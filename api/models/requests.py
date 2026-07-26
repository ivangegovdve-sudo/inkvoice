from typing import Optional
from pydantic import BaseModel


class TTSRequest(BaseModel):
    """Request model for text-to-speech generation."""

    text: str
    voice: Optional[str] = None  # voice directory name in data/voices/
    include_alignment: bool = True


class TTSDesignRequest(BaseModel):
    """Request model for OmniVoice voice-design synthesis (no reference audio).

    `instruct` follows OmniVoice's speaker-attribute syntax — e.g.
    "female, young adult, high pitch, british accent".
    """

    text: str
    instruct: str
    format: Optional[str] = "opus"  # "opus" for preview, "wav" to persist as reference
    class_temperature: Optional[float] = None  # 0.0–1.0, OmniVoice default 0.3
    seed: Optional[int] = None  # if set, makes the take reproducible


class TextNormalizationRequest(BaseModel):
    """Texts to normalize without loading the speech model."""

    texts: list[str]
    language: Optional[str] = None


class TextNormalizationResponse(BaseModel):
    """Normalized texts in the same order as the request."""

    texts: list[str]


class HealthResponse(BaseModel):
    """Response model for health check endpoint."""

    status: str
