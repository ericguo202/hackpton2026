/**
 * Public Terms of Service.
 *
 * The contractual companion to the two notice/consent documents — the general
 * Privacy Policy (`/legal/privacy`) and the Biometric Data Retention Policy
 * (`/legal/biometric-data-retention`) — both of which defer acceptance,
 * acceptable use, account termination, liability, and the under-18
 * "guardian agrees to be bound by these Terms" mechanism to this agreement.
 * This page sets out who may use the Service, the rules for using it
 * (acceptable use), how we enforce them (content moderation + prompt-injection
 * guardrails, up to account termination), and the standard contractual terms.
 *
 * Deliberately PUBLIC (no auth guard) so anyone can read it before signing up,
 * and so it can be linked from sign-up and the other legal pages.
 *
 * This is a DRAFT pending legal review — see TERMS_REVIEW.md for the
 * code-verified enforcement facts, law-by-law analysis, and open questions for
 * counsel. The Service has NO paid tier today, so these Terms contain no
 * payment terms. Keep the age / guardian wording in sync with the Privacy
 * Policy's "Eligibility and age" section.
 */

import { type ReactNode } from 'react';
import { Link } from 'react-router';

import TopBar from '../components/TopBar';

// Placeholders for counsel to finalize before publication. Kept identical to
// the Privacy Policy and Biometric Data Retention Policy so the three documents
// stay in sync.
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

export default function TermsOfService() {
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
          Terms of Service
        </h1>
        <p className="mt-5 text-sm leading-7 text-text-subtle">
          Effective: {EFFECTIVE_DATE} · Last updated: {EFFECTIVE_DATE}
        </p>
        <p className="mt-4 text-sm leading-7 text-text-subtle">
          These Terms of Service (&ldquo;Terms&rdquo;) are an agreement between
          you and {ENTITY} (&ldquo;we,&rdquo; &ldquo;us,&rdquo;
          &ldquo;our&rdquo;) governing your use of the SocraticVoice
          interview-practice product (the &ldquo;Service&rdquo;). Please read
          them carefully. They work alongside our{' '}
          <Link
            to="/legal/privacy"
            className="underline underline-offset-4 transition-colors hover:text-text"
          >
            Privacy Policy
          </Link>{' '}
          and{' '}
          <Link
            to="/legal/biometric-data-retention"
            className="underline underline-offset-4 transition-colors hover:text-text"
          >
            Biometric Data Retention Policy
          </Link>
          , which describe how we handle your information.
        </p>

        <Section id="acceptance" heading="1. Introduction and acceptance">
          <p>
            SocraticVoice is an AI behavioral-interview coach. You record spoken
            answers to interview questions; we transcribe and evaluate them and
            give you written feedback and practice scores. By accessing or using
            the Service, you agree to be bound by these Terms. If you do not
            agree, please do not use the Service.
          </p>
          <p>
            We may update these Terms from time to time as described in
            &ldquo;Changes to these Terms&rdquo; below. Where a change is
            material, we will ask you to review and accept the updated Terms
            before you continue using the Service.
          </p>
        </Section>

        <Section id="policies" heading="2. Related policies and notices">
          <p>
            The following documents and notices form part of your agreement with
            us and are incorporated into these Terms by reference. Where a
            conflict exists, the more specific document controls for the matter
            it covers.
          </p>
          <ul className="ml-5 list-disc space-y-3">
            <li>
              <strong>
                <Link
                  to="/legal/privacy"
                  className="underline underline-offset-4 transition-colors hover:text-text"
                >
                  Privacy Policy
                </Link>
                .
              </strong>{' '}
              Explains what personal information we collect, how we use and share
              it with our service providers, how long we keep it, and the choices
              and rights you have.
            </li>
            <li>
              <strong>
                <Link
                  to="/legal/biometric-data-retention"
                  className="underline underline-offset-4 transition-colors hover:text-text"
                >
                  Biometric Data Retention Policy
                </Link>
                .
              </strong>{' '}
              Covers the optional webcam &ldquo;delivery&rdquo; analytics and how
              your voice recording is handled, including the specific retention
              schedule for that data.
            </li>
            <li>
              <strong>Delivery-analytics consent.</strong> Webcam-based delivery
              analytics are strictly <strong>opt-in</strong>. Before any delivery
              metric is collected, we ask for your explicit consent and record it
              (with its notice version and timestamp). You can withdraw this
              consent at any time from the app, and the Service works fully
              without the camera.
            </li>
            <li>
              <strong>Calibration consent.</strong> An optional six-second face
              calibration computes a few baseline numbers that stay{' '}
              <strong>on your device</strong> and are never transmitted to us. It
              too is opt-in and can be cleared from your browser at any time.
            </li>
          </ul>
        </Section>

        <Section id="eligibility" heading="3. Eligibility and age">
          <p>
            The Service is intended for adults and older teens and is not
            directed to children. You must be at least{' '}
            <strong>16 years old</strong> — or older, if a higher minimum age
            applies where you live — to use the Service.
          </p>
          <p>
            Because minors generally cannot enter into binding contracts, if you
            are <strong>under 18</strong> you may use the Service only with the
            involvement of a parent or legal guardian who agrees to be bound by
            these Terms on your behalf. By allowing a minor in their care to use
            the Service, that parent or guardian accepts these Terms and is
            responsible for the minor&rsquo;s use of it.
          </p>
          <p>
            We do not collect date of birth or otherwise verify age; eligibility
            is based on your representation that you (and, for a minor, the
            supervising parent or guardian) meet these requirements. If we learn
            that someone does not meet them, we may suspend or terminate the
            account and delete the associated information.
          </p>
        </Section>

        <Section id="acceptable-use" heading="4. Acceptable use">
          <p>
            You agree to use the Service only for its intended purpose —
            practicing for interviews — and not in any unlawful, harmful, or
            otherwise abusive way. In particular, you agree that you will{' '}
            <strong>not</strong>:
          </p>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              submit content that is harassing, hateful, threatening, sexual,
              violent, or that otherwise violates our content standards or
              applicable law;
            </li>
            <li>
              attempt to manipulate, circumvent, probe, or interfere with the
              Service&rsquo;s AI systems or safety controls — including{' '}
              <strong>prompt-injection attempts</strong> or efforts to make the
              AI ignore its instructions, reveal system prompts, or behave
              outside its intended function;
            </li>
            <li>
              harass, abuse, or harm another person, or impersonate any person or
              entity;
            </li>
            <li>
              infringe anyone&rsquo;s intellectual-property, privacy, or other
              rights, or submit content you do not have the right to submit;
            </li>
            <li>
              scrape, copy, or harvest the Service through automated means, or
              attempt to access it other than through the interfaces we provide;
            </li>
            <li>
              probe, breach, or circumvent the Service&rsquo;s security, rate
              limits, or usage limits, or introduce malware or otherwise disrupt
              the Service; or
            </li>
            <li>
              use the Service to commit, facilitate, or encourage any illegal
              activity.
            </li>
          </ul>
        </Section>

        <Section id="enforcement" heading="5. Content moderation and enforcement">
          <p>
            To keep the Service safe and within these Terms, we screen submitted
            text for content-policy violations and use automated guardrails to
            detect attempts to manipulate the AI (such as prompt injection). When
            we detect a violation, we may refuse, block, or remove content, limit
            or suspend access, or take other action we consider appropriate.
          </p>
          <p>
            <strong>
              We reserve the right to suspend or terminate accounts at our
              discretion, and repeated and/or egregious violations of our
              moderation or prompt-injection guardrails — or other abuse of the
              Service — will result in account termination.
            </strong>{' '}
            Where required by applicable law, we will provide a statement of the
            reasons for an enforcement action.
          </p>
          <p>
            We may also disclose information to, and cooperate with, law
            enforcement or other authorities where we believe in good faith it is
            required by law or valid legal process, or where we reasonably believe
            it is necessary to address suspected illegal use of the Service,
            fraud, or threats to the safety, rights, or property of any person, as
            described in our{' '}
            <Link
              to="/legal/privacy"
              className="underline underline-offset-4 transition-colors hover:text-text"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </Section>

        <Section id="account" heading="6. Your account">
          <p>
            You access the Service through an account managed by our
            authentication provider. You are responsible for keeping your sign-in
            credentials secure and for all activity that occurs under your
            account. Accounts are for a single person — do not share your account
            or let others use it. Please notify us promptly at {PRIVACY_EMAIL} if
            you believe your account has been accessed without your authorization.
          </p>
        </Section>

        <Section id="content-ip" heading="7. Your content and our intellectual property">
          <p>
            You keep ownership of the content you submit to the Service —
            including your résumé text, bio, recorded answers, and transcripts.
            You grant us a limited, non-exclusive license to host, process, and
            analyze that content <strong>solely to operate and provide the
            Service</strong> to you — for example, to transcribe your answers,
            generate questions and coaching feedback, and screen content for
            safety — as further described in the{' '}
            <Link
              to="/legal/privacy"
              className="underline underline-offset-4 transition-colors hover:text-text"
            >
              Privacy Policy
            </Link>
            .{' '}
            <span className="text-text-muted">
              [Whether this license also permits use of de-identified or
              aggregated data to improve the Service is to be confirmed by
              counsel.]
            </span>
          </p>
          <p>
            The Service itself — including our software, models as configured,
            text, design, and branding — belongs to us or our licensors and is
            protected by intellectual-property laws. We grant you a personal,
            non-transferable, revocable right to use the Service in accordance
            with these Terms; no other rights are granted.
          </p>
        </Section>

        <Section id="ai-disclaimer" heading="8. AI-generated feedback">
          <p>
            The Service is a <strong>practice tool</strong>. The questions,
            scores, and feedback it generates are produced by automated systems,
            including AI models, and may be incomplete or inaccurate. They are{' '}
            <strong>not</strong> professional, career, legal, or other advice, and
            they are <strong>not</strong> a prediction or guarantee of any
            interview, hiring, or employment outcome. You are responsible for how
            you use the feedback.
          </p>
        </Section>

        <Section id="availability" heading="9. Availability and changes to the Service">
          <p>
            The Service is provided on an &ldquo;as available&rdquo; basis and is
            an early-stage product that we are actively developing. We may add,
            change, suspend, or discontinue features (and may impose usage limits)
            at any time. The Service is <strong>currently provided at no
            charge</strong>.
          </p>
        </Section>

        <Section id="disclaimers" heading="10. Disclaimers">
          <p>
            To the fullest extent permitted by applicable law, the Service is
            provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without
            warranties of any kind, whether express or implied, including implied
            warranties of merchantability, fitness for a particular purpose, and
            non-infringement. We do not warrant that the Service will be
            uninterrupted, error-free, or secure, or that any feedback it
            generates will be accurate.
          </p>
        </Section>

        <Section id="liability" heading="11. Limitation of liability">
          <p>
            To the fullest extent permitted by applicable law, {ENTITY} and its
            officers, employees, and suppliers will not be liable for any
            indirect, incidental, special, consequential, or punitive damages, or
            for any loss of data, opportunities, or goodwill, arising out of or
            relating to your use of (or inability to use) the Service.{' '}
            <span className="text-text-muted">
              [Aggregate liability cap and any exclusions to be set by counsel.]
            </span>{' '}
            Nothing in these Terms limits or excludes any liability that cannot be
            limited or excluded under applicable law — including, for consumers in
            the EU/EEA and UK, your mandatory legal rights.
          </p>
        </Section>

        <Section id="indemnification" heading="12. Indemnification">
          <p>
            To the extent permitted by applicable law, you agree to indemnify and
            hold harmless {ENTITY} from claims, losses, and expenses arising out
            of your misuse of the Service or your violation of these Terms or of
            applicable law.{' '}
            <span className="text-text-muted">
              [Scope to be confirmed by counsel.]
            </span>
          </p>
        </Section>

        <Section id="termination" heading="13. Termination">
          <p>
            You may stop using the Service at any time, and you can delete your
            account from within the app to remove your information. We may suspend
            or terminate your access as described in &ldquo;Content moderation and
            enforcement&rdquo; above, or if we reasonably believe it is necessary
            to protect the Service or other users.
          </p>
          <p>
            When your account is terminated or deleted, we delete your profile and
            the associated sessions, transcripts, scores, and other data as
            described in the{' '}
            <Link
              to="/legal/privacy"
              className="underline underline-offset-4 transition-colors hover:text-text"
            >
              Privacy Policy
            </Link>
            . Provisions that by their nature should survive termination — such as
            the intellectual-property, disclaimer, liability, and governing-law
            sections — will continue to apply.
          </p>
        </Section>

        <Section id="governing-law" heading="14. Governing law and dispute resolution">
          <p>
            <span className="text-text-muted">
              [Governing law, venue, and dispute-resolution procedure (including
              whether arbitration and any class-action waiver apply) to be
              determined by counsel.]
            </span>{' '}
            Nothing here is intended to deprive consumers of the protection of
            mandatory laws of their country of residence.
          </p>
        </Section>

        <Section id="changes" heading="15. Changes to these Terms">
          <p>
            We may update these Terms from time to time. We will revise the
            &ldquo;Last updated&rdquo; date above and, where a change is material,
            provide a more prominent notice and ask you to review and accept the
            updated Terms before continuing to use the Service. If you do not
            accept the updated Terms, you may not continue using the Service, but
            you can still export your data or delete your account.
          </p>
        </Section>

        <Section id="contact" heading="16. Contact">
          <p>
            Questions about these Terms can be sent to {ENTITY} at{' '}
            {PRIVACY_EMAIL}.
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
