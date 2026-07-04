// A board's widgets laid out in a responsive grid: one column on mobile,
// two on desktop where a large widget spans both. In view mode the grid
// is static. In edit mode each widget gains a drag handle (dnd-kit
// sortable reorder), a size-cycle button (s -> m -> l -> s), and a remove
// button; any of those calls back with the next layout so the screen can
// persist it. The reorder math is dnd-kit's arrayMove, so this file holds
// only the wiring, not sort bookkeeping.

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, ChevronsLeftRight, cn, Trash2 } from "@halero/ui";
import type { CSSProperties, ReactElement } from "react";
import type { WidgetInstance, WidgetSize } from "../../contract";
import type { F1Api } from "../api";
import { WidgetChrome, WidgetError } from "../widget-chrome";
import { WIDGETS } from "../widgets/registry";

export interface BoardGridProps {
  readonly layout: readonly WidgetInstance[];
  readonly api: F1Api;
  readonly editing: boolean;
  readonly onLayoutChange: (layout: readonly WidgetInstance[]) => void;
}

/** Desktop column span per size; every size is a single column on mobile. */
const SPAN_CLASS: Readonly<Record<WidgetSize, string>> = {
  s: "md:col-span-1",
  m: "md:col-span-1",
  l: "md:col-span-2",
};

/** A widget is "wide" when it spans both desktop columns. */
const isWide = (size: WidgetSize): boolean => size === "l";

/** The six-dot grip glyph shared by every drag handle. */
const GRIP_DOTS = ["tl", "tr", "ml", "mr", "bl", "br"] as const;

const GripDots = (): ReactElement => (
  <>
    {GRIP_DOTS.map((id) => (
      <span
        key={id}
        aria-hidden="true"
        className="size-0.5 rounded-full bg-current"
      />
    ))}
  </>
);

const HANDLE_CLASS =
  "grid cursor-grab grid-cols-2 gap-0.5 rounded p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing";

/** The chrome-wrapped body for one widget; unknown types fail gracefully. */
const WidgetBody = ({
  instance,
  api,
  handle,
  actions,
}: {
  readonly instance: WidgetInstance;
  readonly api: F1Api;
  readonly handle?: ReactElement;
  readonly actions?: ReactElement;
}): ReactElement => {
  const def = WIDGETS[instance.type];
  if (def === undefined) {
    return (
      <WidgetChrome title="Unknown widget" handle={handle} actions={actions}>
        <WidgetError message={`No widget registered for "${instance.type}".`} />
      </WidgetChrome>
    );
  }
  const { Component } = def;
  return (
    <WidgetChrome title={def.title} handle={handle} actions={actions}>
      <Component api={api} config={instance.config} />
    </WidgetChrome>
  );
};

const EditActions = ({
  instance,
  onToggleWide,
  onRemove,
}: {
  readonly instance: WidgetInstance;
  readonly onToggleWide: () => void;
  readonly onRemove: () => void;
}): ReactElement => {
  const wide = isWide(instance.size);
  return (
    <>
      <Button
        type="button"
        variant={wide ? "default" : "outline"}
        size="icon-xs"
        aria-pressed={wide}
        aria-label={wide ? "Make this widget narrow" : "Make this widget wide"}
        title={wide ? "Make narrow" : "Make wide"}
        onClick={onToggleWide}
      >
        <ChevronsLeftRight />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Remove widget"
        title="Remove"
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </>
  );
};

/** An editable, draggable cell wrapping WidgetBody with its dnd hooks. */
const SortableCell = ({
  instance,
  api,
  onToggleWide,
  onRemove,
}: {
  readonly instance: WidgetInstance;
  readonly api: F1Api;
  readonly onToggleWide: () => void;
  readonly onRemove: () => void;
}): ReactElement => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: instance.instanceId });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(SPAN_CLASS[instance.size], isDragging && "opacity-50")}
    >
      <WidgetBody
        instance={instance}
        api={api}
        handle={
          <button
            type="button"
            aria-label="Drag to reorder"
            title="Drag to reorder"
            className={HANDLE_CLASS}
            {...attributes}
            {...listeners}
          >
            <GripDots />
          </button>
        }
        actions={
          <EditActions
            instance={instance}
            onToggleWide={onToggleWide}
            onRemove={onRemove}
          />
        }
      />
    </div>
  );
};

export const BoardGrid = ({
  layout,
  api,
  editing,
  onLayoutChange,
}: BoardGridProps): ReactElement => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const gridClass = "grid grid-cols-1 items-start gap-4 md:grid-cols-2";

  if (!editing) {
    return (
      <div className={gridClass}>
        {layout.map((instance) => (
          <div key={instance.instanceId} className={SPAN_CLASS[instance.size]}>
            <WidgetBody instance={instance} api={api} />
          </div>
        ))}
      </div>
    );
  }

  const toggleWide = (instanceId: string): void => {
    onLayoutChange(
      layout.map((instance) =>
        instance.instanceId === instanceId
          ? { ...instance, size: isWide(instance.size) ? "m" : "l" }
          : instance,
      ),
    );
  };
  const remove = (instanceId: string): void => {
    onLayoutChange(
      layout.filter((instance) => instance.instanceId !== instanceId),
    );
  };
  const reorder = (activeId: string, overId: string): void => {
    if (activeId === overId) {
      return;
    }
    const from = layout.findIndex((item) => item.instanceId === activeId);
    const to = layout.findIndex((item) => item.instanceId === overId);
    if (from === -1 || to === -1) {
      return;
    }
    onLayoutChange(arrayMove([...layout], from, to));
  };

  return (
    <DndContext
      sensors={sensors}
      onDragEnd={(event) => {
        if (event.over !== null) {
          reorder(String(event.active.id), String(event.over.id));
        }
      }}
    >
      <SortableContext
        items={layout.map((instance) => instance.instanceId)}
        strategy={rectSortingStrategy}
      >
        <div className={gridClass}>
          {layout.map((instance) => (
            <SortableCell
              key={instance.instanceId}
              instance={instance}
              api={api}
              onToggleWide={() => toggleWide(instance.instanceId)}
              onRemove={() => remove(instance.instanceId)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
