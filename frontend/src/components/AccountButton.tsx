/**
 * AccountButton — the Clerk `<UserButton />` (avatar + popover) wired so its
 * "Manage account" action navigates to our own `/settings` page instead of
 * opening Clerk's modal. `/settings` hosts Clerk's `<UserProfile />` (Account +
 * Security tabs) plus a custom Privacy tab. Sign-out and the avatar menu stay
 * handled by Clerk.
 *
 * Single wrapper so every TopBar uses the same wiring — change the destination
 * once here, not in each page's `rightSlot`.
 */

import { UserButton } from '@clerk/react';

export default function AccountButton() {
  return (
    <UserButton userProfileMode="navigation" userProfileUrl="/settings" />
  );
}
