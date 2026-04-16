"""Legacy runtime accessors during the consult-service modularization pass."""

from .main_legacy import decode_image, generate_consult, lifespan, load_model

__all__ = [
    "decode_image",
    "generate_consult",
    "lifespan",
    "load_model",
]
