/**
 * Settings — dedicated account page. Hosts Clerk's <UserProfile> (its built-in
 * Account + Security pages: profile/email/connected accounts; password/active
 * devices/MFA/delete) and injects a custom Privacy page (`PrivacySettings`).
 * Reached from the avatar menu's "Manage account" (AccountButton wires
 * `userProfileUrl="/settings"`).
 *
 * `routing="hash"` (not "path"): Clerk drives its own sub-navigation via the URL
 * hash (`/settings#/security`, `/settings#/privacy`), so it needs no splat route
 * and no ClerkProvider router integration — which this app doesn't wire (the
 * provider in Root.tsx sits outside BrowserRouter). The custom page appends
 * after the defaults, so the sidenav reads Account, Security, Privacy.
 *
 * Theming is inherited from the global ClerkProvider `appearance` (Root.tsx),
 * which already maps the app's light/dark tokens onto Clerk's current variable
 * names. The "Secured by Clerk" badge stays — only removable on a paid plan.
 */

import { UserProfile } from '@clerk/react';
import { ShieldCheck } from 'lucide-react';

import AccountButton from '../components/AccountButton';
import PrivacySettings from '../components/settings/PrivacySettings';
import TopBar, { TopBarNavLink } from '../components/TopBar';

export default function Settings() {
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
            <TopBarNavLink to="/personalize">Personalize</TopBarNavLink>
            <TopBarNavLink to="/calibrate">Calibration</TopBarNavLink>
          </>
        }
        rightSlot={<AccountButton />}
      />

      <main className="flex-1 flex justify-center px-4 py-10">
        <UserProfile routing="hash">
          <UserProfile.Page
            label="Privacy"
            url="privacy"
            labelIcon={<ShieldCheck className="h-4 w-4" aria-hidden />}
          >
            <PrivacySettings />
          </UserProfile.Page>
        </UserProfile>
      </main>
    </div>
  );
}
