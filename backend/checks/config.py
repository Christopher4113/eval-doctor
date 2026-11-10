"""Config lint. Pure functions, no network.

Model facts from https://www.assemblyai.com/md/models (last updated 2026-10-27).
"""
import json

from . import finding

U3 = "universal-3-5-pro"
U2 = "universal-2"
DEPRECATED_MODELS = {"best": U3, "nano": U2, "slam-1": U3}
# Universal-3.5 Pro (async) languages. Anything else may silently run on Universal-2.
U3_LANGUAGES = {
    "en", "es", "de", "fr", "it", "pt", "ar", "da", "nl", "fi",
    "he", "hi", "ja", "zh", "no", "sv", "tr", "vi",
}


def requested_models(cfg):
    """Models as the customer wrote them (default model when none set)."""
    if "speech_models" in cfg:
        return list(cfg["speech_models"])
    if "speech_model" in cfg:
        return [cfg["speech_model"]]
    return [U3]


def effective_models(cfg):
    """Requested models with deprecated aliases resolved."""
    return [DEPRECATED_MODELS.get(m, m) for m in requested_models(cfg)]


def declared_languages(cfg):
    langs = set()
    if cfg.get("language_code"):
        langs.add(cfg["language_code"].split("_")[0].lower())
    opts = cfg.get("language_detection_options") or {}
    langs |= {l.split("_")[0].lower() for l in opts.get("expected_languages", [])}
    return langs


def _fallback_risk(cfg):
    models = effective_models(cfg)
    if U3 not in models or U2 in models:
        return set()
    return declared_languages(cfg) - U3_LANGUAGES


def fixed_config(cfg):
    """The corrected request config we recommend (and actually run)."""
    out = {k: v for k, v in cfg.items() if k != "speech_model"}
    models = []
    for m in effective_models(cfg):
        if m not in models:
            models.append(m)
    if _fallback_risk(cfg):
        models.append(U2)
    out["speech_models"] = models
    if U3 in models and cfg.get("prompt") and cfg.get("keyterms_prompt"):
        out.pop("prompt")  # keep keyterms: they're the customer's vocabulary
    if "slam-1" in requested_models(cfg):
        out.setdefault("domain", "medical-v1")
    return out


def _snip(d):
    return json.dumps(d, indent=2)


def check_config(cfg):
    out = []
    models = requested_models(cfg)
    fixed_models = fixed_config(cfg)["speech_models"]

    if "speech_model" in cfg:
        out.append(finding(
            "deprecated_param", "error",
            "Deprecated parameter: speech_model",
            f'Config uses "speech_model": "{cfg["speech_model"]}". The singular parameter is deprecated.',
            "Use the speech_models list instead. It also lets you set an explicit fallback.",
            snippet=_snip({"speech_models": fixed_models}),
        ))

    old = [m for m in models if m in DEPRECATED_MODELS]
    if old:
        repl = ", ".join(f'"{m}" → "{DEPRECATED_MODELS[m]}"' for m in old)
        out.append(finding(
            "deprecated_model", "error",
            f'Deprecated model: {", ".join(old)}',
            f"These model names are retired aliases ({repl}). The benchmark may not be testing the model you think.",
            f"Request {DEPRECATED_MODELS[old[0]]} by name."
            + (' For medical audio add "domain": "medical-v1".' if "slam-1" in old else ""),
            snippet=_snip({"speech_models": fixed_models}),
        ))

    if U3 in effective_models(cfg) and cfg.get("prompt") and cfg.get("keyterms_prompt"):
        out.append(finding(
            "prompt_and_keyterms", "error",
            "prompt and keyterms_prompt are both set",
            "On Universal-3.5 Pro (pre-recorded) these are mutually exclusive, so the request won't run as written.",
            "Keep keyterms_prompt for domain vocabulary and drop prompt (or fold the keyterms into the prompt).",
            snippet=_snip({"keyterms_prompt": cfg["keyterms_prompt"]}),
        ))

    risky = _fallback_risk(cfg)
    if risky:
        out.append(finding(
            "silent_fallback_risk", "warning",
            f"Silent fallback risk for: {', '.join(sorted(risky))}",
            f"Universal-3.5 Pro doesn't support {', '.join(sorted(risky))}. Those files can silently run on Universal-2 with no error, so the scores mix two models.",
            "Make the fallback explicit with a model list, and check speech_model_used on each response.",
            snippet=_snip({"speech_models": [U3, U2]}),
        ))

    if not cfg.get("language_code") and not cfg.get("language_detection"):
        out.append(finding(
            "no_language_setting", "info",
            "No language setting",
            "Neither language_code nor language_detection is set, so non-English files may be transcribed as English.",
            "Set language_code for single-language sets, or language_detection: true for mixed sets.",
            snippet=_snip({"language_detection": True}),
        ))
    return out


ENCODING_FOR_CODEC = {"pcm_s16le": "pcm_s16le", "pcm_mulaw": "pcm_mulaw"}


def check_stream(stream_cfg, audio):
    """audio: {filename: probe_info}. Only PCM files are comparable to a PCM stream."""
    out = []
    if not stream_cfg:
        return out
    rate = stream_cfg.get("sample_rate")
    enc = stream_cfg.get("encoding")
    for name, info in audio.items():
        codec = info.get("codec", "")
        if not codec.startswith("pcm_"):
            continue
        if rate and info.get("sample_rate") and int(rate) != int(info["sample_rate"]):
            out.append(finding(
                "stream_sample_rate_mismatch", "error",
                "Streaming sample_rate doesn't match the audio",
                f"Stream config says {rate} Hz but this file is {info['sample_rate']} Hz. Mismatched rates produce garbage transcripts.",
                f"Set sample_rate to {info['sample_rate']} for this source (or resample the audio to {rate} Hz before streaming).",
                file=name,
                snippet=_snip({**stream_cfg, "sample_rate": info["sample_rate"]}),
            ))
        actual = ENCODING_FOR_CODEC.get(codec)
        if enc and actual and enc != actual:
            out.append(finding(
                "stream_encoding_mismatch", "error",
                "Streaming encoding doesn't match the audio",
                f"Stream config says {enc} but this file is {actual}.",
                f"Set encoding to {actual}.",
                file=name,
                snippet=_snip({**stream_cfg, "encoding": actual}),
            ))
    return out
