import json
import math
import os
from datetime import datetime
from dataclasses import dataclass
from pathlib import Path

import cv2
import mediapipe as mp


def clamp(value: float, minimum: float = 0.0, maximum: float = 100.0) -> float:
    return max(minimum, min(maximum, value))


def score_band(score: float) -> str:
    if score >= 80:
        return "strong"
    if score >= 60:
        return "good"
    if score >= 40:
        return "fair"
    return "needs work"


@dataclass
class FrameAssessment:
    face_found: bool
    eye_contact_score: float
    expression_score: float
    overall_score: float
    eye_label: str
    expression_label: str
    guidance: str


@dataclass
class HeuristicTunable:
    key: str
    value: float
    step: float
    minimum: float
    maximum: float
    description: str


@dataclass
class HighlightSegment:
    start_frame: int
    end_frame: int
    reasons: list[str]
    metrics: list[str]
    severity: float


class InterviewRecorder:
    def __init__(self, base_dir: Path, fps: float, frame_size: tuple[int, int]) -> None:
        self.base_dir = base_dir
        self.fps = fps if fps and fps > 1 else 30.0
        self.frame_width, self.frame_height = frame_size
        self.is_recording = False
        self.writer: cv2.VideoWriter | None = None
        self.session_dir: Path | None = None
        self.session_video_path: Path | None = None
        self.frame_index = 0
        self.issue_log: list[dict] = []

    def start(self) -> None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.session_dir = self.base_dir / f"session_{timestamp}"
        self.session_dir.mkdir(parents=True, exist_ok=True)
        self.session_video_path = self.session_dir / "interview_session.mp4"
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        self.writer = cv2.VideoWriter(
            str(self.session_video_path),
            fourcc,
            self.fps,
            (self.frame_width, self.frame_height),
        )
        if not self.writer.isOpened():
            raise RuntimeError(f"Could not open video writer for {self.session_video_path}")
        self.is_recording = True
        self.frame_index = 0
        self.issue_log = []

    def write_frame(self, frame, issues: list[dict]) -> None:
        if not self.is_recording or self.writer is None:
            return
        self.writer.write(frame)
        issue_snapshot = []
        for issue in issues:
            issue_snapshot.append(
                {
                    "key": issue["key"],
                    "label": issue["label"],
                    "reason": issue["reason"],
                    "metric": issue.get("metric", ""),
                    "severity": float(issue["severity"]),
                }
            )
        self.issue_log.append({"frame": self.frame_index, "issues": issue_snapshot})
        self.frame_index += 1

    def stop(self) -> dict:
        if not self.is_recording:
            return {}

        if self.writer is not None:
            self.writer.release()
            self.writer = None
        self.is_recording = False

        segments = self._build_segments()
        clips = self._write_highlight_clips(segments)
        review_path = None
        if self.session_dir is not None:
            review_path = self.session_dir / "review_summary.json"
            review_payload = {
                "session_video": str(self.session_video_path) if self.session_video_path else None,
                "fps": self.fps,
                "frame_count": self.frame_index,
                "highlights": clips,
            }
            review_path.write_text(json.dumps(review_payload, indent=2), encoding="utf-8")

        return {
            "session_dir": str(self.session_dir) if self.session_dir else None,
            "session_video": str(self.session_video_path) if self.session_video_path else None,
            "review_summary": str(review_path) if review_path else None,
            "highlights": clips,
        }

    def _build_segments(self) -> list[HighlightSegment]:
        segments: list[HighlightSegment] = []
        if not self.issue_log:
            return segments

        active_start: int | None = None
        active_end: int | None = None
        active_reasons: dict[str, tuple[str, str, float]] = {}
        active_severity = 0.0
        gap_tolerance = int(self.fps * 0.4)
        pre_roll = int(self.fps * 1.0)
        post_roll = int(self.fps * 0.8)

        for entry in self.issue_log:
            frame_no = entry["frame"]
            issues = entry["issues"]
            if not issues:
                continue

            current_reasons = {
                issue["key"]: (issue["label"], issue.get("metric", ""), issue["severity"])
                for issue in issues
            }
            current_max_severity = max(issue["severity"] for issue in issues)

            if active_start is None:
                active_start = frame_no
                active_end = frame_no
                active_reasons = current_reasons
                active_severity = current_max_severity
                continue

            if frame_no - (active_end or frame_no) <= gap_tolerance:
                active_end = frame_no
                active_severity = max(active_severity, current_max_severity)
                for key, value in current_reasons.items():
                    if key not in active_reasons or value[2] > active_reasons[key][2]:
                        active_reasons[key] = value
            else:
                segments.append(
                    HighlightSegment(
                        start_frame=max(active_start - pre_roll, 0),
                        end_frame=min((active_end or active_start) + post_roll, max(self.frame_index - 1, 0)),
                        reasons=[value[0] for value in active_reasons.values()],
                        metrics=[value[1] for value in active_reasons.values() if value[1]],
                        severity=active_severity,
                    )
                )
                active_start = frame_no
                active_end = frame_no
                active_reasons = current_reasons
                active_severity = current_max_severity

        if active_start is not None:
            segments.append(
                HighlightSegment(
                    start_frame=max(active_start - pre_roll, 0),
                    end_frame=min((active_end or active_start) + post_roll, max(self.frame_index - 1, 0)),
                    reasons=[value[0] for value in active_reasons.values()],
                    metrics=[value[1] for value in active_reasons.values() if value[1]],
                    severity=active_severity,
                )
            )

        merged: list[HighlightSegment] = []
        for segment in segments:
            if not merged:
                merged.append(segment)
                continue
            previous = merged[-1]
            if segment.start_frame <= previous.end_frame + int(self.fps * 0.5):
                previous.end_frame = max(previous.end_frame, segment.end_frame)
                previous.severity = max(previous.severity, segment.severity)
                previous.reasons = sorted(set(previous.reasons + segment.reasons))
                previous.metrics = sorted(set(previous.metrics + segment.metrics))
            else:
                merged.append(segment)
        return merged

    def _write_highlight_clips(self, segments: list[HighlightSegment]) -> list[dict]:
        if not segments or self.session_video_path is None or self.session_dir is None:
            return []

        capture = cv2.VideoCapture(str(self.session_video_path))
        if not capture.isOpened():
            return []

        highlights_dir = self.session_dir / "highlights"
        highlights_dir.mkdir(parents=True, exist_ok=True)
        saved_clips = []
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")

        try:
            for index, segment in enumerate(segments, start=1):
                clip_path = highlights_dir / f"highlight_{index:02d}.mp4"
                writer = cv2.VideoWriter(
                    str(clip_path),
                    fourcc,
                    self.fps,
                    (self.frame_width, self.frame_height),
                )
                if not writer.isOpened():
                    continue

                capture.set(cv2.CAP_PROP_POS_FRAMES, segment.start_frame)
                current_frame = segment.start_frame
                while current_frame <= segment.end_frame:
                    success, frame = capture.read()
                    if not success:
                        break
                    annotated = self._annotate_highlight_frame(
                        frame,
                        current_frame,
                        segment,
                    )
                    writer.write(annotated)
                    current_frame += 1
                writer.release()

                saved_clips.append(
                    {
                        "clip": str(clip_path),
                        "start_frame": segment.start_frame,
                        "end_frame": segment.end_frame,
                        "start_seconds": round(segment.start_frame / self.fps, 2),
                        "end_seconds": round(segment.end_frame / self.fps, 2),
                        "reasons": segment.reasons,
                        "metrics": segment.metrics,
                        "severity": round(segment.severity, 2),
                    }
                )
        finally:
            capture.release()

        return saved_clips

    def _annotate_highlight_frame(self, frame, current_frame: int, segment: HighlightSegment):
        output = frame.copy()
        cv2.rectangle(output, (16, 16), (output.shape[1] - 16, 130), (22, 32, 58), -1)
        cv2.rectangle(output, (16, 16), (output.shape[1] - 16, 130), (55, 90, 220), 2)
        cv2.putText(output, "Coaching Review Clip", (34, 46), cv2.FONT_HERSHEY_SIMPLEX, 0.78, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(
            output,
            f"Moment: {current_frame / self.fps:0.2f}s",
            (34, 74),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.56,
            (220, 230, 255),
            2,
            cv2.LINE_AA,
        )
        reason_text = " | ".join(segment.reasons[:3])
        cv2.putText(output, reason_text, (34, 104), cv2.FONT_HERSHEY_SIMPLEX, 0.54, (255, 214, 120), 2, cv2.LINE_AA)
        metric_text = " | ".join(segment.metrics[:2]) if segment.metrics else f"Peak severity: {segment.severity:0.1f}/100"
        cv2.putText(output, metric_text, (34, 128), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (210, 245, 210), 2, cv2.LINE_AA)
        return output


class InterviewAnalyzer:
    LEFT_EYE_OUTER = 33
    LEFT_EYE_INNER = 133
    RIGHT_EYE_INNER = 362
    RIGHT_EYE_OUTER = 263
    LEFT_EYE_TOP = 159
    LEFT_EYE_BOTTOM = 145
    RIGHT_EYE_TOP = 386
    RIGHT_EYE_BOTTOM = 374
    LEFT_IRIS = (468, 469, 470, 471, 472)
    RIGHT_IRIS = (473, 474, 475, 476, 477)
    NOSE_TIP = 1
    FACE_LEFT = 234
    FACE_RIGHT = 454
    FOREHEAD = 10
    CHIN = 152
    MOUTH_LEFT = 61
    MOUTH_RIGHT = 291
    UPPER_LIP = 13
    LOWER_LIP = 14
    LEFT_BROW = 105
    RIGHT_BROW = 334

    def __init__(self) -> None:
        self.debug_mode = False
        self.selected_tunable_index = 0
        self.last_metrics: dict[str, float | str] = {}
        self.tunables = [
            HeuristicTunable("eye_left_center_weight", 0.25, 0.01, 0.0, 1.0, "Left iris centering weight"),
            HeuristicTunable("eye_right_center_weight", 0.25, 0.01, 0.0, 1.0, "Right iris centering weight"),
            HeuristicTunable("eye_head_alignment_weight", 0.25, 0.01, 0.0, 1.0, "Head alignment weight"),
            HeuristicTunable("eye_midpoint_weight", 0.15, 0.01, 0.0, 1.0, "Eye midpoint alignment weight"),
            HeuristicTunable("eye_posture_weight", 0.05, 0.01, 0.0, 1.0, "Vertical posture weight"),
            HeuristicTunable("eye_balance_weight", 0.05, 0.01, 0.0, 1.0, "Eye size balance weight"),
            HeuristicTunable("eye_center_target", 0.50, 0.01, 0.2, 0.8, "Ideal iris center ratio"),
            HeuristicTunable("eye_center_sensitivity", 200.0, 5.0, 50.0, 400.0, "Iris centering penalty strength"),
            HeuristicTunable("head_alignment_sensitivity", 100.0, 5.0, 20.0, 200.0, "Head yaw penalty strength"),
            HeuristicTunable("midpoint_sensitivity", 100.0, 5.0, 20.0, 200.0, "Eye midpoint penalty strength"),
            HeuristicTunable("posture_sensitivity", 70.0, 5.0, 10.0, 150.0, "Vertical posture penalty strength"),
            HeuristicTunable("smile_baseline", 0.28, 0.005, 0.1, 0.5, "Smile ratio baseline"),
            HeuristicTunable("smile_gain", 420.0, 10.0, 50.0, 1000.0, "Smile score gain"),
            HeuristicTunable("openness_baseline", 0.028, 0.001, 0.005, 0.08, "Eye openness baseline"),
            HeuristicTunable("openness_gain", 1800.0, 25.0, 100.0, 3000.0, "Eye openness gain"),
            HeuristicTunable("brow_baseline", 0.32, 0.005, 0.1, 0.6, "Relaxed brow baseline"),
            HeuristicTunable("brow_gain", 320.0, 10.0, 50.0, 1000.0, "Brow relaxation gain"),
            HeuristicTunable("tension_baseline", 0.08, 0.005, 0.01, 0.2, "Open-mouth tension baseline"),
            HeuristicTunable("tension_gain", 900.0, 25.0, 100.0, 2000.0, "Open-mouth tension penalty"),
            HeuristicTunable("expr_smile_weight", 0.45, 0.01, 0.0, 1.0, "Smile contribution weight"),
            HeuristicTunable("expr_openness_weight", 0.30, 0.01, 0.0, 1.0, "Eye openness contribution weight"),
            HeuristicTunable("expr_brow_weight", 0.25, 0.01, 0.0, 1.0, "Brow contribution weight"),
        ]
        self.face_mesh = None
        self.face_landmarker = None
        self.using_tasks_api = False
        self.video_timestamp_ms = 0

        if hasattr(mp, "solutions") and hasattr(mp.solutions, "face_mesh"):
            face_mesh = mp.solutions.face_mesh
            self.face_mesh = face_mesh.FaceMesh(
                static_image_mode=False,
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )
        elif hasattr(mp, "tasks") and hasattr(mp.tasks, "vision"):
            model_path = self._resolve_face_landmarker_model()
            if model_path is None:
                raise RuntimeError(
                    "This MediaPipe install uses the Tasks API and needs a model file. "
                    "Download a Face Landmarker model and place it at "
                    "'backend/models/face_landmarker.task' or set the "
                    "MEDIAPIPE_FACE_LANDMARKER_MODEL environment variable."
                )

            base_options = mp.tasks.BaseOptions(model_asset_path=str(model_path))
            options = mp.tasks.vision.FaceLandmarkerOptions(
                base_options=base_options,
                running_mode=mp.tasks.vision.RunningMode.VIDEO,
                num_faces=1,
                min_face_detection_confidence=0.5,
                min_face_presence_confidence=0.5,
                min_tracking_confidence=0.5,
                output_face_blendshapes=False,
                output_facial_transformation_matrixes=False,
            )
            self.face_landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(options)
            self.using_tasks_api = True
        else:
            raise RuntimeError("Unsupported MediaPipe install: no Face Mesh or Face Landmarker API was found.")

        self.frame_count = 0
        self.detected_face_frames = 0
        self.eye_contact_ema = 50.0
        self.expression_ema = 50.0
        self.overall_ema = 50.0
        self.best_eye_contact = 0.0
        self.best_expression = 0.0
        self.last_face_box: tuple[int, int, int, int] | None = None
        self.last_landmarks_px: list[tuple[int, int]] = []
        self.last_assessment = FrameAssessment(
            face_found=False,
            eye_contact_score=0.0,
            expression_score=0.0,
            overall_score=0.0,
            eye_label="searching",
            expression_label="unknown",
            guidance="Move into frame so your face is visible.",
        )

    def _tunable(self, key: str) -> HeuristicTunable:
        for tunable in self.tunables:
            if tunable.key == key:
                return tunable
        raise KeyError(f"Unknown tunable: {key}")

    def _tunable_value(self, key: str) -> float:
        return self._tunable(key).value

    def handle_keypress(self, keycode: int) -> bool:
        key = keycode & 0xFF
        if key == ord("p"):
            self.debug_mode = not self.debug_mode
            return True
        if key == ord("r"):
            return False
        if key == ord("["):
            self.selected_tunable_index = (self.selected_tunable_index - 1) % len(self.tunables)
            return True
        if key == ord("]"):
            self.selected_tunable_index = (self.selected_tunable_index + 1) % len(self.tunables)
            return True
        if key in (ord("="), ord("+")):
            self._adjust_selected_tunable(1)
            return True
        if key in (ord("-"), ord("_")):
            self._adjust_selected_tunable(-1)
            return True
        if key == ord("0"):
            self._reset_selected_tunable()
            return True
        return False

    def _adjust_selected_tunable(self, direction: int) -> None:
        tunable = self.tunables[self.selected_tunable_index]
        tunable.value = clamp(
            tunable.value + (tunable.step * direction),
            tunable.minimum,
            tunable.maximum,
        )

    def _reset_selected_tunable(self) -> None:
        defaults = {
            "eye_left_center_weight": 0.25,
            "eye_right_center_weight": 0.25,
            "eye_head_alignment_weight": 0.25,
            "eye_midpoint_weight": 0.15,
            "eye_posture_weight": 0.05,
            "eye_balance_weight": 0.05,
            "eye_center_target": 0.50,
            "eye_center_sensitivity": 200.0,
            "head_alignment_sensitivity": 100.0,
            "midpoint_sensitivity": 100.0,
            "posture_sensitivity": 70.0,
            "smile_baseline": 0.28,
            "smile_gain": 420.0,
            "openness_baseline": 0.028,
            "openness_gain": 1800.0,
            "brow_baseline": 0.32,
            "brow_gain": 320.0,
            "tension_baseline": 0.08,
            "tension_gain": 900.0,
            "expr_smile_weight": 0.45,
            "expr_openness_weight": 0.30,
            "expr_brow_weight": 0.25,
        }
        tunable = self.tunables[self.selected_tunable_index]
        tunable.value = defaults[tunable.key]

    def _resolve_face_landmarker_model(self) -> Path | None:
        env_model_path = os.getenv("MEDIAPIPE_FACE_LANDMARKER_MODEL")
        candidate_paths = []
        if env_model_path:
            candidate_paths.append(Path(env_model_path))

        backend_dir = Path(__file__).resolve().parent
        candidate_paths.extend(
            [
                backend_dir / "models" / "face_landmarker.task",
                backend_dir / "models" / "face_landmarker_v2.task",
                backend_dir / "face_landmarker.task",
                backend_dir / "face_landmarker_v2.task",
            ]
        )

        for candidate_path in candidate_paths:
            if candidate_path.exists():
                return candidate_path
        return None

    def analyze_frame(self, frame) -> FrameAssessment:
        self.frame_count += 1
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        if self.using_tasks_api:
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
            results = self.face_landmarker.detect_for_video(mp_image, self.video_timestamp_ms)
            self.video_timestamp_ms += 33
            face_landmarks_list = results.face_landmarks
        else:
            results = self.face_mesh.process(rgb_frame)
            face_landmarks_list = [] if not results.multi_face_landmarks else [face.landmark for face in results.multi_face_landmarks]

        if not face_landmarks_list:
            self.last_face_box = None
            self.last_landmarks_px = []
            self.last_metrics = {"status": "no face"}
            self.eye_contact_ema = self._smooth(self.eye_contact_ema, 15.0)
            self.expression_ema = self._smooth(self.expression_ema, 15.0)
            self.overall_ema = self._smooth(self.overall_ema, 15.0)
            self.last_assessment = FrameAssessment(
                face_found=False,
                eye_contact_score=self.eye_contact_ema,
                expression_score=self.expression_ema,
                overall_score=self.overall_ema,
                eye_label="no face",
                expression_label="no face",
                guidance="Center your face in the camera to begin interview scoring.",
            )
            return self.last_assessment

        self.detected_face_frames += 1
        height, width = frame.shape[:2]
        face_landmarks = face_landmarks_list[0]
        points = [self._landmark_to_pixel(landmark, width, height) for landmark in face_landmarks]
        self.last_landmarks_px = points
        self.last_face_box = self._bounding_box(points, width, height)

        eye_contact_score, eye_label = self._score_eye_contact(points)
        expression_score, expression_label = self._score_expression(points)
        overall_score = clamp((eye_contact_score * 0.65) + (expression_score * 0.35))

        self.eye_contact_ema = self._smooth(self.eye_contact_ema, eye_contact_score)
        self.expression_ema = self._smooth(self.expression_ema, expression_score)
        self.overall_ema = self._smooth(self.overall_ema, overall_score)
        self.best_eye_contact = max(self.best_eye_contact, eye_contact_score)
        self.best_expression = max(self.best_expression, expression_score)

        guidance = self._guidance_text(self.eye_contact_ema, self.expression_ema, eye_label, expression_label)
        self.last_assessment = FrameAssessment(
            face_found=True,
            eye_contact_score=self.eye_contact_ema,
            expression_score=self.expression_ema,
            overall_score=self.overall_ema,
            eye_label=eye_label,
            expression_label=expression_label,
            guidance=guidance,
        )

        self._draw_overlay(frame, points)
        return self.last_assessment

    def _landmark_to_pixel(self, landmark, width: int, height: int) -> tuple[int, int]:
        x = min(max(int(landmark.x * width), 0), width - 1)
        y = min(max(int(landmark.y * height), 0), height - 1)
        return x, y

    def _bounding_box(
        self,
        points: list[tuple[int, int]],
        frame_width: int,
        frame_height: int,
    ) -> tuple[int, int, int, int]:
        xs = [point[0] for point in points]
        ys = [point[1] for point in points]
        pad_x = int((max(xs) - min(xs)) * 0.08)
        pad_y = int((max(ys) - min(ys)) * 0.12)
        x1 = max(min(xs) - pad_x, 0)
        y1 = max(min(ys) - pad_y, 0)
        x2 = min(max(xs) + pad_x, frame_width - 1)
        y2 = min(max(ys) + pad_y, frame_height - 1)
        return x1, y1, x2 - x1, y2 - y1

    def _smooth(self, current: float, new_value: float, alpha: float = 0.12) -> float:
        return clamp((1 - alpha) * current + alpha * new_value)

    def _mean_point(self, points: list[tuple[int, int]], indices: tuple[int, ...]) -> tuple[float, float]:
        selected = [points[index] for index in indices]
        return (
            sum(point[0] for point in selected) / len(selected),
            sum(point[1] for point in selected) / len(selected),
        )

    def _distance(self, point_a: tuple[float, float], point_b: tuple[float, float]) -> float:
        return math.hypot(point_a[0] - point_b[0], point_a[1] - point_b[1])

    def _safe_ratio(self, numerator: float, denominator: float) -> float:
        return numerator / denominator if denominator else 0.0

    def _score_eye_contact(self, points: list[tuple[int, int]]) -> tuple[float, str]:
        left_outer = points[self.LEFT_EYE_OUTER]
        left_inner = points[self.LEFT_EYE_INNER]
        right_inner = points[self.RIGHT_EYE_INNER]
        right_outer = points[self.RIGHT_EYE_OUTER]
        left_iris = self._mean_point(points, self.LEFT_IRIS)
        right_iris = self._mean_point(points, self.RIGHT_IRIS)
        nose_tip = points[self.NOSE_TIP]
        face_left = points[self.FACE_LEFT]
        face_right = points[self.FACE_RIGHT]
        forehead = points[self.FOREHEAD]
        chin = points[self.CHIN]

        left_eye_width = self._distance(left_outer, left_inner)
        right_eye_width = self._distance(right_outer, right_inner)
        face_width = self._distance(face_left, face_right)
        face_height = self._distance(forehead, chin)

        left_gaze_ratio = self._safe_ratio(left_iris[0] - left_outer[0], max(left_inner[0] - left_outer[0], 1))
        right_gaze_ratio = self._safe_ratio(right_iris[0] - right_inner[0], min(right_outer[0] - right_inner[0], -1))
        right_gaze_ratio = abs(right_gaze_ratio)

        center_target = self._tunable_value("eye_center_target")
        center_sensitivity = self._tunable_value("eye_center_sensitivity")
        head_sensitivity = self._tunable_value("head_alignment_sensitivity")
        midpoint_sensitivity = self._tunable_value("midpoint_sensitivity")
        posture_sensitivity = self._tunable_value("posture_sensitivity")

        left_center_score = 100 - abs(left_gaze_ratio - center_target) * center_sensitivity
        right_center_score = 100 - abs(right_gaze_ratio - center_target) * center_sensitivity

        eye_mid_x = (left_iris[0] + right_iris[0]) / 2
        face_mid_x = (face_left[0] + face_right[0]) / 2
        head_yaw_offset = abs(nose_tip[0] - face_mid_x) / max(face_width * 0.5, 1)
        midpoint_offset = abs(eye_mid_x - face_mid_x) / max(face_width * 0.5, 1)
        vertical_posture = abs(nose_tip[1] - ((forehead[1] + chin[1]) / 2)) / max(face_height * 0.5, 1)
        eye_size_balance = 100 - (
            abs(left_eye_width - right_eye_width) / max(max(left_eye_width, right_eye_width), 1)
        ) * 100

        head_alignment_score = 100 - (head_yaw_offset * head_sensitivity)
        midpoint_score = 100 - (midpoint_offset * midpoint_sensitivity)
        posture_score = 100 - (vertical_posture * posture_sensitivity)

        score = clamp(
            (clamp(left_center_score) * self._tunable_value("eye_left_center_weight"))
            + (clamp(right_center_score) * self._tunable_value("eye_right_center_weight"))
            + (clamp(head_alignment_score) * self._tunable_value("eye_head_alignment_weight"))
            + (clamp(midpoint_score) * self._tunable_value("eye_midpoint_weight"))
            + (clamp(posture_score) * self._tunable_value("eye_posture_weight"))
            + (clamp(eye_size_balance) * self._tunable_value("eye_balance_weight"))
        )

        self.last_metrics.update(
            {
                "left_gaze_ratio": round(left_gaze_ratio, 4),
                "right_gaze_ratio": round(right_gaze_ratio, 4),
                "head_yaw_offset": round(head_yaw_offset, 4),
                "midpoint_offset": round(midpoint_offset, 4),
                "vertical_posture": round(vertical_posture, 4),
                "eye_size_balance": round(eye_size_balance, 2),
                "left_center_score": round(clamp(left_center_score), 2),
                "right_center_score": round(clamp(right_center_score), 2),
                "head_alignment_score": round(clamp(head_alignment_score), 2),
                "midpoint_score": round(clamp(midpoint_score), 2),
                "posture_score": round(clamp(posture_score), 2),
                "eye_contact_raw_score": round(score, 2),
            }
        )

        if score >= 82:
            label = "direct eye contact"
        elif score >= 64:
            label = "mostly engaged"
        elif score >= 45:
            label = "drifting gaze"
        else:
            label = "avoidant gaze"
        return score, label

    def _score_expression(self, points: list[tuple[int, int]]) -> tuple[float, str]:
        mouth_left = points[self.MOUTH_LEFT]
        mouth_right = points[self.MOUTH_RIGHT]
        upper_lip = points[self.UPPER_LIP]
        lower_lip = points[self.LOWER_LIP]
        left_brow = points[self.LEFT_BROW]
        right_brow = points[self.RIGHT_BROW]
        left_eye_top = points[self.LEFT_EYE_TOP]
        left_eye_bottom = points[self.LEFT_EYE_BOTTOM]
        right_eye_top = points[self.RIGHT_EYE_TOP]
        right_eye_bottom = points[self.RIGHT_EYE_BOTTOM]
        face_left = points[self.FACE_LEFT]
        face_right = points[self.FACE_RIGHT]

        face_width = self._distance(face_left, face_right)
        mouth_width = self._distance(mouth_left, mouth_right)
        mouth_open = self._distance(upper_lip, lower_lip)
        brow_width = self._distance(left_brow, right_brow)
        left_eye_open = self._distance(left_eye_top, left_eye_bottom)
        right_eye_open = self._distance(right_eye_top, right_eye_bottom)

        smile_ratio = self._safe_ratio(mouth_width, max(face_width, 1))
        mouth_open_ratio = self._safe_ratio(mouth_open, max(face_width, 1))
        eye_open_ratio = self._safe_ratio((left_eye_open + right_eye_open) / 2, max(face_width, 1))
        brow_relax_ratio = self._safe_ratio(brow_width, max(face_width, 1))

        smile_score = clamp((smile_ratio - self._tunable_value("smile_baseline")) * self._tunable_value("smile_gain"))
        openness_score = clamp((eye_open_ratio - self._tunable_value("openness_baseline")) * self._tunable_value("openness_gain"))
        relaxed_brow_score = clamp((brow_relax_ratio - self._tunable_value("brow_baseline")) * self._tunable_value("brow_gain"))
        over_tension_penalty = clamp(
            (mouth_open_ratio - self._tunable_value("tension_baseline")) * self._tunable_value("tension_gain"),
            0.0,
            30.0,
        )

        score = clamp(
            (smile_score * self._tunable_value("expr_smile_weight"))
            + (openness_score * self._tunable_value("expr_openness_weight"))
            + (relaxed_brow_score * self._tunable_value("expr_brow_weight"))
            - over_tension_penalty
        )

        self.last_metrics.update(
            {
                "smile_ratio": round(smile_ratio, 4),
                "mouth_open_ratio": round(mouth_open_ratio, 4),
                "eye_open_ratio": round(eye_open_ratio, 4),
                "brow_relax_ratio": round(brow_relax_ratio, 4),
                "smile_score": round(smile_score, 2),
                "openness_score": round(openness_score, 2),
                "relaxed_brow_score": round(relaxed_brow_score, 2),
                "over_tension_penalty": round(over_tension_penalty, 2),
                "expression_raw_score": round(score, 2),
            }
        )

        if score >= 80:
            label = "engaged expression"
        elif score >= 60:
            label = "professional expression"
        elif score >= 42:
            label = "flat expression"
        else:
            label = "low energy"
        return score, label

    def _guidance_text(
        self,
        eye_contact_score: float,
        expression_score: float,
        eye_label: str,
        expression_label: str,
    ) -> str:
        if eye_contact_score < 45:
            return "Look a bit closer to the camera and keep your head centered."
        if expression_score < 45:
            return "Add a slight smile and keep your eyes more open to look engaged."
        if "drifting" in eye_label:
            return "Your gaze is close. Try holding it on the lens a little longer."
        if "flat" in expression_label or "low energy" in expression_label:
            return "Relax your face and add a little warmth between answers."
        return "Nice balance. Maintain this level of eye contact and expression."

    def current_issues(self) -> list[dict]:
        issues: list[dict] = []
        if not self.last_assessment.face_found:
            issues.append(
                {
                    "key": "face_missing",
                    "label": "Face dropped out of frame",
                    "reason": "Your face was not visible enough for the interviewer to read you clearly.",
                    "metric": "face_visible=no",
                    "severity": 85.0,
                }
            )
            return issues

        eye_score = self.last_assessment.eye_contact_score
        expression_score = self.last_assessment.expression_score
        head_alignment = float(self.last_metrics.get("head_alignment_score", 100.0))
        vertical_posture = float(self.last_metrics.get("vertical_posture", 0.0))
        midpoint_offset = float(self.last_metrics.get("midpoint_offset", 0.0))
        smile_score = float(self.last_metrics.get("smile_score", 0.0))
        mouth_open_ratio = float(self.last_metrics.get("mouth_open_ratio", 0.0))

        if eye_score < 55:
            issues.append(
                {
                    "key": "looked_away",
                    "label": "Looked away from camera",
                    "reason": "Your gaze drifted away from the camera, which weakens eye contact.",
                    "metric": f"eye_contact={eye_score:.1f}",
                    "severity": clamp(100 - eye_score),
                }
            )
        if head_alignment < 62 or vertical_posture > 0.22 or midpoint_offset > 0.20:
            posture_severity = max(
                clamp(72 - head_alignment),
                clamp(vertical_posture * 180),
                clamp(midpoint_offset * 220),
            )
            posture_metric = f"head_align={head_alignment:.1f}"
            if clamp(vertical_posture * 180) >= clamp(72 - head_alignment) and clamp(vertical_posture * 180) >= clamp(midpoint_offset * 220):
                posture_metric = f"vertical_posture={vertical_posture:.3f}"
            elif clamp(midpoint_offset * 220) >= clamp(72 - head_alignment):
                posture_metric = f"midpoint_offset={midpoint_offset:.3f}"
            issues.append(
                {
                    "key": "posture_drift",
                    "label": "Posture or head alignment drifted",
                    "reason": "Your head moved off-center or tilted enough to look less composed.",
                    "metric": posture_metric,
                    "severity": posture_severity,
                }
            )
        if smile_score < 40 and mouth_open_ratio < .15:
            issues.append(
                {
                    "key": "low_energy",
                    "label": "Low-energy expression",
                    "reason": "Your expression looked flat, so your answer may have felt less engaged.",
                    "metric": f"smile_score={smile_score:.1f}",
                    "severity": clamp(95 - expression_score),
                }
            )
        return issues

    def _draw_overlay(self, frame, points: list[tuple[int, int]]) -> None:
        if self.last_face_box:
            x, y, w, h = self.last_face_box
            has_issues = bool(self.current_issues())
            box_color = (0, 0, 255) if has_issues else (40, 210, 120)
            cv2.rectangle(frame, (x, y), (x + w, y + h), box_color, 2)

        feature_groups = [
            (self.LEFT_IRIS, (255, 205, 70)),
            (self.RIGHT_IRIS, (255, 205, 70)),
            ((self.LEFT_EYE_OUTER, self.LEFT_EYE_INNER, self.LEFT_EYE_TOP, self.LEFT_EYE_BOTTOM), (80, 190, 255)),
            ((self.RIGHT_EYE_OUTER, self.RIGHT_EYE_INNER, self.RIGHT_EYE_TOP, self.RIGHT_EYE_BOTTOM), (80, 190, 255)),
            ((self.MOUTH_LEFT, self.MOUTH_RIGHT, self.UPPER_LIP, self.LOWER_LIP), (70, 170, 255)),
        ]

        for indices, color in feature_groups:
            for index in indices:
                px, py = points[index]
                cv2.circle(frame, (px, py), 2, color, -1)

    def draw_hud(self, frame) -> None:
        if self.debug_mode:
            self._draw_debug_hud(frame)
            return

    def _draw_debug_hud(self, frame) -> None:
        panel = frame.copy()
        cv2.rectangle(panel, (8, 8), (840, 710), (15, 20, 30), -1)
        cv2.addWeighted(panel, 0.60, frame, 0.40, 0, frame)

        selected = self.tunables[self.selected_tunable_index]
        header_lines = [
            "Precision tuning mode",
            f"Selected: {selected.key} = {selected.value:.4f} | step {selected.step:g}",
            "Controls: [ / ] select  |  - / + adjust  |  0 reset selected  |  p exit  |  q quit",
        ]

        for index, text in enumerate(header_lines):
            cv2.putText(frame, text, (20, 35 + (index * 24)), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (255, 255, 255), 2, cv2.LINE_AA)

        metric_items = [
            f"left_gaze_ratio={self.last_metrics.get('left_gaze_ratio', 'n/a')}",
            f"right_gaze_ratio={self.last_metrics.get('right_gaze_ratio', 'n/a')}",
            f"head_yaw_offset={self.last_metrics.get('head_yaw_offset', 'n/a')}",
            f"midpoint_offset={self.last_metrics.get('midpoint_offset', 'n/a')}",
            f"vertical_posture={self.last_metrics.get('vertical_posture', 'n/a')}",
            f"eye_size_balance={self.last_metrics.get('eye_size_balance', 'n/a')}",
            f"left_center_score={self.last_metrics.get('left_center_score', 'n/a')}",
            f"right_center_score={self.last_metrics.get('right_center_score', 'n/a')}",
            f"head_alignment_score={self.last_metrics.get('head_alignment_score', 'n/a')}",
            f"midpoint_score={self.last_metrics.get('midpoint_score', 'n/a')}",
            f"posture_score={self.last_metrics.get('posture_score', 'n/a')}",
            f"smile_ratio={self.last_metrics.get('smile_ratio', 'n/a')}",
            f"mouth_open_ratio={self.last_metrics.get('mouth_open_ratio', 'n/a')}",
            f"eye_open_ratio={self.last_metrics.get('eye_open_ratio', 'n/a')}",
            f"brow_relax_ratio={self.last_metrics.get('brow_relax_ratio', 'n/a')}",
            f"smile_score={self.last_metrics.get('smile_score', 'n/a')}",
            f"openness_score={self.last_metrics.get('openness_score', 'n/a')}",
            f"relaxed_brow_score={self.last_metrics.get('relaxed_brow_score', 'n/a')}",
            f"over_tension_penalty={self.last_metrics.get('over_tension_penalty', 'n/a')}",
            f"eye_contact_raw={self.last_metrics.get('eye_contact_raw_score', 'n/a')}",
            f"expression_raw={self.last_metrics.get('expression_raw_score', 'n/a')}",
        ]

        cv2.putText(frame, "Live ratios and component scores", (20, 108), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (120, 220, 255), 2, cv2.LINE_AA)
        for index, text in enumerate(metric_items):
            col = index // 11
            row = index % 11
            x = 20 + (col * 380)
            y = 138 + (row * 24)
            cv2.putText(frame, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (235, 235, 235), 1, cv2.LINE_AA)

        cv2.putText(frame, "Editable tunables", (20, 420), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (120, 220, 255), 2, cv2.LINE_AA)
        visible_tunables = self.tunables[:]
        for index, tunable in enumerate(visible_tunables):
            marker = ">" if index == self.selected_tunable_index else " "
            text = f"{marker} {tunable.key}={tunable.value:.4f} [{tunable.minimum:g},{tunable.maximum:g}] {tunable.description}"
            y = 450 + (index * 11)
            cv2.putText(
                frame,
                text,
                (20, y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.34,
                (120, 255, 170) if index == self.selected_tunable_index else (230, 230, 230),
                1,
                cv2.LINE_AA,
            )

    def draw_recording_indicator(self, frame, is_recording: bool) -> None:
        if not self.debug_mode:
            return
        if is_recording:
            cv2.circle(frame, (frame.shape[1] - 170, 34), 10, (0, 0, 255), -1)
            cv2.putText(frame, "REC", (frame.shape[1] - 150, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.72, (255, 255, 255), 2, cv2.LINE_AA)
        else:
            cv2.putText(frame, "Press r to record", (frame.shape[1] - 240, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.58, (255, 255, 255), 2, cv2.LINE_AA)

    def build_summary(self) -> dict:
        face_presence = 0.0
        if self.frame_count:
            face_presence = (self.detected_face_frames / self.frame_count) * 100

        return {
            "frames_processed": self.frame_count,
            "face_visible_pct": round(face_presence, 1),
            "eye_contact_score": round(self.eye_contact_ema, 1),
            "expression_score": round(self.expression_ema, 1),
            "overall_interview_score": round(self.overall_ema, 1),
            "eye_contact_rating": score_band(self.eye_contact_ema),
            "expression_rating": score_band(self.expression_ema),
            "interview_rating": score_band(self.overall_ema),
            "best_eye_contact_frame_score": round(self.best_eye_contact, 1),
            "best_expression_frame_score": round(self.best_expression, 1),
            "coaching_tip": self.last_assessment.guidance,
            "notes": [
                "Eye contact uses MediaPipe face and iris landmarks as a webcam-based gaze proxy.",
                "Expression scoring uses mouth width, eye openness, and brow relaxation as engagement cues.",
                "This is still a heuristic practice tool, not a validated interview or hiring assessment.",
            ],
        }

    def close(self) -> None:
        if self.face_mesh is not None:
            self.face_mesh.close()
        if self.face_landmarker is not None:
            self.face_landmarker.close()


def main() -> None:
    analyzer = InterviewAnalyzer()
    cap = cv2.VideoCapture(0)
    window_name = "Interview Eye Contact and Expression Analyzer"

    if not cap.isOpened():
        analyzer.close()
        raise RuntimeError("Could not open the camera.")

    window_flags = cv2.WINDOW_NORMAL
    if hasattr(cv2, "WINDOW_KEEPRATIO"):
        window_flags |= cv2.WINDOW_KEEPRATIO
    if hasattr(cv2, "WINDOW_GUI_EXPANDED"):
        window_flags |= cv2.WINDOW_GUI_EXPANDED

    cv2.namedWindow(window_name, window_flags)
    cv2.resizeWindow(window_name, 1280, 720)

    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1280)
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 720)
    recorder = InterviewRecorder(
        base_dir=Path(__file__).with_name("recordings"),
        fps=fps,
        frame_size=(frame_width, frame_height),
    )
    recording_result: dict = {}

    print(
        "Interview analyzer is running. Resize the window freely; the camera view will keep its aspect ratio. "
        "Press 'r' to start or stop recording, 'p' for tuning mode, and 'q' to end the session."
    )

    try:
        while True:
            success, frame = cap.read()
            if not success:
                print("Error: failed to read a frame from the camera.")
                break

            frame = cv2.flip(frame, 1)
            analyzer.analyze_frame(frame)
            analyzer.draw_hud(frame)
            analyzer.draw_recording_indicator(frame, recorder.is_recording)
            issues = analyzer.current_issues()
            if recorder.is_recording:
                recorder.write_frame(frame.copy(), issues)
            cv2.imshow(window_name, frame)

            key = cv2.waitKey(1)
            if key & 0xFF == ord("r"):
                if recorder.is_recording:
                    recording_result = recorder.stop()
                    print("\nRecording stopped.")
                    if recording_result.get("highlights"):
                        print(f"Saved review clips to: {recording_result.get('session_dir')}")
                    else:
                        print("No bad-moment clips were detected strongly enough to save.")
                else:
                    recorder.start()
                    recording_result = {}
                    print(f"\nRecording started. Session will be saved under: {recorder.session_dir}")
                continue
            if analyzer.handle_keypress(key):
                continue
            if key & 0xFF == ord("q"):
                break
    finally:
        if recorder.is_recording:
            recording_result = recorder.stop()
        cap.release()
        cv2.destroyAllWindows()
        analyzer.close()

    summary = analyzer.build_summary()
    summary_path = Path(__file__).with_name("interview_feedback_latest.json")
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print("\nInterview session summary")
    print(json.dumps(summary, indent=2))
    print(f"\nSaved summary to: {summary_path}")
    if recording_result:
        print("\nRecording artifacts")
        print(json.dumps(recording_result, indent=2))


if __name__ == "__main__":
    main()
