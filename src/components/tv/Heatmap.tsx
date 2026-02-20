'use client';

import { useEffect, useRef } from 'react';

interface HeatmapProps {
  dataSource?: string;
  exchange?: string;
  colorTheme?: 'dark' | 'light';
  width?: string;
  height?: string;
  blockSize?: string;
  blockColor?: string;
  grouping?: string;
}

export function Heatmap({
  dataSource = 'SPX500',
  exchange = '',
  colorTheme = 'dark',
  width = '100%',
  height = '100%',
  blockSize = 'market_cap_basic',
  blockColor = 'change',
  grouping = 'sector',
}: HeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      exchanges: exchange ? [exchange] : [],
      dataSource,
      grouping,
      blockSize,
      blockColor,
      locale: 'en',
      symbolUrl: '',
      colorTheme,
      hasTopBar: true,
      isDataSet498Enabled: false,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      isMonoSize: false,
      width: '100%',
      height: '100%',
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
  }, [dataSource, exchange, colorTheme, blockSize, blockColor, grouping]);

  return (
    <div
      className="tradingview-widget-container"
      ref={containerRef}
      style={{ width, height }}
    />
  );
}
