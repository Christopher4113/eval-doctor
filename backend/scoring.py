"""WER (raw vs normalized), alignment and the Eval Health score."""
import re

import jiwer
from whisper_normalizer.basic import BasicTextNormalizer
from whisper_normalizer.english import EnglishTextNormalizer

_en = EnglishTextNormalizer()
_basic = BasicTextNormalizer()


def raw_norm(text):
    return re.sub(r"\s+", " ", text.lower()).strip()


def full_norm(text, language):
    n = _en if (language or "en").startswith("en") else _basic
    return re.sub(r"\s+", " ", n(text)).strip()


def _align(ref, hyp):
    if not ref:
        return {"wer": 1.0 if hyp else 0.0, "errors": len(hyp.split()), "ref_words": 0, "ops": []}
    out = jiwer.process_words(ref, hyp or "")
    r, h = out.references[0], out.hypotheses[0]
    ops = []
    for c in out.alignments[0]:
        if c.type == "equal":
            ops += [{"op": "eq", "ref": w} for w in r[c.ref_start_idx:c.ref_end_idx]]
        elif c.type == "substitute":
            ops += [{"op": "sub", "ref": a, "hyp": b}
                    for a, b in zip(r[c.ref_start_idx:c.ref_end_idx], h[c.hyp_start_idx:c.hyp_end_idx])]
        elif c.type == "delete":
            ops += [{"op": "del", "ref": w} for w in r[c.ref_start_idx:c.ref_end_idx]]
        else:
            ops += [{"op": "ins", "hyp": w} for w in h[c.hyp_start_idx:c.hyp_end_idx]]
    errors = out.substitutions + out.deletions + out.insertions
    return {"wer": errors / len(r), "errors": errors, "ref_words": len(r), "ops": ops}


def score(ref, hyp, language):
    """Same normalization applied to both sides."""
    raw = _align(raw_norm(ref), raw_norm(hyp))
    norm = _align(full_norm(ref, language), full_norm(hyp, language))
    return {
        "raw_wer": raw["wer"], "normalized_wer": norm["wer"],
        "raw_errors": raw["errors"], "norm_errors": norm["errors"],
        "raw_ref_words": raw["ref_words"], "norm_ref_words": norm["ref_words"],
        "diff": {"raw": raw["ops"], "normalized": norm["ops"]},
    }


def aggregate(scores):
    """Weighted by reference word count: total errors / total reference words.
    Not the mean of per-file WERs (that over-weights short files)."""
    rw = sum(s["raw_ref_words"] for s in scores) or 1
    nw = sum(s["norm_ref_words"] for s in scores) or 1
    return {
        "raw_wer": sum(s["raw_errors"] for s in scores) / rw,
        "normalized_wer": sum(s["norm_errors"] for s in scores) / nw,
        "ref_words": sum(s["raw_ref_words"] for s in scores),
    }


def health(findings):
    errors = sum(f["severity"] == "error" for f in findings)
    warnings = sum(f["severity"] == "warning" for f in findings)
    return max(0, 100 - 25 * errors - 8 * warnings)
