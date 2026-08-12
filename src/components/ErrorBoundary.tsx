import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 rounded-2xl bg-red-950/40 border border-red-500/30 text-slate-100 my-4 shadow-xl">
          <div className="flex items-start space-x-3">
            <div className="p-2.5 bg-red-500/20 rounded-xl text-red-400 shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1 space-y-2">
              <h3 className="text-sm font-bold text-red-300">
                {this.props.fallbackTitle || 'Došlo k neočekávané chybě v modulu / Module Error'}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Tento modul zaznamenal chybový stav, ale zbývající část aplikace funguje normálně.
              </p>
              {this.state.error && (
                <div className="p-2.5 bg-slate-950/80 rounded-lg border border-red-900/50 font-mono text-[11px] text-red-400 overflow-x-auto max-h-32">
                  {this.state.error.message || String(this.state.error)}
                </div>
              )}
              <div className="pt-2">
                <button
                  onClick={this.handleReset}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-200 text-xs font-bold transition cursor-pointer active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Obnovit tento modul / Reset module</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
