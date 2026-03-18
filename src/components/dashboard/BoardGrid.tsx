'use client';

import { useMemo, useRef } from 'react';
import { Responsive, useContainerWidth } from 'react-grid-layout';
import { createScaledStrategy, getCompactor } from 'react-grid-layout/core';
import type { Layout, ResponsiveLayouts } from 'react-grid-layout';
import type { ReactNode } from 'react';
import type { BoardBreakpoint, BoardLayouts, BoardWidget } from '@/lib/dashboard/widgets';
import { BOARD_BREAKPOINTS, BOARD_COLS } from '@/lib/dashboard/widgets';

const BOARD_ROW_HEIGHT = 16;
const BOARD_MARGIN: [number, number] = [4, 4];
const BOARD_CONTAINER_PADDING: [number, number] = [4, 4];
const BOARD_DRAG_RUNWAY_ROWS = 8;
const BOARD_ZOOM_REVEAL_BUFFER_COLS = 1;

interface BoardGridProps {
  widgets: BoardWidget[];
  layouts: BoardLayouts;
  zoom?: number;
  onLayoutsChange: (layouts: BoardLayouts) => void;
  renderWidget: (widget: BoardWidget) => ReactNode;
}

const SORTED_BOARD_BREAKPOINTS = Object.entries(BOARD_BREAKPOINTS).sort(
  (left, right) => right[1] - left[1]
) as Array<[BoardBreakpoint, number]>;

function getActiveBoardBreakpoint(width: number): BoardBreakpoint {
  return (
    SORTED_BOARD_BREAKPOINTS.find(([, minWidth]) => width >= minWidth)?.[0] ?? 'xxs'
  );
}

function getLayoutRightEdge(layout: Layout | undefined) {
  return layout?.reduce((max, item) => Math.max(max, item.x + item.w), 0) ?? 0;
}

function getLayoutBottomEdge(layout: Layout | undefined) {
  return layout?.reduce((max, item) => Math.max(max, item.y + item.h), 0) ?? 0;
}

function getBoardContainerHeight(rows: number) {
  if (rows <= 0) return 0;
  return (
    rows * BOARD_ROW_HEIGHT +
    Math.max(rows - 1, 0) * BOARD_MARGIN[1] +
    BOARD_CONTAINER_PADDING[1] * 2
  );
}

export function BoardGrid({
  widgets,
  layouts,
  zoom = 1,
  onLayoutsChange,
  renderWidget,
}: BoardGridProps) {
  const { width, containerRef, mounted } = useContainerWidth({
    measureBeforeMount: true,
  });
  const scaleRootRef = useRef<HTMLDivElement | null>(null);
  const clampedZoom = Math.max(0.7, Math.min(1.3, zoom));
  const activeBreakpoint = useMemo(() => getActiveBoardBreakpoint(width), [width]);
  const baseCols = BOARD_COLS[activeBreakpoint];
  const activeLayout = layouts[activeBreakpoint] ?? [];
  const layoutRightEdge = useMemo(
    () => getLayoutRightEdge(activeLayout),
    [activeLayout]
  );
  const layoutBottomEdge = useMemo(
    () => getLayoutBottomEdge(activeLayout),
    [activeLayout]
  );
  const zoomWorkspaceCols =
    clampedZoom < 1
      ? Math.max(
          baseCols,
          Math.round(baseCols / clampedZoom) + BOARD_ZOOM_REVEAL_BUFFER_COLS
        )
      : baseCols;
  const workspaceCols = Math.max(baseCols, layoutRightEdge, zoomWorkspaceCols);
  const responsiveCols = useMemo(
    () => ({
      ...BOARD_COLS,
      [activeBreakpoint]: workspaceCols,
    }),
    [activeBreakpoint, workspaceCols]
  );
  const workspaceWidth = width * (workspaceCols / baseCols);
  const scaledWorkspaceWidth = workspaceWidth * clampedZoom;
  const unscaledWorkspaceHeight = getBoardContainerHeight(
    Math.max(layoutBottomEdge + BOARD_DRAG_RUNWAY_ROWS, BOARD_DRAG_RUNWAY_ROWS)
  );
  const scaledWorkspaceHeight = Math.max(
    unscaledWorkspaceHeight * clampedZoom,
    getBoardContainerHeight(BOARD_DRAG_RUNWAY_ROWS)
  );
  const positionStrategy = useMemo(
    () => ({
      ...createScaledStrategy(clampedZoom),
      calcDragPosition(clientX: number, clientY: number, offsetX: number, offsetY: number) {
        const rect = scaleRootRef.current?.getBoundingClientRect();
        const originLeft = rect?.left ?? 0;
        const originTop = rect?.top ?? 0;

        return {
          left: (clientX - offsetX - originLeft) / clampedZoom,
          top: (clientY - offsetY - originTop) / clampedZoom,
        };
      },
    }),
    [clampedZoom]
  );
  const compactor = useMemo(() => getCompactor(null, false, true), []);
  const children = useMemo(
    () =>
      widgets.map((widget) => (
        <div
          key={widget.id}
          className="board-widget-shell h-full min-h-0 overflow-hidden rounded-[12px] p-1"
        >
          {renderWidget(widget)}
        </div>
      )),
    [renderWidget, widgets]
  );

  return (
    <div ref={containerRef} className="h-full min-h-full overflow-auto px-2 pt-2 pb-20">
      {mounted && widgets.length > 0 ? (
        <div
          className="relative min-h-full"
          style={{
            width: Math.max(width, scaledWorkspaceWidth),
            minHeight: Math.max(scaledWorkspaceHeight, 0),
          }}
        >
          <div
            ref={scaleRootRef}
            className="origin-top-left"
            style={{
              width: workspaceWidth,
              transform: `scale(${clampedZoom})`,
            }}
          >
            <Responsive<BoardBreakpoint>
              width={workspaceWidth}
              breakpoint={activeBreakpoint}
              layouts={layouts}
              breakpoints={BOARD_BREAKPOINTS}
              cols={responsiveCols}
              rowHeight={BOARD_ROW_HEIGHT}
              margin={BOARD_MARGIN}
              containerPadding={BOARD_CONTAINER_PADDING}
              positionStrategy={positionStrategy}
              className="min-h-full"
              style={{
                minHeight: `${unscaledWorkspaceHeight}px`,
              }}
              compactor={compactor}
              dragConfig={{
                enabled: true,
                handle: '.board-widget-handle',
                cancel: '.board-widget-actions, .board-widget-actions *',
              }}
              resizeConfig={{ enabled: true }}
              onLayoutChange={(
                _layout: Layout,
                nextLayouts: Partial<ResponsiveLayouts<BoardBreakpoint>>
              ) => onLayoutsChange(nextLayouts as BoardLayouts)}
            >
              {children}
            </Responsive>
          </div>
        </div>
      ) : null}
    </div>
  );
}
