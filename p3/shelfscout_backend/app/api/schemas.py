from __future__ import annotations

from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class PredictResponse(BaseModel):
    empty_ratio: float = Field(..., ge=0.0, le=1.0)
    decoded_centers: int = Field(..., ge=0)
    predicted_instances: int = Field(..., ge=0)
    product_pixels: int = Field(..., ge=0)
    empty_pixels: int = Field(..., ge=0)
    feature_map_size: List[int]
    image_size: int
    shelf_bbox: Optional[List[int]] = None

    masks: Optional[Dict[str, str]] = None
