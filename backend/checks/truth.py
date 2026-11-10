"""Truth (reference transcript) checks. Pure functions."""
import re
from pathlib import PurePath

from . import finding

TIMESTAMP_RE = re.compile(r"-->|^WEBVTT|\[\d{1,2}:\d{2}(:\d{2})?\]|\b\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\b", re.M)
SPEAKER_RE = re.compile(
    r"^\s*(speaker\s*\w+|agent|customer|caller|rep|representative|interviewer|interviewee|host|guest|doctor|patient)\s*:",
    re.I | re.M,
)


def stem(name):
    return PurePath(name).stem


def pair_files(audio_names, truth_names):
    """Returns ({audio: truth}, findings) pairing on filename stem."""
    truths = {stem(t): t for t in truth_names}
    audios = {stem(a): a for a in audio_names}
    pairs, out = {}, []
    for s, a in audios.items():
        if s in truths:
            pairs[a] = truths[s]
        else:
            out.append(finding(
                "missing_truth", "error", "Audio file has no truth file",
                f"No truth file named {s}.* was found, so this file can't be scored.",
                f"Add a reference transcript named {s}.txt.", file=a,
            ))
    for s, t in truths.items():
        if s not in audios:
            out.append(finding(
                "orphan_truth", "error", "Truth file has no audio",
                "This truth file doesn't match any audio filename.",
                "Rename it to match its audio file, or remove it from the set.", file=t,
            ))
    return pairs, out


def has_timestamps(text):
    return bool(TIMESTAMP_RE.search(text))


def has_speaker_labels(text):
    return len(SPEAKER_RE.findall(text)) >= 2


def clean_truth(text):
    """Strip SRT/VTT scaffolding, timestamps and speaker labels so the words can be scored."""
    lines = []
    for line in text.splitlines():
        s = line.strip()
        if not s or s == "WEBVTT" or s.isdigit() or "-->" in s:
            continue
        s = re.sub(r"\[\d{1,2}:\d{2}(:\d{2})?\]", "", s)
        s = SPEAKER_RE.sub("", s)
        lines.append(s.strip())
    return " ".join(l for l in lines if l)


def is_unformatted(text):
    words = re.sub(r"\s+", " ", text).strip()
    return bool(words) and words == words.lower() and not re.search(r"[.,?!;:]", words)


def check_truth(name, text):
    out = []
    if has_timestamps(text):
        out.append(finding(
            "truth_has_timestamps", "error", "Truth file contains timestamps",
            "Looks like an SRT/VTT caption file. Index numbers and timecodes get scored as words and wreck WER.",
            "Export plain text only. (Eval Doctor stripped them for this run so you can see the real score.)",
            file=name,
        ))
    if has_speaker_labels(text):
        out.append(finding(
            "truth_has_speaker_labels", "warning", "Truth file has speaker labels",
            'Lines start with labels like "Agent:" or "Customer:". The model never says these words, so each one counts as a deletion.',
            "Remove the labels from the reference text. Score diarization separately if it matters.",
            file=name,
        ))
    return out


def check_truth_vs_hyp(name, truth_text, hyp_text, normalized_wer):
    out = []
    if normalized_wer > 0.8:
        out.append(finding(
            "truth_wrong_file", "error", "Truth probably belongs to a different file",
            f"Normalized WER is {normalized_wer:.0%}. That's too high to be recognition errors.",
            "Check that this truth file was paired with the right audio.",
            file=name,
        ))
    if is_unformatted(truth_text) and not is_unformatted(hyp_text):
        out.append(finding(
            "truth_casing_punct", "info", "Truth has no casing or punctuation",
            "The reference is all lowercase with no punctuation, but the transcript is formatted. Raw WER counts every comma and capital as an error.",
            "Compare normalized WER, or normalize both sides the same way before scoring.",
            file=name,
        ))
    return out
