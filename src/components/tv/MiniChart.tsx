'use client';

import { useEffect, useRef } from 'react';

interface MiniChartProps {
  symbol?: string;
  width?: string;
  height?: string;
  colorTheme?: 'dark' | 'light';
  dateRange?: string;
  isTransparent?: boolean;
}

export function MiniChart({
  symbol = 'FOREXCOM:XAUUSD',
  width = '100%',
  height = '100%',
  colorTheme = 'dark',
  dateRange = '3M',
  isTransparent = true,
}: MiniChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol,
      width: '100%',
      height: '100%',
      locale: 'en',
      dateRange,
      colorTheme,
      isTransparent,
      autosize: true,
      largeChartUrl: '',
      chartOnly: false,
      noTimeScale: false,
    });

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    containerRef.current.appendChild(widgetDiv);
    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [symbol, colorTheme, dateRange, isTransparent]);

  return (
    <div
      className="tradingview-widget-container"
      ref={containerRef}
      style={{ width, height }}
    />
  );
}
