import pytest

from api.services.tts_service import TTSService


@pytest.fixture(scope="module")
def service() -> TTSService:
    return TTSService()


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        (
            "The 21st edition costs $14.99 in 2026.",
            "The twenty first edition costs fourteen point nine nine dollars in twenty twenty six.",
        ),
        (
            "Meet me on July 27, 2026 at 8:30 p.m.",
            "Meet me on the twenty seventh of july, twenty twenty six at eight thirty PM",
        ),
    ],
)
def test_english_normalization_expands_spoken_forms(
    service: TTSService,
    source: str,
    expected: str,
) -> None:
    assert service.normalize_text(source, "en") == expected


def test_normalization_preserves_omnivoice_control_syntax(service: TTSService) -> None:
    source = "[laughter] He plays the [B EY1 S] guitar in 2026, then gives a [sigh]."
    normalized = service.normalize_text(source, "en")

    assert normalized == (
        "[laughter] He plays the [B EY1 S] guitar in twenty twenty six, "
        "then gives a [sigh]."
    )


def test_non_english_integer_fallback_uses_num2words(service: TTSService) -> None:
    assert service.normalize_text("Kapitel 12 beginnt.", "de") == "Kapitel zwölf beginnt."
