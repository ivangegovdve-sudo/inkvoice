import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace

import pytest
import torch
from omnivoice.models.omnivoice import VoiceClonePrompt

from api.services import voice_clone_prompt_cache as cache_module
from api.services.voice_clone_prompt_cache import (
    PROMPT_CACHE_PATH,
    VoiceClonePromptCache,
)


class FakeOmniVoice:
    def __init__(self, model_revision: str = "model-revision") -> None:
        self.config = SimpleNamespace(_commit_hash=model_revision)
        self.audio_tokenizer = SimpleNamespace(
            config=SimpleNamespace(_commit_hash="tokenizer-revision")
        )
        self.creation_count = 0
        self._creation_lock = threading.Lock()

    def create_voice_clone_prompt(
        self,
        ref_audio: str,
        ref_text: str | None,
    ) -> VoiceClonePrompt:
        with self._creation_lock:
            self.creation_count += 1
        time.sleep(0.02)
        return VoiceClonePrompt(
            ref_audio_tokens=torch.tensor([[1, 2, 3]], dtype=torch.int64),
            ref_text=(ref_text or "transcribed").strip(),
            ref_rms=0.25,
        )


def test_reuses_prompt_in_process_and_after_restart(tmp_path: Path) -> None:
    voice_path = _write_voice(tmp_path)
    model = FakeOmniVoice()
    cache = VoiceClonePromptCache()

    first = cache.get_or_create(model, voice_path, " reference text ")
    second = cache.get_or_create(model, voice_path, "reference text")
    restarted = VoiceClonePromptCache().get_or_create(model, voice_path, "reference text")

    assert first.source == "new encoding"
    assert second.source == "disk cache"
    assert restarted.source == "disk cache"
    assert model.creation_count == 1
    assert restarted.prompt.ref_text == "reference text"


def test_regenerates_when_audio_text_or_model_changes(tmp_path: Path) -> None:
    voice_path = _write_voice(tmp_path)
    model = FakeOmniVoice()
    cache = VoiceClonePromptCache()

    cache.get_or_create(model, voice_path, "first transcript")
    cache.get_or_create(model, voice_path, "second transcript")
    voice_path.write_bytes(b"changed audio")
    cache.get_or_create(model, voice_path, "second transcript")
    changed_model = FakeOmniVoice(model_revision="changed-model-revision")
    cache.get_or_create(changed_model, voice_path, "second transcript")

    assert model.creation_count == 3
    assert changed_model.creation_count == 1


def test_regenerates_corrupt_prompt(tmp_path: Path) -> None:
    voice_path = _write_voice(tmp_path)
    model = FakeOmniVoice()
    cache = VoiceClonePromptCache()

    cache.get_or_create(model, voice_path, "reference text")
    cache_path = voice_path.parent / PROMPT_CACHE_PATH
    cache_path.write_bytes(b"not a torch payload")

    result = VoiceClonePromptCache().get_or_create(model, voice_path, "reference text")

    assert result.source == "new encoding"
    assert model.creation_count == 2
    assert torch.load(cache_path, map_location="cpu", weights_only=True)["ref_text"] == (
        "reference text"
    )


@pytest.mark.parametrize(
    "load_error",
    [
        IndexError("corrupt index"),
        UnicodeDecodeError("utf-8", b"\xff", 0, 1, "corrupt text"),
        KeyError("corrupt key"),
    ],
)
def test_regenerates_for_any_safe_load_error(
    tmp_path: Path,
    monkeypatch,
    load_error: Exception,
) -> None:
    voice_path = _write_voice(tmp_path)
    model = FakeOmniVoice()
    cache_path = voice_path.parent / PROMPT_CACHE_PATH
    cache_path.parent.mkdir()
    cache_path.write_bytes(b"corrupt prompt")

    def raise_load_error(*_args, **_kwargs):
        raise load_error

    monkeypatch.setattr(cache_module.torch, "load", raise_load_error)

    result = VoiceClonePromptCache().get_or_create(model, voice_path, "reference text")

    assert result.source == "new encoding"
    assert model.creation_count == 1


def test_concurrent_requests_create_one_prompt(tmp_path: Path) -> None:
    voice_path = _write_voice(tmp_path)
    model = FakeOmniVoice()
    cache = VoiceClonePromptCache()

    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(
            executor.map(
                lambda _: cache.get_or_create(model, voice_path, "reference text"),
                range(8),
            )
        )

    assert model.creation_count == 1
    assert [result.source for result in results].count("new encoding") == 1
    assert [result.source for result in results].count("disk cache") == 7


def test_persists_auto_transcript_as_a_cache_input(tmp_path: Path) -> None:
    voice_path = _write_voice(tmp_path)
    model = FakeOmniVoice()
    cache = VoiceClonePromptCache()

    first = cache.get_or_create(model, voice_path, None)
    transcript_path = voice_path.parent / "source.txt"
    restarted = VoiceClonePromptCache().get_or_create(
        model,
        voice_path,
        transcript_path.read_text().strip(),
    )

    assert first.source == "new encoding"
    assert transcript_path.read_text() == "transcribed"
    assert restarted.source == "disk cache"
    assert model.creation_count == 1


def test_deleted_voice_cannot_recreate_prompt_after_atomic_replace(
    tmp_path: Path,
    monkeypatch,
) -> None:
    voice_path = _write_voice(tmp_path)
    model = FakeOmniVoice()
    cache_path = voice_path.parent / PROMPT_CACHE_PATH
    deletion_marker = voice_path.parent / ".deleted"
    original_replace = cache_module.os.replace

    def replace_then_delete(source, destination) -> None:
        original_replace(source, destination)
        deletion_marker.write_text("")

    monkeypatch.setattr(cache_module.os, "replace", replace_then_delete)

    result = VoiceClonePromptCache().get_or_create(model, voice_path, "reference text")

    assert result.source == "new encoding without disk cache"
    assert not cache_path.exists()


def test_hard_deleted_voice_directory_is_not_recreated(
    tmp_path: Path,
    monkeypatch,
) -> None:
    voice_path = _write_voice(tmp_path)
    model = FakeOmniVoice()
    original_get_fingerprint = cache_module._get_fingerprint
    fingerprint_calls = 0

    def delete_after_fingerprint(*args, **kwargs):
        nonlocal fingerprint_calls
        fingerprint = original_get_fingerprint(*args, **kwargs)
        fingerprint_calls += 1
        if fingerprint_calls == 2:
            shutil.rmtree(voice_path.parent)
        return fingerprint

    monkeypatch.setattr(cache_module, "_get_fingerprint", delete_after_fingerprint)

    result = VoiceClonePromptCache().get_or_create(model, voice_path, "reference text")

    assert result.source == "new encoding without disk cache"
    assert not voice_path.parent.exists()


def test_failed_atomic_write_preserves_previous_prompt(
    tmp_path: Path,
    monkeypatch,
) -> None:
    voice_path = _write_voice(tmp_path)
    model = FakeOmniVoice()
    cache = VoiceClonePromptCache()
    cache.get_or_create(model, voice_path, "first transcript")
    cache_path = voice_path.parent / PROMPT_CACHE_PATH

    def fail_after_partial_write(payload, destination) -> None:
        destination.write(b"partial")
        raise RuntimeError("simulated write failure")

    monkeypatch.setattr(cache_module.torch, "save", fail_after_partial_write)
    result = cache.get_or_create(model, voice_path, "second transcript")
    monkeypatch.undo()

    persisted = torch.load(cache_path, map_location="cpu", weights_only=True)
    temporary_files = list(cache_path.parent.glob(f".{cache_path.name}.*.tmp"))

    assert result.source == "new encoding without disk cache"
    assert persisted["ref_text"] == "first transcript"
    assert temporary_files == []


def _write_voice(tmp_path: Path) -> Path:
    voice_path = tmp_path / "voice" / "source.wav"
    voice_path.parent.mkdir()
    voice_path.write_bytes(b"reference audio")
    return voice_path
