// The /notes/$noteId page: a note's title, its block editor, tags, and a
// delete action. The note is fetched once by id; the editor mounts only
// after it loads so its initialContent is the real document (never a
// placeholder that would later force a remount). Title and tag edits save
// through the same NotesApi.update the editor autosave uses; the host
// wrapper invalidates the list but not this note's detail, so saving never
// disturbs the open editor.

import {
  Alert,
  AlertDescription,
  Button,
  ChevronLeft,
  Input,
  Loader2,
} from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  lazy,
  type ReactElement,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Note, NoteDocument } from "../contract";
import type { NotesApi } from "./api";
import { TagEditor } from "./components/tag-editor";
import { type Autosaver, createAutosaver } from "./helpers/autosave";
import { noteDetailKey } from "./queries";
import { readableError } from "./readable-error";

const TITLE_AUTOSAVE_DELAY_MS = 800;

// Lazy so BlockNote and its CSS stay out of the module's static import
// graph: the list and command tests load this module under happy-dom.
const NoteEditor = lazy(() =>
  import("./components/note-editor").then((module) => ({
    default: module.NoteEditor,
  })),
);

type NotesListNavigate = (options: { readonly to: "/notes" }) => Promise<void>;

const EditorFallback = (): ReactElement => (
  <Loader2
    aria-hidden="true"
    className="mt-6 size-4 animate-spin text-muted-foreground"
  />
);

const NoteDetailLoaded = ({
  note,
  api,
  onDeleted,
}: {
  readonly note: Note;
  readonly api: NotesApi;
  readonly onDeleted: () => void;
}): ReactElement => {
  const [title, setTitle] = useState(note.title);
  const [tags, setTags] = useState<readonly string[]>(note.tags);

  const titleSaverRef = useRef<Autosaver<string> | null>(null);
  if (titleSaverRef.current === null) {
    titleSaverRef.current = createAutosaver<string>((value) => {
      void api.update({ entityId: note.entityId, title: value });
    }, TITLE_AUTOSAVE_DELAY_MS);
  }
  useEffect(() => {
    const saver = titleSaverRef.current;
    return () => saver?.flush();
  }, []);

  const saveDocument = useCallback(
    (document: NoteDocument) => {
      void api.update({ entityId: note.entityId, document });
    },
    [api, note.entityId],
  );

  const onTitleChange = (value: string): void => {
    setTitle(value);
    titleSaverRef.current?.schedule(value);
  };

  const onTagsChange = (next: readonly string[]): void => {
    setTags(next);
    void api.update({ entityId: note.entityId, tags: next });
  };

  return (
    <div className="flex flex-col gap-4">
      <Input
        aria-label="Note title"
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        placeholder="Untitled note"
        className="h-auto border-0 px-0 text-xl font-semibold shadow-none focus-visible:ring-0"
      />
      <Suspense fallback={<EditorFallback />}>
        <NoteEditor initialDocument={note.document} onSave={saveDocument} />
      </Suspense>
      <div className="mt-2 flex flex-col gap-3 border-t pt-4">
        <TagEditor tags={tags} onChange={onTagsChange} />
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void api.delete(note.entityId).then(onDeleted);
            }}
          >
            Delete note
          </Button>
        </div>
      </div>
    </div>
  );
};

/** Builds the editor page component around the host-wired notes queries. */
export const createNoteDetailScreen = (api: NotesApi) => {
  const NoteDetailScreen = (): ReactElement => {
    const params = useParams({ strict: false }) as { noteId?: string };
    const noteId = params.noteId ?? "";
    const navigate = useNavigate() as unknown as NotesListNavigate;

    const noteQuery = useQuery({
      queryKey: noteDetailKey(noteId),
      queryFn: () => api.get(noteId),
    });

    const goToList = (): void => {
      void navigate({ to: "/notes" });
    };

    return (
      // The editor keeps a centred reading column (the one sanctioned page
      // exception, see the layout guard's exemptions); the shell's
      // PageContainer already supplies the page padding.
      <div className="mx-auto w-full max-w-3xl">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={goToList}
          className="-ml-2 mb-4 text-muted-foreground"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Notes
        </Button>

        {noteQuery.error !== null ? (
          <Alert variant="destructive">
            <AlertDescription>
              {readableError(noteQuery.error)}
            </AlertDescription>
          </Alert>
        ) : noteQuery.data === undefined ? (
          <Loader2
            aria-hidden="true"
            className="size-4 animate-spin text-muted-foreground"
          />
        ) : (
          <NoteDetailLoaded
            note={noteQuery.data}
            api={api}
            onDeleted={goToList}
          />
        )}
      </div>
    );
  };
  return NoteDetailScreen;
};
