/**
 * AppNav — the signed-in TopBar navigation link set, in one place.
 *
 * This fragment used to be copy-pasted into every page that renders a TopBar
 * (ten of them), so adding a destination meant ten identical edits and any miss
 * left one page unable to reach the new page at all. It is now written once.
 *
 * `withTourIds` attaches the `data-tour` hooks the Home first-run tutorial
 * locates by selector — only Home passes it, so the tutorial can't accidentally
 * target a link on another page.
 */

import { TopBarNavLink } from './TopBar';

export default function AppNav({ withTourIds = false }: { withTourIds?: boolean }) {
  const tour = (id: string) => (withTourIds ? id : undefined);
  return (
    <>
      {/* Practice lives at "/" (the Setup form), but stays lit on /practice. */}
      <TopBarNavLink
        to="/"
        matchPatterns={['/practice']}
        tourId={tour('nav-practice')}
      >
        Practice
      </TopBarNavLink>
      {/* History owns both detail surfaces it links out to, so it stays lit on
          a session AND a saved question (SavedQuestionDetail used to be the
          only page that got this right). */}
      <TopBarNavLink
        to="/history"
        matchPatterns={['/sessions/:id', '/saved-question/:id']}
        tourId={tour('nav-history')}
      >
        History
      </TopBarNavLink>
      {/* The general coach. Sits next to History because both are review
          surfaces — you come here after practising, not before. */}
      <TopBarNavLink to="/tutor" tourId={tour('nav-tutor')}>
        Ask Tutor
      </TopBarNavLink>
      <TopBarNavLink to="/personalize" tourId={tour('nav-personalize')}>
        Personalize
      </TopBarNavLink>
      <TopBarNavLink to="/calibrate" tourId={tour('nav-calibration')}>
        Calibration
      </TopBarNavLink>
    </>
  );
}
