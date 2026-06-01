/**
 * Light/dark theme toggle for the TopBar.
 *
 * Icon-only button (Moon in light mode, Sun in dark) consuming `useTheme`.
 * Reuses TopBar's hamburger shape + the project's standard focus-ring pattern
 * so it sits consistently in the masthead's right cluster. Always rendered,
 * including on the signed-out Hero, so anyone can switch before signing in.
 */

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-surface-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      {isDark ? (
        <Sun size={18} aria-hidden="true" />
      ) : (
        <Moon size={18} aria-hidden="true" />
      )}
    </button>
  );
}
