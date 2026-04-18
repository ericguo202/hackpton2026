import json
import math
import os
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

        left_center_score = 100 - abs(left_gaze_ratio - 0.5) * 200
        right_center_score = 100 - abs(right_gaze_ratio - 0.5) * 200

        eye_mid_x = (left_iris[0] + right_iris[0]) / 2
        face_mid_x = (face_left[0] + face_right[0]) / 2
        head_yaw_offset = abs(nose_tip[0] - face_mid_x) / max(face_width * 0.5, 1)
        midpoint_offset = abs(eye_mid_x - face_mid_x) / max(face_width * 0.5, 1)
        vertical_posture = abs(nose_tip[1] - ((forehead[1] + chin[1]) / 2)) / max(face_height * 0.5, 1)
        eye_size_balance = 100 - (
            abs(left_eye_width - right_eye_width) / max(max(left_eye_width, right_eye_width), 1)
        ) * 100

        head_alignment_score = 100 - (head_yaw_offset * 100)
        midpoint_score = 100 - (midpoint_offset * 100)
        posture_score = 100 - (vertical_posture * 70)

        score = clamp(
            (clamp(left_center_score) * 0.25)
            + (clamp(right_center_score) * 0.25)
            + (clamp(head_alignment_score) * 0.25)
            + (clamp(midpoint_score) * 0.15)
            + (clamp(posture_score) * 0.05)
            + (clamp(eye_size_balance) * 0.05)
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

        smile_score = clamp((smile_ratio - 0.28) * 420)
        openness_score = clamp((eye_open_ratio - 0.028) * 1800)
        relaxed_brow_score = clamp((brow_relax_ratio - 0.32) * 320)
        over_tension_penalty = clamp((mouth_open_ratio - 0.08) * 900, 0.0, 30.0)

        score = clamp(
            (smile_score * 0.45)
            + (openness_score * 0.30)
            + (relaxed_brow_score * 0.25)
            - over_tension_penalty
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

    def _draw_overlay(self, frame, points: list[tuple[int, int]]) -> None:
        if self.last_face_box:
            x, y, w, h = self.last_face_box
            cv2.rectangle(frame, (x, y), (x + w, y + h), (40, 210, 120), 2)

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
        assessment = self.last_assessment
        lines = [
            f"Eye contact: {assessment.eye_contact_score:5.1f}/100 ({assessment.eye_label})",
            f"Expression:  {assessment.expression_score:5.1f}/100 ({assessment.expression_label})",
            f"Interview:   {assessment.overall_score:5.1f}/100 ({score_band(assessment.overall_score)})",
            f"Coaching: {assessment.guidance}",
            "Press q to end session",
        ]

        for index, text in enumerate(lines):
            y = 32 + (index * 28)
            cv2.putText(
                frame,
                text,
                (18, y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.65,
                (255, 255, 255),
                2,
                cv2.LINE_AA,
            )

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

    print("Interview analyzer is running. Resize the window freely; the camera view will keep its aspect ratio. Press 'q' to end the session.")

    try:
        while True:
            success, frame = cap.read()
            if not success:
                print("Error: failed to read a frame from the camera.")
                break

            frame = cv2.flip(frame, 1)
            analyzer.analyze_frame(frame)
            analyzer.draw_hud(frame)
            cv2.imshow(window_name, frame)

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()
        analyzer.close()

    summary = analyzer.build_summary()
    summary_path = Path(__file__).with_name("interview_feedback_latest.json")
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print("\nInterview session summary")
    print(json.dumps(summary, indent=2))
    print(f"\nSaved summary to: {summary_path}")


if __name__ == "__main__":
    main()
