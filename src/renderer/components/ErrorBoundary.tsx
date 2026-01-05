import * as React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from './ui/button'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-bg-base p-6">
          <div className="max-w-md w-full bg-bg-surface border border-border rounded-lg p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>

            <h1 className="text-lg font-semibold text-text-primary mb-2">
              Something went wrong
            </h1>

            <p className="text-sm text-text-secondary mb-4">
              An unexpected error occurred. You can try resetting this view or reloading the application.
            </p>

            {this.state.error && (
              <div className="mb-4 p-3 bg-bg-elevated rounded-md text-left">
                <p className="text-xs font-mono text-red-400 break-words">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex gap-2 justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={this.handleReset}
              >
                Try Again
              </Button>
              <Button
                size="sm"
                onClick={this.handleReload}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Reload App
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
