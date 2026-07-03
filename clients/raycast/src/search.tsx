// The Search Halero command: throttled search-as-you-type over
// system.search, sectioned by kind in relevance order, opening hits in
// the browser. Titles and snippets render with the server's highlight
// markers stripped; Raycast rows are plain text.

import { Action, ActionPanel, List } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { type ReactElement, useEffect, useRef, useState } from "react";
import {
  createHaleroClient,
  getPrefs,
  type HaleroClient,
  type HaleroPrefs,
  hasApiToken,
} from "./api";
import {
  MissingTokenEmptyView,
  showApiFailureToast,
  showMissingTokenToast,
} from "./feedback";
import { stripHighlightMarkers } from "./highlight";
import {
  displayTitle,
  groupByKind,
  truncateSearchQuery,
} from "./search-helpers";
import { kindLabel, searchHitUrl } from "./urls";

type SearchResponse = Awaited<
  ReturnType<HaleroClient["system"]["search"]["query"]>
>;
type SearchHit = SearchResponse["results"][number];

const SearchResultItem = ({
  hit,
  baseUrl,
}: {
  readonly hit: SearchHit;
  readonly baseUrl: string;
}): ReactElement => {
  const title = displayTitle(hit);
  return (
    <List.Item
      title={title}
      subtitle={
        hit.snippetHighlighted === null
          ? undefined
          : stripHighlightMarkers(hit.snippetHighlighted)
      }
      accessories={
        hit.occurredDate === null ? undefined : [{ text: hit.occurredDate }]
      }
      actions={
        <ActionPanel>
          <Action.OpenInBrowser url={searchHitUrl(baseUrl, hit)} />
          <Action.CopyToClipboard title="Copy Title" content={title} />
        </ActionPanel>
      }
    />
  );
};

/** Shown only while the list has no items; Raycast picks the state. */
const SearchEmptyView = ({
  tokenMissing,
  query,
}: {
  readonly tokenMissing: boolean;
  readonly query: string;
}): ReactElement => {
  if (tokenMissing) {
    return <MissingTokenEmptyView />;
  }
  if (query.trim() === "") {
    return (
      <List.EmptyView
        title="Type to search"
        description="Search across everything in Halero."
      />
    );
  }
  return <List.EmptyView title="No matches." />;
};

/** One request per pause (List throttle), aborting the one before it. */
const useSearch = (prefs: HaleroPrefs, tokenMissing: boolean) => {
  const [searchText, setSearchText] = useState("");
  const abortable = useRef<AbortController | null>(null);
  const { isLoading, data } = usePromise(
    async (query: string): Promise<readonly SearchHit[]> => {
      const term = truncateSearchQuery(query);
      if (tokenMissing || term === "") {
        return [];
      }
      const client = createHaleroClient(prefs);
      const { results } = await client.system.search.query(
        { query: term },
        { signal: abortable.current?.signal },
      );
      return results;
    },
    [searchText],
    {
      abortable,
      onError: (error) => {
        void showApiFailureToast(error, prefs.baseUrl);
      },
    },
  );
  return { searchText, setSearchText, isLoading, hits: data ?? [] };
};

export default function SearchCommand(): ReactElement {
  const prefs = getPrefs();
  const tokenMissing = !hasApiToken(prefs);
  const search = useSearch(prefs, tokenMissing);

  useEffect(() => {
    if (tokenMissing) {
      void showMissingTokenToast();
    }
  }, [tokenMissing]);

  return (
    <List
      isLoading={search.isLoading}
      throttle
      onSearchTextChange={search.setSearchText}
      searchBarPlaceholder="Search Halero..."
    >
      <SearchEmptyView tokenMissing={tokenMissing} query={search.searchText} />
      {groupByKind(search.hits).map((group) => (
        <List.Section key={group.kind} title={kindLabel(group.kind)}>
          {group.hits.map((hit) => (
            <SearchResultItem
              key={hit.entityId}
              hit={hit}
              baseUrl={prefs.baseUrl}
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}
