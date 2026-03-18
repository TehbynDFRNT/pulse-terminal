'use client';

import type { ReactNode } from 'react';
import { GripVertical, Pencil, X } from 'lucide-react';

interface BoardWidgetCardProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  onEdit?: () => void;
  onRemove: () => void;
  children: ReactNode;
}

export function BoardWidgetCard({
  title,
  actions,
  onEdit,
  onRemove,
  children,
}: BoardWidgetCardProps) {
  return (
    <div className="pulse-app-shadow flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/80 bg-card">
      <div className="board-widget-handle flex shrink-0 items-center justify-between border-b border-border/60 bg-background/85 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 truncate font-mono text-[11px] font-medium uppercase tracking-wider text-foreground">
            {title}
          </div>
        </div>

        <div className="board-widget-actions flex shrink-0 items-center gap-1">
          {actions}
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={`Edit ${title}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={`Remove ${title}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
