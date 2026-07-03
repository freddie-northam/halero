// The Cmd+K command palette: universal search over the entity spine
// plus module-contributed commands, both handed in from the boot-built
// registry. Core-owned and module-agnostic: it never imports module code.

import type {
  CommandContribution,
  CommandRunResult,
  EntityLink,
  EntityLinkContribution,
} from "@halero/module-sdk/web";
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Loader2,
} from "@halero/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Fragment,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import type { SearchResult } from "../lib/api";
import { useApi } from "../lib/api-context";
import { readableError } from "../lib/errors";
import { splitHighlighted } from "../lib/highlight";

/** Search-as-you-type debounce: one request per pause, not per key. */
export const SEARCH_DEBOUNCE_MS = 200;

/** Command row values wear this so they never collide with entity ids. */
const COMMAND_VALUE_PREFIX = "command:";

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The entity-link registry built at boot; maps hit kinds to links. */
  readonly entityLinks: ReadonlyMap<string, EntityLinkContribution>;
  /** Module commands built at boot; rendered as the Commands group. */
  readonly commands: readonly CommandContribution[];
  /** Navigates to a hit's or command result's link; the router owns how. */
  readonly onOpenLink: (link: EntityLink) => void;
}

/** Renders highlight() output; marker safety lives in lib/highlight. */
const HighlightedText = ({
  value,
}: {
  readonly value: string;
}): ReactElement => {
  const nodes: ReactElement[] = [];
  let offset = 0;
  for (const segment of splitHighlighted(value)) {
    // Character offsets are stable keys: segments never reorder.
    const key = String(offset);
    offset += segment.text.length;
    nodes.push(
      segment.highlighted ? (
        <mark key={key} className="bg-transparent font-medium text-foreground">
          {segment.text}
        </mark>
      ) : (
        <Fragment key={key}>{segment.text}</Fragment>
      ),
    );
  }
  return <>{nodes}</>;
};

interface ResultRowProps {
  readonly hit: SearchResult;
  /** Null when no module links this kind: the row is non-interactive. */
  readonly link: EntityLinkContribution | null;
  readonly onSelect: (link: EntityLinkContribution, hit: SearchResult) => void;
}

const ResultRow = ({ hit, link, onSelect }: ResultRowProps): ReactElement => (
  <CommandItem
    value={hit.entityId}
    disabled={link === null}
    onSelect={() => {
      if (link !== null) {
        onSelect(link, hit);
      }
    }}
  >
    <span className="min-w-0 flex-1 truncate">
      <HighlightedText value={hit.titleHighlighted} />
    </span>
    {hit.snippetHighlighted !== null && (
      <span className="min-w-0 max-w-[45%] truncate text-muted-foreground">
        <HighlightedText value={hit.snippetHighlighted} />
      </span>
    )}
    {hit.occurredDate !== null && (
      <span className="tnum shrink-0 text-xs text-muted-foreground">
        {hit.occurredDate}
      </span>
    )}
  </CommandItem>
);

interface ResultGroup {
  readonly kind: string;
  readonly heading: string;
  readonly link: EntityLinkContribution | null;
  readonly hits: readonly SearchResult[];
}

/** Groups hits by kind in first-appearance (relevance) order. */
const groupResults = (
  hits: readonly SearchResult[],
  entityLinks: ReadonlyMap<string, EntityLinkContribution>,
): readonly ResultGroup[] => {
  const groups = new Map<
    string,
    {
      heading: string;
      link: EntityLinkContribution | null;
      hits: SearchResult[];
    }
  >();
  for (const hit of hits) {
    const existing = groups.get(hit.kind);
    if (existing !== undefined) {
      existing.hits.push(hit);
      continue;
    }
    const link = entityLinks.get(hit.kind) ?? null;
    // An unlinked kind still shows its hits, headed by the raw kind.
    groups.set(hit.kind, {
      heading: link?.label ?? hit.kind,
      link,
      hits: [hit],
    });
  }
  return [...groups.entries()].map(([kind, group]) => ({ kind, ...group }));
};

interface CommandRunState {
  /** The id of the command in flight, or null when none runs. */
  readonly runningId: string | null;
  /** The last rejection as readable text, shown inline in the group. */
  readonly errorMessage: string | null;
}

interface CommandRunner {
  readonly state: CommandRunState;
  readonly run: (command: CommandContribution) => void;
  readonly reset: () => void;
}

/**
 * Runs one command at a time against the palette's raw input. Success
 * hands the result to onDone (the palette closes and navigates there);
 * rejection keeps the palette open with readable text and the input
 * untouched, so the user can fix and retry. reset() also abandons an
 * in-flight run: a palette closed mid-run must not navigate when the
 * command settles late.
 */
const useCommandRunner = (
  input: string,
  onDone: (result: CommandRunResult) => void,
): CommandRunner => {
  const [state, setState] = useState<CommandRunState>({
    runningId: null,
    errorMessage: null,
  });
  const generation = useRef(0);

  const run = (command: CommandContribution): void => {
    if (state.runningId !== null) {
      return;
    }
    generation.current += 1;
    const started = generation.current;
    setState({ runningId: command.id, errorMessage: null });
    command.run(input).then(
      (result) => {
        if (generation.current !== started) {
          return;
        }
        setState({ runningId: null, errorMessage: null });
        onDone(result);
      },
      (thrown: unknown) => {
        if (generation.current !== started) {
          return;
        }
        setState({ runningId: null, errorMessage: readableError(thrown) });
      },
    );
  };

  const reset = (): void => {
    generation.current += 1;
    setState({ runningId: null, errorMessage: null });
  };

  return { state, run, reset };
};

interface CommandsGroupProps {
  readonly commands: readonly CommandContribution[];
  /** The palette's raw input; describe() labels each row for it. */
  readonly input: string;
  readonly state: CommandRunState;
  readonly onRun: (command: CommandContribution) => void;
}

/** Module command rows; absent when nothing describes itself. */
const CommandsGroup = ({
  commands,
  input,
  state,
  onRun,
}: CommandsGroupProps): ReactElement | null => {
  const rows = commands.flatMap((command) => {
    const label = command.describe(input);
    return label === null ? [] : [{ command, label }];
  });
  if (rows.length === 0) {
    return null;
  }
  return (
    <CommandGroup heading="Commands">
      {rows.map(({ command, label }) => (
        <CommandItem
          key={command.id}
          value={`${COMMAND_VALUE_PREFIX}${command.id}`}
          onSelect={() => onRun(command)}
        >
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {state.runningId === command.id && (
            <Loader2
              role="status"
              aria-label="Running..."
              className="size-4 shrink-0 animate-spin text-muted-foreground"
            />
          )}
        </CommandItem>
      ))}
      {state.errorMessage !== null && (
        <p className="px-2 pt-1 pb-1.5 text-sm text-destructive">
          {state.errorMessage}
        </p>
      )}
    </CommandGroup>
  );
};

const StateLine = ({
  tone = "muted",
  children,
}: {
  readonly tone?: "muted" | "destructive";
  readonly children: ReactNode;
}): ReactElement => (
  <p
    className={cn(
      "py-6 text-center text-sm",
      tone === "muted" ? "text-muted-foreground" : "text-destructive",
    )}
  >
    {children}
  </p>
);

interface PaletteResultsProps {
  readonly idle: boolean;
  readonly searching: boolean;
  readonly error: unknown;
  readonly hits: readonly SearchResult[];
  readonly entityLinks: ReadonlyMap<string, EntityLinkContribution>;
  readonly onSelectHit: (
    link: EntityLinkContribution,
    hit: SearchResult,
  ) => void;
  /** The rendered Commands group (or null); placement is per state. */
  readonly commands: ReactNode;
}

const ResultGroups = ({
  groups,
  onSelectHit,
}: {
  readonly groups: readonly ResultGroup[];
  readonly onSelectHit: PaletteResultsProps["onSelectHit"];
}): ReactElement => (
  <>
    {groups.map((group) => (
      <CommandGroup key={group.kind} heading={group.heading}>
        {group.hits.map((hit) => (
          <ResultRow
            key={hit.entityId}
            hit={hit}
            link={group.link}
            onSelect={onSelectHit}
          />
        ))}
      </CommandGroup>
    ))}
  </>
);

const PaletteResults = ({
  idle,
  searching,
  error,
  hits,
  entityLinks,
  onSelectHit,
  commands,
}: PaletteResultsProps): ReactElement => {
  if (idle) {
    // With an empty query the command rows ARE the content; the hint
    // keeps its line below them. Search results never render here.
    return (
      <CommandList>
        {commands}
        <StateLine>Type to search</StateLine>
      </CommandList>
    );
  }
  if (error !== null && error !== undefined) {
    // A failed search never blocks capture: commands stay available.
    return (
      <CommandList>
        <StateLine tone="destructive">{readableError(error)}</StateLine>
        {commands}
      </CommandList>
    );
  }
  const groups = groupResults(hits, entityLinks);
  return (
    <CommandList>
      {groups.length === 0 ? (
        // A plain line, not cmdk's CommandEmpty: the command rows below
        // count as items, which would keep CommandEmpty from showing.
        <StateLine>{searching ? "Searching..." : "No matches."}</StateLine>
      ) : (
        <ResultGroups groups={groups} onSelectHit={onSelectHit} />
      )}
      {commands}
    </CommandList>
  );
};

/** Toggles the palette on Cmd+K/Ctrl+K (the sidebar's Cmd+B pattern). */
const useCmdKToggle = (
  open: boolean,
  onOpenChange: (open: boolean) => void,
): void => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);
};

/** The value as of the last typing pause. */
const useDebouncedValue = (value: string): string => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
};

interface PaletteSearchState {
  readonly idle: boolean;
  readonly searching: boolean;
  readonly error: unknown;
  readonly hits: readonly SearchResult[];
}

/** The debounced entity search behind the palette's result rows. */
const usePaletteSearch = (open: boolean, query: string): PaletteSearchState => {
  const api = useApi();
  const idle = query.trim() === "";
  // Whitespace-only or still-idle input never reaches the server.
  const term = useDebouncedValue(query).trim();
  const search = useQuery({
    queryKey: ["command-palette-search", term],
    queryFn: () => api.search(term),
    enabled: open && !idle && term !== "",
    // Keeps the previous results on screen while the next term loads,
    // so typing never blanks the list.
    placeholderData: keepPreviousData,
  });
  return {
    idle,
    searching: !idle && (term !== query.trim() || search.isFetching),
    error: idle ? null : search.error,
    // Hits only when they would render: stale cached results must not
    // steer the selection while idle or while an error line shows.
    hits: idle || search.error !== null ? [] : (search.data ?? []),
  };
};

/**
 * cmdk's selection, lifted. cmdk re-selects only when the search text
 * changes, so async hits landing under an already-selected command row
 * would leave Enter on the command instead of the first result. Handing
 * the selection to the first linked hit as results arrive keeps the
 * palette's Enter-opens-the-top-result behavior.
 */
const usePaletteSelection = (
  hits: readonly SearchResult[],
  entityLinks: ReadonlyMap<string, EntityLinkContribution>,
) => {
  const [selected, setSelected] = useState("");
  const firstLinkedId = hits.find((hit) => entityLinks.has(hit.kind))?.entityId;
  useEffect(() => {
    if (firstLinkedId === undefined) {
      return;
    }
    setSelected((current) =>
      current.startsWith(COMMAND_VALUE_PREFIX) ? firstLinkedId : current,
    );
  }, [firstLinkedId]);
  return { selected, setSelected };
};

/** Everything the palette JSX needs, wired apart from the markup. */
const usePaletteState = ({
  open,
  onOpenChange,
  entityLinks,
  onOpenLink,
}: Omit<CommandPaletteProps, "commands">) => {
  const [query, setQuery] = useState("");
  useCmdKToggle(open, onOpenChange);
  const search = usePaletteSearch(open, query);
  const selection = usePaletteSelection(search.hits, entityLinks);

  // Success closes the palette; rejection is the runner's to keep.
  const runner = useCommandRunner(query, (result: CommandRunResult): void => {
    if (result.navigateTo !== undefined) {
      onOpenLink(result.navigateTo);
    }
    setQuery("");
    onOpenChange(false);
  });

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      setQuery("");
      selection.setSelected("");
      runner.reset();
    }
    onOpenChange(nextOpen);
  };

  const openHit = (link: EntityLinkContribution, hit: SearchResult): void => {
    onOpenLink(
      link.buildLink({
        entityId: hit.entityId,
        occurredDate: hit.occurredDate,
      }),
    );
    handleOpenChange(false);
  };

  return {
    query,
    setQuery,
    search,
    selection,
    runner,
    handleOpenChange,
    openHit,
  };
};

export const CommandPalette = ({
  open,
  onOpenChange,
  entityLinks,
  commands,
  onOpenLink,
}: CommandPaletteProps): ReactElement => {
  const palette = usePaletteState({
    open,
    onOpenChange,
    entityLinks,
    onOpenLink,
  });

  return (
    <CommandDialog
      open={open}
      onOpenChange={palette.handleOpenChange}
      shouldFilter={false}
      value={palette.selection.selected}
      onValueChange={palette.selection.setSelected}
      showCloseButton={false}
      title="Search Halero"
      description="Search across everything in Halero"
    >
      <CommandInput
        value={palette.query}
        onValueChange={palette.setQuery}
        placeholder="Search Halero..."
      />
      <PaletteResults
        idle={palette.search.idle}
        searching={palette.search.searching}
        error={palette.search.error}
        hits={palette.search.hits}
        entityLinks={entityLinks}
        onSelectHit={palette.openHit}
        commands={
          <CommandsGroup
            commands={commands}
            input={palette.query}
            state={palette.runner.state}
            onRun={palette.runner.run}
          />
        }
      />
    </CommandDialog>
  );
};
