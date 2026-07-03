// Browser URLs for the API commands. Raycast opens hits in the browser,
// so every builder produces an absolute URL on the configured base URL.
// The kind map is deliberately local and small: it mirrors where the
// web app's entity links land (modules/*/src/web/index.ts), and any
// kind it does not know falls back to the app root.

export const normalizeBaseUrl = (baseUrl: string): string =>
  baseUrl.replace(/\/+$/, "");

export interface SearchHitLocator {
  readonly kind: string;
  readonly occurredDate: string | null;
}

interface KindMapping {
  /** Section heading, matching the web palette's entity-link labels. */
  readonly label: string;
  readonly url: (baseUrl: string, hit: SearchHitLocator) => string;
}

const calendarAgendaUrl = (baseUrl: string, date: string | null): string => {
  const search = date === null ? "view=agenda" : `view=agenda&date=${date}`;
  return `${normalizeBaseUrl(baseUrl)}/calendar?${search}`;
};

const KIND_MAP: ReadonlyMap<string, KindMapping> = new Map([
  [
    "calendar.event",
    {
      label: "Event",
      // A dated hit lands on the agenda anchored at its home-timezone
      // date; an undated one falls back to today's agenda (the web
      // calendar module's buildLink behavior).
      url: (baseUrl, hit) => calendarAgendaUrl(baseUrl, hit.occurredDate),
    },
  ],
  [
    "task.item",
    {
      label: "Task",
      url: (baseUrl) => `${normalizeBaseUrl(baseUrl)}/tasks`,
    },
  ],
]);

/** Section label for a hit kind; unmapped kinds show their raw kind. */
export const kindLabel = (kind: string): string =>
  KIND_MAP.get(kind)?.label ?? kind;

/** Where opening a search hit lands; unmapped kinds go to the root. */
export const searchHitUrl = (baseUrl: string, hit: SearchHitLocator): string =>
  KIND_MAP.get(hit.kind)?.url(baseUrl, hit) ?? `${normalizeBaseUrl(baseUrl)}/`;

/** The agenda view anchored on the given date (the Today's Agenda target). */
export const agendaUrl = (baseUrl: string, date: string): string =>
  calendarAgendaUrl(baseUrl, date);
