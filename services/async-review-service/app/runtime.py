"""Legacy runtime accessors during async-review modularization."""

from .main_legacy import decode_image, generate_case_id, lifespan, load_model

__all__ = [
    "decode_image",
    "generate_case_id",
    "lifespan",
    "load_model",
]
