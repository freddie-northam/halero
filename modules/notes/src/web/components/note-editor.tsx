// The BlockNote editor surface. Loaded lazily (see note-detail-screen) so
// BlockNote and its CSS never enter the module's static import graph, and
// so the list and command tests can run under happy-dom without a real
// contenteditable. The editor is UNCONTROLLED after mount: initialContent
// is read once, edits stay in the editor, and a debounced autosaver
// persists them. Nothing feeds query data back in, so a background list
// refetch never remounts the editor or drops the caret.

import "@blocknote/core/style.css";
import "@blocknote/shadcn/style.css";
import "./note-editor.css";

import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@halero/ui";
import { type ReactElement, useEffect, useRef } from "react";
import type { NoteDocument } from "../../contract";
import { type Autosaver, createAutosaver } from "../helpers/autosave";
import { noteSchema } from "./note-schema";

const AUTOSAVE_DELAY_MS = 800;

export interface NoteEditorProps {
  readonly initialDocument: NoteDocument;
  readonly onSave: (document: NoteDocument) => void;
}

export const NoteEditor = ({
  initialDocument,
  onSave,
}: NoteEditorProps): ReactElement => {
  const editor = useCreateBlockNote({
    schema: noteSchema,
    // The stored document is opaque BlockNote JSON from the server; cast
    // at this boundary. An empty document leaves BlockNote to open its
    // own single empty paragraph.
    initialContent: (initialDocument.length > 0
      ? initialDocument
      : undefined) as never,
  });

  // The autosaver is created once; a ref keeps it calling the latest
  // onSave even though that closure is recreated each render.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const autosaverRef = useRef<Autosaver<NoteDocument> | null>(null);
  if (autosaverRef.current === null) {
    autosaverRef.current = createAutosaver<NoteDocument>(
      (document) => onSaveRef.current(document),
      AUTOSAVE_DELAY_MS,
    );
  }

  useEffect(() => {
    const autosaver = autosaverRef.current;
    if (autosaver === null) {
      return;
    }
    const flush = (): void => autosaver.flush();
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        autosaver.flush();
      }
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // Persist the final edit as the editor unmounts (navigation away).
      autosaver.flush();
    };
  }, []);

  return (
    <div className="halero-note-editor">
      <BlockNoteView
        editor={editor}
        theme="light"
        // Off on purpose: the emoji picker fetches its dataset from a CDN,
        // which the server's connect-src 'self' CSP blocks and which the
        // "no external services" design forbids. Disabling it keeps the
        // ":" trigger from ever reaching out.
        emojiPicker={false}
        // Use Halero's own tooltip so the toolbar matches the rest of the
        // app (a dark bubble with a matching arrow); BlockNote's bundled
        // default rendered a coral bubble with a mismatched caret.
        shadCNComponents={{
          Tooltip: { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger },
        }}
        onChange={() => autosaverRef.current?.schedule(editor.document)}
      />
    </div>
  );
};
