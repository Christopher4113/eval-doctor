"""AssemblyAI async transcription with a disk cache.

Cache: backend/.cache/{sha256(audio + config)}.json. Without an API key we fall back to
demo/cached/{stem}.json (mock mode).
"""
import hashlib
import json
import os
import time
from pathlib import Path

import requests

BASE = "https://api.assemblyai.com"
ROOT = Path(__file__).resolve().parent
CACHE_DIR = ROOT / ".cache"
DEMO_CACHED = Path(os.environ.get("DEMO_DIR", ROOT.parent / "demo")) / "cached"


class NoTranscript(Exception):
    pass


def api_key():
    return os.environ.get("ASSEMBLYAI_API_KEY", "").strip()


def cache_key(audio_path, cfg):
    h = hashlib.sha256(Path(audio_path).read_bytes())
    h.update(json.dumps(cfg, sort_keys=True).encode())
    return h.hexdigest()


def cached(audio_path, cfg):
    """Returns (response, source) or (None, None). source: 'cache' | 'mock'."""
    p = CACHE_DIR / f"{cache_key(audio_path, cfg)}.json"
    if p.exists():
        return json.loads(p.read_text()), "cache"
    if not api_key():
        m = DEMO_CACHED / f"{Path(audio_path).stem}.json"
        if m.exists():
            return json.loads(m.read_text()), "mock"
    return None, None


def transcribe(audio_path, cfg, poll_s=2.0, timeout_s=600):
    resp, source = cached(audio_path, cfg)
    if resp:
        return resp, source
    key = api_key()
    if not key:
        raise NoTranscript(
            f"No ASSEMBLYAI_API_KEY set and no cached transcript for {Path(audio_path).name}."
        )
    h = {"authorization": key}
    with open(audio_path, "rb") as f:
        up = requests.post(f"{BASE}/v2/upload", headers=h, data=f, timeout=120)
    up.raise_for_status()
    body = {**cfg, "audio_url": up.json()["upload_url"]}
    r = requests.post(f"{BASE}/v2/transcript", headers=h, json=body, timeout=30)
    if r.status_code >= 400:
        raise NoTranscript(f"AssemblyAI rejected the request: {r.text[:300]}")
    tid = r.json()["id"]
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        t = requests.get(f"{BASE}/v2/transcript/{tid}", headers=h, timeout=30).json()
        if t["status"] == "completed":
            CACHE_DIR.mkdir(exist_ok=True)
            (CACHE_DIR / f"{cache_key(audio_path, cfg)}.json").write_text(json.dumps(t, indent=2))
            return t, "api"
        if t["status"] == "error":
            raise NoTranscript(f"Transcription failed: {t.get('error')}")
        time.sleep(poll_s)
    raise NoTranscript("Timed out waiting for transcript.")
