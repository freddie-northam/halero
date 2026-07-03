import { Button, Pencil } from "@halero/ui";
import type { ReactElement } from "react";

export interface EditTaskButtonProps {
  readonly title: string;
  readonly onOpen: () => void;
  readonly className?: string;
}

/**
 * The keyboard- and screen-reader-accessible way to open a task's detail
 * sheet. A board card's whole surface is also click-to-open, but its
 * Space/Enter belong to the dnd keyboard sensor, so this explicit button
 * is the only path that opens the editor without starting a drag; list
 * rows carry it for the same reason. Pointer, keydown, and click all stop
 * propagating so the button never reaches the card's own onClick or the
 * drag sensors wrapping it.
 */
export const EditTaskButton = ({
  title,
  onOpen,
  className,
}: EditTaskButtonProps): ReactElement => (
  <Button
    variant="ghost"
    size="icon-xs"
    aria-label={`Edit ${title}`}
    className={className}
    onPointerDown={(event) => event.stopPropagation()}
    onKeyDown={(event) => event.stopPropagation()}
    onClick={(event) => {
      event.stopPropagation();
      onOpen();
    }}
  >
    <Pencil aria-hidden="true" />
  </Button>
);
