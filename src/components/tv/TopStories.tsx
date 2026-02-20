'use client';

import { useEffect, useRef } from 'react';

interface TopStoriesProps {
  feedMode?: string;
  symbol?: string;
  colorTheme?: 'dark' | 'light';
  width?: string;
  height?: string;
}

export function TopStories({
  feedMode = 'all_symbols',
  symbol = '',
  colorTheme = 'dark',
  width = '100%',
  height = '100%',
}: TopStoriesProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-timeline.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      feedMode,
      ...(symbol && feedMode === 'symbol' ? { symbol } : {}),
      colorTheme,
      isTransparent: true,
      displayMode: 'regular',
      width: '100%',
      height: '100%',
      locale: 'en',
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
  }, [feedMode, symbol, colorTheme]);

  return (
    <div
      className="tradingview-widget-container"
      ref={containerRef}
      style={{ width, height }}
    />
  );
}
