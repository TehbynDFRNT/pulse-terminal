'use client';

import { useEffect, useMemo, useState } from 'react';
import { PanelLeft, Plus, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BoardGrid } from '@/components/dashboard/BoardGrid';
import { BoardWidgetDialog } from '@/components/dashboard/BoardWidgetDialog';
import { BoardWidgetRenderer } from '@/components/dashboard/BoardWidgetRenderer';
import type { BoardBreakpoint, BoardLayouts, BoardWidget } from '@/lib/dashboard/widgets';
import {
  addWidgetToLayouts,
  createChartBoardWidget,
  isBoardWidget,
  normalizeBoardLayouts,
  pruneLayoutsForWidgets,
  createDefaultBoardLayouts,
} from '@/lib/dashboard/widgets';
import { useWatchlistStore } from '@/lib/store/watchlist';

const BOARD_STORAGE_KEY = 'pulse-board-layout-v3';
const BOARD_SETTINGS_KEY = 'pulse-board-settings-v1';
const LEGACY_BOARD_STORAGE_KEYS = ['pulse-board-layout-v2', 'pulse-board-layout-v1'];
const DEFAULT_BOARD_ZOOM = 1;
const MIN_BOARD_ZOOM = 0.7;
const MAX_BOARD_ZOOM = 1.3;
const BOARD_ZOOM_STEP = 0.1;
const BOARD_FLOATING_CONTROLS_BOTTOM_PX = 56;
const BOARD_LAYOUT_COLUMN_SCALE: Record<BoardBreakpoint, number> = {
  lg: 2,
  md: 2,
  sm: 2,
  xs: 2,
  xxs: 1,
};
const BOARD_LAYOUT_ROW_SCALE = 2;

interface PersistedBoardState {
  widgets: BoardWidget[];
  layouts: BoardLayouts;
}

interface PersistedBoardSettings {
  zoom?: number;
}

function clampBoardZoom(value: number) {
  return Math.min(MAX_BOARD_ZOOM, Math.max(MIN_BOARD_ZOOM, Number(value.toFixed(2))));
}

function migrateLegacyBoardLayouts(layouts?: BoardLayouts): BoardLayouts | undefined {
  if (!layouts) return layouts;

  return Object.fromEntries(
    (Object.keys(BOARD_LAYOUT_COLUMN_SCALE) as BoardBreakpoint[]).map((breakpoint) => {
      const columnScale = BOARD_LAYOUT_COLUMN_SCALE[breakpoint];
      const items = (layouts[breakpoint] ?? []).map((item) => ({
        ...item,
        x: Math.round(item.x * columnScale),
        y: item.y * BOARD_LAYOUT_ROW_SCALE,
        w: Math.max(1, Math.round(item.w * columnScale)),
        h: Math.max(1, item.h * BOARD_LAYOUT_ROW_SCALE),
        minW:
          typeof item.minW === 'number'
            ? Math.max(1, Math.round(item.minW * columnScale))
            : item.minW,
        maxW:
          typeof item.maxW === 'number'
            ? Math.max(1, Math.round(item.maxW * columnScale))
            : item.maxW,
        minH:
          typeof item.minH === 'number'
            ? Math.max(1, item.minH * BOARD_LAYOUT_ROW_SCALE)
            : item.minH,
        maxH:
          typeof item.maxH === 'number'
            ? Math.max(1, item.maxH * BOARD_LAYOUT_ROW_SCALE)
            : item.maxH,
      }));

      return [breakpoint, items];
    })
  ) as BoardLayouts;
}

function parsePersistedBoardState(
  raw: string,
  options?: { migrateLegacyLayout?: boolean }
): PersistedBoardState | null {
  const parsed = JSON.parse(raw) as {
    widgets?: unknown[];
    layouts?: BoardLayouts;
  };
  const widgets = (parsed.widgets ?? []).filter(isBoardWidget);
  if (widgets.length === 0) return null;

  const layouts = options?.migrateLegacyLayout
    ? migrateLegacyBoardLayouts(parsed.layouts)
    : parsed.layouts;

  return {
    widgets,
    layouts: normalizeBoardLayouts(widgets, layouts),
  };
}

function loadPersistedBoardState(): PersistedBoardState | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(BOARD_STORAGE_KEY);
    if (raw) {
      return parsePersistedBoardState(raw);
    }

    for (const legacyKey of LEGACY_BOARD_STORAGE_KEYS) {
      const legacyRaw = window.localStorage.getItem(legacyKey);
      if (!legacyRaw) continue;

      const migrated = parsePersistedBoardState(legacyRaw, {
        migrateLegacyLayout: legacyKey === 'pulse-board-layout-v2',
      });

      if (!migrated) continue;

      window.localStorage.removeItem(legacyKey);
      return migrated;
    }

    return null;
  } catch {
    return null;
  }
}

function savePersistedBoardState(state: PersistedBoardState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BOARD_STORAGE_KEY, JSON.stringify(state));
}

function loadPersistedBoardSettings(): PersistedBoardSettings | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(BOARD_SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedBoardSettings;
  } catch {
    return null;
  }
}

function savePersistedBoardSettings(settings: PersistedBoardSettings) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BOARD_SETTINGS_KEY, JSON.stringify(settings));
}

interface BoardWorkspaceProps {
  watchlistOpen: boolean;
  onToggleWatchlist: () => void;
}

export function BoardWorkspace({
  watchlistOpen,
  onToggleWatchlist,
}: BoardWorkspaceProps) {
  const items = useWatchlistStore((state) => state.items);
  const selectedConid = useWatchlistStore((state) => state.selectedConid);
  const [widgets, setWidgets] = useState<BoardWidget[]>([]);
  const [layouts, setLayouts] = useState<BoardLayouts>({} as BoardLayouts);
  const [hydrated, setHydrated] = useState(false);
  const [widgetDialogOpen, setWidgetDialogOpen] = useState(false);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [boardZoom, setBoardZoom] = useState(DEFAULT_BOARD_ZOOM);

  const selectedInstrument = useMemo(
    () =>
      items.find((item) => item.conid === selectedConid) ??
      items[0] ??
      null,
    [items, selectedConid]
  );

  const editingWidget = useMemo(
    () => widgets.find((widget) => widget.id === editingWidgetId) ?? null,
    [editingWidgetId, widgets]
  );

  useEffect(() => {
    if (hydrated) return;

    const persistedSettings = loadPersistedBoardSettings();
    if (persistedSettings?.zoom) {
      setBoardZoom(clampBoardZoom(persistedSettings.zoom));
    }

    const persisted = loadPersistedBoardState();
    if (persisted) {
      setWidgets(persisted.widgets);
      setLayouts(persisted.layouts);
      setHydrated(true);
      return;
    }

    if (selectedInstrument) {
      const widget = createChartBoardWidget(selectedInstrument, 0);
      setWidgets([widget]);
      setLayouts(createDefaultBoardLayouts(widget));
      setHydrated(true);
      return;
    }

    if (items.length > 0) {
      setHydrated(true);
    }
  }, [hydrated, items.length, selectedInstrument]);

  useEffect(() => {
    if (!hydrated) return;
    savePersistedBoardState({
      widgets,
      layouts,
    });
  }, [hydrated, layouts, widgets]);

  useEffect(() => {
    if (!hydrated) return;
    savePersistedBoardSettings({
      zoom: boardZoom,
    });
  }, [boardZoom, hydrated]);

  const addWidget = () => {
    setEditingWidgetId(null);
    setWidgetDialogOpen(true);
  };

  const removeWidget = (id: string) => {
    setWidgets((current) => {
      const next = current.filter((widget) => widget.id !== id);
      setLayouts((prev) => pruneLayoutsForWidgets(prev, next));
      return next;
    });
  };

  const saveWidget = (nextWidget: BoardWidget) => {
    setWidgets((current) => {
      const existingIndex = current.findIndex((widget) => widget.id === nextWidget.id);
      if (existingIndex >= 0) {
        const next = [...current];
        next[existingIndex] = nextWidget;
        setLayouts((prev) => normalizeBoardLayouts(next, prev));
        return next;
      }

      setLayouts((prev) => addWidgetToLayouts(prev, nextWidget));
      return [...current, nextWidget];
    });
    setEditingWidgetId(null);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/60 bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant={watchlistOpen ? 'secondary' : 'outline'}
            size="icon-sm"
            onClick={onToggleWatchlist}
            aria-label={watchlistOpen ? 'Hide watchlist' : 'Show watchlist'}
            title={watchlistOpen ? 'Hide watchlist' : 'Show watchlist'}
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
          <div className="truncate text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Board
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 bg-background">
        {widgets.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div>
              <div className="text-sm text-foreground">No widgets on this board</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Add a chart, series, table, metric, pie, stacked bar, heatmap, or screener widget to start shaping this board.
              </div>
            </div>
          </div>
        ) : (
          <BoardGrid
            widgets={widgets}
            layouts={layouts}
            zoom={boardZoom}
            onLayoutsChange={(nextLayouts) => setLayouts(normalizeBoardLayouts(widgets, nextLayouts))}
            renderWidget={(widget) => (
              <BoardWidgetRenderer
                widget={widget}
                onRemove={removeWidget}
                onEdit={(id) => {
                  setEditingWidgetId(id);
                  setWidgetDialogOpen(true);
                }}
              />
            )}
          />
        )}
      </div>

      <div
        className="pointer-events-none fixed right-4 z-[70] flex items-center gap-2"
        style={{
          bottom: `calc(env(safe-area-inset-bottom, 0px) + ${BOARD_FLOATING_CONTROLS_BOTTOM_PX}px)`,
        }}
      >
        <div className="pulse-app-shadow pointer-events-auto flex items-center gap-1 rounded-lg border border-border/80 bg-card/95 p-1 backdrop-blur">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => setBoardZoom((current) => clampBoardZoom(current - BOARD_ZOOM_STEP))}
            disabled={boardZoom <= MIN_BOARD_ZOOM}
            aria-label="Zoom out board"
            title="Zoom out board"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={() => setBoardZoom(DEFAULT_BOARD_ZOOM)}
            className="min-w-[3.75rem] rounded px-2 py-1 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Reset board zoom"
          >
            {Math.round(boardZoom * 100)}%
          </button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => setBoardZoom((current) => clampBoardZoom(current + BOARD_ZOOM_STEP))}
            disabled={boardZoom >= MAX_BOARD_ZOOM}
            aria-label="Zoom in board"
            title="Zoom in board"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>

        <Button
          type="button"
          size="icon-sm"
          onClick={addWidget}
          className="pulse-app-shadow pointer-events-auto"
          aria-label="Add widget"
          title="Add widget"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <BoardWidgetDialog
        open={widgetDialogOpen}
        onOpenChange={(open) => {
          setWidgetDialogOpen(open);
          if (!open) {
            setEditingWidgetId(null);
          }
        }}
        initialWidget={editingWidget}
        watchlistItems={items}
        selectedInstrument={selectedInstrument}
        widgetCount={widgets.length}
        onSave={saveWidget}
      />
    </div>
  );
}
