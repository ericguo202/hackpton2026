import json
import statistics
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import cv2

from opencv import InterviewAnalyzer


@dataclass(frozen=True)
class CalibrationLabel:
    key: str
    title: str
    description: str


LABELS: dict[str, CalibrationLabel] = {
    "1": CalibrationLabel(
        key="neutral",
        title="Neutral baseline",
        description="Look normal and relaxed, facing the camera the way you naturally would.",
    ),
    "2": CalibrationLabel(
        key="engaged",
        title="Engaged / strong delivery",
        description="Use your best interview face: steady eye contact, open eyes, light smile.",
    ),
    "3": CalibrationLabel(
        key="looked_away",
        title="Egregious gaze drift",
        description="Look away from the camera the way a bad answer would feel on replay.",
    ),
    "4": CalibrationLabel(
        key="posture_drift",
        title="Egregious posture drift",
        description="Lean off center, tilt, or move your head into a clearly bad position.",
    ),
    "5": CalibrationLabel(
        key="low_energy",
        title="Low-energy expression",
        description="Go flat: weak smile, dull eyes, low facial energy.",
    ),
}

KEY_METRICS: dict[str, list[str]] = {
    "neutral": [
        "eye_contact_raw_score",
        "expression_raw_score",
        "head_alignment_score",
        "smile_score",
        "eye_open_ratio",
    ],
    "engaged": [
        "eye_contact_raw_score",
        "expression_raw_score",
        "head_alignment_score",
        "smile_score",
        "eye_open_ratio",
    ],
    "looked_away": [
        "eye_contact_raw_score",
        "head_alignment_score",
        "midpoint_offset",
        "left_gaze_ratio",
        "right_gaze_ratio",
    ],
    "posture_drift": [
        "head_alignment_score",
        "vertical_posture",
        "midpoint_offset",
        "posture_score",
        "eye_contact_raw_score",
    ],
    "low_energy": [
        "expression_raw_score",
        "smile_score",
        "mouth_open_ratio",
        "eye_open_ratio",
        "brow_relax_ratio",
    ],
}


def percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (len(ordered) - 1) * pct
    lower = int(rank)
    upper = min(lower + 1, len(ordered) - 1)
    weight = rank - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def summarize_numeric(values: list[float]) -> dict[str, float] | None:
    if not values:
        return None
    return {
        "min": round(min(values), 4),
        "p05": round(percentile(values, 0.05) or 0.0, 4),
        "p25": round(percentile(values, 0.25) or 0.0, 4),
        "p50": round(percentile(values, 0.50) or 0.0, 4),
        "p75": round(percentile(values, 0.75) or 0.0, 4),
        "p95": round(percentile(values, 0.95) or 0.0, 4),
        "max": round(max(values), 4),
        "mean": round(statistics.fmean(values), 4),
    }


def collect_numeric_fields(samples: list[dict]) -> dict[str, list[float]]:
    collected: dict[str, list[float]] = {}
    for sample in samples:
        metrics = sample.get("metrics", {})
        for key, value in metrics.items():
            if isinstance(value, (int, float)):
                collected.setdefault(key, []).append(float(value))
    return collected


def suggested_thresholds(grouped: dict[str, list[dict]]) -> dict[str, float | None]:
    def values(label: str, metric: str) -> list[float]:
        return [
            float(sample["metrics"][metric])
            for sample in grouped.get(label, [])
            if metric in sample.get("metrics", {}) and isinstance(sample["metrics"][metric], (int, float))
        ]

    neutral_eye = values("neutral", "eye_contact_raw_score") + values("engaged", "eye_contact_raw_score")
    bad_eye = values("looked_away", "eye_contact_raw_score")
    neutral_align = values("neutral", "head_alignment_score") + values("engaged", "head_alignment_score")
    bad_align = values("posture_drift", "head_alignment_score")
    neutral_vertical = values("neutral", "vertical_posture") + values("engaged", "vertical_posture")
    bad_vertical = values("posture_drift", "vertical_posture")
    neutral_midpoint = values("neutral", "midpoint_offset") + values("engaged", "midpoint_offset")
    bad_midpoint = values("posture_drift", "midpoint_offset")
    neutral_smile = values("neutral", "smile_score") + values("engaged", "smile_score")
    bad_smile = values("low_energy", "smile_score")
    neutral_mouth_open = values("neutral", "mouth_open_ratio") + values("engaged", "mouth_open_ratio")
    bad_mouth_open = values("low_energy", "mouth_open_ratio")

    def midpoint(a: float | None, b: float | None) -> float | None:
        if a is None or b is None:
            return None
        return round((a + b) / 2, 4)

    thresholds = {
        "eye_contact_score_red_below": midpoint(percentile(neutral_eye, 0.10), percentile(bad_eye, 0.90)),
        "head_alignment_red_below": midpoint(percentile(neutral_align, 0.10), percentile(bad_align, 0.90)),
        "vertical_posture_red_above": midpoint(percentile(neutral_vertical, 0.90), percentile(bad_vertical, 0.10)),
        "midpoint_offset_red_above": midpoint(percentile(neutral_midpoint, 0.90), percentile(bad_midpoint, 0.10)),
        "smile_score_red_below": midpoint(percentile(neutral_smile, 0.10), percentile(bad_smile, 0.90)),
        "mouth_open_ratio_low_energy_below": midpoint(
            percentile(neutral_mouth_open, 0.10),
            percentile(bad_mouth_open, 0.90),
        ),
    }
    return thresholds


def build_summary(samples: list[dict]) -> dict:
    grouped: dict[str, list[dict]] = {}
    for sample in samples:
        grouped.setdefault(sample["label"], []).append(sample)

    labels_summary: dict[str, dict] = {}
    for label_key, label_samples in grouped.items():
        numeric_fields = collect_numeric_fields(label_samples)
        labels_summary[label_key] = {
            "frames_captured": len(label_samples),
            "face_found_frames": sum(1 for sample in label_samples if sample.get("face_found")),
            "issue_counts": {},
            "metrics": {},
        }
        for sample in label_samples:
            for issue_key in sample.get("issue_keys", []):
                counts = labels_summary[label_key]["issue_counts"]
                counts[issue_key] = counts.get(issue_key, 0) + 1

        relevant_metrics = KEY_METRICS.get(label_key, [])
        for metric in relevant_metrics:
            summary = summarize_numeric(numeric_fields.get(metric, []))
            if summary is not None:
                labels_summary[label_key]["metrics"][metric] = summary

    return {
        "created_at": datetime.now().isoformat(),
        "labels": labels_summary,
        "suggested_thresholds": suggested_thresholds(grouped),
        "notes": [
            "Use neutral + engaged captures as your personal normal baseline.",
            "Use the egregious captures to set red-box thresholds where bad behavior is clearly separated from your baseline.",
            "Suggested thresholds are midpoint heuristics between your normal and bad percentile bands, not final truth.",
        ],
    }


def draw_text_block(frame, lines: list[str], origin_x: int, origin_y: int, color: tuple[int, int, int]) -> None:
    for index, line in enumerate(lines):
        y = origin_y + (index * 24)
        cv2.putText(frame, line, (origin_x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.58, color, 2, cv2.LINE_AA)


def main() -> None:
    analyzer = InterviewAnalyzer()
    cap = cv2.VideoCapture(0)
    window_name = "Face Range Calibration"

    if not cap.isOpened():
        analyzer.close()
        raise RuntimeError("Could not open the camera.")

    window_flags = cv2.WINDOW_NORMAL
    if hasattr(cv2, "WINDOW_KEEPRATIO"):
        window_flags |= cv2.WINDOW_KEEPRATIO
    if hasattr(cv2, "WINDOW_GUI_EXPANDED"):
        window_flags |= cv2.WINDOW_GUI_EXPANDED

    cv2.namedWindow(window_name, window_flags)
    cv2.resizeWindow(window_name, 1380, 820)

    current_label = LABELS["1"]
    is_recording = False
    samples: list[dict] = []
    frame_index = 0

    calibration_dir = Path(__file__).with_name("recordings") / f"calibration_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    calibration_dir.mkdir(parents=True, exist_ok=True)
    raw_path = calibration_dir / "calibration_samples.json"
    summary_path = calibration_dir / "calibration_summary.json"

    print(
        "Calibration tool running.\n"
        "Press 1-5 to choose a label, SPACE to start/stop capture, P to toggle OpenCV tuning HUD, and Q to quit.\n"
        "Recommended order: 1 neutral, 2 engaged, 3 looked away, 4 posture drift, 5 low energy.\n"
    )

    try:
        while True:
            success, frame = cap.read()
            if not success:
                print("Error: failed to read a frame from the camera.")
                break

            frame = cv2.flip(frame, 1)
            assessment = analyzer.analyze_frame(frame)
            issues = analyzer.current_issues()
            issue_keys = [issue["key"] for issue in issues]

            if is_recording:
                samples.append(
                    {
                        "frame_index": frame_index,
                        "label": current_label.key,
                        "face_found": assessment.face_found,
                        "eye_contact_score": round(assessment.eye_contact_score, 2),
                        "expression_score": round(assessment.expression_score, 2),
                        "overall_score": round(assessment.overall_score, 2),
                        "issue_keys": issue_keys,
                        "metrics": dict(analyzer.last_metrics),
                    }
                )

            overlay = frame.copy()
            cv2.rectangle(overlay, (12, 12), (760, 190), (12, 18, 28), -1)
            cv2.addWeighted(overlay, 0.68, frame, 0.32, 0, frame)

            draw_text_block(
                frame,
                [
                    "Calibration capture",
                    f"Active label [{current_label.key}]: {current_label.title}",
                    current_label.description,
                    f"Capture: {'ON' if is_recording else 'OFF'} | Samples: {len(samples)} | Issues: {', '.join(issue_keys) if issue_keys else 'none'}",
                    "Keys: 1 neutral | 2 engaged | 3 looked away | 4 posture drift | 5 low energy | SPACE record | p debug | q quit",
                ],
                26,
                38,
                (255, 255, 255),
            )

            metrics_lines = [
                f"eye_contact={assessment.eye_contact_score:.1f}",
                f"expression={assessment.expression_score:.1f}",
                f"overall={assessment.overall_score:.1f}",
                f"head_align={analyzer.last_metrics.get('head_alignment_score', 'n/a')}",
                f"vertical_posture={analyzer.last_metrics.get('vertical_posture', 'n/a')}",
                f"midpoint_offset={analyzer.last_metrics.get('midpoint_offset', 'n/a')}",
                f"smile_score={analyzer.last_metrics.get('smile_score', 'n/a')}",
                f"mouth_open_ratio={analyzer.last_metrics.get('mouth_open_ratio', 'n/a')}",
            ]
            draw_text_block(frame, metrics_lines, 26, 168, (145, 220, 255))

            cv2.imshow(window_name, frame)

            key = cv2.waitKey(1) & 0xFF
            if chr(key) in LABELS:
                current_label = LABELS[chr(key)]
                continue
            if key == ord(" "):
                is_recording = not is_recording
                print(f"{'Started' if is_recording else 'Stopped'} capture for label: {current_label.key}")
                continue
            if analyzer.handle_keypress(key):
                continue
            if key == ord("q"):
                break

            frame_index += 1
    finally:
        cap.release()
        cv2.destroyAllWindows()
        analyzer.close()

    raw_payload = {
        "created_at": datetime.now().isoformat(),
        "sample_count": len(samples),
        "samples": samples,
    }
    raw_path.write_text(json.dumps(raw_payload, indent=2), encoding="utf-8")
    summary = build_summary(samples)
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"\nSaved raw samples to: {raw_path}")
    print(f"Saved calibration summary to: {summary_path}")
    print("\nSuggested thresholds")
    print(json.dumps(summary.get("suggested_thresholds", {}), indent=2))


if __name__ == "__main__":
    main()
