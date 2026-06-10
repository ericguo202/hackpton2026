/**
 * Public Biometric Data Retention Policy.
 *
 * Satisfies the "publicly available written retention policy" required by
 * Illinois BIPA §15(a) and Colorado HB24-1130, and the per-category retention
 * disclosure required by CCPA/CPRA. Deliberately PUBLIC (no auth guard) so it is
 * available to anyone, as those statutes contemplate.
 *
 * SCOPE: biometric + biometric-derived data only (webcam delivery analytics and
 * voice handling). Non-biometric data (profile, transcripts, auth) is covered by
 * the forthcoming general Privacy Policy and is cross-referenced, not restated.
 *
 * This is a DRAFT pending legal review — see BIOMETRIC_DATA_REVIEW.md for the
 * data-flow inventory, statute-by-statute analysis, and open questions. Keep the
 * retention figure here (12 months) in sync with
 * `DELIVERY_ANALYTICS_RETENTION_MONTHS` in the backend.
 */

import { type ReactNode } from 'react';
import { Link } from 'react-router';

import TopBar from '../components/TopBar';

// Placeholders for counsel to finalize before publication.
const ENTITY = '[Legal Entity Name]';
const PRIVACY_EMAIL = 'privacy@socraticvoice.com';
const EFFECTIVE_DATE = '[Effective date — pending legal review]';

function Section({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-24">
      <h2 className="font-display text-2xl font-medium tracking-[-0.01em] text-text">
        {heading}
      </h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-text-subtle">
        {children}
      </div>
    </section>
  );
}

export default function BiometricDataRetentionPolicy() {
  return (
    <div className="min-h-screen bg-surface text-text">
      <TopBar
        rightSlot={
          <Link
            to="/"
            className="text-xs uppercase tracking-eyebrow text-text-muted underline-offset-4 transition-colors hover:text-text hover:underline"
          >
            Back to home
          </Link>
        }
      />

      <main className="mx-auto w-full max-w-[52rem] px-6 pb-24 pt-6 md:px-10 2xl:max-w-[56rem]">
        {/* DRAFT banner — remove once counsel approves. */}
        <div
          role="note"
          className="rounded-lg border border-border-strong bg-surface-sunken px-4 py-3 text-xs leading-6 text-text"
        >
          <span className="font-medium uppercase tracking-eyebrow">
            Draft — pending legal review.
          </span>{' '}
          This document is a working draft prepared for review by counsel and is
          not yet in force. Bracketed items are placeholders to be finalized
          before publication.
        </div>

        <p className="mt-8 text-eyebrow uppercase tracking-eyebrow text-text-muted">
          Legal
        </p>
        <h1
          className="mt-3 font-display font-medium leading-[1.04] tracking-[-0.03em]"
          style={{ fontSize: 'clamp(2.2rem, 4vw, 3.4rem)' }}
        >
          Biometric Data Retention Policy
        </h1>
        <p className="mt-5 text-sm leading-7 text-text-subtle">
          Effective: {EFFECTIVE_DATE} · Last updated: {EFFECTIVE_DATE}
        </p>
        <p className="mt-4 text-sm leading-7 text-text-subtle">
          This policy explains how {ENTITY} (&ldquo;we,&rdquo; &ldquo;us&rdquo;)
          handles biometric and biometric-derived data in the SocraticVoice
          interview-practice product, including how long we keep it and how it is
          destroyed. It is the retention policy referenced in the consent notices
          shown before camera-based features are enabled.
        </p>

        <Section id="scope" heading="1. Scope">
          <p>
            This policy covers only <strong>biometric and biometric-derived
            data</strong> we process in connection with the interview coach:
            webcam-based delivery analytics and the handling of your voice
            recording during practice. All other personal information — your
            profile, résumé text, answer transcripts, account and authentication
            data — is governed by our{' '}
            <Link
              to="/legal/privacy"
              className="underline underline-offset-4 transition-colors hover:text-text"
            >
              general Privacy Policy
            </Link>
            , which this policy supplements and does not replace.
          </p>
        </Section>

        <Section id="what-we-collect" heading="2. What we collect and how">
          <p>
            <strong>Webcam delivery analytics (optional).</strong> If you enable
            the camera during practice, your browser uses on-device face analysis
            to compute a small set of <strong>aggregate numeric metrics</strong>{' '}
            about your delivery — for example, approximate eye-contact, posture,
            and facial-expression percentages, head-tilt angle, and steadiness
            counts. Only these numbers are transmitted to and stored on our
            servers (with a per-turn &ldquo;delivery summary,&rdquo; a 0–10
            delivery score, and short delivery coaching).
          </p>
          <p>
            <strong>Voice (during practice).</strong> When you record a spoken
            answer, the audio is sent to our speech-to-text provider to produce a
            text transcript. We <strong>do not store the audio recording</strong>{' '}
            on our servers — it is used for transcription and then discarded. Only
            the resulting text transcript is retained (governed by the general
            Privacy Policy).
          </p>
          <p>
            <strong>Calibration (optional).</strong> An optional six-second
            calibration computes a few face-geometry baseline numbers that stay{' '}
            <strong>on your device</strong> (in your browser&rsquo;s local
            storage). Calibration data is never transmitted to or stored on our
            servers.
          </p>
          <p className="rounded-lg border border-border bg-surface-raised p-4">
            <strong className="text-text">What we never do.</strong> We do not
            create or store facial-recognition templates, face embeddings, or
            voiceprints; we do not retain raw video frames, images, or the
            underlying facial-landmark data on our servers; and we never use any
            of this data to identify you. The delivery metrics are coaching
            measurements, not an identifier.
          </p>
        </Section>

        <Section id="purpose" heading="3. Purpose and use limitation">
          <p>
            We process this data for one purpose: to give you feedback on your
            interview delivery within the practice product. We do not use it for
            identification or verification, for any hiring or employment decision,
            for advertising, or for profiling beyond generating your coaching
            feedback. We do not sell it and do not share it for cross-context
            behavioral advertising.
          </p>
        </Section>

        <Section id="consent" heading="4. Consent">
          <p>
            Camera-based delivery analytics are <strong>opt-in</strong>. We ask
            for your explicit, affirmative consent <strong>before</strong> any
            delivery summary is collected or stored, and we record the consent
            (with its notice version and timestamp). Consent is{' '}
            <strong>not a condition</strong> of using the interview coach — you can
            practice without the camera, and you can withdraw consent at any time
            (see &ldquo;Your choices and rights&rdquo;). If we materially change
            this notice, we will ask you to consent again.
          </p>
        </Section>

        <Section id="retention" heading="5. Retention schedule">
          <p>
            We keep stored delivery analytics (the per-turn delivery summary,
            delivery score, and delivery-specific coaching) only as long as needed
            for your coaching, and in any event{' '}
            <strong>no later than 12 months after your last practice session</strong>
            , whichever comes first. Your most recent session resets this period.
          </p>
          <p>We delete the data sooner than that when:</p>
          <ul className="ml-5 list-disc space-y-2">
            <li>you withdraw your consent to delivery analytics; or</li>
            <li>you delete your account; or</li>
            <li>
              the data is otherwise no longer necessary for the purpose above.
            </li>
          </ul>
          <p>
            <strong>Voice recordings</strong> are not retained: the audio is
            discarded immediately after transcription.{' '}
            <strong>Calibration data</strong> lives only on your device and is
            removed when you clear calibration or your browser storage.
          </p>
        </Section>

        <Section id="destruction" heading="6. How we destroy it">
          <p>
            When the retention period ends or you exercise a deletion right, we
            permanently delete the stored delivery summary, delivery score, and
            delivery-specific coaching, and we recompute any affected session
            scores so they no longer reflect the deleted delivery data. We run an
            automated deletion process on a recurring (at least daily) basis to
            enforce the schedule above, in addition to acting on your individual
            requests.
          </p>
        </Section>

        <Section id="disclosure" heading="7. Service providers">
          <p>
            We use a third-party speech-to-text provider to transcribe your
            recorded answers; your answer audio is transmitted to that provider
            for that purpose under contract and is not retained by us. We do not
            otherwise disclose biometric or biometric-derived data to third
            parties except as needed to provide the service, to comply with law,
            or with your consent. A complete list of our service providers /
            subprocessors appears in the general Privacy Policy.
          </p>
        </Section>

        <Section id="rights" heading="8. Your choices and rights">
          <p>
            You can withdraw consent and delete your stored delivery analytics at
            any time from the calibration/delivery settings in the app, and you
            can delete your account to remove this and other data. Depending on
            where you live (including Illinois, Texas, Colorado, California, and
            the EU/EEA/UK), you may also have rights to access, obtain a copy of,
            correct, or delete your personal data, and to withdraw consent. You can
            export a copy of your data from within the app, and you can exercise
            any of these rights by contacting us at {PRIVACY_EMAIL}. We will not
            discriminate against you for exercising these rights.
          </p>
        </Section>

        <Section id="security" heading="9. Security">
          <p>
            We protect this data with measures appropriate to its sensitivity,
            including encryption in transit and access controls. No method of
            transmission or storage is completely secure, but we work to protect
            your information and to limit what we collect and keep.
          </p>
        </Section>

        <Section id="changes" heading="10. Changes to this policy">
          <p>
            We may update this policy from time to time. We will update the
            &ldquo;Last updated&rdquo; date above and, where a change is material
            or the consent notice changes, ask you to review and consent again
            before continuing to use camera-based features.
          </p>
        </Section>

        <Section id="contact" heading="11. Contact">
          <p>
            Questions about this policy or our handling of biometric data can be
            sent to {ENTITY} at {PRIVACY_EMAIL}.
          </p>
        </Section>

        <p className="mt-12 border-t border-border pt-6 text-xs leading-6 text-text-muted">
          This draft is provided for legal review and does not constitute legal
          advice or a binding commitment until finalized and published.{' '}
          <Link
            to="/"
            className="underline-offset-4 transition-colors hover:text-text hover:underline"
          >
            Return home
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
