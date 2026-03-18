'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarketStatusInline } from '@/components/market/MarketStatus';
import { getGatewayAuth, getLiveFeedStatus } from '@/lib/ibkr/gateway-client';
import {
  connectOpenBBService,
  fetchOpenBBServiceStatus,
} from '@/lib/openbb/client';
import type {
  OpenBBServiceState,
  OpenBBServiceStatus,
} from '@/lib/openbb/service-types';
import { useGatewayStore } from '@/lib/store/gateway';
import { useThemeStore } from '@/lib/store/theme';
import { cn } from '@/lib/utils';

function useGatewayStatus() {
  const connected = useGatewayStore((s) => s.connected);
  const setGatewayConnected = useGatewayStore((s) => s.setConnected);
  const setMarketDataMode = useGatewayStore((s) => s.setMarketDataMode);
  const marketDataMode = useGatewayStore((s) => s.marketDataMode);
  const inflight = useRef(false);
  const failures = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void check();
      }, delayMs);
    };

    const check = async (): Promise<void> => {
      if (inflight.current) return;
      inflight.current = true;

      try {
        const data = await getGatewayAuth();
        const isUp = data.authenticated === true && data.connected === true;

        if (!cancelled) {
          failures.current = 0;
          setGatewayConnected(isUp);
          if (!isUp) {
            setMarketDataMode('unknown');
          }
          schedule(isUp ? 10_000 : 2_000);
        }
      } catch {
        if (!cancelled) {
          failures.current += 1;
          setGatewayConnected(failures.current >= 3 ? false : null);
          setMarketDataMode('unknown');
          schedule(1_500);
        }
      } finally {
        inflight.current = false;
      }
    };

    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [setGatewayConnected, setMarketDataMode]);

  return { connected, marketDataMode };
}

interface DaemonStatusSnapshot {
  connected: boolean | null;
  error: string | null;
  lastSuccessAt: number;
}

interface OpenBBStatusSnapshot {
  state: OpenBBServiceState | 'checking';
  connected: boolean | null;
  running: boolean;
  error: string | null;
}

function toOpenBBStatusSnapshot(status: OpenBBServiceStatus): OpenBBStatusSnapshot {
  return {
    state: status.state,
    connected: status.connected,
    running: status.running,
    error: status.error,
  };
}

function useDaemonStatus(): DaemonStatusSnapshot {
  const [status, setStatus] = useState<DaemonStatusSnapshot>({
    connected: null,
    error: null,
    lastSuccessAt: 0,
  });
  const inflight = useRef(false);
  const failures = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void check();
      }, delayMs);
    };

    const check = async (): Promise<void> => {
      if (inflight.current) return;
      inflight.current = true;

      try {
        const data = await getLiveFeedStatus();

        if (!cancelled) {
          failures.current = 0;
          setStatus({
            connected: data.connected,
            error: data.error,
            lastSuccessAt: data.lastSuccessAt,
          });
          schedule(data.connected ? 10_000 : 3_000);
        }
      } catch (error) {
        if (!cancelled) {
          failures.current += 1;
          setStatus((current) => ({
            connected: failures.current >= 3 ? false : current.connected,
            error: error instanceof Error ? error.message : 'Live feed status unavailable',
            lastSuccessAt: current.lastSuccessAt,
          }));
          schedule(1_500);
        }
      } finally {
        inflight.current = false;
      }
    };

    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return status;
}

function useOpenBBStatus() {
  const [status, setStatus] = useState<OpenBBStatusSnapshot>({
    state: 'checking',
    connected: null,
    running: false,
    error: null,
  });
  const inflight = useRef(false);
  const failures = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void check();
      }, delayMs);
    };

    const check = async (): Promise<void> => {
      if (inflight.current) return;
      inflight.current = true;

      try {
        const data = await fetchOpenBBServiceStatus();

        if (!cancelled) {
          failures.current = 0;
          setStatus(toOpenBBStatusSnapshot(data));
          schedule(data.connected ? 10_000 : data.running ? 2_500 : 5_000);
        }
      } catch (error) {
        if (!cancelled) {
          failures.current += 1;
          setStatus((current) => ({
            state: failures.current >= 3 ? 'offline' : current.state,
            connected: failures.current >= 3 ? false : current.connected,
            running: failures.current >= 3 ? false : current.running,
            error: error instanceof Error ? error.message : 'OpenBB status unavailable',
          }));
          schedule(1_500);
        }
      } finally {
        inflight.current = false;
      }
    };

    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { status, setStatus };
}

function DaemonStatusInline({
  connected,
  lastSuccessAt,
}: Pick<DaemonStatusSnapshot, 'connected' | 'lastSuccessAt'>) {
  const recovering = connected === false && lastSuccessAt > 0;
  const dotClassName =
    connected === true
      ? 'bg-emerald-500'
      : recovering
        ? 'bg-amber-500'
        : connected === null
          ? 'bg-muted-foreground'
          : 'bg-red-500';
  const textClassName =
    connected === true
      ? 'text-emerald-500'
      : recovering
        ? 'text-amber-500'
        : connected === null
          ? 'text-muted-foreground'
          : 'text-red-400';
  const label =
    connected === true
      ? 'Daemon Live'
      : recovering
        ? 'Daemon Recovering'
        : connected === null
          ? 'Checking Daemon'
          : 'Daemon Offline';

  return (
    <div className="flex items-center gap-2">
      <div className={cn('h-1.5 w-1.5 rounded-full', dotClassName)} />
      <span className={cn('text-[10px] uppercase tracking-wider', textClassName)}>
        {label}
      </span>
    </div>
  );
}

function OpenBBStatusInline({ status }: { status: OpenBBStatusSnapshot }) {
  const dotClassName =
    status.state === 'connected'
      ? 'bg-emerald-500'
      : status.state === 'starting'
        ? 'bg-amber-500'
        : status.state === 'checking'
          ? 'bg-muted-foreground'
          : 'bg-red-500';
  const textClassName =
    status.state === 'connected'
      ? 'text-emerald-500'
      : status.state === 'starting'
        ? 'text-amber-500'
        : status.state === 'checking'
          ? 'text-muted-foreground'
          : 'text-red-400';
  const label =
    status.state === 'connected'
      ? 'OpenBB Live'
      : status.state === 'starting'
        ? 'OpenBB Starting'
        : status.state === 'checking'
          ? 'Checking OpenBB'
          : 'OpenBB Offline';

  return (
    <div className="flex items-center gap-2">
      <div className={cn('h-1.5 w-1.5 rounded-full', dotClassName)} />
      <span className={cn('text-[10px] uppercase tracking-wider', textClassName)}>
        {label}
      </span>
    </div>
  );
}

function OpenBBStatusControl() {
  const { status, setStatus } = useOpenBBStatus();
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);

    try {
      const next = await connectOpenBBService();
      setStatus(toOpenBBStatusSnapshot(next));
    } catch (error) {
      setStatus((current) => ({
        state: current.running ? 'starting' : 'offline',
        connected: false,
        running: current.running,
        error: error instanceof Error ? error.message : 'Failed to start OpenBB',
      }));
    } finally {
      setConnecting(false);
    }
  };

  if (connecting) {
    return (
      <div className="flex items-center gap-2 rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1">
        <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
        <span className="text-[10px] uppercase tracking-wider text-amber-400">
          Connecting OpenBB
        </span>
      </div>
    );
  }

  if (status.state === 'connected' || status.state === 'starting' || status.state === 'checking') {
    return (
      <div
        className="rounded border border-border/70 bg-background/70 px-2 py-1"
        title={status.error ?? undefined}
      >
        <OpenBBStatusInline status={status} />
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={handleConnect}
      className="border-border/80 bg-background/70 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:bg-accent hover:text-foreground"
      title={status.error ?? 'Start the OpenBB sidecar'}
    >
      Connect OpenBB
    </Button>
  );
}

const NAV_ITEMS = [
  { href: '/', label: 'Terminal' },
  { href: '/charts', label: 'Charts' },
  { href: '/board', label: 'Board' },
] as const;

export function PulseNav() {
  const pathname = usePathname();
  const gateway = useGatewayStatus();
  const daemon = useDaemonStatus();
  const theme = useThemeStore((s) => s.theme);
  const hydrated = useThemeStore((s) => s.hydrated);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  return (
    <header className="flex shrink-0 items-center justify-between border-b border-border/80 bg-card/95 px-4 py-2 backdrop-blur">
      <div className="flex items-center gap-4">
        <h1 className="text-sm font-semibold uppercase tracking-widest text-foreground/85">
          Pulse
        </h1>
        <div className="h-4 w-px bg-border" />
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label }) => {
            const active = pathname === href;
            return active ? (
              <span
                key={href}
                className="rounded border border-border/70 bg-accent px-3 py-1 text-[10px] uppercase tracking-widest text-foreground"
              >
                {label}
              </span>
            ) : (
              <Link
                key={href}
                href={href}
                className="rounded px-3 py-1 text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="h-4 w-px bg-border" />

        {/* Gateway status */}
        {gateway.connected === true ? (
          <MarketStatusInline status={gateway.marketDataMode} />
        ) : gateway.connected === null ? (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Checking Gateway
            </span>
          </div>
        ) : (
          <a
            href="https://localhost:5050"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded bg-red-500/10 px-2 py-1 transition-colors hover:bg-red-500/20"
          >
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            <span className="text-[10px] text-red-400 uppercase tracking-wider">
              Connect Gateway
            </span>
          </a>
        )}
        <div className="h-4 w-px bg-border" />
        <DaemonStatusInline
          connected={daemon.connected}
          lastSuccessAt={daemon.lastSuccessAt}
        />
      </div>

      <div className="flex items-center gap-2">
        <OpenBBStatusControl />
        {hydrated ? (
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            onClick={toggleTheme}
            className="border-border/80 bg-background/70 text-muted-foreground hover:bg-accent hover:text-foreground"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : (
          <span className="h-6 w-6 rounded border border-border/70 bg-background/70" />
        )}
      </div>
    </header>
  );
}
