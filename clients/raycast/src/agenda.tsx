// The Today's Agenda command: today's events through the same
// today-anchor plus one-day-range pair the web Today section uses
// (modules/calendar/src/web/today-agenda-section.tsx), preserving the
// server's ordering: all-day events first, then by start time.

import { Action, ActionPanel, List } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { type ReactElement, useEffect } from "react";
import { addDaysToDate, eventTimeLabel } from "./agenda-helpers";
import {
  createHaleroClient,
  getPrefs,
  type HaleroClient,
  hasApiToken,
} from "./api";
import {
  MissingTokenEmptyView,
  showApiFailureToast,
  showMissingTokenToast,
} from "./feedback";
import { agendaUrl } from "./urls";

type CalendarRange = Awaited<
  ReturnType<HaleroClient["modules"]["calendar"]["range"]["query"]>
>;
type AgendaEvent = CalendarRange["days"][number]["events"][number];

interface AgendaData {
  readonly today: string;
  readonly timeZone: string;
  readonly events: readonly AgendaEvent[];
}

const loadAgenda = async (client: HaleroClient): Promise<AgendaData> => {
  const { today } = await client.modules.calendar.today.query();
  const range = await client.modules.calendar.range.query({
    from: today,
    to: addDaysToDate(today, 1),
  });
  // The one-day window groups into at most a single day entry; the
  // server already ordered it all-day first, then by start time.
  const events = range.days.find((day) => day.date === today)?.events ?? [];
  return { today, timeZone: range.homeTimezone, events };
};

const AgendaItems = ({
  data,
  baseUrl,
}: {
  readonly data: AgendaData;
  readonly baseUrl: string;
}): ReactElement => {
  const openCalendar = (
    <ActionPanel>
      <Action.OpenInBrowser
        title="Open Calendar"
        url={agendaUrl(baseUrl, data.today)}
      />
    </ActionPanel>
  );
  return (
    <>
      <List.EmptyView title="Nothing scheduled today." actions={openCalendar} />
      {data.events.map((event) => (
        <List.Item
          key={event.entityId}
          title={event.title}
          subtitle={event.location ?? undefined}
          accessories={[{ text: eventTimeLabel(event, data.timeZone) }]}
          actions={openCalendar}
        />
      ))}
    </>
  );
};

export default function AgendaCommand(): ReactElement {
  const prefs = getPrefs();
  const tokenMissing = !hasApiToken(prefs);

  useEffect(() => {
    if (tokenMissing) {
      void showMissingTokenToast();
    }
  }, [tokenMissing]);

  const { isLoading, data } = usePromise(
    async (skip: boolean) =>
      skip ? undefined : loadAgenda(createHaleroClient(prefs)),
    [tokenMissing],
    {
      onError: (error) => {
        void showApiFailureToast(error, prefs.baseUrl);
      },
    },
  );

  return (
    <List isLoading={isLoading}>
      {tokenMissing ? (
        <MissingTokenEmptyView />
      ) : data === undefined ? null : (
        <AgendaItems data={data} baseUrl={prefs.baseUrl} />
      )}
    </List>
  );
}
