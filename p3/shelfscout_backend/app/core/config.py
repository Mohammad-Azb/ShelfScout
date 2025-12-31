from __future__ import annotations

import os
from dataclasses import dataclass

@dataclass(frozen=True)
class Settings:
    # Path to a PyTorch checkpoint containing {"model_state": ...}
    model_path: str = os.getenv("MODEL_PATH", "checkpoints/shelfscout_latest.pth")
    # Force device: "cpu" | "cuda" | "auto"
    device: str = os.getenv("DEVICE", "auto").lower()
    # Input image size (model expects square)
    image_size: int = int(os.getenv("IMAGE_SIZE", "512"))
    # Feature stride used in post-processing
    stride: int = int(os.getenv("STRIDE", "4"))

settings = Settings()
