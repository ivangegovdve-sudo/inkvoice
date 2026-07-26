from __future__ import annotations

import hashlib
import importlib.metadata
import json
import logging
import math
import os
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

import torch

if TYPE_CHECKING:
    from omnivoice.models.omnivoice import VoiceClonePrompt


OMNIVOICE_MODEL_ID = "k2-fsa/OmniVoice"
PROMPT_CACHE_FORMAT_VERSION = 1
PROMPT_CACHE_PATH = Path(".derived") / "omnivoice-voice-clone-prompt.pt"
VOICE_DELETED_MARKER = ".deleted"

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PromptCacheResult:
    prompt: VoiceClonePrompt
    source: str


class VoiceClonePromptCache:
    def __init__(self) -> None:
        self._voice_locks: dict[Path, threading.Lock] = {}
        self._voice_locks_guard = threading.Lock()

    def get_or_create(
        self,
        model: Any,
        voice_path: Path,
        reference_text: str | None,
    ) -> PromptCacheResult:
        cache_path = voice_path.parent / PROMPT_CACHE_PATH
        voice_lock = self._get_voice_lock(cache_path)

        with voice_lock:
            deletion_marker = voice_path.parent / VOICE_DELETED_MARKER
            if deletion_marker.exists():
                raise FileNotFoundError(f"Voice '{voice_path.parent.name}' is deleted")

            identity = _get_prompt_identity(model)
            if reference_text is not None:
                fingerprint = _get_fingerprint(voice_path, reference_text, identity)
                prompt = _load_prompt(cache_path, fingerprint, identity)
                if prompt is not None:
                    return PromptCacheResult(prompt=prompt, source="disk cache")

            created_prompt = model.create_voice_clone_prompt(
                ref_audio=str(voice_path),
                ref_text=reference_text,
            )
            prompt = type(created_prompt)(
                ref_audio_tokens=created_prompt.ref_audio_tokens.detach().cpu(),
                ref_text=created_prompt.ref_text,
                ref_rms=float(created_prompt.ref_rms),
            )
            if deletion_marker.exists():
                return PromptCacheResult(
                    prompt=prompt,
                    source="new encoding without disk cache",
                )

            if reference_text is None:
                reference_text = prompt.ref_text.strip()
                if not reference_text:
                    return PromptCacheResult(
                        prompt=prompt,
                        source="new encoding without disk cache",
                    )
                try:
                    _save_reference_text(voice_path.parent / "source.txt", reference_text)
                except (OSError, RuntimeError, UnicodeError) as error:
                    logger.warning("Unable to persist auto-transcribed reference text: %s", error)
                    return PromptCacheResult(
                        prompt=prompt,
                        source="new encoding without disk cache",
                    )

            fingerprint = _get_fingerprint(voice_path, reference_text, identity)
            try:
                persisted = _save_prompt(
                    cache_path,
                    fingerprint,
                    identity,
                    prompt,
                    deletion_marker,
                )
                source = "new encoding" if persisted else "new encoding without disk cache"
            except (OSError, RuntimeError) as error:
                logger.warning("Unable to persist voice clone prompt: %s", error)
                source = "new encoding without disk cache"
            return PromptCacheResult(prompt=prompt, source=source)

    def _get_voice_lock(self, cache_path: Path) -> threading.Lock:
        with self._voice_locks_guard:
            return self._voice_locks.setdefault(cache_path, threading.Lock())


def _get_prompt_identity(model: Any) -> dict[str, str | int]:
    return {
        "format_version": PROMPT_CACHE_FORMAT_VERSION,
        "omnivoice_version": importlib.metadata.version("omnivoice"),
        "model_id": OMNIVOICE_MODEL_ID,
        "model_revision": _get_component_revision(model),
        "audio_tokenizer_revision": _get_component_revision(model.audio_tokenizer),
    }


def _get_component_revision(component: Any) -> str:
    config = getattr(component, "config", None)
    commit_hash = getattr(config, "_commit_hash", None)
    if commit_hash:
        return str(commit_hash)

    name_or_path = str(getattr(config, "_name_or_path", "") or "")
    path_parts = Path(name_or_path).parts
    if "snapshots" in path_parts:
        snapshot_index = path_parts.index("snapshots") + 1
        if snapshot_index < len(path_parts):
            return path_parts[snapshot_index]

    return name_or_path or "unresolved"


def _get_fingerprint(
    voice_path: Path,
    reference_text: str | None,
    identity: dict[str, str | int],
) -> str:
    digest = hashlib.sha256()
    digest.update(json.dumps(identity, sort_keys=True, separators=(",", ":")).encode())
    digest.update(b"\0")
    if reference_text is None:
        digest.update(b"missing-reference-text")
    else:
        digest.update(reference_text.strip().encode())
    digest.update(b"\0")

    with voice_path.open("rb") as voice_file:
        while chunk := voice_file.read(1024 * 1024):
            digest.update(chunk)

    return digest.hexdigest()


def _load_prompt(
    cache_path: Path,
    fingerprint: str,
    identity: dict[str, str | int],
) -> VoiceClonePrompt | None:
    from omnivoice.models.omnivoice import VoiceClonePrompt

    try:
        payload = torch.load(cache_path, map_location="cpu", weights_only=True)
        if not isinstance(payload, dict):
            return None
        if payload.get("fingerprint") != fingerprint or payload.get("identity") != identity:
            return None

        audio_tokens = payload.get("ref_audio_tokens")
        reference_text = payload.get("ref_text")
        reference_rms = payload.get("ref_rms")
        if (
            not isinstance(audio_tokens, torch.Tensor)
            or audio_tokens.ndim != 2
            or audio_tokens.numel() == 0
            or audio_tokens.dtype != torch.int64
            or not isinstance(reference_text, str)
            or not isinstance(reference_rms, (int, float))
            or not math.isfinite(reference_rms)
            or reference_rms < 0
        ):
            return None

        return VoiceClonePrompt(
            ref_audio_tokens=audio_tokens,
            ref_text=reference_text,
            ref_rms=float(reference_rms),
        )
    except Exception:
        return None


def _save_reference_text(reference_text_path: Path, reference_text: str) -> None:
    file_descriptor, temporary_name = tempfile.mkstemp(
        dir=reference_text_path.parent,
        prefix=f".{reference_text_path.name}.",
        suffix=".tmp",
    )
    temporary_path = Path(temporary_name)

    try:
        with os.fdopen(file_descriptor, "w", encoding="utf-8") as temporary_file:
            temporary_file.write(reference_text)
            temporary_file.flush()
            os.fsync(temporary_file.fileno())
        os.replace(temporary_path, reference_text_path)
    finally:
        temporary_path.unlink(missing_ok=True)


def _save_prompt(
    cache_path: Path,
    fingerprint: str,
    identity: dict[str, str | int],
    prompt: VoiceClonePrompt,
    deletion_marker: Path,
) -> bool:
    cache_path.parent.mkdir(exist_ok=True)
    payload = {
        "fingerprint": fingerprint,
        "identity": identity,
        "ref_audio_tokens": prompt.ref_audio_tokens,
        "ref_text": prompt.ref_text,
        "ref_rms": prompt.ref_rms,
    }
    file_descriptor, temporary_name = tempfile.mkstemp(
        dir=cache_path.parent,
        prefix=f".{cache_path.name}.",
        suffix=".tmp",
    )
    temporary_path = Path(temporary_name)

    try:
        with os.fdopen(file_descriptor, "wb") as temporary_file:
            torch.save(payload, temporary_file)
            temporary_file.flush()
            os.fsync(temporary_file.fileno())
        os.replace(temporary_path, cache_path)
        if deletion_marker.exists():
            cache_path.unlink(missing_ok=True)
            return False
        return True
    finally:
        temporary_path.unlink(missing_ok=True)
