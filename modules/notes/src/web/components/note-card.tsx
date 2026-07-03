import { Badge, Card, CardContent } from "@halero/ui";
import type { ReactElement } from "react";
import type { NoteListItem } from "../../contract";

const formatUpdated = (updatedAt: number): string =>
  new Date(updatedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export interface NoteCardProps {
  readonly note: NoteListItem;
  readonly onOpen: (entityId: string) => void;
}

/** One note in the list: title, a short preview, tags, and last-edited. */
export const NoteCard = ({ note, onOpen }: NoteCardProps): ReactElement => (
  <button
    type="button"
    onClick={() => onOpen(note.entityId)}
    className="w-full text-left"
  >
    <Card className="transition-colors hover:border-primary/40">
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate font-medium">{note.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground tnum">
            {formatUpdated(note.updatedAt)}
          </span>
        </div>
        {note.preview !== "" && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {note.preview}
          </p>
        )}
        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {note.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  </button>
);
