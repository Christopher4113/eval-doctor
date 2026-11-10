"""Checks that need the transcription result."""
from . import finding


def check_fallback(name, expected_model, used_model, language):
    if not used_model or used_model == expected_model:
        return []
    return [finding(
        "fallback_happened", "warning", f"Ran on {used_model}, not {expected_model}",
        f"speech_model_used is {used_model} for this {language or 'unknown'}-language file. Its score isn't a {expected_model} score.",
        "Report this file separately, or scope the benchmark to languages the target model supports.",
        file=name,
    )]


def check_normalization_gap(raw_wer, normalized_wer):
    gap = (raw_wer - normalized_wer) * 100
    if gap <= 5:
        return []
    return [finding(
        "normalization_gap", "info", f"{gap:.1f} pts of WER is formatting",
        f"Raw WER is {raw_wer:.1%}, normalized WER is {normalized_wer:.1%}. Most of this gap is casing, punctuation and number formatting, not recognition.",
        "Quote normalized WER, with the same normalizer applied to truth and transcript.",
    )]
