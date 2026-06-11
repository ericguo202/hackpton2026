/**
 * Canonical copy for the practice delivery-analytics consent — the three
 * disclosures (purpose / data sent / retention) plus the link to the public
 * Biometric Data Retention Policy.
 *
 * Single source of truth so the pre-session consent popup
 * (`DeliveryConsentDialog`) and the Home "Privacy" management surface
 * (`PrivacyPanel`) can't drift. The 12-month figure mirrors
 * `DELIVERY_ANALYTICS_RETENTION_MONTHS` in the backend.
 */

import { Link } from 'react-router';

export default function DeliveryConsentBullets() {
  return (
    <>
      <ul className="space-y-3 text-xs leading-6 text-text-subtle">
        <li>
          <span className="font-medium text-text">Purpose.</span> Delivery
          analytics are used only for interview-practice coaching, not
          identification, hiring, or employment decisions.
        </li>
        <li>
          <span className="font-medium text-text">Data sent.</span> If you use
          the camera during practice, raw video, images, and landmarks stay on
          your device. The server receives aggregate numbers such as face
          visibility, eye-contact proxy, posture, expression, and streak counts.
        </li>
        <li>
          <span className="font-medium text-text">Retention and deletion.</span>{' '}
          We keep the numeric delivery summary, delivery score, and
          delivery-specific coaching only as long as needed for your coaching,
          and never longer than 12 months after your last practice session.
          After that — or sooner if you revoke this consent or delete your
          account — they are permanently deleted and the affected session scores
          are recalculated without them. Your other interview records, such as
          the answer transcript and content scores, follow our general retention
          policy and may remain.
        </li>
      </ul>

      <p className="mt-3 text-xs leading-6 text-text-subtle">
        Full details are in our{' '}
        <Link
          to="/legal/biometric-data-retention"
          className="text-text underline underline-offset-4 transition-colors hover:text-text-muted"
        >
          Biometric Data Retention Policy
        </Link>
        .
      </p>
    </>
  );
}
