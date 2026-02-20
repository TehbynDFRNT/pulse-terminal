'use client';

import { useEffect, useRef } from 'react';

interface AdvancedChartProps {
  symbol?: string;
  interval?: string;
  colorTheme?: 'dark' | 'light';
  width?: string;
  height?: string;
  studies?: string[];
  style?: string;
}

export function AdvancedChart({
  symbol = 'FOREXCOM:XAUUSD',
  interval = 'D',
  colorTheme = 'dark',
  width = '100%',
  height = '100%',
  studies = ['STD;EMA', 'STD;RSI'],
  style = '1',
}: AdvancedChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: 'Australia/Brisbane',
      theme: colorTheme,
      style,
      locale: 'en',
      backgroundColor: 'rgba(10, 10, 10, 1)',
      gridColor: 'rgba(30, 30, 40, 0.6)',
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: true,
      save_image: false,
      calendar: false,
      hide_volume: false,
      support_host: 'https://www.tradingview.com',
      studies,
    });

    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'tradingview-widget-container__widget';
    widgetDiv.style.height = 'calc(100% - 32px)';
    widgetDiv.style.width = '100%';

    containerRef.current.appendChild(widgetDiv);
    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [symbol, interval, colorTheme, style, JSON.stringify(studies)]);

  return (
    <div
      className="tradingview-widget-container"
      ref={containerRef}
      style={{ width, height }}
    />
  );
}
