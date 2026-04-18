import json
from dataclasses import dataclass
from pathlib import Path

import cv2


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
    def __init__(self) -> None:
        cascade_root = Path(cv2.data.haarcascades)
        self.face_cascade = cv2.CascadeClassifier(str(cascade_root / "haarcascade_frontalface_default.xml"))
        self.eye_cascade = cv2.CascadeClassifier(str(cascade_root / "haarcascade_eye.xml"))
        self.smile_cascade = cv2.CascadeClassifier(str(cascade_root / "haarcascade_smile.xml"))

        if self.face_cascade.empty() or self.eye_cascade.empty() or self.smile_cascade.empty():
            raise RuntimeError("Could not load one or more Haar cascade models from OpenCV.")

        self.frame_count = 0
        self.detected_face_frames = 0
        self.eye_contact_ema = 50.0
        self.expression_ema = 50.0
        self.overall_ema = 50.0
        self.best_eye_contact = 0.0
        self.best_expression = 0.0
        self.last_assessment = FrameAssessment(
            face_found=False,
            eye_contact_score=0.0,
            expression_score=0.0,
            overall_score=0.0,
            eye_label="searching",
            expression_label="unknown",
            guidance="Move into frame so your face is visible.",
        )

    def _largest_box(self, detections) -> tuple[int, int, int, int] | None:
        if len(detections) == 0:
            return None
        return max(detections, key=lambda box: box[2] * box[3])

    def analyze_frame(self, frame) -> FrameAssessment:
        self.frame_count += 1
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)

        faces = self.face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=6,
            minSize=(120, 120),
        )

        face = self._largest_box(faces)
        if face is None:
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
        x, y, w, h = face
        face_gray = gray[y : y + h, x : x + w]
        upper_face = face_gray[: int(h * 0.6), :]
        lower_face = face_gray[int(h * 0.35) :, :]

        eyes = self.eye_cascade.detectMultiScale(
            upper_face,
            scaleFactor=1.08,
            minNeighbors=8,
            minSize=(24, 24),
        )
        smiles = self.smile_cascade.detectMultiScale(
            lower_face,
            scaleFactor=1.7,
            minNeighbors=22,
            minSize=(40, 20),
        )

        eye_contact_score, eye_label = self._score_eye_contact(w, h, eyes)
        expression_score, expression_label = self._score_expression(w, h, eyes, smiles)
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

        self._draw_overlay(frame, face, eyes, smiles)
        return self.last_assessment

    def _smooth(self, current: float, new_value: float, alpha: float = 0.12) -> float:
        return clamp((1 - alpha) * current + alpha * new_value)

    def _score_eye_contact(self, face_w: int, face_h: int, eyes) -> tuple[float, str]:
        if len(eyes) < 2:
            return 25.0, "unstable gaze"

        eyes_sorted = sorted(eyes, key=lambda box: box[2] * box[3], reverse=True)[:2]
        eyes_sorted = sorted(eyes_sorted, key=lambda box: box[0])
        left_eye, right_eye = eyes_sorted

        lx, ly, lw, lh = left_eye
        rx, ry, rw, rh = right_eye

        midpoint_x = ((lx + (lw / 2)) + (rx + (rw / 2))) / 2
        midpoint_score = 100 - (abs(midpoint_x - (face_w / 2)) / (face_w / 2)) * 100
        balance_score = 100 - (abs((lw * lh) - (rw * rh)) / max(lw * lh, rw * rh, 1)) * 100
        alignment_score = 100 - (abs((ly + (lh / 2)) - (ry + (rh / 2))) / max(face_h * 0.25, 1)) * 100
        spacing = (rx + (rw / 2)) - (lx + (lw / 2))
        spacing_ratio = spacing / max(face_w, 1)
        spacing_score = 100 - (abs(spacing_ratio - 0.38) / 0.22) * 100

        score = clamp(
            (midpoint_score * 0.45)
            + (balance_score * 0.20)
            + (alignment_score * 0.20)
            + (spacing_score * 0.15)
        )

        if score >= 80:
            label = "direct eye contact"
        elif score >= 60:
            label = "mostly engaged"
        elif score >= 40:
            label = "drifting gaze"
        else:
            label = "avoidant gaze"
        return score, label

    def _score_expression(self, face_w: int, face_h: int, eyes, smiles) -> tuple[float, str]:
        smile_score = 15.0
        if len(smiles) > 0:
            sx, sy, sw, sh = max(smiles, key=lambda box: box[2] * box[3])
            smile_ratio = (sw * sh) / max(face_w * face_h, 1)
            smile_score = clamp(35 + (smile_ratio * 1200))

        eye_openness = 30.0
        if len(eyes) >= 2:
            eyes_sorted = sorted(eyes, key=lambda box: box[2] * box[3], reverse=True)[:2]
            openness_values = [(eh / max(ew, 1)) * 100 for _, _, ew, eh in eyes_sorted]
            eye_openness = clamp(sum(openness_values) / len(openness_values) * 1.7)

        liveliness_score = clamp((eye_openness * 0.55) + (smile_score * 0.45))

        if liveliness_score >= 78:
            label = "engaged expression"
        elif liveliness_score >= 58:
            label = "professional expression"
        elif liveliness_score >= 40:
            label = "flat expression"
        else:
            label = "low energy"
        return liveliness_score, label

    def _guidance_text(
        self,
        eye_contact_score: float,
        expression_score: float,
        eye_label: str,
        expression_label: str,
    ) -> str:
        if eye_contact_score < 45:
            return "Keep your eyes closer to the camera lens between thoughts."
        if expression_score < 45:
            return "Add a bit more warmth to your face so you look engaged."
        if "unstable" in eye_label:
            return "Hold your head steady for a stronger eye-contact read."
        if "flat" in expression_label or "low energy" in expression_label:
            return "Use a slight smile and relaxed eyebrows to look more present."
        return "Nice balance. Maintain this level of eye contact and expression."

    def _draw_overlay(self, frame, face, eyes, smiles) -> None:
        x, y, w, h = face
        cv2.rectangle(frame, (x, y), (x + w, y + h), (40, 210, 120), 2)

        for ex, ey, ew, eh in eyes[:2]:
            cv2.rectangle(frame, (x + ex, y + ey), (x + ex + ew, y + ey + eh), (255, 205, 70), 2)

        for sx, sy, sw, sh in smiles[:1]:
            adjusted_y = y + int(h * 0.35) + sy
            cv2.rectangle(frame, (x + sx, adjusted_y), (x + sx + sw, adjusted_y + sh), (70, 170, 255), 2)

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

        summary = {
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
                "Eye contact is estimated from face and eye alignment in the webcam image.",
                "Expression scoring uses visible smile and eye-openness cues as an engagement proxy.",
                "This is a lightweight computer-vision heuristic, not a clinically validated interview assessment.",
            ],
        }
        return summary


def main() -> None:
    analyzer = InterviewAnalyzer()
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        raise RuntimeError("Could not open the camera.")

    print("Interview analyzer is running. Press 'q' in the video window to end the session.")

    try:
        while True:
            success, frame = cap.read()
            if not success:
                print("Error: failed to read a frame from the camera.")
                break

            frame = cv2.flip(frame, 1)
            analyzer.analyze_frame(frame)
            analyzer.draw_hud(frame)
            cv2.imshow("Interview Eye Contact and Expression Analyzer", frame)

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()

    summary = analyzer.build_summary()
    summary_path = Path(__file__).with_name("interview_feedback_latest.json")
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print("\nInterview session summary")
    print(json.dumps(summary, indent=2))
    print(f"\nSaved summary to: {summary_path}")


if __name__ == "__main__":
    main()
