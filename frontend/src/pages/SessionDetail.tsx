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

import { useEffect, useRef, useState } from 'react';
import { UserButton } from '@clerk/react';
import { useNavigate, useParams } from 'react-router';

import TopBar, { TopBarNavLink } from '../components/TopBar';
import { FlowHoverButton } from '../components/ui/flow-hover-button';
import {
  FolderTabs,
  SideNavButton,
  type FolderTab,
} from '../components/session-detail/FolderTabs';
import OverviewPanel from '../components/session-detail/OverviewPanel';
import TurnPanel from '../components/session-detail/TurnPanel';
import { useSessionDetail } from '../hooks/useSessionDetail';

export default function SessionDetail() {
  const { id: sessionId = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session, isLoading, error, errorStatus } = useSessionDetail(sessionId);
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
          </>
        }
        rightSlot={<UserButton />}
      />

      <main className="flex-1">
        <div className="w-full max-w-[80rem] 2xl:max-w-[88rem] mx-auto px-6 min-[900px]:px-16 py-8 min-[900px]:py-12">

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
                  {/* Mobile tab indicator. Visible only below 900px since
                      desktop already labels the active section in the tabs.
                      Lives inside the middle column so it shares the same
                      left edge as the card. */}
                  <p className="min-[900px]:hidden mb-3 text-eyebrow uppercase tracking-eyebrow text-text-muted">
                    {tabs[safeIndex]?.label} · {safeIndex + 1} of {tabs.length}
                  </p>

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
                    className="anim-crossfade rounded-lg border border-border-strong bg-tertiary-200 min-[900px]:rounded-tl-none"
                  >
                    {safeIndex === 0 ? (
                      <OverviewPanel session={session} />
                    ) : (
                      <TurnPanel turn={session.turns[safeIndex - 1]} />
                    )}
                  </section>

                  {/* Mobile-only previous / next row. Hidden on desktop
                      because the side circular buttons handle nav there. */}
                  <div className="min-[900px]:hidden mt-6 flex items-center justify-between gap-3">
                    {prevTab ? (
                      <FlowHoverButton
                        variant="dark"
                        type="button"
                        onClick={() => setActiveTabIndex(safeIndex - 1)}
                      >
                        ← Prev: {prevTab.label}
                      </FlowHoverButton>
                    ) : (
                      <div className="flex-1" />
                    )}
                    {nextTab ? (
                      <FlowHoverButton
                        type="button"
                        onClick={() => setActiveTabIndex(safeIndex + 1)}
                      >
                        Next: {nextTab.label} →
                      </FlowHoverButton>
                    ) : (
                      <div className="flex-1" />
                    )}
                  </div>
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

