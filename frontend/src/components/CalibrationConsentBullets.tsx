/**
 * Canonical copy for the browser-local calibration privacy notice — purpose,
 * data processed, storage/deletion, sharing, and choice.
 *
 * Single source of truth so the calibration consent gate
 * (`CalibrationConsentDialog`) renders the same disclosure the page promises.
 * The calibration profile never leaves the device (stored per-user in this
 * browser, see `lib/faceCalibration.ts`); the consent RECORD is kept on your
 * account so it is demonstrable and per-user (see `lib/faceCalibrationConsent.ts`).
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
        Only aggregate numeric ratios are saved in this browser, scoped to your
        account; a record of this consent (version and date) is kept on your
        account. Removing calibration deletes the local baseline and revokes the
        consent record.
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
