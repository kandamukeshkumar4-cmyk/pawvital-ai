"""Runtime configuration surface for the multimodal consult service."""

from .main_legacy import (
    DEVICE,
    EXPECTED_API_KEY,
    FORCE_FALLBACK,
    MODEL,
    MODEL_NAME,
    PROCESSOR,
    STATE_LOCK,
    STUB_MODE,
    logger,
    torch,
)

__all__ = [
    "DEVICE",
    "EXPECTED_API_KEY",
    "FORCE_FALLBACK",
    "MODEL",
    "MODEL_NAME",
    "PROCESSOR",
    "STATE_LOCK",
    "STUB_MODE",
    "logger",
    "torch",
]
