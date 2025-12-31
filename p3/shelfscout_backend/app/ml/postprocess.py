from __future__ import annotations

import torch
import torch.nn.functional as F

# Default stride used by the model head / feature map
STRIDE_DEFAULT = 4

STRIDE = STRIDE_DEFAULT


def decode_centers(ctr_logits, stride, prob_thresh=0.3, nms_kernel=3, top_k=200):
    B, _, Hf, Wf = ctr_logits.shape
    ctr_probs = torch.sigmoid(ctr_logits)

    pooled = F.max_pool2d(
        ctr_probs,
        kernel_size=nms_kernel,
        stride=1,
        padding=nms_kernel // 2
    )

    keep = (ctr_probs == pooled) & (ctr_probs > prob_thresh)
    decoded = []

    for b in range(B):
        ys, xs = torch.where(keep[b, 0])
        scores = ctr_probs[b, 0, ys, xs]

        if len(scores) > top_k:
            scores, idx = torch.topk(scores, top_k)
            xs, ys = xs[idx], ys[idx]

        centers = []
        for x, y, s in zip(xs, ys, scores):
            centers.append(torch.tensor([
                (x.float() + 0.5) * stride,
                (y.float() + 0.5) * stride,
                s
            ], device=ctr_logits.device))

        decoded.append(centers)

    return decoded

#========================================
## Radius-Gated Instance Reconstruction
#========================================

def reconstruct_instances(
    sem_prob,
    ctr_points,
    offsets,
    sem_thresh=0.5,
    max_radius=16,     # <<< KEY FIX (feature-space pixels)
    min_pixels=12     # remove tiny noisy instances
):
    """
    sem_prob : [Hf, Wf]  semantic probability
    ctr_points : list of tensors [x,y] or [x,y,score]
    offsets : [2, Hf, Wf]
    """

    Hf, Wf = sem_prob.shape
    device = sem_prob.device

    if len(ctr_points) == 0:
        return torch.zeros((Hf, Wf), dtype=torch.int64)

    # ---- centers → tensor [K,2] in feature space ----
    centers = []
    for ctr in ctr_points:
        x, y = ctr[:2]
        centers.append([y // 4, x // 4])  # convert to feature coords

    centers = torch.tensor(centers, device=device).float()  # [K,2]

    # ---- pixel grid ----
    yy, xx = torch.meshgrid(
        torch.arange(Hf, device=device),
        torch.arange(Wf, device=device),
        indexing="ij"
    )
    coords = torch.stack([yy, xx], dim=-1).float()  # [Hf,Wf,2]

    # ---- apply offsets ----
    offsets = offsets.permute(1, 2, 0)  # [Hf,Wf,2]
    shifted = coords + offsets

    # ---- distance to centers ----
    dist = torch.cdist(
        shifted.view(-1, 2),
        centers
    )  # [Hf*Wf, K]

    min_dist, inst_ids = dist.min(dim=1)
    inst_ids = inst_ids.view(Hf, Wf) + 1

    # ---- RADIUS GATE (THE FIX) ----
    inst_ids[min_dist.view(Hf, Wf) > max_radius] = 0

    # ---- semantic gate ----
    instance_map = inst_ids * (sem_prob > sem_thresh)

    # ---- remove tiny instances ----
    for uid in instance_map.unique():
        if uid == 0:
            continue
        if (instance_map == uid).sum() < min_pixels:
            instance_map[instance_map == uid] = 0

    return instance_map

#==============================================
# Shelf / Empty / Background Segmentation
#==============================================

def compute_shelf_masks(
    sem_prob,
    sem_thresh=0.5,
    margin=2
):
    """
    sem_prob : [Hf, Wf]
    returns:
        product_mask
        empty_mask
        background_mask
        shelf_bbox (ymin, ymax, xmin, xmax)
    """

    H, W = sem_prob.shape

    product_mask = sem_prob > sem_thresh

    if product_mask.sum() == 0:
        # no products → everything is background
        background_mask = torch.ones_like(product_mask)
        empty_mask = torch.zeros_like(product_mask)
        return product_mask, empty_mask, background_mask, None

    ys, xs = torch.where(product_mask)

    ymin = max(0, ys.min().item() - margin)
    ymax = min(H - 1, ys.max().item() + margin)
    xmin = max(0, xs.min().item() - margin)
    xmax = min(W - 1, xs.max().item() + margin)

    shelf_mask = torch.zeros_like(product_mask)
    shelf_mask[ymin:ymax+1, xmin:xmax+1] = 1

    empty_mask = shelf_mask & (~product_mask)
    background_mask = ~shelf_mask

    return product_mask, empty_mask, background_mask, (ymin, ymax, xmin, xmax)

def compute_empty_shelf_ratio_from_masks(empty_mask, product_mask):
    shelf_pixels = (empty_mask | product_mask).sum().item()
    if shelf_pixels == 0:
        return 0.0
    return empty_mask.sum().item() / shelf_pixels

#===================================
#  Image Loader
#===================================
