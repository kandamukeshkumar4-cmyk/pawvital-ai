from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from threading import Lock
from typing import Any, Iterable

from PIL import Image

try:
    import torch
    from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor
except ImportError:
    torch = None  # type: ignore[assignment]
    AutoModelForZeroShotObjectDetection = None  # type: ignore[assignment]
    AutoProcessor = None  # type: ignore[assignment]


logger = logging.getLogger("vision-preprocess-service.grounding")


@dataclass(frozen=True)
class Detection:
    label: str
    confidence: float
    box: tuple[int, int, int, int]


class GroundingDinoDetector:
    def __init__(self, model_name: str | None = None) -> None:
        self.model_name = (
            model_name
            or os.getenv("GROUNDING_DINO_MODEL_NAME", "IDEA-Research/grounding-dino-base")
        )
        self.threshold = float(os.getenv("GROUNDING_DINO_BOX_THRESHOLD", "0.25"))
        self.text_threshold = float(os.getenv("GROUNDING_DINO_TEXT_THRESHOLD", "0.2"))
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

    def detect(self, image: Image.Image, labels: Iterable[str]) -> list[Detection]:
        model, processor = self._ensure_loaded()
        prompt = ". ".join(str(label).strip() for label in labels if str(label).strip())
        if not prompt:
            prompt = "wound. rash. lesion. paw. eye. ear. skin"

        inputs = processor(images=image, text=prompt, return_tensors="pt")
        if hasattr(inputs, "to"):
            inputs = inputs.to(self.device)

        with torch.inference_mode():
            outputs = model(**inputs)

        result = self._post_process(image, processor, outputs, inputs)
        boxes = result.get("boxes") or []
        scores = result.get("scores") or []
        labels_out = result.get("labels") or result.get("text_labels") or []

        normalized: list[Detection] = []
        for box, score, label in zip(boxes, scores, labels_out):
            clamped_box = self._normalize_box(image, box)
            if not clamped_box:
                continue
            normalized.append(
                Detection(
                    label=str(label).strip().lower(),
                    confidence=float(score),
                    box=clamped_box,
                )
            )

        normalized.sort(key=lambda item: item.confidence, reverse=True)
        return normalized

    def _ensure_loaded(self) -> tuple[Any, Any]:
        if self._model is not None and self._processor is not None:
            return self._model, self._processor

        with self._lock:
            if self._model is not None and self._processor is not None:
                return self._model, self._processor

            self._load_attempted = True
            if not AutoModelForZeroShotObjectDetection or not AutoProcessor or not torch:
                self._load_error = "transformers Grounding DINO dependencies are unavailable"
                raise RuntimeError(self._load_error)

            try:
                processor = AutoProcessor.from_pretrained(self.model_name)
                model = AutoModelForZeroShotObjectDetection.from_pretrained(self.model_name)
                model = model.to(self.device)
                model.eval()
            except Exception as error:
                self._load_error = str(error)
                logger.warning("Grounding DINO load failed", exc_info=error)
                raise RuntimeError(self._load_error) from error

            self._processor = processor
            self._model = model
            self._load_error = None
            return model, processor

    def _post_process(
        self,
        image: Image.Image,
        processor: Any,
        outputs: Any,
        inputs: Any,
    ) -> dict[str, Any]:
        target_sizes = [(image.height, image.width)]
        post_process = processor.post_process_grounded_object_detection
        try:
            processed = post_process(
                outputs,
                threshold=self.threshold,
                text_threshold=self.text_threshold,
                target_sizes=target_sizes,
            )
        except TypeError:
            processed = post_process(
                outputs,
                inputs.input_ids,
                threshold=self.threshold,
                text_threshold=self.text_threshold,
                target_sizes=target_sizes,
            )
        return processed[0] if processed else {}

    def _normalize_box(
        self,
        image: Image.Image,
        raw_box: Any,
    ) -> tuple[int, int, int, int] | None:
        values = raw_box.tolist() if hasattr(raw_box, "tolist") else list(raw_box)
        if len(values) != 4:
            return None
        left, top, right, bottom = [int(round(float(value))) for value in values]
        left = max(0, min(image.width - 1, left))
        top = max(0, min(image.height - 1, top))
        right = max(left + 1, min(image.width, right))
        bottom = max(top + 1, min(image.height, bottom))
        return (left, top, right, bottom)
