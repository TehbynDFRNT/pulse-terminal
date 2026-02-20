'use client';

import { useEffect, useRef } from 'react';

interface ScreenerProps {
  defaultColumn?: string;
  defaultScreen?: string;
  exchange?: string;
  colorTheme?: 'dark' | 'light';
  width?: string;
  height?: string;
  market?: string;
}

export function Screener({
  defaultColumn = 'overview',
  defaultScreen = 'general',
  exchange = '',
  colorTheme = 'dark',
  width = '100%',
  height = '100%',
  market = 'australia',
}: ScreenerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-screener.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      width: '100%',
      height: '100%',
      defaultColumn,
      defaultScreen,
      market,
      showToolbar: true,
      colorTheme,
      locale: 'en',
      isTransparent: true,
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
  }, [defaultColumn, defaultScreen, exchange, colorTheme, market]);

  return (
    <div
      className="tradingview-widget-container"
      ref={containerRef}
      style={{ width, height }}
    />
  );
}
