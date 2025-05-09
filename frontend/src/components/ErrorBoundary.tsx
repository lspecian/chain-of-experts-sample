import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
  darkMode?: boolean;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, errorMessage: error.message };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // You can also log the error to an error reporting service
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      const { fallbackMessage = "Something went wrong in this section.", darkMode = false } = this.props;
      return (
        <div className={`error-boundary-fallback ${darkMode ? 'dark' : 'light'}`}>
          <h4>Oops!</h4>
          <p>{fallbackMessage}</p>
          {this.state.errorMessage && <p><small>Details: {this.state.errorMessage}</small></p>}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;