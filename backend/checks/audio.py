"""Audio inspection via ffprobe/ffmpeg, plus pure checks on the results."""
import json
import math
import subprocess
from array import array

from . import finding

SILENCE_DBFS = -45.0
FRAME = 320  # 20 ms at 16 kHz


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0",
         "-show_entries", "stream=codec_name,sample_rate,channels:format=duration",
         "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout
    data = json.loads(out)
    s = data["streams"][0]
    return {
        "codec": s.get("codec_name", ""),
        "sample_rate": int(s.get("sample_rate", 0)),
        "channels": int(s.get("channels", 0)),
        "duration": round(float(data["format"].get("duration", 0)), 2),
    }


def stats(path):
    """Silence ratio and clipping ratio from 16 kHz mono PCM."""
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
        capture_output=True, check=True,
    ).stdout
    samples = array("h", raw[: len(raw) // 2 * 2])
    return signal_stats(samples)


def signal_stats(samples):
    if not samples:
        return {"silence_ratio": 1.0, "clip_ratio": 0.0}
    thresh = 32768 * 10 ** (SILENCE_DBFS / 20)
    frames = silent = 0
    for i in range(0, len(samples) - FRAME + 1, FRAME):
        chunk = samples[i:i + FRAME]
        rms = math.sqrt(sum(x * x for x in chunk) / FRAME)
        frames += 1
        silent += rms < thresh
    clipped = sum(1 for x in samples if x >= 32700 or x <= -32700)
    return {
        "silence_ratio": round(silent / frames, 3) if frames else 1.0,
        "clip_ratio": round(clipped / len(samples), 4),
    }


def check_audio(name, info, st):
    out = []
    if info.get("sample_rate") and info["sample_rate"] <= 8000:
        out.append(finding(
            "telephony_audio", "info", "Telephony audio (8 kHz)",
            "This is narrowband phone audio. Expect higher WER than wideband recordings of the same speech.",
            "Benchmark phone audio separately from wideband audio and set the customer's expectations with that baseline.",
            file=name,
        ))
    if info.get("channels") == 2:
        out.append(finding(
            "stereo_dual_channel", "info", "Stereo / dual-channel audio",
            "Two channels usually means agent and customer are on separate tracks.",
            "Try multichannel transcription so each speaker is transcribed from their own channel.",
            file=name, snippet='{\n  "multichannel": true\n}',
        ))
    if st.get("silence_ratio", 0) > 0.5:
        out.append(finding(
            "mostly_silence", "warning", "Mostly silence",
            f"{st['silence_ratio']:.0%} of this file is below {SILENCE_DBFS:.0f} dBFS.",
            "Check that the right channel or file was exported. Silence inflates duration but adds no scoring signal.",
            file=name,
        ))
    if st.get("clip_ratio", 0) > 0.001:
        out.append(finding(
            "clipping", "warning", "Audio is clipping",
            f"{st['clip_ratio']:.2%} of samples hit full scale.",
            "Re-export at a lower gain. Clipped audio is a recording problem, not a model problem.",
            file=name,
        ))
    return out
