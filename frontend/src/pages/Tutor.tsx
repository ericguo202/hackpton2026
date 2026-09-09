/**
 * /tutor — the general interview coach.
 *
 * The turn-scoped Ask Tutor can only ever talk about ONE answer, so the
 * questions a candidate actually has between sessions had nowhere to go: how a
 * company runs its behavioral loop, how to get better at a whole question type,
 * what their practice history says they should work on. This page is that
 * conversation. It runs a stronger model with live web search and cited sources
 * (see `../CLAUDE.md` → "Ask Tutor"), which is why a message here costs 2 chat
 * credits to the turn chat's 1.
 *
 * A chat wants the whole viewport, not a scrolling document: the shell is
 * `h-screen` with the header fixed and the conversation column owning the only
 * scroll, so the composer stays pinned at the bottom the way people expect. That
 * is also why there's no `SiteFooter` here.
 */

import AccountButton from '../components/AccountButton';
import AppNav from '../components/AppNav';
import TopBar from '../components/TopBar';
import GeneralTutorChat from '../components/tutor/GeneralTutorChat';

export default function Tutor() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface text-text">
      <div className="shrink-0">
        <TopBar nav={<AppNav />} rightSlot={<AccountButton />} />
      </div>

      <header className="mx-auto w-full max-w-3xl shrink-0 px-6 pb-4">
        <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
          Ask Tutor
        </p>
        <h1 className="mt-1 font-display text-2xl font-medium">
          Your interview coach
        </h1>
      </header>

      <GeneralTutorChat />
    </div>
  );
}
