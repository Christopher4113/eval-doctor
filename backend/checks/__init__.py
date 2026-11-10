def finding(id, severity, title, detail, fix, file=None, snippet=None):
    """Every check returns these. `snippet` is an optional copyable config/text fix."""
    f = {"id": id, "severity": severity, "title": title, "detail": detail, "fix": fix}
    if file:
        f["file"] = file
    if snippet:
        f["snippet"] = snippet
    return f
