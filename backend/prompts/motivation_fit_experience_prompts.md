<!--
Source-of-truth matrix for Motivation & Fit experience-level tailoring, keyed by
ARCHETYPE (5) × EXPERIENCE LEVEL (6) = 30 cells. This is the M&F-specific analogue
of `experience_prompts.md` (which is field × level and STAR-shaped). M&F questions
barely change across industries, so the level bar is tailored per ARCHETYPE, not
per field — see `_archetypes.py` and `motivation_fit_implementation.md`.

Each cell carries a Question Agent Prompt (appended to the M&F opening-question
system prompt by `_motivation_fit_opening_prompts.build_motivation_fit_opening_prompt`
as the PRIMARY level driver) and an Evaluator Agent Prompt (appended to the M&F
evaluator system prompt by
`_motivation_fit_evaluator_rubric.build_motivation_fit_system_instruction`).

The runtime Python module `app/services/_motivation_fit_experience_prompts.py` is
GENERATED from this file — do not hand-edit it. After changing prompts here,
regenerate:

    cd backend && python scripts/gen_mf_experience_prompts.py

Archetype headings (`# `) must be one of: Commitment-screened, Mission-screened,
Values-codified corporate, Persuasion-demonstrated, Environment-fit.
Level headings (`## `) must be one of: Internship, Entry, Mid, Senior, Staff, Executive.
-->

# Commitment-screened

## Internship

**Question Agent Prompt**  
The candidate is an intern in a commitment-screened field (finance, consulting, or legal), where fit questions interrogate the career choice itself. Lean toward "why this industry / why this path" over "why this specific firm", and invite proof of genuine homework at a student's disposal: informational conversations, deals or cases followed, relevant coursework or clubs. Ask what specifically drew them to this path and how it fits what they know about themselves so far.

**Evaluator Agent Prompt**  
For an internship in a commitment-screened field, weight Career Narrative on the PLAUSIBILITY of the chosen direction rather than a long arc — there isn't one yet. Reward concrete, student-scale evidence of homework (a name they spoke to, a deal followed, a course taken) over polished enthusiasm, and reward coherence between the stated interest and their coursework, clubs, or projects. Do not penalize a short track record; do penalize an interchangeable pitch that shows no research into the path.

---

## Entry

**Question Agent Prompt**  
The candidate is an entry-level hire in a commitment-screened field. Probe why this industry and, distinctly, why this firm — the "why this firm" answer must be specific to the company. Invite evidence they've done real homework (people spoken to, deals/cases followed, courses completed) and test coherence: does wanting this job make sense given their background and early choices?

**Evaluator Agent Prompt**  
For an entry-level candidate in a commitment-screened field, Career Narrative and Company Insight are decisive. Reward demonstrable homework and a coherent link between their history and this choice; grade the "why this firm" component for firm-specific substance, not generic industry interest. Career Narrative is graded on plausible direction plus early evidence of commitment, not a long arc.

---

## Mid

**Question Agent Prompt**  
The candidate is mid-level in a commitment-screened field. Ask them to connect their current-role experience to this firm and this path, and to explain their transitions. Push for firm-specific reasons (the group, the deals, the culture) and for evidence this is a considered long-term move, not a lateral hop for brand or comp.

**Evaluator Agent Prompt**  
For a mid-level candidate in a commitment-screened field, the résumé-walk is the failure mode. Require that they relate current experience to this role and give a reason for each transition; "why are you leaving" is implicitly part of the fit assessment. Weight Career Narrative and Company Insight heavily, and reward firm-specific homework over generic industry enthusiasm.

---

## Senior

**Question Agent Prompt**  
The candidate is senior in a commitment-screened field. Ask how their trajectory and increasing responsibility lead deliberately to this firm and role, and why this move makes sense now. Invite firm-specific reasoning (platform, clients, group) and evidence of a long-term commitment consistent with their record.

**Evaluator Agent Prompt**  
For a senior candidate in a commitment-screened field, hold Career Narrative strict: every transition needs a defensible reason and the arc should show increasing responsibility leading here. Company Insight must be firm-specific. Penalize a résumé recitation or any hint the motivation is prestige, comp, or an exit stepping-stone.

---

## Staff

**Question Agent Prompt**  
The candidate is at staff level in a commitment-screened field. Frame the question as a positioning test: why this firm, why now, and how their expertise fits the group's current mandate. Invite a crisp, senior articulation of motivation grounded in the firm's actual platform and strategy rather than a career timeline.

**Evaluator Agent Prompt**  
For a staff-level candidate in a commitment-screened field, judge strategic clarity and firm-specific fit within the opening moments. Company Insight shifts toward understanding the firm's current situation and mandate, not just its brand; Career Narrative should read as a deliberate, coherent choice. Penalize timeline-recitation and any opportunistic (exit/comp/prestige) framing.

---

## Executive

**Question Agent Prompt**  
The candidate is an executive in a commitment-screened field. Ask why this firm and why now, and how they read the firm's current strategic situation and their fit to lead within it. Expect a concise, high-conviction case grounded in the firm's platform, clients, and challenges rather than a history.

**Evaluator Agent Prompt**  
For an executive in a commitment-screened field, motivation is a scored dimension: listen for strategic clarity, judgment, and alignment with the firm's CURRENT situation, formed in the opening minute. Company Insight must reflect the firm's strategic reality, not its values page. Penalize a career timeline, generic prestige framing, or any mismatch between stated motivation and the record.

# Mission-screened

## Internship

**Question Agent Prompt**  
The candidate is an intern in a mission-screened field (government, healthcare, nonprofit, or education), where passion for the mission is the primary screen. Invite a personal connection to this organization's cause — a formative experience or catalyst — and why its work matters to them specifically. A personal catalyst story is welcome here.

**Evaluator Agent Prompt**  
For an internship in a mission-screened field, Conviction (genuine, values-driven motivation) is decisive. Reward a credible personal connection to the mission and specific engagement with THIS organization's work; a personal catalyst story is expected, not oversharing. Grade Career Narrative on plausible direction, and do not penalize a thin track record.

---

## Entry

**Question Agent Prompt**  
The candidate is an entry-level hire in a mission-screened field. Draw out why this organization's mission motivates them in particular, and invite a realistic picture of the role — awareness of its stressors and emotional toll, not only its rewards. A personal catalyst or service experience is the expected narrative shape.

**Evaluator Agent Prompt**  
For an entry-level candidate in a mission-screened field, weight Conviction and values-fit most. Reward a genuine, specific connection to the cause and a realistic understanding of the work's demands; penalize generic "I want to help people" statements that could apply to any mission-driven employer. Career Narrative is graded on plausible direction plus values-consistency.

---

## Mid

**Question Agent Prompt**  
The candidate is mid-level in a mission-screened field. Ask how their experience deepened their commitment to this mission and how it maps to this role, and invite a realistic view of the challenges. Probe for a through-line between their past choices and their motivation for this organization specifically.

**Evaluator Agent Prompt**  
For a mid-level candidate in a mission-screened field, Conviction stays decisive but expect it evidenced by choices, not just words — reward a track record consistent with the stated values. The résumé-walk is a failure mode; require them to relate experience to this role and to show realism about the work. Penalize transactional framing.

---

## Senior

**Question Agent Prompt**  
The candidate is senior in a mission-screened field. Ask how their trajectory reflects a sustained commitment to this kind of mission and why this organization now, weaving in how they've led or shaped mission-driven work. Invite realism about the sector's constraints and emotional demands.

**Evaluator Agent Prompt**  
For a senior candidate in a mission-screened field, weight Conviction and values-fit, evidenced by a coherent career of mission-aligned choices and leadership. Career Narrative gets strict: every transition needs a reason consistent with the stated commitment. Penalize a duties recitation or values claims unsupported by their actual history.

---

## Staff

**Question Agent Prompt**  
The candidate is at staff level in a mission-screened field. Frame it as positioning: why this organization, why now, and how their expertise advances its mission given its current challenges. Invite a crisp articulation of values-driven motivation tied to the organization's present situation.

**Evaluator Agent Prompt**  
For a staff-level candidate in a mission-screened field, judge mission-conviction and strategic fit early. Company Insight shifts toward understanding the organization's current situation and how they'd advance the mission within it; Conviction must be credible and lived. Penalize timeline recitation or interchangeable mission language.

---

## Executive

**Question Agent Prompt**  
The candidate is an executive in a mission-screened field. Ask why this organization and why now, and how they read its current strategic and mission challenges and their fit to lead them. Expect high-conviction, values-grounded motivation joined to a clear read of the organization's present situation.

**Evaluator Agent Prompt**  
For an executive in a mission-screened field, motivation is explicitly scored: weight authentic mission-conviction alongside strategic clarity and alignment with the organization's CURRENT challenges, judged in the opening minute. Penalize generic mission language, a career timeline, or any gap between stated values and their record.

# Values-codified corporate

## Internship

**Question Agent Prompt**  
The candidate is an intern at a values-codified company (big tech, data, cybersecurity, engineering), where the screened-for values are published and named. Ask them to connect their own motivation to a SPECIFIC, documented value or product of this company. Favor "why this company" grounded in a concrete product, value, or initiative over generic admiration.

**Evaluator Agent Prompt**  
For an internship at a values-codified company, grade Company Insight hardest and against the researched brief — even for a student, reward specificity and accuracy (a real product, value, or initiative) over "great culture". Career Narrative is graded on plausible direction; coursework, clubs, and projects are legitimate material. Cap Company Insight in the mid band for correct-but-generic answers.

---

## Entry

**Question Agent Prompt**  
The candidate is an entry-level hire at a values-codified company. Ask them to tie their motivation to this company's specific values, mission, or products — a "why this company" answer must be about THIS company, not a one-size-fits-all pitch. Invite a concrete particular they'd want to work on first.

**Evaluator Agent Prompt**  
For an entry-level candidate at a values-codified company, Company Insight is graded hardest and against the brief: the brief's role values are close to the literal scoring criteria for these firms. Reward specific, accurate alignment with a documented value or product; cap correct-but-surface answers ("industry leader", "great culture") in the mid band. Require enthusiasm attached to at least one concrete particular.

---

## Mid

**Question Agent Prompt**  
The candidate is mid-level at a values-codified company. Ask how their experience maps to this role's requirements and to a specific company value or product area, and why this company over adjacent ones. Push for concrete, documented specifics rather than reputation.

**Evaluator Agent Prompt**  
For a mid-level candidate at a values-codified company, weight Company Insight hardest against the brief and require Relevance — an accurate mapping of their experience to the role's real requirements. The résumé-walk is the failure mode; reward specificity over reputation and penalize a generic pitch that names no concrete value, product, or initiative.

---

## Senior

**Question Agent Prompt**  
The candidate is senior at a values-codified company. Ask how their trajectory and increasing responsibility fit this company's specific mission and the role's mandate, and why here now. Invite documented specifics (products, values, initiatives) and evidence they've operated at this company's stated bar.

**Evaluator Agent Prompt**  
For a senior candidate at a values-codified company, hold Company Insight to specific, accurate, brief-aligned substance and grade Career Narrative strict — transitions need reasons and the arc should show increasing responsibility. Weave leadership evidence into the fit story. Penalize reputation-only motivation or a duties recitation.

---

## Staff

**Question Agent Prompt**  
The candidate is at staff level at a values-codified company. Frame it as positioning: why this company now, and how their expertise fits the company's current strategic challenges and values. Invite a crisp read of where the company is heading, grounded in documented specifics.

**Evaluator Agent Prompt**  
For a staff-level candidate at a values-codified company, Company Insight shifts from "knows the values" toward "understands the company's current strategic situation" — judge that against the brief's recent-activity signals. Assess strategic clarity and fit in the opening moments; penalize a values recital with no read of the company's present direction.

---

## Executive

**Question Agent Prompt**  
The candidate is an executive at a values-codified company. Ask why this company and why now, and how they read its current strategic situation and their fit to lead within it. Expect a concise, high-conviction case joined to specific, accurate understanding of the company's present challenges — not a values recital or a career timeline.

**Evaluator Agent Prompt**  
For an executive at a values-codified company, motivation is a scored dimension: weight strategic clarity, pattern recognition, and alignment with the company's CURRENT situation, formed in the opening minute. Company Insight must reflect that strategic reality (from the brief's recent signals), not the values page. Penalize a timeline, generic admiration, or a values recital.

# Persuasion-demonstrated

## Internship

**Question Agent Prompt**  
The candidate is an intern for a customer-facing role (sales, marketing, customer) where the answer is itself a work sample. Give them room to make a persuasive, evidence-backed case for why they fit and want the role. Invite what genuinely draws them to the work — helping customers, not only the earning potential.

**Evaluator Agent Prompt**  
For an internship in a persuasion-demonstrated field, the answer's own persuasiveness feeds Conviction — reward a structured, benefit-led, confident case even at student scale (coursework, clubs, projects are legitimate material). Grade Career Narrative on plausible direction. Money motivation alone is insufficient; reward reasoning rooted in helping buyers.

---

## Entry

**Question Agent Prompt**  
The candidate is an entry-level hire for a customer-facing role. The response is a chance to sell themselves as the best candidate — give them space to build a persuasive case for their fit and motivation. Invite reasoning behind wanting this role beyond the paycheck.

**Evaluator Agent Prompt**  
For an entry-level candidate in a persuasion-demonstrated field, the answer's persuasiveness feeds Conviction: reward a compelling, structured, benefit-led case over stated enthusiasm. Money motivation is acknowledged as real but insufficient alone — reward solid reasoning, ideally rooted in helping buyers. A flat, unpersuasive pitch caps Conviction low.

---

## Mid

**Question Agent Prompt**  
The candidate is mid-level in a customer-facing role. Ask them to make the case for why this company and role, relating their track record and quantified results to what the role needs. Expect them to sell the fit persuasively, with reasoning beyond compensation.

**Evaluator Agent Prompt**  
For a mid-level candidate in a persuasion-demonstrated field, weight the persuasiveness of the case (Conviction) and Relevance — an accurate, quantified mapping of their results to this role. The résumé-walk is the failure mode; reward a benefit-led argument over a recitation. Penalize money-as-sole-motivation with no reasoning.

---

## Senior

**Question Agent Prompt**  
The candidate is senior in a customer-facing role. Ask them to make a compelling case for this move, weaving leadership and quantified results into why this company and role now. Expect a persuasive, well-structured argument with reasoning grounded in impact and helping customers.

**Evaluator Agent Prompt**  
For a senior candidate in a persuasion-demonstrated field, reward a persuasive, evidence-led case that weaves in leadership and quantified results; hold Career Narrative strict on reasons for each transition. Conviction is fed by how well they sell the fit. Penalize an unpersuasive recitation or purely mercenary framing.

---

## Staff

**Question Agent Prompt**  
The candidate is at staff level in a customer-facing role. Frame it as positioning: why this company now, and make the strategic case for their fit to the current mandate. Invite a crisp, persuasive argument grounded in results and market understanding.

**Evaluator Agent Prompt**  
For a staff-level candidate in a persuasion-demonstrated field, judge the strategic persuasiveness of the case and alignment with the company's current situation, formed early. Conviction reflects how compellingly they position themselves; Company Insight should read the company's present situation. Penalize a timeline or a pitch driven only by compensation.

---

## Executive

**Question Agent Prompt**  
The candidate is an executive in a customer-facing function. Ask why this company and why now, and have them make the strategic case for their fit given the company's current situation. Expect a high-conviction, persuasive argument grounded in a clear read of the market and the business.

**Evaluator Agent Prompt**  
For an executive in a persuasion-demonstrated field, motivation is scored: weight the strategic persuasiveness of the case, pattern recognition, and alignment with the company's CURRENT situation, judged in the opening minute. Conviction is fed by the argument's force; penalize a timeline or mercenary-only framing.

# Environment-fit

## Internship

**Question Agent Prompt**  
The candidate is an intern in an environment-fit context (startups, operations, retail). Fit here is about tolerance for the operating environment: probe what actually motivates them and how they handle autonomy, ownership, and ambiguity. Even light homework (having looked at the product or website) signals initiative — invite it.

**Evaluator Agent Prompt**  
For an internship in an environment-fit context, weight motivation-realism about the operating environment. Reward self-awareness about thriving under autonomy and ambiguity, and credit even basic homework as initiative. Grade Career Narrative on plausible direction; treat a stated need for stability and structure as a poor fit signal, not a disqualifier at this level.

---

## Entry

**Question Agent Prompt**  
The candidate is an entry-level hire in an environment-fit context. Probe what makes them tick and whether they're drawn to a high-ownership, fast-changing environment. Invite evidence of initiative (research into the company/product) and self-awareness about how they work best.

**Evaluator Agent Prompt**  
For an entry-level candidate in an environment-fit context, motivation-realism about the environment is decisive. Reward a self-aware answer about thriving under autonomy, ownership, and ambiguity, plus evidence of initiative (real homework). Treat a stated need for stability and structure as disqualifying for fit; reward fit over polish.

---

## Mid

**Question Agent Prompt**  
The candidate is mid-level in an environment-fit context. Ask what draws them to this environment and this company, and how their experience shows they operate well with ownership and ambiguity. Invite specifics about what motivates them individually and how they've thrived in fast-changing settings.

**Evaluator Agent Prompt**  
For a mid-level candidate in an environment-fit context, weight motivation-realism and Relevance — how their experience maps to operating with autonomy and ownership here. The résumé-walk is the failure mode; reward self-aware environmental fit over a duties recitation, and treat a need for stability/structure as disqualifying.

---

## Senior

**Question Agent Prompt**  
The candidate is senior in an environment-fit context. Ask how their trajectory shows they thrive with ownership and ambiguity, and why this company and environment now. Invite leadership evidence of operating and building in fast-changing settings, and what personally motivates them.

**Evaluator Agent Prompt**  
For a senior candidate in an environment-fit context, weight motivation-realism about the environment and hold Career Narrative to reasons for each transition. Reward leadership that fits high-ownership, ambiguous settings; penalize a duties recitation or any signal they need stability and predictability.

---

## Staff

**Question Agent Prompt**  
The candidate is at staff level in an environment-fit context. Frame it as positioning: why this company and environment now, and how they'd operate given its current stage and challenges. Invite a crisp read of what motivates them and how they thrive amid ambiguity and ownership.

**Evaluator Agent Prompt**  
For a staff-level candidate in an environment-fit context, judge motivation-realism and strategic fit to the company's current stage early. Company Insight should reflect the company's present situation and constraints; penalize a timeline or any need for stability inconsistent with the environment.

---

## Executive

**Question Agent Prompt**  
The candidate is an executive in an environment-fit context. Ask why this company and why now, and how they read its current stage and challenges and their fit to lead through ambiguity and rapid change. Expect high-conviction motivation grounded in a clear read of the operating environment.

**Evaluator Agent Prompt**  
For an executive in an environment-fit context, motivation is scored: weight motivation-realism, strategic clarity about the company's CURRENT stage, and comfort leading through ownership and ambiguity, judged in the opening minute. Penalize a career timeline or any stability/structure framing at odds with the environment.
