from __future__ import annotations

import logging
import os
import re
from threading import Lock
from typing import Any

from PIL import Image

try:
    import torch
    from transformers import AutoModelForCausalLM, AutoProcessor
except ImportError:
    torch = None  # type: ignore[assignment]
    AutoModelForCausalLM = None  # type: ignore[assignment]
    AutoProcessor = None  # type: ignore[assignment]


logger = logging.getLogger("vision-preprocess-service.florence")


class FlorenceCaptioner:
    def __init__(self, model_name: str | None = None) -> None:
        self.model_name = (
            model_name or os.getenv("FLORENCE_MODEL_NAME", "microsoft/Florence-2-large")
        )
        self.task_prompt = os.getenv("FLORENCE_TASK_PROMPT", "<CAPTION>")
        self.max_new_tokens = int(os.getenv("FLORENCE_MAX_NEW_TOKENS", "64"))
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
            "task_prompt": self.task_prompt,
            "load_attempted": self._load_attempted,
            "model_loaded": self._model is not None and self._processor is not None,
            "load_error": self._load_error,
        }

    def caption(self, image: Image.Image) -> str:
        model, processor = self._ensure_loaded()
        inputs = processor(text=self.task_prompt, images=image, return_tensors="pt")
        if hasattr(inputs, "to"):
            inputs = inputs.to(self.device)

        with torch.inference_mode():
            generated_ids = model.generate(
                **inputs,
                max_new_tokens=self.max_new_tokens,
                num_beams=1,
                do_sample=False,
            )

        decoded = processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
        return self._extract_caption(processor, decoded, image)

    def _ensure_loaded(self) -> tuple[Any, Any]:
        if self._model is not None and self._processor is not None:
            return self._model, self._processor

        with self._lock:
            if self._model is not None and self._processor is not None:
                return self._model, self._processor

            self._load_attempted = True
            if not AutoModelForCausalLM or not AutoProcessor or not torch:
                self._load_error = "Florence-2 dependencies are unavailable"
                raise RuntimeError(self._load_error)

            try:
                processor = AutoProcessor.from_pretrained(
                    self.model_name,
                    trust_remote_code=True,
                )
                model = AutoModelForCausalLM.from_pretrained(
                    self.model_name,
                    trust_remote_code=True,
                )
                model = model.to(self.device)
                model.eval()
            except Exception as error:
                self._load_error = str(error)
                logger.warning("Florence-2 load failed", exc_info=error)
                raise RuntimeError(self._load_error) from error

            self._processor = processor
            self._model = model
            self._load_error = None
            return model, processor

    def _extract_caption(self, processor: Any, decoded: str, image: Image.Image) -> str:
        if hasattr(processor, "post_process_generation"):
            try:
                parsed = processor.post_process_generation(
                    decoded,
                    task=self.task_prompt,
                    image_size=image.size,
                )
                if isinstance(parsed, dict):
                    direct = parsed.get(self.task_prompt)
                    if isinstance(direct, str) and direct.strip():
                        return direct.strip()
            except Exception:
                pass

        cleaned = decoded.replace(self.task_prompt, " ")
        cleaned = re.sub(r"<[^>]+>", " ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if not cleaned:
            raise RuntimeError("Florence-2 returned an empty caption")
        return cleaned
