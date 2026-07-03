// The /notes page: a searchable list of note cards. Data arrives through
// the narrow NotesApi seam the host registry wires (and wraps with cache
// invalidation). Opening a note routes to /notes/$noteId; the "New note"
// button creates one and lands on its editor. The filter box narrows the
// already-loaded list client-side (universal search via Cmd+K covers
// finding notes across everything).

import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Loader2,
  StickyNote,
} from "@halero/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { type ReactElement, useState } from "react";
import type { NotesApi } from "./api";
import { NoteCard } from "./components/note-card";
import { filterNotes, normalizeNotesSearch } from "./helpers/notes-search";
import { notesListKey } from "./queries";
import { readableError } from "./readable-error";

/**
 * Module pages mount into the host's route tree dynamically, so the host's
 * literal route types cannot know /notes at compile time; the narrow
 * structural signature keeps navigation typed on the module side (the
 * tasks screen's pattern).
 */
type NotesNavigate = (options: {
  readonly to: "/notes/$noteId";
  readonly params: { readonly noteId: string };
}) => Promise<void>;

const EmptyState = ({
  onCreate,
  creating,
}: {
  readonly onCreate: () => void;
  readonly creating: boolean;
}): ReactElement => (
  <div className="mt-16 flex flex-col items-center gap-3 text-center">
    <StickyNote
      aria-hidden="true"
      className="size-8 text-muted-foreground/60"
    />
    <p className="text-sm text-muted-foreground">
      No notes yet. Start writing and it saves as you go.
    </p>
    <Button type="button" onClick={onCreate} disabled={creating}>
      New note
    </Button>
  </div>
);

/** Builds the page component around the host-wired notes queries. */
export const createNotesScreen = (api: NotesApi) => {
  const NotesScreen = (): ReactElement => {
    const rawSearch: unknown = useSearch({ strict: false });
    const navigate = useNavigate() as unknown as NotesNavigate;
    const [query, setQuery] = useState(() => normalizeNotesSearch(rawSearch).q);

    const listQuery = useQuery({
      queryKey: notesListKey,
      queryFn: () => api.list(),
    });

    const open = (entityId: string): void => {
      void navigate({ to: "/notes/$noteId", params: { noteId: entityId } });
    };

    const createNote = useMutation({
      mutationFn: () => api.create({ title: "Untitled note" }),
      onSuccess: (note) => open(note.entityId),
    });

    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Notes</h1>
          <Button
            type="button"
            onClick={() => createNote.mutate()}
            disabled={createNote.isPending}
          >
            New note
          </Button>
        </div>

        {createNote.error !== null && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>
              {readableError(createNote.error)}
            </AlertDescription>
          </Alert>
        )}

        <Body
          api={api}
          query={query}
          onQueryChange={setQuery}
          onOpen={open}
          onCreate={() => createNote.mutate()}
          creating={createNote.isPending}
          listQuery={listQuery}
        />
      </div>
    );
  };
  return NotesScreen;
};

const Body = ({
  query,
  onQueryChange,
  onOpen,
  onCreate,
  creating,
  listQuery,
}: {
  readonly api: NotesApi;
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly onOpen: (entityId: string) => void;
  readonly onCreate: () => void;
  readonly creating: boolean;
  readonly listQuery: ReturnType<
    typeof useQuery<Awaited<ReturnType<NotesApi["list"]>>>
  >;
}): ReactElement => {
  if (listQuery.error !== null) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertDescription>{readableError(listQuery.error)}</AlertDescription>
      </Alert>
    );
  }
  const data = listQuery.data;
  if (data === undefined) {
    return (
      <Loader2
        aria-hidden="true"
        className="mt-4 size-4 animate-spin text-muted-foreground"
      />
    );
  }
  if (data.notes.length === 0) {
    return <EmptyState onCreate={onCreate} creating={creating} />;
  }
  const visible = filterNotes(data.notes, query);
  return (
    <div className="mt-4 flex flex-col gap-3">
      <Input
        aria-label="Filter notes"
        placeholder="Filter notes..."
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No notes match "{query}".
        </p>
      ) : (
        visible.map((note) => (
          <NoteCard key={note.entityId} note={note} onOpen={onOpen} />
        ))
      )}
    </div>
  );
};
