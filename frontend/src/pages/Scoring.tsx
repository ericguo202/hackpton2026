/**
 * Scoring — the content-rubric transparency page (sibling to DeliveryPlayground).
 * Explains, per question category, what each of the five scored content
 * dimensions means and how to answer that type well, then how the Recommended
 * Mix blends the four categories. Copy is finalized in the root
 * `scoring_page_implementation.md`; dimension labels/colors come from the
 * canonical `scoreDimensionsFor` so this page can never drift from History /
 * SessionDetail. No data fetching — it's static, research-cited prose.
 */

import { type ReactNode } from 'react';
import { Link } from 'react-router';

import AccountButton from '../components/AccountButton';
import CategoryScoringSection, {
  type CategoryContent,
} from '../components/scoring/CategoryScoringSection';
import TopBar, { TopBarNavLink } from '../components/TopBar';

function ScoringNav() {
  return (
    <>
      <TopBarNavLink to="/" matchPatterns={['/practice']}>
        Practice
      </TopBarNavLink>
      <TopBarNavLink to="/history" matchPatterns={['/sessions/:id']}>
        History
      </TopBarNavLink>
      <TopBarNavLink to="/personalize">Personalize</TopBarNavLink>
      <TopBarNavLink to="/calibrate">Calibration</TopBarNavLink>
    </>
  );
}

/** External citation link — consistent styling for the research references. */
function Cite({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-xs text-link underline decoration-link/40 underline-offset-2 transition-colors hover:decoration-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      {children}
    </a>
  );
}

const REF = {
  opmStructured:
    'https://www.opm.gov/policy-data-oversight/assessment-and-selection/other-assessment-methods/structured-interviews/',
  opmSjt:
    'https://www.opm.gov/policy-data-oversight/assessment-and-selection/other-assessment-methods/situational-judgment-tests/',
  princeton:
    'https://careerdevelopment.princeton.edu/interview-guide/types-interview-questions/behavioral-or-situational',
  columbia:
    'https://www.careereducation.columbia.edu/resources/prepare-interview-sample-questions',
  uconn: 'https://career.uconn.edu/types-of-questions/',
  nace: 'https://www.naceweb.org/research/reports/job-outlook/2026/',
  muse: 'https://www.themuse.com/advice/behavioral-interview-questions-answers-examples',
  frontiers:
    'https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.674815/full',
  unc: 'https://studentaid.unc.edu/wp-content/uploads/sites/1072/2019/12/2020_Interview_Process_Development_Guide.pdf',
  bankiLatham:
    'https://www-2.rotman.utoronto.ca/facbios/file/35%20-%20Banki%20&%20Latham%202010.pdf',
  reed: 'https://www.reed.com/articles/customer-service-interview-questions-and-answers',
  tulane:
    'https://careerengagement.tulane.edu/blog/2026/04/09/interview-prep-reframing-the-weakness-question/',
  eurich:
    'https://hbr.org/2018/01/what-self-awareness-really-is-and-how-to-cultivate-it',
  pid: 'https://www.sciencedirect.com/science/article/abs/pii/S0191886923004269',
  indeed:
    'https://www.indeed.com/career-advice/interviewing/list-of-example-weaknesses-for-interviewing',
  bmc: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7906611/',
} as const;

// Per-category copy. `dimensionBlurbs` are in canonical position order
// (Structure first) so they line up with `scoreDimensionsFor(category)` — note
// Situational position 2 is "Reasoning" (canonical) and Self-Assessment order is
// Structure / Self-Awareness / Growth / Candor / Evidence.
const CATEGORY_CONTENT: CategoryContent[] = [
  {
    category: 'experience_star',
    subtitle: '“Tell me about a time…” — questions about what you actually did.',
    dimensionBlurbs: [
      'A clear arc: situation, your actions, the result.',
      'The reasoning behind your choices is visible.',
      'The story closes with a result someone could measure.',
      'You owned the move rather than watching it happen.',
      'Specifics over generalities.',
    ],
    tips: [
      'Spend the least time on setup and the most on what you did.',
      'Say “I,” not only “we.” Credit your team, but be precise about which decision or action was yours.',
      'Be specific — give a few concrete details that prove you were actually there.',
      'Name trade-offs you considered and alternatives you rejected, and why, to show critical thinking.',
      'Numbers (a percentage or a count) beat adjectives. Top companies grade whether the scope of your impact matches your level.',
      'Close out strong — connect the result to your action: interviewers listen for whether your contribution caused the outcome.',
    ],
  },
  {
    category: 'motivation_fit',
    subtitle: '“Tell me about yourself,” “why this company,” “why this field.”',
    dimensionBlurbs: [
      'A deliberate arc — for “tell me about yourself,” present → past → future — rather than a résumé recitation.',
      "Your background maps to this role's actual requirements.",
      "Evidence you've done your homework.",
      'Your story hangs together.',
      'Specific, genuine enthusiasm in what you say.',
    ],
    tips: [
      'Select the two or three high-impact experiences from your résumé specific to your target role.',
      'Make the connection out loud. “I did X, which is why I can do this role’s Y” is much stronger than just “I did X.”',
      <>
        Cite something specific and accurate — a product, a documented value, a
        recent move — and link it to your own motivation. Employers screen
        candidates against the specific skills and values they’ve published (
        <Cite href={REF.nace}>NACE Job Outlook research</Cite>).
      </>,
      'Research the company and your role at the company. Generic praise (“great culture”) comes off as unprepared.',
      "Explain career transitions. Interviewers test your stated motivation against choices you've actually made.",
      <>
        Be enthusiastic, but attach your enthusiasm to at least one specific
        motivator: what you’d want to work on first, why this team, why now (
        <Cite href={REF.muse}>The Muse</Cite>).
      </>,
    ],
  },
  {
    category: 'situational',
    subtitle:
      '“What would you do if…” — hypotheticals that test your reasoning before you’ve lived the situation.',
    intro: (
      <>
        In these questions, you must choose between competing courses of action,
        testing judgment and values. They’re popular for candidates who don’t
        yet have years of experience (
        <Cite href={REF.frontiers}>Frontiers in Psychology</Cite>,{' '}
        <Cite href={REF.unc}>UNC interview development guide</Cite>). There is no
        single right answer because real problems have multiple valid solutions (
        <Cite href={REF.bankiLatham}>Banki &amp; Latham, 2010</Cite>).
      </>
    ),
    dimensionBlurbs: [
      'Clarify the situation → weigh options → decide → justify.',
      'The soundness of the approach you chose.',
      'Your decision is grounded in stated reasoning and values.',
      "Your answer is realistic under the scenario's constraints.",
      'You tie the hypothetical back to something real.',
    ],
    tips: [
      'Commit to a decision. Playing both sides without ever choosing comes off as evasive.',
      'Acknowledge the trade-off — what your choice costs, who it affects, and what could go wrong downstream.',
      'Say the “why” behind the “what.” Justifying why the rejected option lost is the fastest way to show judgment rather than reflex.',
      "Give a concrete first step based on your experience level and the information you're given. Don't assume authority, resources, or facts the scenario didn't provide.",
      <>
        Ground decisions in prior experience — “I’d do X, because when Y
        happened, Z worked.” Recruiters discount purely theoretical answers when
        you have real experience to draw on (<Cite href={REF.reed}>Reed</Cite>) —
        and if you’re early-career, coursework, clubs, and projects count fully.
      </>,
    ],
  },
  {
    category: 'self_assessment_growth',
    subtitle:
      "Strengths and weaknesses, biggest failure, feedback you've received.",
    dimensionBlurbs: [
      'Claim → concrete example → what it means, answered on the trait actually asked about.',
      'An honest, specific read on yourself.',
      'Concrete steps you’ve taken to improve, with signs of progress.',
      'You own real shortcomings without self-sabotage.',
      'Every trait claim is backed by a concrete moment.',
    ],
    tips: [
      'One trait, well-evidenced, beats a list of five.',
      <>
        Name a real, role-relevant weakness a manager would recognize. Skip the
        clichés and the strengths-in-disguise — interviewers assess honesty, and
        disguised strengths read as evasive (
        <Cite href={REF.tulane}>Tulane Career Services</Cite>).
      </>,
      <>
        Know how others see you — it can differ from how you see yourself. Quote
        feedback you’ve actually received (
        <Cite href={REF.eurich}>Eurich, Harvard Business Review</Cite>).
      </>,
      'Anchor each claim to a specific incident — when, what you did, what was said.',
      <>
        A growth mindset is good but not enough. Describe the mechanism — a
        habit, a system, a feedback loop — then the change it produced (
        <Cite href={REF.pid}>Personality and Individual Differences</Cite>).
      </>,
      'Own your part plainly, without blaming circumstances. Don’t claim a weakness is fully “fixed”; show it’s managed.',
      <>
        <Cite href={REF.indeed}>Indeed</Cite> has a list of example weaknesses.
      </>,
    ],
  },
];

export default function Scoring() {
  return (
    <div className="min-h-screen bg-surface text-text">
      <TopBar nav={<ScoringNav />} rightSlot={<AccountButton />} />

      <main className="mx-auto flex w-full max-w-[92rem] flex-col gap-12 px-8 py-8 md:px-16 md:py-12">
        {/* Intro */}
        <div className="space-y-4">
          <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
            Scoring
          </p>
          <h1 className="max-w-4xl font-display text-5xl font-semibold leading-[1.05] tracking-normal md:text-6xl">
            How your answers are scored.
          </h1>
          <p className="text-sm leading-7 text-text-muted">
            Every answer you give is scored 0–10 on six dimensions, and every
            dimension comes from research on how real interviews are judged. Our
            rubrics are built on the same foundations professional selection
            uses: structured interviews with pre-defined questions and anchored
            scoring benchmarks, which show higher validity and reliability than
            unstructured conversation (
            <Cite href={REF.opmStructured}>
              U.S. Office of Personnel Management
            </Cite>
            ).
          </p>
          <p className="text-sm leading-7 text-text-muted">
            Two dimensions appear in every rubric.{' '}
            <span className="font-semibold text-text">Structure</span> is scored
            in all four categories because organized answers are the first thing
            interviewers can follow — what “well-structured” means changes by
            question type, so it&apos;s described under each category below.{' '}
            <span className="font-semibold text-text">Delivery</span> is also
            universal: it&apos;s computed from your webcam (eye contact, framing,
            posture, expression) only when your camera is on. For more on how
            Delivery is scored, see the{' '}
            <Link
              to="/delivery-playground"
              className="rounded-xs text-link underline decoration-link/40 underline-offset-2 transition-colors hover:decoration-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Delivery Playground
            </Link>
            . Everything else changes with the kind of question you&apos;re
            answering, following the question types university career centers
            consistently teach (<Cite href={REF.princeton}>Princeton</Cite>,{' '}
            <Cite href={REF.columbia}>Columbia</Cite>,{' '}
            <Cite href={REF.uconn}>UConn</Cite>).
          </p>
        </div>

        {/* Four stacked category sections */}
        {CATEGORY_CONTENT.map((content) => (
          <CategoryScoringSection key={content.category} content={content} />
        ))}

        {/* Recommended Mix — full width */}
        <section
          aria-labelledby="scoring-recommended-mix"
          className="space-y-4 border-t border-border pt-10"
        >
          <h2
            id="scoring-recommended-mix"
            className="font-display text-2xl font-medium"
          >
            The Recommended Mix
          </h2>
          <p className="text-sm leading-7 text-text-muted">
            Real interviews aren&apos;t one question type on repeat, so your
            sessions aren&apos;t either. InterviewPie automatically blends the
            four categories based on your experience level and your field, with
            each question labeled so you always know what you&apos;re practicing.
          </p>
          <p className="text-sm leading-7 text-text-muted">
            The blend follows the selection research. Situational questions carry
            more weight early in your career, because they&apos;re the format
            designed to reveal judgment when you don&apos;t yet have years of
            stories to draw on (<Cite href={REF.unc}>UNC</Cite>). Experience
            (STAR) questions grow to dominate as you advance, because
            past-behavior questions show their highest validity for complex
            professional and managerial work (
            <Cite href={REF.opmStructured}>U.S. OPM</Cite>). And some fields tilt
            the mix on their own: healthcare&apos;s gateway interviews are largely
            scenario-based (<Cite href={REF.bmc}>BMC Medical Education</Cite>),
            and public-sector selection leans on scenario judgment at nearly every
            level (<Cite href={REF.opmSjt}>U.S. OPM</Cite>). In principle, you
            practice the mix of questions the interviews in your field, at your
            level, actually ask.
          </p>
        </section>
      </main>
    </div>
  );
}
