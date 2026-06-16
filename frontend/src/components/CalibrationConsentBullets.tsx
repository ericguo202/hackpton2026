/**
 * Canonical copy for the browser-local calibration privacy notice — purpose,
 * data processed, storage/deletion, sharing, and choice.
 *
 * Single source of truth so the calibration consent gate
 * (`CalibrationConsentDialog`) renders the same disclosure the page promises.
 * Unlike delivery analytics, calibration never leaves the device, so consent
 * for it is stored locally (see `lib/faceCalibration.ts`).
 */

export default function CalibrationConsentBullets() {
  return (
    <ul className="space-y-3 text-xs leading-6 text-text-subtle">
      <li>
        <span className="font-medium text-text">Purpose.</span> We use a
        six-second neutral-face camera capture only to create a delivery
        baseline for this coaching tool.
      </li>
      <li>
        <span className="font-medium text-text">Data processed.</span> Your
        browser analyzes webcam frames and face/iris landmarks during the
        capture. Calibration does not record audio and is not used to identify
        you.
      </li>
      <li>
        <span className="font-medium text-text">Storage and deletion.</span>{' '}
        Raw frames, video, and landmark lists are discarded after processing.
        Only aggregate numeric ratios and this consent timestamp are saved in
        this browser. Removing calibration deletes both from local storage.
      </li>
      <li>
        <span className="font-medium text-text">Sharing.</span> The calibration
        profile stays on this device. Practice uses a separate delivery
        analytics consent before any numeric delivery summary is sent with your
        answer. Raw webcam video is not uploaded.
      </li>
      <li>
        <span className="font-medium text-text">Choice.</span> You can skip
        calibration and practice without it. Delivery scoring may be absent or
        less personalized when the camera or calibration is not used.
      </li>
    </ul>
  );
}
