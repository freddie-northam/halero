// The shared shell every F1 widget renders inside: a Card with a header
// row (an optional drag-handle slot on the left, the title, and a
// right-aligned action slot the board fills with remove and resize controls
// in edit mode) over a CardContent body. The header shows the title only:
// the widget's own name already says what it is, so no second line. The
// three state helpers (skeleton, empty, error) give every widget the same
// loading, empty, and failure look without each re-inventing it.

import {
  AlertCircle,
  Card,
  CardContent,
  CardHeader,
  cn,
  Skeleton,
} from "@halero/ui";
import type { ReactElement, ReactNode } from "react";

export interface WidgetChromeProps {
  readonly title: string;
  /** The board's drag handle, shown only in edit mode. */
  readonly handle?: ReactNode;
  /** Edit-mode controls (remove, resize) pinned to the header's right. */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

export const WidgetChrome = ({
  title,
  handle,
  actions,
  children,
  className,
}: WidgetChromeProps): ReactElement => (
  <Card className={cn("flex h-full flex-col gap-0 overflow-hidden", className)}>
    <CardHeader className="flex flex-row items-center gap-2 space-y-0 border-b py-3">
      {handle ?? null}
      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
        {title}
      </h3>
      {actions === undefined ? null : (
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      )}
    </CardHeader>
    <CardContent className="flex-1 p-3">{children}</CardContent>
  </Card>
);

// Stable keys for the skeleton's decorative rows, so the shimmer never
// leans on array indices as keys. Covers every rows count the widgets ask
// for; a larger request simply shows this many placeholder rows.
const SKELETON_KEYS = [
  "sk1",
  "sk2",
  "sk3",
  "sk4",
  "sk5",
  "sk6",
  "sk7",
  "sk8",
] as const;

/** The uniform loading state: a few shimmer rows sized to the widget body. */
export const WidgetSkeleton = ({
  rows = 4,
}: {
  readonly rows?: number;
}): ReactElement => (
  <div className="flex flex-col gap-2" aria-hidden="true">
    {SKELETON_KEYS.slice(0, rows).map((key) => (
      <Skeleton key={key} className="h-6 w-full" />
    ))}
  </div>
);

/**
 * A friendly empty state, centered in the body. An optional action (e.g. a
 * Connect button) renders centered below the message, so every "nothing
 * here yet" and "connect to see this" state across the widgets looks the
 * same.
 */
export const WidgetEmpty = ({
  message,
  action,
}: {
  readonly message: string;
  readonly action?: ReactNode;
}): ReactElement => (
  <div className="flex h-full min-h-24 flex-col items-center justify-center gap-3 px-2 text-center">
    <p className="text-sm text-muted-foreground">{message}</p>
    {action ?? null}
  </div>
);

/** A failure state that keeps the widget's footprint rather than collapsing. */
export const WidgetError = ({
  message,
}: {
  readonly message: string;
}): ReactElement => (
  <div className="flex h-full min-h-24 flex-col items-center justify-center gap-2 px-2 text-center">
    <AlertCircle aria-hidden="true" className="size-5 text-destructive" />
    <p className="text-sm text-muted-foreground">{message}</p>
  </div>
);
