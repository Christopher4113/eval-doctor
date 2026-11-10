import json
import os
import tempfile
import threading
import time
import uuid
from pathlib import Path

from flask import Flask, jsonify, request
from werkzeug.utils import secure_filename

import assemblyai_client as aai
import scoring
from checks import audio as audio_checks
from checks import config as config_checks
from checks import post_run, truth as truth_checks
from report import build_report

DEMO = Path(os.environ.get("DEMO_DIR", Path(__file__).resolve().parent.parent / "demo"))
# ponytail: pacing so the stepper is readable on camera when everything is cached. 0 to disable.
PACE = float(os.environ.get("PACE_SECONDS", "0.6"))
STEPS = [("lint", "Config lint"), ("audio", "Audio checks"), ("transcribe", "Transcribing"), ("score", "Scoring")]

app = Flask(__name__)
app.json.sort_keys = False  # keep the customer's config in their order
# ponytail: in-memory job store, single process. Use Redis if this ever runs multi-worker.
JOBS = {}


def _new_job():
    jid = uuid.uuid4().hex[:12]
    JOBS[jid] = {
        "status": "running", "step": "lint", "progress": 0.0,
        "steps": [{"key": k, "label": l, "status": "pending"} for k, l in STEPS],
        "transcribed": 0, "total": 0, "findings": [], "files": [],
        "aggregate": None, "health": None, "report_md": "", "fixed_config": None,
        "mock": False, "error": None,
    }
    return jid


def _step(job, key, status):
    for s in job["steps"]:
        if s["key"] == key:
            s["status"] = status
    if status == "running":
        job["step"] = key


def run_job(job, audio_paths, truth_paths, cfg, stream_cfg):
    try:
        f = job["findings"]
        # 1. Lint
        _step(job, "lint", "running")
        f += config_checks.check_config(cfg)
        fixed = config_checks.fixed_config(cfg)
        job["fixed_config"] = fixed
        time.sleep(PACE)
        _step(job, "lint", "done"); job["progress"] = 0.2

        # 2. Audio + truth file checks
        _step(job, "audio", "running")
        pairs, pair_findings = truth_checks.pair_files([p.name for p in audio_paths], [p.name for p in truth_paths])
        f += pair_findings
        by_name = {p.name: p for p in audio_paths + truth_paths}
        infos = {}
        for p in audio_paths:
            infos[p.name] = audio_checks.probe(p)
            f += audio_checks.check_audio(p.name, infos[p.name], audio_checks.stats(p))
        f += config_checks.check_stream(stream_cfg, infos)
        truth_text = {}
        for a, t in pairs.items():
            truth_text[a] = by_name[t].read_text(encoding="utf-8", errors="replace")
            f += truth_checks.check_truth(t, truth_text[a])
        time.sleep(PACE)
        _step(job, "audio", "done"); job["progress"] = 0.4

        # 3. Transcribe (with the corrected config)
        _step(job, "transcribe", "running")
        job["total"] = len(pairs)
        hyps = {}
        for a in pairs:
            resp, source = aai.transcribe(by_name[a], fixed)
            job["mock"] |= source == "mock"
            hyps[a] = resp
            job["transcribed"] += 1
            job["progress"] = 0.4 + 0.4 * job["transcribed"] / max(1, len(pairs))
            if source != "api":
                time.sleep(PACE / 2)
        _step(job, "transcribe", "done")

        # 4. Score
        _step(job, "score", "running")
        expected = config_checks.effective_models(fixed)[0]
        scores = []
        for a, t in pairs.items():
            resp = hyps[a]
            lang = resp.get("language_code") or cfg.get("language_code") or "en"
            ref = truth_checks.clean_truth(truth_text[a])
            hyp = resp.get("text") or ""
            s = scoring.score(ref, hyp, lang)
            scores.append(s)
            file_findings = (
                truth_checks.check_truth_vs_hyp(t, ref, hyp, s["normalized_wer"])
                + post_run.check_fallback(a, expected, resp.get("speech_model_used"), lang)
            )
            f += file_findings
            job["files"].append({
                "name": a, "truth_name": t, "language": lang,
                "speech_model_used": resp.get("speech_model_used"),
                "duration": infos[a]["duration"], "sample_rate": infos[a]["sample_rate"],
                "channels": infos[a]["channels"],
                "raw_wer": s["raw_wer"], "normalized_wer": s["normalized_wer"],
                "ref_words": s["raw_ref_words"],
                "truth_text": ref, "hyp_text": hyp, "diff": s["diff"],
            })
        agg = scoring.aggregate(scores) if scores else {"raw_wer": 0, "normalized_wer": 0, "ref_words": 0}
        f += post_run.check_normalization_gap(agg["raw_wer"], agg["normalized_wer"])
        for file in job["files"]:
            file["findings_count"] = sum(x.get("file") in (file["name"], file["truth_name"]) for x in f)
        stream_fixes = next((x.get("snippet") for x in f if x["id"] == "stream_sample_rate_mismatch"), None)
        job["aggregate"] = agg
        job["health"] = scoring.health(f)
        job["report_md"] = build_report(
            f, job["files"], agg, fixed, json.loads(stream_fixes) if stream_fixes else None
        )
        time.sleep(PACE)
        _step(job, "score", "done")
        job["progress"] = 1.0
        job["status"] = "done"
    except aai.NoTranscript as e:
        job["status"], job["error"], job["error_kind"] = "error", str(e), "no_key"
    except Exception as e:  # surface anything else to the UI rather than hang
        job["status"], job["error"] = "error", f"{type(e).__name__}: {e}"


def _start(audio_paths, truth_paths, cfg, stream_cfg):
    jid = _new_job()
    threading.Thread(target=run_job, args=(JOBS[jid], audio_paths, truth_paths, cfg, stream_cfg), daemon=True).start()
    return jid


def _demo_inputs():
    return (
        sorted((DEMO / "audio").iterdir()),
        sorted((DEMO / "truth").iterdir()),
        json.loads((DEMO / "config.json").read_text()),
        json.loads((DEMO / "stream_config.json").read_text()),
    )


def _parse_json(field):
    raw = request.form.get(field, "").strip()
    if not raw:
        return None
    try:
        v = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"{field} isn't valid JSON: {e.msg} (line {e.lineno})")
    if not isinstance(v, dict):
        raise ValueError(f"{field} must be a JSON object")
    return v


@app.post("/api/analyze")
def analyze():
    try:
        cfg = _parse_json("config") or {}
        stream_cfg = _parse_json("stream_config")
    except ValueError as e:
        return jsonify(error=str(e)), 400
    if request.form.get("demo") == "1":
        audio_paths, truth_paths, _, _ = _demo_inputs()
    else:
        tmp = Path(tempfile.mkdtemp(prefix="evaldoc-"))
        audio_paths, truth_paths = [], []
        for field, bucket in (("audio", audio_paths), ("truth", truth_paths)):
            for up in request.files.getlist(field):
                name = secure_filename(up.filename or "")
                if not name:
                    continue
                (tmp / field).mkdir(exist_ok=True)
                p = tmp / field / name
                up.save(p)
                bucket.append(p)
        if not audio_paths:
            return jsonify(error="Add at least one audio file."), 400
    return jsonify(job_id=_start(audio_paths, truth_paths, cfg, stream_cfg))


@app.get("/api/demo")
def demo():
    return jsonify(job_id=_start(*_demo_inputs()))


@app.get("/api/demo/manifest")
def demo_manifest():
    audio_paths, truth_paths, cfg, stream_cfg = _demo_inputs()
    return jsonify(
        customer="Northwind Telecom",
        audio=[{"name": p.name, "size": p.stat().st_size} for p in audio_paths],
        truth=[{"name": p.name, "size": p.stat().st_size} for p in truth_paths],
        config=cfg, stream_config=stream_cfg,
    )


@app.get("/api/jobs/<jid>")
def job(jid):
    j = JOBS.get(jid)
    return (jsonify(j), 200) if j else (jsonify(error="unknown job"), 404)


@app.get("/api/health")
def health():
    return jsonify(ok=True, mock=not aai.api_key())


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5001)), debug=False, threaded=True)
