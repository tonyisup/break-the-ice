import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  /** What the reset button says; name the data it clears. */
  resetLabel?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    copied: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, copied: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private copyErrorToClipboard = async () => {
    if (!this.state.error) return;
    
    const errorText = `${this.state.error.name}: ${this.state.error.message}\n\n${this.state.error.stack}`;
    
    try {
      await navigator.clipboard.writeText(errorText);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch (err) {
      console.error('Failed to copy error to clipboard:', err);
    }
  };

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="deck-canvas min-h-screen text-foreground flex items-center justify-center p-6">
          <div className="deck-card max-w-md w-full p-8 text-center">
            <h1 className="text-2xl font-extrabold tracking-[-0.02em] mb-3 text-card-foreground">Something went wrong</h1>
            <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
              We're sorry, but something unexpected happened. Please try refreshing the page.
            </p>
            <p className="mb-5"><a href="/app" className="text-sm font-semibold text-primary underline underline-offset-4">Back to questions</a></p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="min-h-11 px-5 py-2 bg-primary text-primary-foreground rounded-full font-semibold hover:bg-primary/90 transition-colors"
              >
                Refresh Page
              </button>
              {this.props.onReset && (
                <button
                  onClick={() => {
                    if (!window.confirm("This clears that saved list on this device and can't be undone. Continue?")) return;
                    this.props.onReset?.();
                    this.setState({ hasError: false, error: undefined });
                  }}
                  className="min-h-11 px-5 py-2 border border-destructive text-destructive rounded-full font-semibold hover:bg-destructive/10 transition-colors"
                >
                  {this.props.resetLabel ?? "Reset & Continue"}
                </button>
              )}
            </div>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-sm text-gray-500 flex items-center justify-between">
                  <span>Error Details</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void this.copyErrorToClipboard();
                      }}
                      className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                      {this.state.copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </summary>
                <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto max-h-64 whitespace-pre-wrap break-words">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
