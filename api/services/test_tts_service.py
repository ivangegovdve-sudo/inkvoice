import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace

import torch

from api.services import tts_service as tts_service_module
from api.services.tts_service import TTSService


class ConcurrentProbeModel:
    def __init__(self) -> None:
        self.active_calls = 0
        self.max_active_calls = 0
        self.guard = threading.Lock()
        self.calls = []

    def generate(self, **kwargs):
        with self.guard:
            self.active_calls += 1
            self.max_active_calls = max(self.max_active_calls, self.active_calls)
            self.calls.append(kwargs)

        time.sleep(0.05)

        with self.guard:
            self.active_calls -= 1

        return [torch.zeros(240)]


def test_generation_serializes_shared_model_access(monkeypatch) -> None:
    service = TTSService()
    model = ConcurrentProbeModel()

    monkeypatch.setattr(service, "_get_model", lambda: model)
    monkeypatch.setattr(service, "get_voice_path", lambda _voice: Path("source.wav"))
    monkeypatch.setattr(
        service._voice_clone_prompt_cache,
        "get_or_create",
        lambda **_kwargs: SimpleNamespace(prompt=object(), source="test"),
    )
    monkeypatch.setattr(tts_service_module, "encode_wav_to_opus", lambda _wav: b"audio")

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(
            executor.map(
                lambda _: service.generate(
                    "The 21st edition.",
                    "narrator",
                    include_alignment=False,
                ),
                range(2),
            )
        )

    assert [result[0] for result in results] == [b"audio", b"audio"]
    assert model.max_active_calls == 1
    assert all(call["normalize_text"] is True for call in model.calls)


def test_voice_design_always_uses_text_normalization(monkeypatch) -> None:
    service = TTSService()
    model = ConcurrentProbeModel()
    normalized_texts = []

    monkeypatch.setattr(service, "_get_model", lambda: model)
    monkeypatch.setattr(
        service,
        "normalize_text",
        lambda text: normalized_texts.append(text) or text,
    )
    monkeypatch.setattr(tts_service_module, "encode_wav_to_opus", lambda _wav: b"audio")

    result = service.design("Chapter 12", "calm female narrator")

    assert result[0] == b"audio"
    assert normalized_texts == ["Chapter 12"]
    assert model.calls[0]["normalize_text"] is True
