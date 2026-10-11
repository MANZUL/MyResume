import { Component, createElement, Fragment, type ReactNode } from 'react';

// The reusable part of the root error boundary. It has no React Native import, so it is
// tested in a real React renderer (see error-boundary.test.ts).
//
// What it catches: errors thrown while React renders, or in a lifecycle method, anywhere
// below it. What it does NOT catch (React's rule, not ours): errors in event handlers,
// in asynchronous code (promises, timers) and native crashes. Those are handled where they
// happen (saves, loads and exports report their own failures).

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** The recovery screen. It must not depend on whatever failed; `reset` remounts the children. */
  fallback: (reset: () => void) => ReactNode;
  /** For diagnostics. Receives the error only; callers must not log resume content. */
  onError?: (error: Error) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
  /** Changes on every reset, so the children are mounted fresh (their state is rebuilt). */
  attempt: number;
}

export class ErrorBoundaryCore extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error): void {
    this.props.onError?.(error);
  }

  /** Clears the error and remounts the children. Saved data is never touched. */
  reset = (): void => {
    this.setState((state) => ({ error: null, attempt: state.attempt + 1 }));
  };

  render(): ReactNode {
    if (this.state.error) return this.props.fallback(this.reset);
    return createElement(Fragment, { key: this.state.attempt }, this.props.children);
  }
}
