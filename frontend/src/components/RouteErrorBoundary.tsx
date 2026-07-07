/**
 * `RouteErrorBoundary` — terminal fallback for the lazy route tree.
 *
 * Wraps the route `<Suspense>` so a render error inside a page (most commonly a
 * chunk that failed to download) shows a recoverable panel instead of
 * unmounting the whole app to a blank white screen. `lazyWithRetry` already
 * handles the common chunk-load cases (silent retry + one auto-reload after a
 * deploy); this boundary catches whatever survives that — including the
 * "reloaded once and the chunk is still broken" case, where a second auto-reload
 * would loop.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from './ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface for logging/diagnostics; chunk-load failures land here as the
    // terminal fallback after lazyWithRetry has exhausted retry + reload.
    console.error('[RouteErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-surface px-6 text-center text-text">
        <p className="text-eyebrow uppercase tracking-eyebrow text-text-muted">
          Something went wrong
        </p>
        <p className="max-w-sm text-sm leading-6 text-text-subtle">
          We couldn’t finish loading this page. This usually clears up with a
          refresh.
        </p>
        <Button type="button" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }
}
