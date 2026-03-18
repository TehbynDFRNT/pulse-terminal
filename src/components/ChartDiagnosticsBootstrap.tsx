'use client';

import { useEffect } from 'react';
import { initChartDiagnostics } from '@/lib/dev/chart-diagnostics';

export function ChartDiagnosticsBootstrap() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    initChartDiagnostics();
  }, []);

  return null;
}
