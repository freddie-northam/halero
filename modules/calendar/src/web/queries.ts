// The module's react-query keys and the invalidation wrapper the host
// registry applies to its CalendarApi. The keys never leave this module:
// the host holds the QueryClient and calls the wrapper, so core code
// never learns (or hardcodes) module cache shapes. Mirrors tasks'
// queries.ts.

import type { QueryClient } from "@tanstack/react-query";
import type { CalendarApi } from "./api";

const calendarRootKey = ["calendar"] as const;

/**
 * Wraps a CalendarApi so every successful mutation invalidates the
 * module's queries (today, every range window, and the flat events feed)
 * and resolves only after active ones refetched. No optimistic updates:
 * invalidate-and-refetch keeps every view (month, week, agenda) consistent
 * after a create, edit, or delete.
 */
export const withCalendarInvalidation = (
  api: CalendarApi,
  queryClient: QueryClient,
): CalendarApi => {
  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: calendarRootKey });
  };
  return {
    today: api.today,
    range: api.range,
    events: api.events,
    createEvent: async (input) => {
      const event = await api.createEvent(input);
      await invalidate();
      return event;
    },
    updateEvent: async (input) => {
      const event = await api.updateEvent(input);
      await invalidate();
      return event;
    },
    deleteEvent: async (entityId) => {
      const result = await api.deleteEvent(entityId);
      await invalidate();
      return result;
    },
  };
};
