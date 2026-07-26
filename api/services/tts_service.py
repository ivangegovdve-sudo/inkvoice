import gc
import io
import time
from pathlib import Path
from typing import Optional, Tuple

import soundfile as sf
import torch

from api.app.config import settings
from api.services.alignment_service import get_alignment_service
from api.services.opus_encoder import encode_wav_to_opus
from api.services.voice_clone_prompt_cache import VoiceClonePromptCache


CLEANUP_INTERVAL = 20
OMNIVOICE_SAMPLE_RATE = 24000


class TTSService:
    """Service for text-to-speech generation using OmniVoice."""

    def __init__(self):
        self._model = None
        self._generation_count = 0
        self._voice_clone_prompt_cache = VoiceClonePromptCache()

    def _get_model(self):
        """Lazy load the OmniVoice model."""
        if self._model is None:
            import logging
            import os
            os.environ["TRANSFORMERS_VERBOSITY"] = "error"
            logging.getLogger("transformers").setLevel(logging.ERROR)
            from omnivoice import OmniVoice
            # MPS doesn't support fp16 matmul — use fp32 on Apple Silicon, fp16 on CUDA
            dtype = torch.float32 if settings.device == "mps" else torch.float16
            self._model = OmniVoice.from_pretrained(
                "k2-fsa/OmniVoice",
                device_map=settings.device,
                dtype=dtype,
            )
        return self._model

    def get_voice_path(self, voice_name: str) -> Path:
        """Get the path to a voice file, checking app voices then custom voices."""
        voice_path = settings.voices_dir / voice_name / "source.wav"
        if voice_path.exists():
            return voice_path

        custom_path = settings.voices_dir / "custom" / voice_name / "source.wav"
        if custom_path.exists():
            return custom_path

        raise FileNotFoundError(
            f"Voice '{voice_name}' not found. "
            f"Add data/voices/{voice_name}/source.wav or upload via settings."
        )

    def _get_ref_text(self, voice_path: Path) -> Optional[str]:
        """Read pre-computed voice transcript if available."""
        txt_path = voice_path.parent / "source.txt"
        if txt_path.exists():
            return txt_path.read_text().strip()
        return None

    def design(
        self,
        text: str,
        instruct: str,
        class_temperature: float = 0.3,
        seed: Optional[int] = None,
        as_wav: bool = False,
    ) -> Tuple[bytes, int, int]:
        """
        Generate speech audio in a designed (synthesized) voice from a speaker
        description string (no reference audio).

        `instruct` is OmniVoice's speaker-attribute syntax — e.g.
        "female, young adult, high pitch, british accent". See
        https://github.com/k2-fsa/OmniVoice/blob/master/docs/voice-design.md

        Set `as_wav=True` to return raw WAV bytes (used when the result must
        be persisted as data/voices/<name>/source.wav for later cloning).

        Returns:
            Tuple of (audio_bytes, generation_time_ms, duration_ms)
        """
        tts_model = self._get_model()
        wav = None
        buffer = None

        try:
            if seed is not None:
                _set_torch_seed(seed)

            start = time.time()
            with torch.inference_mode():
                audio_list = tts_model.generate(
                    text=text,
                    instruct=instruct,
                    class_temperature=class_temperature,
                )
            wav = torch.as_tensor(audio_list[0])
            if wav.dim() == 1:
                wav = wav.unsqueeze(0)
            gen_time_ms = int((time.time() - start) * 1000)

            duration_ms = int(wav.shape[1] / OMNIVOICE_SAMPLE_RATE * 1000)

            buffer = io.BytesIO()
            sf.write(buffer, wav.squeeze(0).cpu().numpy(), OMNIVOICE_SAMPLE_RATE, format="WAV")
            buffer.seek(0)
            wav_bytes = buffer.read()
            audio_bytes = wav_bytes if as_wav else encode_wav_to_opus(wav_bytes)

            return audio_bytes, gen_time_ms, duration_ms
        finally:
            del wav, buffer
            self._generation_count += 1
            if self._generation_count % CLEANUP_INTERVAL == 0:
                gc.collect()
                if settings.device == "mps":
                    torch.mps.empty_cache()
                elif settings.device == "cuda":
                    torch.cuda.empty_cache()

    def generate(
        self,
        text: str,
        voice: str | None = None,
    ) -> Tuple[bytes, int, Optional[list[dict]], int, Optional[float]]:
        """
        Generate speech audio from text with optional word-level timestamps.

        Returns:
            Tuple of (audio_bytes, generation_time_ms, word_timestamps_or_none, duration_ms, sampling_rate)
        """
        voice_name = voice or settings.default_voice
        voice_path = self.get_voice_path(voice_name)
        ref_text = self._get_ref_text(voice_path)

        tts_model = self._get_model()
        wav = None
        buffer = None

        try:
            start = time.time()
            prompt_start = time.time()
            prompt_result = self._voice_clone_prompt_cache.get_or_create(
                model=tts_model,
                voice_path=voice_path,
                reference_text=ref_text,
            )
            prompt_time_ms = int((time.time() - prompt_start) * 1000)
            generation_start = time.time()
            with torch.inference_mode():
                audio_list = tts_model.generate(
                    text=text,
                    voice_clone_prompt=prompt_result.prompt,
                    class_temperature=0.3,
                )
            model_generation_time_ms = int((time.time() - generation_start) * 1000)
            # OmniVoice returns ndarray for very short input; normalize to (1, T) tensor.
            wav = torch.as_tensor(audio_list[0])
            if wav.dim() == 1:
                wav = wav.unsqueeze(0)
            gen_time_ms = int((time.time() - start) * 1000)
            print(
                f"[tts] Voice prompt: {prompt_result.source} in {prompt_time_ms}ms; "
                f"model generation: {model_generation_time_ms}ms"
            )

            # Run forced alignment to get word-level timestamps
            alignment = get_alignment_service()
            timestamps = alignment.align(wav, OMNIVOICE_SAMPLE_RATE, text)

            duration_ms = int(wav.shape[1] / OMNIVOICE_SAMPLE_RATE * 1000)

            # Convert tensor to WAV bytes, then encode to Opus.
            # torchaudio>=2.10 routes save() through torchcodec, which rejects
            # unnamed BytesIO ("check the desired extension"). Use soundfile
            # directly — it accepts BytesIO when format is passed explicitly.
            buffer = io.BytesIO()
            sf.write(buffer, wav.squeeze(0).cpu().numpy(), OMNIVOICE_SAMPLE_RATE, format="WAV")
            buffer.seek(0)
            opus_bytes = encode_wav_to_opus(buffer.read())

            return opus_bytes, gen_time_ms, timestamps, duration_ms, None
        finally:
            del wav, buffer
            self._generation_count += 1
            if self._generation_count % CLEANUP_INTERVAL == 0:
                gc.collect()
                if settings.device == "mps":
                    torch.mps.empty_cache()
                elif settings.device == "cuda":
                    torch.cuda.empty_cache()


def _set_torch_seed(seed: int) -> None:
    """Seed every backend torch may use so design() is reproducible across MPS/CUDA/CPU."""
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    if hasattr(torch, "mps") and torch.backends.mps.is_available():
        torch.mps.manual_seed(seed)


# Singleton instance
_tts_service: TTSService | None = None


def get_tts_service() -> TTSService:
    """Get the singleton TTS service instance."""
    global _tts_service
    if _tts_service is None:
        _tts_service = TTSService()
    return _tts_service
