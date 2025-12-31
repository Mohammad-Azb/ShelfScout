from __future__ import annotations

import logging

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.core.logging import setup_logging
from app.ml.inference import predict_from_bytes

setup_logging()
log = logging.getLogger("app.api")

app = FastAPI(
    title="ShelfScout Inference API",
    version="1.0.0",
    description="FastAPI backend wrapping the ShelfScout Panoptic CNN inference pipeline.",
)

# Optional: adjust for your front-end domain(s)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict")
async def predict(
    file: UploadFile = File(..., description="Image file (jpg/png)"),
    include_masks: bool = False,
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Please upload an image file.")

    try:
        image_bytes = await file.read()
        result = predict_from_bytes(image_bytes=image_bytes, include_masks=include_masks)
        return result
    except FileNotFoundError as e:
        # Model checkpoint missing
        log.exception("Model checkpoint not found.")
        raise HTTPException(status_code=500, detail=str(e)) from e
    except Exception as e:
        log.exception("Inference failed.")
        raise HTTPException(status_code=500, detail=f"Inference failed: {type(e).__name__}: {e}") from e
