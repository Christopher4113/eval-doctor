"""Run the bundled demo against the real API and save responses to demo/cached/.

    ASSEMBLYAI_API_KEY=... python backend/refresh_demo_cache.py
"""
import json
import sys

import assemblyai_client as aai
from app import _demo_inputs
from checks.config import fixed_config

if not aai.api_key():
    sys.exit("Set ASSEMBLYAI_API_KEY first.")

audio_paths, _, cfg, _ = _demo_inputs()
fixed = fixed_config(cfg)
for p in audio_paths:
    resp, source = aai.transcribe(p, fixed)
    keep = {k: resp.get(k) for k in ("id", "status", "language_code", "speech_model_used", "audio_duration", "text")}
    (aai.DEMO_CACHED / f"{p.stem}.json").write_text(json.dumps(keep, indent=2, ensure_ascii=False) + "\n")
    print(f"{p.name}: {resp.get('speech_model_used')} ({source})")
