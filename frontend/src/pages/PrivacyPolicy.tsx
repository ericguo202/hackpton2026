/**
 * Public general Privacy Policy.
 *
 * The companion to the narrower Biometric Data Retention Policy
 * (`/legal/biometric-data-retention`): that one covers webcam/voice biometric
 * data only and defers everything else here. This policy covers all personal
 * information — account/identity, profile, interview transcripts, scores and
 * feedback, operational/audit data — and the third-party service providers we
 * share it with (Information We Collect, How We Use It, How We Share It, Data
 * Retention & Storage, your rights).
 *
 * Deliberately PUBLIC (no auth guard) so anyone can read it, and so it can be
 * linked from consent surfaces and sign-up.
 *
 * This is a DRAFT pending legal review — see PRIVACY_REVIEW.md for the
 * data-flow inventory, law-by-law analysis, and open questions for counsel.
 * Keep biometric/voice retention specifics in the Biometric Data Retention
 * Policy (single source of truth for the 12-month figure); cross-reference it
 * here rather than restating it.
 */

import { type ReactNode } from 'react';
import { Link } from 'react-router';

import TopBar from '../components/TopBar';

// Placeholders for counsel to finalize before publication. Kept identical to
// the Biometric Data Retention Policy so the two documents stay in sync.
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

/** A two-column "service provider" row used in the sharing section. */
function ProviderRow({
  name,
  purpose,
  data,
}: {
  name: string;
  purpose: string;
  data: string;
}) {
  return (
    <tr className="border-t border-border align-top">
      <th scope="row" className="py-3 pr-4 text-left font-medium text-text">
        {name}
      </th>
      <td className="py-3 pr-4">{purpose}</td>
      <td className="py-3">{data}</td>
    </tr>
  );
}

export default function PrivacyPolicy() {
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
          Privacy Policy
        </h1>
        <p className="mt-5 text-sm leading-7 text-text-subtle">
          Effective: {EFFECTIVE_DATE} · Last updated: {EFFECTIVE_DATE}
        </p>
        <p className="mt-4 text-sm leading-7 text-text-subtle">
          This Privacy Policy explains how {ENTITY} (&ldquo;we,&rdquo;
          &ldquo;us,&rdquo; &ldquo;our&rdquo;) collects, uses, shares, and
          retains personal information in the SocraticVoice interview-practice
          product (the &ldquo;Service&rdquo;), and the choices and rights you
          have. It is the general policy referenced by our{' '}
          <Link
            to="/legal/biometric-data-retention"
            className="underline underline-offset-4 transition-colors hover:text-text"
          >
            Biometric Data Retention Policy
          </Link>
          , which supplements (and does not replace) this policy for camera- and
          voice-related data.
        </p>

        <Section id="scope" heading="1. Introduction and scope">
          <p>
            SocraticVoice is an AI behavioral-interview coach. You record spoken
            answers to interview questions; we transcribe and evaluate them and
            give you written feedback and practice scores. This policy applies to
            personal information we process through the Service&rsquo;s website
            and application.
          </p>
          <p>
            This is our <strong>general</strong> privacy policy and covers all
            personal information we handle. The handling of{' '}
            <strong>biometric and biometric-derived data</strong> (optional
            webcam &ldquo;delivery&rdquo; analytics and how your voice recording
            is processed), including its specific retention schedule, is detailed
            in our{' '}
            <Link
              to="/legal/biometric-data-retention"
              className="underline underline-offset-4 transition-colors hover:text-text"
            >
              Biometric Data Retention Policy
            </Link>
            . Where the two overlap, that policy controls for biometric data.
          </p>
        </Section>

        <Section id="what-we-collect" heading="2. Information we collect">
          <p>
            We collect the following categories of personal information, almost
            all of it provided directly by you or generated as you use the
            Service:
          </p>
          <ul className="ml-5 list-disc space-y-3">
            <li>
              <strong>Account and identity.</strong> When you sign up we use a
              third-party authentication provider (Clerk). We receive your email
              address, your name, and — if you sign in with Google — basic
              account identifiers from that sign-in. We do not receive or store
              your Google password.
            </li>
            <li>
              <strong>Profile you provide.</strong> Information you enter to
              personalize your coaching: résumé text, a short bio, your target
              industry and role, your experience level, and your time zone.
            </li>
            <li>
              <strong>Interview content.</strong> When you practice, you record
              spoken answers. The <strong>audio is used only to produce a text
              transcript and is then discarded</strong> — we do not store the
              audio recording (see the Biometric Data Retention Policy). We
              retain the resulting transcript, derived counts (such as
              filler-word and word counts), the practice scores and written
              coaching feedback we generate, the company name and job title you
              enter for a session, and any questions you choose to save.
            </li>
            <li>
              <strong>Optional webcam delivery analytics.</strong> If you turn on
              the camera and consent, your browser computes a small set of{' '}
              <strong>aggregate numeric delivery metrics</strong> (for example,
              approximate eye-contact, posture, and expression percentages) that
              are sent to us; raw video and facial-landmark data never leave your
              device. This is opt-in and is governed in detail by the{' '}
              <Link
                to="/legal/biometric-data-retention"
                className="underline underline-offset-4 transition-colors hover:text-text"
              >
                Biometric Data Retention Policy
              </Link>
              .
            </li>
            <li>
              <strong>On your device.</strong> We use storage on your device for
              your sign-in session and for optional calibration data and consent
              records that stay <strong>local to your browser</strong> and are
              not transmitted to us.
            </li>
            <li>
              <strong>Operational and security records.</strong> Records of your
              consent choices, counters used to enforce daily usage limits, and a
              security and audit log of significant events. That log can briefly
              capture text you submit (for example, to investigate a content-policy
              or abuse signal); we automatically scrub that captured content on a
              short schedule (see &ldquo;Data retention and storage&rdquo;).
            </li>
          </ul>
          <p>
            We do <strong>not</strong> use third-party advertising, analytics, or
            tracking services, and we do not build advertising profiles about you.
          </p>
        </Section>

        <Section id="how-we-use" heading="3. How we use your information">
          <p>We use personal information to:</p>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              provide and personalize the Service — generate interview questions
              tailored to your profile, transcribe your answers, and produce
              scores and coaching feedback;
            </li>
            <li>
              research the company and role you enter so questions and feedback
              are relevant;
            </li>
            <li>
              keep the Service safe — screen submitted text for content-policy
              violations, prevent abuse, enforce usage limits, and maintain a
              security and audit log;
            </li>
            <li>
              operate, troubleshoot, and improve the Service; and
            </li>
            <li>
              comply with law and enforce our terms.
            </li>
          </ul>
          <p>
            Where the EU/UK GDPR applies, our lawful bases are: performance of our
            contract with you (to provide the Service you request); your consent
            (for optional webcam delivery analytics, which you can withdraw at any
            time); and our legitimate interests (to secure the Service, prevent
            abuse, and improve the product), balanced against your rights.
          </p>
        </Section>

        <Section id="sharing" heading="4. How we share your information">
          <p>
            We do <strong>not sell</strong> your personal information, and we do
            not share it for cross-context behavioral advertising. We share it
            only with the service providers that help us run the Service, and as
            described below. Each provider receives only the data needed for its
            function and is bound to process it on our behalf.
          </p>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full border-collapse text-sm leading-6 text-text-subtle">
              <thead>
                <tr className="text-left text-xs uppercase tracking-eyebrow text-text-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Provider
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Purpose
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Data shared
                  </th>
                </tr>
              </thead>
              <tbody>
                <ProviderRow
                  name="Clerk"
                  purpose="Authentication and account management"
                  data="Email, name, and sign-in identifiers"
                />
                <ProviderRow
                  name="OpenRouter (and its model providers, incl. Google and DeepSeek models)"
                  purpose="AI generation of questions, evaluation, and feedback"
                  data="Your answer transcripts, profile context (role, experience level), and the company/role you enter"
                />
                <ProviderRow
                  name="OpenAI (moderation)"
                  purpose="Screening submitted text for content-policy violations"
                  data="Text you submit (e.g., transcripts, résumé text, bio)"
                />
                <ProviderRow
                  name="ElevenLabs"
                  purpose="Speech-to-text (transcription) and text-to-speech (spoken questions)"
                  data="Your recorded answer audio (transcribed, then discarded) and question text"
                />
                <ProviderRow
                  name="Serper"
                  purpose="Company and role research for relevant questions"
                  data="Company name, job title, and experience level"
                />
                <ProviderRow
                  name="Hosting & infrastructure (Vercel, Amazon Web Services)"
                  purpose="Serving the application and storing data"
                  data="Personal information described in this policy, stored and processed in the United States"
                />
                <ProviderRow
                  name="Content delivery network (jsDelivr)"
                  purpose="Serving the in-browser camera-analysis library"
                  data="No personal data sent by us; your device's IP address is visible to the network, as with any web resource"
                />
              </tbody>
            </table>
          </div>
          <p>
            <strong>Government and law enforcement.</strong> We may disclose
            personal information when we believe in good faith that disclosure is
            required by applicable law or valid legal process (such as a subpoena
            or court order), or where we reasonably believe it is necessary to
            prevent or address suspected illegal use of the Service, fraud, or
            threats to the safety, rights, or property of any person.
          </p>
          <p>
            <strong>Business transfers.</strong> If we are involved in a merger,
            acquisition, financing, or sale of assets, personal information may be
            transferred as part of that transaction; we will require the recipient
            to honor this policy or notify you of any material change.
          </p>
        </Section>

        <Section id="retention" heading="5. Data retention and storage">
          <p>
            We store personal information on infrastructure located in the{' '}
            <strong>United States</strong> and protect it in transit with
            encryption. We keep information only as long as needed for the
            purposes above:
          </p>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <strong>Account and interview data</strong> (profile, transcripts,
              scores, feedback, saved questions) is retained for as long as your
              account is active, and deleted when you delete your account.
            </li>
            <li>
              <strong>Answer audio is not retained</strong> — it is discarded
              immediately after transcription.
            </li>
            <li>
              <strong>Webcam delivery analytics</strong> are retained no longer
              than 12 months after your last practice session, and sooner if you
              withdraw consent or delete your account — see the{' '}
              <Link
                to="/legal/biometric-data-retention"
                className="underline underline-offset-4 transition-colors hover:text-text"
              >
                Biometric Data Retention Policy
              </Link>
              .
            </li>
            <li>
              <strong>Security/audit-log content</strong> (any text briefly
              captured for investigation) is automatically scrubbed on a short
              recurring schedule, leaving only a minimal event record.
            </li>
            <li>
              <strong>Calibration data</strong> lives only on your device and is
              removed when you clear calibration or your browser storage.
            </li>
          </ul>
          <p>
            When you delete your account, we delete your profile and the
            associated sessions, transcripts, scores, metrics, saved questions,
            and delivery analytics.
          </p>
        </Section>

        <Section id="rights" heading="6. Your choices and rights">
          <p>
            You have control over your information, and — depending on where you
            live (including California, Colorado, Connecticut, Virginia and other
            U.S. states, and the EU/EEA/UK) — specific legal rights:
          </p>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <strong>Access and portability.</strong> You can export a copy of
              your data from within the app.
            </li>
            <li>
              <strong>Correction.</strong> You can edit your profile information
              at any time.
            </li>
            <li>
              <strong>Deletion.</strong> You can delete your account to remove
              your personal information.
            </li>
            <li>
              <strong>Withdraw consent.</strong> You can turn off and delete
              webcam delivery analytics at any time from the app&rsquo;s privacy
              settings.
            </li>
          </ul>
          <p>
            Depending on your jurisdiction you may also have the right to confirm
            whether we process your data, to opt out of sale or targeted
            advertising (we do neither), to limit use of sensitive information,
            and to appeal a decision on your request. We will{' '}
            <strong>not discriminate</strong> against you for exercising these
            rights.
          </p>
          <p>
            <strong>Sensitive information.</strong> Where any information we
            process is treated as &ldquo;sensitive&rdquo; under applicable law
            (for example, biometric-derived data), we process it only with your
            opt-in consent and do not sell it. To exercise any right, use the
            in-app controls or contact us at {PRIVACY_EMAIL}. We may need to verify
            your identity before acting on a request.
          </p>
        </Section>

        <Section id="automated" heading="7. Automated processing">
          <p>
            The Service uses automated systems, including AI models, to generate
            your practice questions, transcribe your answers, and produce scores
            and coaching feedback. This is <strong>practice feedback</strong> —
            it is not used to make any legal, employment, hiring, financial, or
            other decision about you that produces a similar significant effect.
            If you have questions about how your feedback was generated, you can
            contact us at {PRIVACY_EMAIL}.
          </p>
        </Section>

        <Section id="international" heading="8. International users and data transfers">
          <p>
            We operate and store data in the United States. If you access the
            Service from outside the United States, you understand your
            information will be transferred to and processed in the United States.
            Where required for transfers from the EU/EEA, UK, or Switzerland, we
            rely on an appropriate transfer mechanism (such as the European
            Commission&rsquo;s Standard Contractual Clauses).{' '}
            <span className="text-text-muted">
              [Transfer mechanism to be confirmed by counsel.]
            </span>
          </p>
        </Section>

        <Section id="eligibility" heading="9. Eligibility and age">
          <p>
            The Service is intended for adults and older teens, and is not
            directed to children. You must be at least <strong>16 years old</strong>
            {' '}— or older, if a higher minimum age applies where you live — to use
            the Service.
          </p>
          <p>
            Because minors generally cannot enter into binding contracts, if you
            are <strong>under 18</strong> you may use the Service only with the
            involvement of a parent or legal guardian who agrees to be bound by
            our{' '}
            <Link
              to="/legal/terms"
              className="underline underline-offset-4 transition-colors hover:text-text"
            >
              Terms of Service
            </Link>{' '}
            and this Privacy Policy on your behalf.
          </p>
          <p>
            We do not knowingly collect personal information from anyone under the
            minimum age, and we do not collect date of birth or otherwise verify
            age — eligibility is based on your representation that you meet these
            requirements. If we learn that we have collected information from
            someone under the minimum age without the required involvement of a
            parent or guardian, we will delete it. If you believe a minor has
            provided us information, contact us at {PRIVACY_EMAIL}.
          </p>
        </Section>

        <Section id="security" heading="10. Security">
          <p>
            We protect personal information with measures appropriate to its
            sensitivity, including encryption in transit and access controls, and
            we limit what we collect and keep. No method of transmission or
            storage is completely secure, but we work to protect your information.
          </p>
        </Section>

        <Section id="changes" heading="11. Changes to this policy">
          <p>
            We may update this policy from time to time. We will revise the
            &ldquo;Last updated&rdquo; date above and, where a change is material,
            provide a more prominent notice and ask you to review and accept the
            updated policy before continuing to use the Service.
          </p>
        </Section>

        <Section id="contact" heading="12. Contact">
          <p>
            Questions about this policy or our handling of your personal
            information can be sent to {ENTITY} at {PRIVACY_EMAIL}.
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
