'use client';

import { useEffect, useRef } from 'react';

interface TickerTapeProps {
  symbols?: { proName: string; title: string }[];
  colorTheme?: 'dark' | 'light';
}

const DEFAULT_SYMBOLS = [
  { proName: 'FOREXCOM:XAUUSD', title: 'Gold' },
  { proName: 'FOREXCOM:XAGUSD', title: 'Silver' },
  { proName: 'TVC:PLATINUM', title: 'Platinum' },
  { proName: 'AMEX:UUP', title: 'Dollar (UUP)' },
  { proName: 'BITSTAMP:BTCUSD', title: 'BTC' },
  { proName: 'OANDA:XAUUSD', title: 'Gold (OANDA)' },
  { proName: 'ASX:NST', title: 'Northern Star' },
  { proName: 'ASX:EVN', title: 'Evolution' },
  { proName: 'ASX:RMS', title: 'Ramelius' },
  { proName: 'ASX:GOR', title: 'Gold Road' },
  { proName: 'ASX:WGX', title: 'Westgold' },
  { proName: 'ASX:XJO', title: 'ASX 200' },
  { proName: 'AMEX:SPY', title: 'S&P 500 ETF' },
  { proName: 'NASDAQ:QQQ', title: 'Nasdaq ETF' },
  { proName: 'AMEX:GLD', title: 'Gold ETF' },
  { proName: 'AMEX:SLV', title: 'Silver ETF' },
];

export function TickerTape({ symbols = DEFAULT_SYMBOLS, colorTheme = 'dark' }: TickerTapeProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous
    containerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbols,
      showSymbolLogo: true,
      isTransparent: true,
      displayMode: 'adaptive',
      colorTheme,
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
  }, [symbols, colorTheme]);

  return (
    <div className="tradingview-widget-container" ref={containerRef}>
      <div className="tradingview-widget-container__widget"></div>
    </div>
  );
}
