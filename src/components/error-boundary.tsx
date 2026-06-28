
'use client';
/**
 * @fileOverview A resilient React Error Boundary component for component-level fault isolation.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { logError } from '@/services/log-service';

interface Props {
  children?: ReactNode;
  moduleName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Structural logging of the crash
    logError(error, this.props.moduleName || 'Isolated Component', { errorInfo });
    console.error(`Isolated Component Error [${this.props.moduleName || 'Component'}]:`, error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <Card className="m-4 border-dashed border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {this.props.moduleName || 'Module'} Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              We encountered a glitch while loading this section. This issue has been reported automatically for resolution.
            </p>
            <div className="mt-2 p-2 bg-black/5 rounded text-[10px] font-mono overflow-auto max-h-24 whitespace-pre-wrap">
              {this.state.error?.message}
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 text-xs font-semibold"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              <RefreshCw className="mr-1 h-3 w-3" /> Reset View
            </Button>
          </CardFooter>
        </Card>
      );
    }

    return this.props.children;
  }
}
