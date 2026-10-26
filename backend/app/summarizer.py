"""Temporary deterministic summarizer used until OpenRouter is integrated."""

MOCK_TAGS = ["insighttag", "development", "mock-summary"]
SUMMARY_LIMIT = 200


def summarize_text(text: str) -> tuple[str, list[str]]:
    """Return a predictable development summary and exactly three tags."""
    normalized_text = " ".join(text.split())
    if len(normalized_text) <= SUMMARY_LIMIT:
        summary = normalized_text
    else:
        summary = f"{normalized_text[: SUMMARY_LIMIT - 3].rstrip()}..."
    return summary, MOCK_TAGS.copy()
