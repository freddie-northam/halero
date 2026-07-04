// The relationship layer's reusable UI surface: an entity's links, with
// an inline search to relate another item and a control to unlink one.
// Prop-driven and host-agnostic on purpose: it takes the kind->route map
// (entityKinds) and a navigate callback rather than reaching into the
// router, so any surface (a module dialog, the Developer page) can drop
// it in. Data comes through the injected HaleroApi, so tests pass a stub.

import type {
  EntityLink,
  EntityLinkContribution,
} from "@halero/module-sdk/web";
import { Badge, Button, cn, Input, Separator, Skeleton } from "@halero/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactElement, useMemo, useState } from "react";
import type { EntityLinkItem } from "../lib/api";
import { useApi } from "../lib/api-context";

/** The host-owned generic relationship every build ships. */
const RELATES_TO = "relates_to";
const SEARCH_LIMIT = 6;

export interface RelatedPanelProps {
  readonly entityId: string;
  /** kind -> where it lives + its label, from the web module registry. */
  readonly entityKinds: ReadonlyMap<string, EntityLinkContribution>;
  readonly onNavigate: (link: EntityLink) => void;
}

export const RelatedPanel = ({
  entityId,
  entityKinds,
  onNavigate,
}: RelatedPanelProps): ReactElement => {
  const api = useApi();
  const queryClient = useQueryClient();
  // Submitted (not keystroke) search term: the app's text inputs are
  // uncontrolled and read at submit, so this stays a plain form.
  const [query, setQuery] = useState("");

  const linksKey = ["entity-links", entityId] as const;
  const linksQuery = useQuery({
    queryKey: linksKey,
    queryFn: () => api.entityLinks(entityId),
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: linksKey });

  const relate = useMutation({
    mutationFn: (toId: string) =>
      api.createEntityLink({ fromId: entityId, toId, kind: RELATES_TO }),
    onSuccess: () => {
      setQuery("");
      return invalidate();
    },
  });

  const runSearch = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const raw = new FormData(event.currentTarget).get("q");
    setQuery(typeof raw === "string" ? raw.trim() : "");
  };
  const unrelate = useMutation({
    mutationFn: (id: string) => api.deleteEntityLink(id),
    onSuccess: () => invalidate(),
  });

  const links = linksQuery.data?.links ?? [];
  const linkedIds = useMemo(
    () => new Set(links.map((link) => link.neighbor.entityId)),
    [links],
  );

  const searchQuery = useQuery({
    queryKey: ["related-search", entityId, query],
    queryFn: () => api.search(query, { limit: SEARCH_LIMIT }),
    enabled: query.trim().length > 0,
  });
  const candidates = (searchQuery.data ?? []).filter(
    (hit) => hit.entityId !== entityId && !linkedIds.has(hit.entityId),
  );

  const kindLabel = (kind: string): string =>
    entityKinds.get(kind)?.label ?? kind;

  const navigateToNeighbor = (item: EntityLinkItem): void => {
    const contribution = entityKinds.get(item.neighbor.kind);
    if (contribution === undefined) {
      return;
    }
    onNavigate(
      contribution.buildLink({
        entityId: item.neighbor.entityId,
        occurredDate: item.neighbor.occurredDate,
      }),
    );
  };

  return (
    <section className="space-y-3">
      <h3 className="font-medium text-muted-foreground text-sm">Related</h3>

      {linksQuery.isLoading ? (
        <Skeleton className="h-8 w-full" />
      ) : links.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing linked yet.</p>
      ) : (
        <ul className="space-y-1">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-2">
              <button
                type="button"
                data-testid="related-neighbor"
                onClick={() => navigateToNeighbor(link)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                )}
              >
                <Badge variant="secondary" className="shrink-0">
                  {kindLabel(link.neighbor.kind)}
                </Badge>
                <span className="truncate">
                  {link.neighbor.title ?? "Untitled"}
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Remove relationship"
                disabled={unrelate.isPending}
                onClick={() => unrelate.mutate(link.id)}
              >
                Unlink
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Separator />

      <div className="space-y-1">
        <form
          data-testid="related-search-form"
          onSubmit={runSearch}
          className="flex gap-2"
        >
          <Input
            name="q"
            data-testid="related-search"
            placeholder="Search to link an item..."
          />
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
        </form>
        {candidates.length > 0 && (
          <ul className="space-y-1 rounded-md border p-1">
            {candidates.map((hit) => (
              <li key={hit.entityId}>
                <button
                  type="button"
                  data-testid="related-result"
                  disabled={relate.isPending}
                  onClick={() => relate.mutate(hit.entityId)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                  )}
                >
                  <Badge variant="secondary" className="shrink-0">
                    {kindLabel(hit.kind)}
                  </Badge>
                  <span className="truncate">{hit.title ?? "Untitled"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
