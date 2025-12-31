from __future__ import annotations

import base64
import io
import logging
from functools import lru_cache
from typing import Any, Dict, Optional

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageDraw

from app.core.config import settings
from app.ml.model import ShelfScoutPanopticCNN
from app.ml.postprocess import (
    STRIDE,
    compute_empty_shelf_ratio_from_masks,
    compute_shelf_masks,
    decode_centers,
    reconstruct_instances,
)

log = logging.getLogger("app.ml.inference")


def get_device() -> torch.device:
    if settings.device == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if settings.device in {"cpu", "cuda"}:
        if settings.device == "cuda" and not torch.cuda.is_available():
            log.warning("DEVICE=cuda requested but CUDA not available; falling back to CPU.")
            return torch.device("cpu")
        return torch.device(settings.device)
    raise ValueError("DEVICE must be one of: auto, cpu, cuda")


@lru_cache(maxsize=1)
def load_model() -> ShelfScoutPanopticCNN:
    device = get_device()
    model = ShelfScoutPanopticCNN().to(device)

    ckpt_path = settings.model_path
    try:
        ckpt = torch.load(ckpt_path, map_location=device)
    except FileNotFoundError as e:
        raise FileNotFoundError(
            f"Checkpoint not found at '{ckpt_path}'. "
            f"Place it there or set MODEL_PATH to the correct path."
        ) from e

    if "model_state" not in ckpt:
        raise KeyError("Checkpoint missing key 'model_state'.")

    model.load_state_dict(ckpt["model_state"])
    model.eval()
    log.info("Model loaded. device=%s path=%s", device, ckpt_path)
    return model


def preprocess_image_bytes(image_bytes: bytes, image_size: int) -> torch.Tensor:
    """Return normalized tensor [3, image_size, image_size] in RGB."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize((image_size, image_size), resample=Image.BILINEAR)
    arr = np.asarray(img, dtype=np.float32) / 255.0  # [H,W,3]
    tensor = torch.from_numpy(arr).permute(2, 0, 1).contiguous()  # [3,H,W]
    return tensor


def _mask_to_base64_png(mask: torch.Tensor, out_size: int) -> str:
    """Encode a boolean/0-1 mask [Hf,Wf] to a base64 PNG upscaled to out_size."""
    if mask.dtype != torch.bool:
        mask = mask > 0.5
    # upscale nearest
    up = (
        F.interpolate(
            mask[None, None].float(),
            size=(out_size, out_size),
            mode="nearest",
        )[0, 0]
        .cpu()
        .numpy()
        .astype(np.uint8)
        * 255
    )
    pil = Image.fromarray(up, mode="L")
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _centers_overlay_to_base64_png(image_bytes: bytes, centers, out_size: int, radius: int = 5) -> str:
    """Draw decoded centers over the resized input image and return base64 PNG."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize((out_size, out_size), resample=Image.BILINEAR)
    draw = ImageDraw.Draw(img)
    for c in centers:
        # c: tensor [x,y] or [x,y,score]
        x = float(c[0].item() if hasattr(c[0], "item") else c[0])
        y = float(c[1].item() if hasattr(c[1], "item") else c[1])
        r = radius
        # Outer ring
        draw.ellipse((x - r, y - r, x + r, y + r), outline=(255, 64, 64), width=2)
        # Center dot
        draw.ellipse((x - 1, y - 1, x + 1, y + 1), fill=(255, 64, 64))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def predict_from_bytes(
    image_bytes: bytes,
    include_masks: bool = False,
) -> Dict[str, Any]:
    """
    Runs model inference + post-processing on an image.
    Returns a JSON-serializable dict.
    """
    device = get_device()
    model = load_model()

    img = preprocess_image_bytes(image_bytes, settings.image_size).to(device)  # [3,512,512]

    with torch.no_grad():
        sem_logits, ctr_logits, offsets = model(img.unsqueeze(0))

    # Foreground semantic probability in feature space [Hf,Wf]
    sem_prob = torch.softmax(sem_logits[0], dim=0)[1]  # keep on device

    centers = decode_centers(ctr_logits, stride=settings.stride)[0]  # list of [x,y,score] in pixel space
    instance_map = reconstruct_instances(
        sem_prob=sem_prob,
        ctr_points=centers,
        offsets=offsets[0],
    )

    product_mask, empty_mask, background_mask, shelf_bbox = compute_shelf_masks(sem_prob)
    empty_ratio = compute_empty_shelf_ratio_from_masks(empty_mask, product_mask)

    # summary stats
    predicted_instances = int(instance_map.unique().numel() - 1)
    out: Dict[str, Any] = {
        "empty_ratio": float(empty_ratio),
        "decoded_centers": int(len(centers)),
        "predicted_instances": predicted_instances,
        "product_pixels": int(product_mask.sum().item()),
        "empty_pixels": int(empty_mask.sum().item()),
        "feature_map_size": [int(sem_prob.shape[0]), int(sem_prob.shape[1])],
        "image_size": settings.image_size,
        "shelf_bbox": list(shelf_bbox) if shelf_bbox is not None else None,  # ymin,ymax,xmin,xmax in feature space
    }

    if include_masks:
        out["masks"] = {
            "product_mask_png_b64": _mask_to_base64_png(product_mask, settings.image_size),
            "empty_mask_png_b64": _mask_to_base64_png(empty_mask, settings.image_size),
            "background_mask_png_b64": _mask_to_base64_png(background_mask, settings.image_size),
            # Input image with decoded center points drawn on top:
            "decoded_centers_overlay_png_b64": _centers_overlay_to_base64_png(image_bytes, centers, settings.image_size),
        }

    return out
