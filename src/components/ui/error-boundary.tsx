"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { LisionCard } from "@/components/ui/lision-card";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <LisionCard className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="size-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-[15px] font-semibold tracking-tight mb-1">
            Algo deu errado
          </h3>
          <p className="text-[13px] text-muted-foreground mb-6 max-w-sm">
            Ocorreu um erro inesperado. Tente novamente ou entre em contato com o suporte.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleRetry}
            className="gap-2"
          >
            <RefreshCw className="size-3.5" />
            Tentar Novamente
          </Button>
        </LisionCard>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary };
