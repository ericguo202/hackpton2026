"""
`stt._speech_span_seconds` — the words-per-minute denominator.

The span is derived from ElevenLabs' per-word timestamps rather than the
top-level `audio_duration_secs`, so the silence before the candidate starts and
the dead air before they stop recording don't drag a well-paced answer into the
"too slow" band.

Every malformed-input case must return None rather than raise: pace is an
optional coaching metric, and a schema change upstream must never cost the user
a whole interview turn.
"""

from app.services.stt import _speech_span_seconds


def _word(start, end, type_="word"):
    return {"type": type_, "start": start, "end": end, "text": "x"}


def test_span_from_first_start_to_last_end():
    payload = {"words": [_word(1.0, 1.5), _word(1.6, 3.0), _word(3.1, 4.0)]}
    assert _speech_span_seconds(payload) == 3.0


def test_span_excludes_spacing_and_audio_events():
    # A trailing "(laughter)" audio event must not stretch the span — it isn't
    # speech, so counting it would deflate words-per-minute.
    payload = {
        "words": [
            _word(1.0, 1.5),
            _word(1.5, 1.6, "spacing"),
            _word(1.6, 3.0),
            _word(9.0, 11.0, "audio_event"),
        ]
    }
    assert _speech_span_seconds(payload) == 2.0


def test_span_ignores_top_level_audio_duration():
    # Recording length is deliberately NOT the denominator.
    payload = {"audio_duration_secs": 120.0, "words": [_word(2.0, 4.0)]}
    assert _speech_span_seconds(payload) == 2.0


def test_missing_words_array():
    assert _speech_span_seconds({}) is None
    assert _speech_span_seconds({"words": None}) is None
    assert _speech_span_seconds({"words": []}) is None
    assert _speech_span_seconds({"words": "not-a-list"}) is None


def test_words_without_usable_timestamps():
    assert _speech_span_seconds({"words": [_word(None, None)]}) is None
    assert _speech_span_seconds({"words": [_word("1.0", "2.0")]}) is None
    assert _speech_span_seconds({"words": [{"type": "word", "text": "x"}]}) is None


def test_only_non_word_entries():
    payload = {"words": [_word(0.0, 5.0, "audio_event"), _word(5.0, 6.0, "spacing")]}
    assert _speech_span_seconds(payload) is None


def test_non_positive_span():
    # A single instantaneous word gives a zero span — not a real measurement.
    assert _speech_span_seconds({"words": [_word(2.0, 2.0)]}) is None


def test_non_finite_timestamps_skipped():
    payload = {"words": [_word(float("nan"), float("inf")), _word(1.0, 3.0)]}
    assert _speech_span_seconds(payload) == 2.0


def test_malformed_payload_never_raises():
    assert _speech_span_seconds(None) is None
    assert _speech_span_seconds("nonsense") is None
    assert _speech_span_seconds({"words": [None, 42, _word(1.0, 2.0)]}) == 1.0
