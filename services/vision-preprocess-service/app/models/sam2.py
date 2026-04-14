from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from threading import Lock
from typing import Any

import numpy as np
from PIL import Image

try:
    import torch
    from transformers import Sam2Model, Sam2Processor
except ImportError:
    torch = None  # type: ignore[assignment]
    Sam2Model = None  # type: ignore[assignment]
    Sam2Processor = None  # type: ignore[assignment]


logger = logging.getLogger("vision-preprocess-service.sam2")


@dataclass(frozen=True)
class SegmentationResult:
    box: tuple[int, int, int, int] | None
    coverage: float


class Sam2Segmenter:
    def __init__(self, model_name: str | None = None) -> None:
        self.model_name = (
            model_name or os.getenv("SAM2_MODEL_NAME", "facebook/sam2.1-hiera-large")
        )
        self.device = "cuda" if torch and torch.cuda.is_available() else "cpu"
        self._lock = Lock()
        self._model: Any | None = None
        self._processor: Any | None = None
        self._load_attempted = False
        self._load_error: str | None = None

    def health(self) -> dict[str, Any]:
        return {
            "model_name": self.model_name,
            "device": self.device,
            "load_attempted": self._load_attempted,
            "model_loaded": self._model is not None and self._processor is not None,
            "load_error": self._load_error,
        }

    def segment_box(
        self,
        image: Image.Image,
        box: tuple[int, int, int, int],
    ) -> SegmentationResult:
        model, processor = self._ensure_loaded()
        inputs = processor(images=image, input_boxes=[[list(box)]], return_tensors="pt")
        if hasattr(inputs, "to"):
            inputs = inputs.to(self.device)

        with torch.inference_mode():
            outputs = model(**inputs, multimask_output=False)

        masks = processor.post_process_masks(
            outputs.pred_masks.cpu(),
            inputs["original_sizes"],
        )[0]

        binary_mask = self._to_binary_mask(masks)
        if binary_mask is None:
            return SegmentationResult(box=box, coverage=0.0)

        coordinates = np.argwhere(binary_mask)
        if coordinates.size == 0:
            return SegmentationResult(box=box, coverage=0.0)

        y_min, x_min = coordinates.min(axis=0)
        y_max, x_max = coordinates.max(axis=0)
        coverage = float(binary_mask.mean())
        refined_box = (
            max(0, int(x_min)),
            max(0, int(y_min)),
            min(image.width, int(x_max) + 1),
            min(image.height, int(y_max) + 1),
        )
        return SegmentationResult(box=refined_box, coverage=coverage)

    def _ensure_loaded(self) -> tuple[Any, Any]:
        if self._model is not None and self._processor is not None:
            return self._model, self._processor

        with self._lock:
            if self._model is not None and self._processor is not None:
                return self._model, self._processor

            self._load_attempted = True
            if not Sam2Model or not Sam2Processor or not torch:
                self._load_error = "transformers SAM2 dependencies are unavailable"
                raise RuntimeError(self._load_error)

            try:
                processor = Sam2Processor.from_pretrained(self.model_name)
                model = Sam2Model.from_pretrained(self.model_name)
                model = model.to(self.device)
                model.eval()
            except Exception as error:
                self._load_error = str(error)
                logger.warning("SAM2 load failed", exc_info=error)
                raise RuntimeError(self._load_error) from error

            self._processor = processor
            self._model = model
            self._load_error = None
            return model, processor

    def _to_binary_mask(self, masks: Any) -> np.ndarray | None:
        if isinstance(masks, (list, tuple)):
            first = masks[0] if masks else None
        else:
            first = masks

        if first is None:
            return None

        if hasattr(first, "detach"):
            array = first.detach().cpu().numpy()
        else:
            array = np.asarray(first)

        squeezed = np.squeeze(array)
        if squeezed.ndim != 2:
            return None
        return squeezed > 0
