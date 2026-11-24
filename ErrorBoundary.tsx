import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Isolates unexpected rendering failures inside dashboard panels
 * and provides an accessible inline recovery trigger.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected rendering issue occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Vayumitra UI boundary caught error:', error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <section className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6">
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--vayu-border)] bg-[var(--vayu-surface)] p-6 text-sm text-[var(--vayu-ink)]"
          >
            <div>
              <h2 className="font-display text-base font-bold">
                {this.props.fallbackTitle ?? 'Section temporarily unavailable'}
              </h2>
              <p className="mt-1 text-xs text-[var(--vayu-ink-muted)]">{this.state.message}</p>
            </div>
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--vayu-accent)] px-3.5 py-2 text-xs font-semibold text-[var(--vayu-accent-ink)] hover:bg-[var(--vayu-accent-hover)]"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reload Section</span>
            </button>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
