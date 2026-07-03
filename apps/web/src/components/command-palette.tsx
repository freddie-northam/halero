// The Cmd+K command palette: universal search over the entity spine,
// routed to module pages through the boot-built entity-link registry.
// Core-owned and module-agnostic: it never imports module code.

import type {
  EntityLink,
  EntityLinkContribution,
} from "@halero/module-sdk/web";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
} from "@halero/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Fragment,
  type ReactElement,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import type { SearchResult } from "../lib/api";
import { useApi } from "../lib/api-context";
import { readableError } from "../lib/errors";
import { splitHighlighted } from "../lib/highlight";

/** Search-as-you-type debounce: one request per pause, not per key. */
export const SEARCH_DEBOUNCE_MS = 200;

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The entity-link registry built at boot; maps hit kinds to links. */
  readonly entityLinks: ReadonlyMap<string, EntityLinkContribution>;
  /** Navigates to a hit's link; the router owns how. */
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
}

const PaletteResults = ({
  idle,
  searching,
  error,
  hits,
  entityLinks,
  onSelectHit,
}: PaletteResultsProps): ReactElement => {
  if (idle) {
    // Task 11's command rows will slot in above this hint; search
    // results always render below whatever the empty query shows.
    return (
      <CommandList>
        <StateLine>Type to search</StateLine>
      </CommandList>
    );
  }
  if (error !== null && error !== undefined) {
    return (
      <CommandList>
        <StateLine tone="destructive">{readableError(error)}</StateLine>
      </CommandList>
    );
  }
  const groups = groupResults(hits, entityLinks);
  if (groups.length === 0) {
    return (
      <CommandList>
        {searching ? (
          <StateLine>Searching...</StateLine>
        ) : (
          <CommandEmpty>No matches.</CommandEmpty>
        )}
      </CommandList>
    );
  }
  return (
    <CommandList>
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

export const CommandPalette = ({
  open,
  onOpenChange,
  entityLinks,
  onOpenLink,
}: CommandPaletteProps): ReactElement => {
  const api = useApi();
  const [query, setQuery] = useState("");
  useCmdKToggle(open, onOpenChange);

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

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      setQuery("");
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

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      shouldFilter={false}
      showCloseButton={false}
      title="Search Halero"
      description="Search across everything in Halero"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search Halero..."
      />
      <PaletteResults
        idle={idle}
        searching={!idle && (term !== query.trim() || search.isFetching)}
        error={idle ? null : search.error}
        hits={search.data ?? []}
        entityLinks={entityLinks}
        onSelectHit={openHit}
      />
    </CommandDialog>
  );
};
