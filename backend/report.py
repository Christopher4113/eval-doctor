"""Customer-ready markdown summary, written like a Slack message."""
import json


def _pct(x):
    return f"{x * 100:.1f}%"


def build_report(findings, files, aggregate, fixed_cfg, stream_fixes, customer="there"):
    errors = [f for f in findings if f["severity"] == "error"]
    warnings = [f for f in findings if f["severity"] == "warning"]
    raw, norm = aggregate["raw_wer"], aggregate["normalized_wer"]
    gap = (raw - norm) * 100

    lines = [
        f"Hey {customer}! I went through your eval setup before we look at accuracy numbers. "
        f"Found {len(errors)} thing{'s' if len(errors) != 1 else ''} that would break the benchmark "
        f"and {len(warnings)} worth a look. All quick fixes.",
        "",
        "**The headline**",
        f"- Raw WER across the set is **{_pct(raw)}**, but normalized WER is **{_pct(norm)}**."
        + (f" About **{gap:.1f} points** of the gap is formatting (casing, punctuation, numbers), not recognition." if gap > 1 else ""),
        f"- Both numbers are weighted by reference word count ({aggregate['ref_words']} words), not averaged per file.",
        "",
        "**What to fix**",
    ]
    for f in errors + warnings:
        where = f" (`{f['file']}`)" if f.get("file") else ""
        lines.append(f"- **{f['title']}**{where}: {f['fix']}")

    lines += [
        "",
        "**Corrected request config**",
        "```json",
        json.dumps(fixed_cfg, indent=2),
        "```",
    ]
    if stream_fixes:
        lines += [
            "",
            "**Streaming config for 8 kHz sources**",
            "```json",
            json.dumps(stream_fixes, indent=2),
            "```",
        ]

    lines += ["", "**Per file (normalized WER)**"]
    for f in files:
        lines.append(
            f"- `{f['name']}`: {_pct(f['normalized_wer'])} on {f['speech_model_used'] or 'n/a'}"
            f" (raw {_pct(f['raw_wer'])})"
        )

    lines += [
        "",
        "Once the truth files are plain text and the config is updated, re-run and I'll send the "
        "clean numbers. Happy to jump on a call if anything's unclear!",
    ]
    return "\n".join(lines)
