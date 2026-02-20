'use client';

import { useEffect, useRef } from 'react';

interface MarketOverviewTab {
  title: string;
  symbols: { s: string; d?: string }[];
  originalTitle?: string;
}

interface MarketOverviewProps {
  tabs?: MarketOverviewTab[];
  colorTheme?: 'dark' | 'light';
  width?: string;
  height?: string;
}

const DEFAULT_TABS: MarketOverviewTab[] = [
  {
    title: 'Precious Metals',
    symbols: [
      { s: 'FOREXCOM:XAUUSD', d: 'Gold Spot' },
      { s: 'FOREXCOM:XAGUSD', d: 'Silver Spot' },
      { s: 'TVC:PLATINUM', d: 'Platinum' },
      { s: 'TVC:PALLADIUM', d: 'Palladium' },
      { s: 'AMEX:GLD', d: 'Gold ETF (GLD)' },
      { s: 'AMEX:SLV', d: 'Silver ETF (SLV)' },
    ],
  },
  {
    title: 'ASX Miners',
    symbols: [
      { s: 'ASX:NST', d: 'Northern Star' },
      { s: 'ASX:EVN', d: 'Evolution Mining' },
      { s: 'ASX:RMS', d: 'Ramelius Resources' },
      { s: 'ASX:GOR', d: 'Gold Road' },
      { s: 'ASX:SBM', d: 'St Barbara' },
      { s: 'ASX:WGX', d: 'Westgold' },
      { s: 'ASX:NEM', d: 'Newmont' },
      { s: 'ASX:NCM', d: 'Newcrest' },
    ],
  },
  {
    title: 'Macro',
    symbols: [
      { s: 'AMEX:UUP', d: 'Dollar Index (UUP)' },
      { s: 'AMEX:SPY', d: 'S&P 500 ETF' },
      { s: 'NASDAQ:QQQ', d: 'Nasdaq ETF' },
      { s: 'AMEX:TLT', d: 'Long Bond ETF' },
      { s: 'AMEX:GLD', d: 'Gold ETF' },
      { s: 'AMEX:USO', d: 'Oil ETF' },
    ],
  },
  {
    title: 'Indices',
    symbols: [
      { s: 'ASX:XJO', d: 'ASX 200' },
      { s: 'AMEX:SPY', d: 'S&P 500 ETF' },
      { s: 'NASDAQ:QQQ', d: 'Nasdaq 100 ETF' },
      { s: 'AMEX:EWU', d: 'FTSE UK ETF' },
      { s: 'AMEX:EWG', d: 'Germany ETF' },
      { s: 'AMEX:EWJ', d: 'Japan ETF' },
    ],
  },
  {
    title: 'Crypto',
    symbols: [
      { s: 'BITSTAMP:BTCUSD', d: 'Bitcoin' },
      { s: 'BITSTAMP:ETHUSD', d: 'Ethereum' },
      { s: 'BINANCE:SOLUSDT', d: 'Solana' },
      { s: 'BINANCE:XRPUSDT', d: 'XRP' },
    ],
  },
  {
    title: 'Commodities',
    symbols: [
      { s: 'AMEX:USO', d: 'Crude Oil ETF' },
      { s: 'AMEX:UNG', d: 'Natural Gas ETF' },
      { s: 'AMEX:CPER', d: 'Copper ETF' },
      { s: 'AMEX:URA', d: 'Uranium ETF' },
      { s: 'AMEX:WEAT', d: 'Wheat ETF' },
    ],
  },
];

export function MarketOverview({
  tabs = DEFAULT_TABS,
  colorTheme = 'dark',
  width = '100%',
  height = '100%',
}: MarketOverviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      colorTheme,
      dateRange: '1D',
      showChart: true,
      locale: 'en',
      width: '100%',
      height: '100%',
      largeChartUrl: '',
      isTransparent: true,
      showSymbolLogo: true,
      showFloatingTooltip: true,
      plotLineColorGrowing: 'rgba(0, 230, 118, 1)',
      plotLineColorFalling: 'rgba(255, 23, 68, 1)',
      gridLineColor: 'rgba(30, 30, 40, 0)',
      scaleFontColor: 'rgba(120, 120, 140, 1)',
      belowLineFillColorGrowing: 'rgba(0, 230, 118, 0.06)',
      belowLineFillColorFalling: 'rgba(255, 23, 68, 0.06)',
      belowLineFillColorGrowingBottom: 'rgba(0, 230, 118, 0)',
      belowLineFillColorFallingBottom: 'rgba(255, 23, 68, 0)',
      symbolActiveColor: 'rgba(0, 230, 118, 0.08)',
      tabs,
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
  }, [colorTheme, JSON.stringify(tabs)]);

  return (
    <div
      className="tradingview-widget-container"
      ref={containerRef}
      style={{ width, height }}
    />
  );
}
