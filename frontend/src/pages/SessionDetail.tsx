/**
 * SessionDetail — read-only view of one completed interview session.
 *
 * Renders three folder-shaped tabs (Overview, Turn 1, Turn 2) attached to
 * a dark-beige "case file" card. The desktop layout has clickable folder
 * tabs plus circular side-arrow buttons in the gutters; mobile drops the
 * tabs/arrows in favor of a single visible panel with touch-swipe
 * navigation and a Previous/Next button row at the bottom.
 *
 * The page state is just `activeTabIndex`: 0 = Overview, 1..N = each
 * turn. Tab content is delegated to OverviewPanel / TurnPanel.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import AccountButton from '../components/AccountButton';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import TopBar, { TopBarNavLink } from '../components/TopBar';
import {
  FolderTabs,
  PagerArrow,
  SideNavButton,
  type FolderTab,
} from '../components/session-detail/FolderTabs';
import OverviewPanel from '../components/session-detail/OverviewPanel';
import TurnPanel from '../components/session-detail/TurnPanel';
import { PracticeOverviewPanel } from '../components/practice/PracticeOverviewPanel';
import { PracticeTurnPanel } from '../components/practice/PracticeTurnPanel';
import { useSessionDetail } from '../hooks/useSessionDetail';
import { getPracticeReplays } from '../lib/practiceReplayStore';

export default function SessionDetail() {
  const { id: sessionId = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Arriving straight from a just-finished practice run. Swaps the Overview's
  // company brief for the "Let's look at how you did." intro and surfaces the
  // in-memory recording replays. Survives a reload (it's in the URL), but the
  // blobs don't — so the replay cards fall back to "media unavailable" then.
  const fromPractice = searchParams.get('from') === 'practice';
  const { session, isLoading, error, errorStatus } = useSessionDetail(sessionId);
  // Read once per session id — the store is module-level (not reactive) and is
  // populated by Practice before it navigates here, so render-time read is fine.
  const replays = useMemo(() => getPracticeReplays(sessionId), [sessionId]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  // Reset the active tab when the URL session id changes. Storing the
  // previous id in state + comparing during render is the React-19-blessed
  // alternative to a useEffect with `setActiveTabIndex(0)` — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [trackedSessionId, setTrackedSessionId] = useState(sessionId);
  if (sessionId !== trackedSessionId) {
    setTrackedSessionId(sessionId);
    setActiveTabIndex(0);
  }

  // 4xx (404, 422, 403) — bounce back to / with a flash. 5xx falls
  // through to the inline error block so transient flakes stay visible.
  const shouldRedirect =
    errorStatus !== null && errorStatus >= 400 && errorStatus < 500;
  useEffect(() => {
    if (shouldRedirect) {
      navigate('/', {
        replace: true,
        state: { flash: 'The session you requested does not exist.' },
      });
    }
  }, [shouldRedirect, navigate]);

  const tabs: FolderTab[] = session
    ? [
        { label: 'Overview', tabId: 'sd-tab-overview', panelId: 'sd-panel-overview' },
        ...session.turns.map((_, i) => ({
          label: `Turn ${i + 1}`,
          tabId: `sd-tab-turn-${i + 1}`,
          panelId: `sd-panel-turn-${i + 1}`,
        })),
      ]
    : [];

  const safeIndex = Math.min(activeTabIndex, Math.max(0, tabs.length - 1));
  const prevTab = safeIndex > 0 ? tabs[safeIndex - 1] : null;
  const nextTab = safeIndex < tabs.length - 1 ? tabs[safeIndex + 1] : null;

  // Touch-swipe to switch tabs on mobile. Commit a tab change only when
  // the horizontal delta dominates and exceeds the threshold so a normal
  // vertical scroll inside an inner card doesn't accidentally page.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && nextTab) {
      setActiveTabIndex(safeIndex + 1);
    } else if (dx > 0 && prevTab) {
      setActiveTabIndex(safeIndex - 1);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface text-text">
      <TopBar
        nav={
          <>
            <TopBarNavLink to="/" matchPatterns={['/practice']}>
              Practice
            </TopBarNavLink>
            <TopBarNavLink to="/history" matchPatterns={['/sessions/:id']}>
              History
            </TopBarNavLink>
            <TopBarNavLink to="/personalize">
              Personalize
            </TopBarNavLink>
            <TopBarNavLink to="/calibrate">
              Calibration
            </TopBarNavLink>
          </>
        }
        rightSlot={<AccountButton />}
      />

      <main className="flex-1">
        {/* pb-28 on mobile keeps the last scrolled content clear of the
            bottom-corner Ask Tutor + feedback FABs; desktop restores the
            symmetric py-12. */}
        <div className="w-full max-w-[80rem] 2xl:max-w-[88rem] mx-auto px-6 min-[900px]:px-16 pt-8 pb-28 min-[900px]:py-12">

          {isLoading && (
            <p className="text-sm text-text-muted">Loading session…</p>
          )}

          {error && !isLoading && !shouldRedirect && (
            <p role="alert" className="text-sm text-text-muted">
              <span className="mr-2 text-[10px] uppercase tracking-eyebrow text-text">Error</span>
              {error}
            </p>
          )}

          {session && (
            <>
              <div className="flex items-stretch gap-3 min-[900px]:gap-4">
                {/* Sticky-to-viewport-middle side button so it remains
                    reachable when the active card is tall enough to require
                    page scrolling. items-center inside the gutter column
                    sets the natural starting position (column middle ≈
                    viewport middle when the card fits), and sticky pins it
                    at top: 50vh once page scroll would push it higher. */}
                <div className="hidden min-[900px]:flex items-start">
                  <div className="sticky top-[50vh] -translate-y-1/2">
                    <SideNavButton
                      direction="prev"
                      onClick={() => prevTab && setActiveTabIndex(safeIndex - 1)}
                      targetLabel={prevTab?.label ?? ''}
                      hidden={prevTab === null}
                    />
                  </div>
                </div>

                <div className="flex-1 min-w-0 flex flex-col">
                  {/* Mobile top pager. Below 900px this replaces both the
                      desktop folder tabs and the gutter side-arrows: chevrons
                      switch tabs (inert at the ends), the centre shows
                      position, and horizontal swipe on the panel does the
                      same. It lives at the top so the bottom edge stays clear
                      for the floating Ask Tutor + feedback buttons, which
                      otherwise overlapped a bottom nav row. */}
                  <div className="min-[900px]:hidden mb-3 flex items-center gap-3">
                    <PagerArrow
                      direction="prev"
                      onClick={() => setActiveTabIndex(safeIndex - 1)}
                      disabled={prevTab === null}
                      label={prevTab?.label}
                    />
                    <p
                      aria-live="polite"
                      className="flex-1 text-center text-eyebrow uppercase tracking-eyebrow text-text-muted"
                    >
                      {tabs[safeIndex]?.label} · {safeIndex + 1} of {tabs.length}
                    </p>
                    <PagerArrow
                      direction="next"
                      onClick={() => setActiveTabIndex(safeIndex + 1)}
                      disabled={nextTab === null}
                      label={nextTab?.label}
                    />
                  </div>

                  {/* Desktop folder tabs. Live inside the middle column so
                      the strip aligns with the card's left edge — placing
                      them outside the gutter row would float them past the
                      side-button column. */}
                  <FolderTabs
                    tabs={tabs}
                    activeIndex={safeIndex}
                    onChange={setActiveTabIndex}
                  />

                  <section
                    key={safeIndex}
                    id={tabs[safeIndex]?.panelId}
                    role="tabpanel"
                    aria-labelledby={tabs[safeIndex]?.tabId}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    className="anim-crossfade rounded-lg border border-border-strong bg-surface-raised min-[900px]:rounded-tl-none"
                  >
                    {(() => {
                      const sessionCompleted = session.status === 'completed';
                      if (safeIndex === 0) {
                        // From practice: reuse Practice's "Let's look at how you
                        // did." intro overview; otherwise the company brief.
                        return fromPractice ? (
                          <PracticeOverviewPanel
                            company={session.company}
                            jobTitle={session.job_title}
                            averages={session.averages}
                            turns={session.turns}
                            sessionCompleted={sessionCompleted}
                          />
                        ) : (
                          <OverviewPanel
                            session={session}
                            sessionCompleted={sessionCompleted}
                          />
                        );
                      }
                      const turnIndex = safeIndex - 1;
                      const turn = session.turns[turnIndex];
                      const replay = replays[turnIndex];
                      // Show the Practice turn panel (with video/audio replay)
                      // only on the immediate post-practice view AND when the
                      // replay blobs are still in memory. The fromPractice gate
                      // keeps History always video-less and self-consistent; the
                      // replay gate makes a post-practice reload (blobs gone)
                      // fall back to the plain panel.
                      const hasReplay =
                        replay != null
                        && (replay.replayUrl != null || replay.audioReplayUrl != null);
                      return fromPractice && hasReplay ? (
                        <PracticeTurnPanel
                          turn={turn}
                          turnNum={safeIndex}
                          replay={replay}
                          sessionCompleted={sessionCompleted}
                          sessionId={session.id}
                          savedQuestionId={session.saved_question_id}
                        />
                      ) : (
                        <TurnPanel
                          turn={turn}
                          sessionCompleted={sessionCompleted}
                          sessionId={session.id}
                          savedQuestionId={session.saved_question_id}
                        />
                      );
                    })()}
                  </section>
                </div>

                <div className="hidden min-[900px]:flex items-start">
                  <div className="sticky top-[50vh] -translate-y-1/2">
                    <SideNavButton
                      direction="next"
                      onClick={() => nextTab && setActiveTabIndex(safeIndex + 1)}
                      targetLabel={nextTab?.label ?? ''}
                      hidden={nextTab === null}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

