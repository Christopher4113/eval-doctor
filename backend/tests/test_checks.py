import sys
from array import array
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import scoring
from checks import audio, config, post_run, truth


def ids(findings):
    return {f["id"] for f in findings}


def test_every_finding_has_a_fix():
    cfg = {"speech_model": "best", "prompt": "x", "keyterms_prompt": ["y"],
           "language_detection_options": {"expected_languages": ["pl"]}}
    for f in config.check_config(cfg) + config.check_config({}):
        assert f["fix"].strip()


def test_deprecated_param_and_model():
    got = ids(config.check_config({"speech_model": "nano", "language_code": "en"}))
    assert {"deprecated_param", "deprecated_model"} <= got
    assert ids(config.check_config({"speech_models": ["universal-3-5-pro"], "language_code": "en"})) == set()


def test_prompt_and_keyterms_only_on_u3():
    both = {"prompt": "p", "keyterms_prompt": ["k"], "language_code": "en"}
    assert "prompt_and_keyterms" in ids(config.check_config({**both, "speech_models": ["universal-3-5-pro"]}))
    assert "prompt_and_keyterms" not in ids(config.check_config({**both, "speech_models": ["universal-2"]}))


def test_silent_fallback_risk():
    cfg = {"speech_models": ["universal-3-5-pro"], "language_code": "pl"}
    assert "silent_fallback_risk" in ids(config.check_config(cfg))
    cfg["speech_models"].append("universal-2")
    assert "silent_fallback_risk" not in ids(config.check_config(cfg))
    assert "silent_fallback_risk" not in ids(config.check_config({"language_code": "es"}))


def test_no_language_setting():
    assert "no_language_setting" in ids(config.check_config({}))


def test_fixed_config():
    fixed = config.fixed_config({"speech_model": "best", "prompt": "p", "keyterms_prompt": ["k"],
                                 "language_detection_options": {"expected_languages": ["en", "pl"]}})
    assert "speech_model" not in fixed and "prompt" not in fixed
    assert fixed["speech_models"] == ["universal-3-5-pro", "universal-2"]


def test_stream_mismatch():
    infos = {"a.wav": {"codec": "pcm_s16le", "sample_rate": 8000},
             "b.wav": {"codec": "pcm_mulaw", "sample_rate": 16000},
             "c.mp3": {"codec": "mp3", "sample_rate": 44100}}
    got = config.check_stream({"sample_rate": 16000, "encoding": "pcm_s16le"}, infos)
    assert [(f["id"], f["file"]) for f in got] == [
        ("stream_sample_rate_mismatch", "a.wav"), ("stream_encoding_mismatch", "b.wav")]


def test_audio_checks():
    assert ids(audio.check_audio("x", {"sample_rate": 8000, "channels": 2},
                                 {"silence_ratio": 0.7, "clip_ratio": 0.01})) == {
        "telephony_audio", "stereo_dual_channel", "mostly_silence", "clipping"}
    assert audio.check_audio("x", {"sample_rate": 16000, "channels": 1},
                             {"silence_ratio": 0.1, "clip_ratio": 0}) == []


def test_signal_stats():
    silent = audio.signal_stats(array("h", [0] * 3200))
    loud = audio.signal_stats(array("h", [32767, -32767] * 1600))
    assert silent["silence_ratio"] == 1.0 and loud["clip_ratio"] == 1.0


def test_pairing():
    pairs, f = truth.pair_files(["a.wav", "b.mp3"], ["a.txt", "c.txt"])
    assert pairs == {"a.wav": "a.txt"}
    assert ids(f) == {"missing_truth", "orphan_truth"}


def test_truth_checks():
    srt = "1\n00:00:00,000 --> 00:00:02,000\nHello there.\n"
    assert "truth_has_timestamps" in ids(truth.check_truth("t.srt", srt))
    assert "truth_has_timestamps" in ids(truth.check_truth("t.txt", "[00:01:02] hello"))
    labels = "Agent: hi\nCustomer: hello\n"
    assert "truth_has_speaker_labels" in ids(truth.check_truth("t.txt", labels))
    assert truth.check_truth("t.txt", "Just plain words here.") == []
    assert truth.clean_truth(srt) == "Hello there."
    assert truth.clean_truth(labels) == "hi hello"


def test_truth_vs_hyp():
    assert "truth_wrong_file" in ids(truth.check_truth_vs_hyp("t", "a b", "c d", 0.95))
    assert "truth_casing_punct" in ids(truth.check_truth_vs_hyp("t", "hello there", "Hello there.", 0.0))
    assert truth.check_truth_vs_hyp("t", "Hello there.", "Hello there.", 0.0) == []


def test_post_run():
    assert ids(post_run.check_fallback("f", "universal-3-5-pro", "universal-2", "pl")) == {"fallback_happened"}
    assert post_run.check_fallback("f", "universal-3-5-pro", "universal-3-5-pro", "en") == []
    assert ids(post_run.check_normalization_gap(0.30, 0.05)) == {"normalization_gap"}
    assert post_run.check_normalization_gap(0.06, 0.05) == []


def test_scoring_raw_vs_normalized():
    s = scoring.score("it's about five minutes", "It's about 5 minutes.", "en")
    assert s["raw_wer"] > s["normalized_wer"]
    assert s["normalized_wer"] == 0.0


def test_aggregate_is_word_weighted():
    short = {"raw_errors": 1, "raw_ref_words": 1, "norm_errors": 1, "norm_ref_words": 1}
    long = {"raw_errors": 0, "raw_ref_words": 99, "norm_errors": 0, "norm_ref_words": 99}
    assert scoring.aggregate([short, long])["normalized_wer"] == 0.01  # mean of WERs would be 0.5


def test_health():
    assert scoring.health([{"severity": "error"}, {"severity": "warning"}, {"severity": "info"}]) == 67
    assert scoring.health([{"severity": "error"}] * 5) == 0
