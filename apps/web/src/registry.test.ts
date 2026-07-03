import { describe, expect, test } from "bun:test";
import type { CalendarApi } from "@halero/module-calendar/web";
import type {
  CommandContribution,
  EntityLinkContribution,
  WebModule,
} from "@halero/module-sdk/web";
import type { TasksApi } from "@halero/module-tasks/web";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory } from "@tanstack/react-router";
import type { HaleroApi } from "./lib/api";
import type { TrpcClient } from "./lib/trpc";
import {
  buildCalendarApi,
  buildCommands,
  buildEntityLinks,
  buildNav,
  buildTasksApi,
  buildTodaySections,
  buildWebModules,
} from "./registry";
import { createAppRouter } from "./router";

const stubTask = {
  entityId: "t-1",
  title: "Buy milk",
  status: "todo",
  priority: null,
  tags: [],
  dueDate: null,
  notes: null,
  estimateMinutes: null,
  loggedMinutes: 0,
  sortOrder: 1,
  completedAt: null,
};

const stubEvent = {
  entityId: "ev-1",
  title: "Standup",
  allDay: true,
  start: 0,
  end: 0,
  location: null,
  calendarId: "halero-local",
  recurring: false,
  notes: null,
  url: null,
  editable: true,
};

const stubClient = {
  modules: {
    calendar: {
      today: {
        query: () =>
          Promise.resolve({ homeTimezone: "UTC", today: "2023-11-14" }),
      },
      range: {
        query: () => Promise.resolve({ homeTimezone: "UTC", days: [] }),
      },
      events: {
        query: () => Promise.resolve({ homeTimezone: "UTC", events: [] }),
      },
      createEvent: {
        mutate: () => Promise.resolve(stubEvent),
      },
      updateEvent: {
        mutate: () => Promise.resolve(stubEvent),
      },
      deleteEvent: {
        mutate: () => Promise.resolve({ entityId: stubEvent.entityId }),
      },
    },
    tasks: {
      list: { query: () => Promise.resolve({ tasks: [stubTask] }) },
      today: {
        query: () =>
          Promise.resolve({
            homeTimezone: "UTC",
            today: "2023-11-14",
            tasks: [],
          }),
      },
      board: {
        query: () =>
          Promise.resolve({
            homeTimezone: "UTC",
            today: "2023-11-14",
            columns: { todo: [stubTask], doing: [], done: [] },
          }),
      },
      create: { mutate: () => Promise.resolve(stubTask) },
      update: { mutate: () => Promise.resolve(stubTask) },
      move: { mutate: () => Promise.resolve(stubTask) },
      toggle: { mutate: () => Promise.resolve(stubTask) },
      delete: { mutate: () => Promise.resolve({ entityId: "t-1" }) },
      logTime: { mutate: () => Promise.resolve(stubTask) },
    },
  },
} as unknown as TrpcClient;

const stubApi = {
  googleStatus: () =>
    Promise.resolve({
      clientConfigured: false,
      httpsOk: true,
      redirectUri: "http://localhost:4253/api/oauth/google/callback",
      connection: null,
    }),
} as unknown as HaleroApi;

const stubCalendarApi: CalendarApi = {
  today: () => Promise.resolve({ homeTimezone: "UTC", today: "2023-11-14" }),
  range: () => Promise.resolve({ homeTimezone: "UTC", days: [] }),
  events: () => Promise.resolve({ homeTimezone: "UTC", events: [] }),
  createEvent: () => Promise.reject(new Error("not under test")),
  updateEvent: () => Promise.reject(new Error("not under test")),
  deleteEvent: () => Promise.reject(new Error("not under test")),
};

const stubTasksApi: TasksApi = {
  list: () => Promise.resolve({ tasks: [] }),
  today: () =>
    Promise.resolve({ homeTimezone: "UTC", today: "2023-11-14", tasks: [] }),
  board: () =>
    Promise.resolve({
      homeTimezone: "UTC",
      today: "2023-11-14",
      columns: { todo: [], doing: [], done: [] },
    }),
  create: () => Promise.reject(new Error("not under test")),
  update: () => Promise.reject(new Error("not under test")),
  move: () => Promise.reject(new Error("not under test")),
  toggle: () => Promise.reject(new Error("not under test")),
  delete: () => Promise.reject(new Error("not under test")),
  logTime: () => Promise.reject(new Error("not under test")),
};

const modulesUnderTest = () =>
  buildWebModules(stubClient, stubApi, new QueryClient());

describe("the shipped web module registry", () => {
  test("provides the calendar page and nav entry from the module", () => {
    const calendar = modulesUnderTest().find(
      (module) => module.id === "calendar",
    );

    expect(calendar?.nav).toEqual([
      { label: "Calendar", path: "/calendar", order: 20 },
    ]);
    expect(calendar?.pages?.map((page) => page.path)).toEqual(["/calendar"]);
  });

  test("provides the home page and Today nav entry from the today module", () => {
    const today = modulesUnderTest().find((module) => module.id === "today");

    expect(today?.nav).toEqual([{ label: "Today", path: "/", order: 10 }]);
    expect(today?.pages?.map((page) => page.path)).toEqual(["/"]);
  });

  test("provides the tasks page and nav entry from the module", () => {
    const tasks = modulesUnderTest().find((module) => module.id === "tasks");

    expect(tasks?.nav).toEqual([{ label: "Tasks", path: "/tasks", order: 30 }]);
    expect(tasks?.pages?.map((page) => page.path)).toEqual(["/tasks"]);
  });

  test("hardcodes the Today sections: agenda at 10, due tasks at 20", () => {
    const sections = buildTodaySections(stubCalendarApi, stubTasksApi);

    expect(sections.map(({ id, order }) => ({ id, order }))).toEqual([
      { id: "calendar.agenda", order: 10 },
      { id: "tasks.dueToday", order: 20 },
    ]);
  });
});

describe("buildCalendarApi", () => {
  test("invalidates through the registry-held QueryClient after each mutation", async () => {
    const queryClient = new QueryClient();
    let invalidations = 0;
    const original = queryClient.invalidateQueries.bind(queryClient);
    queryClient.invalidateQueries = ((...args: []) => {
      invalidations += 1;
      return original(...args);
    }) as QueryClient["invalidateQueries"];
    const api = buildCalendarApi(stubClient, queryClient);

    await api.createEvent({
      title: "Standup",
      allDay: true,
      date: "2023-11-14",
    });
    expect(invalidations).toBe(1);
    await api.updateEvent({
      entityId: "ev-1",
      title: "Standup",
      allDay: true,
      date: "2023-11-14",
    });
    expect(invalidations).toBe(2);
    await api.deleteEvent("ev-1");
    expect(invalidations).toBe(3);
  });

  test("reads pass straight through without invalidating", async () => {
    const queryClient = new QueryClient();
    let invalidations = 0;
    queryClient.invalidateQueries = (() => {
      invalidations += 1;
      return Promise.resolve();
    }) as QueryClient["invalidateQueries"];
    const api = buildCalendarApi(stubClient, queryClient);

    const today = await api.today();
    const range = await api.range("2023-11-14", "2023-11-15");
    const events = await api.events("2023-11-14", "2023-11-15");
    expect(today.today).toBe("2023-11-14");
    expect(range.days).toEqual([]);
    expect(events.events).toEqual([]);
    expect(invalidations).toBe(0);
  });
});

describe("buildTasksApi", () => {
  test("invalidates through the registry-held QueryClient after each mutation", async () => {
    const queryClient = new QueryClient();
    let invalidations = 0;
    const original = queryClient.invalidateQueries.bind(queryClient);
    queryClient.invalidateQueries = ((...args: []) => {
      invalidations += 1;
      return original(...args);
    }) as QueryClient["invalidateQueries"];
    const api = buildTasksApi(stubClient, queryClient);

    await api.create({ title: "Buy milk" });
    expect(invalidations).toBe(1);
    await api.toggle("t-1");
    expect(invalidations).toBe(2);
    await api.delete("t-1");
    expect(invalidations).toBe(3);
    await api.logTime({ entityId: "t-1", minutes: 15 });
    expect(invalidations).toBe(4);
  });

  test("reads pass straight through without invalidating", async () => {
    const queryClient = new QueryClient();
    let invalidations = 0;
    queryClient.invalidateQueries = (() => {
      invalidations += 1;
      return Promise.resolve();
    }) as QueryClient["invalidateQueries"];
    const api = buildTasksApi(stubClient, queryClient);

    const list = await api.list("todo");
    const today = await api.today();
    expect(list.tasks.map((task) => task.title)).toEqual(["Buy milk"]);
    expect(today.today).toBe("2023-11-14");
    expect(invalidations).toBe(0);
  });
});

describe("buildNav", () => {
  test("keeps Settings in core and sorts everything by order", () => {
    const nav = buildNav(modulesUnderTest());

    expect(nav.map((entry) => entry.label)).toEqual([
      "Today",
      "Calendar",
      "Tasks",
      "Settings",
    ]);
    expect(nav.map((entry) => entry.path)).toEqual([
      "/",
      "/calendar",
      "/tasks",
      "/settings",
    ]);
  });

  test("renders core-only nav when no modules contribute", () => {
    const nav = buildNav([]);

    expect(nav.map((entry) => entry.label)).toEqual(["Settings"]);
  });

  test("orders a module entry after Settings when its order says so", () => {
    const nav = buildNav([
      { id: "late", nav: [{ label: "Late", path: "/late", order: 900 }] },
    ]);

    expect(nav.map((entry) => entry.label)).toEqual(["Settings", "Late"]);
  });
});

describe("buildCommands", () => {
  const command = (id: string): CommandContribution => ({
    id,
    describe: () => "Do the thing",
    run: () => Promise.resolve({ message: "Done." }),
  });

  test("collects only the tasks quick-capture command from the shipped modules", () => {
    // Today and calendar contribute no commands; nothing of theirs leaks in.
    const commands = buildCommands(modulesUnderTest());

    expect(commands.map((entry) => entry.id)).toEqual(["tasks.new"]);
  });

  test("a module without commands contributes nothing", () => {
    expect(buildCommands([{ id: "quiet" }])).toEqual([]);
  });

  test("rejects two modules contributing the same command id with a readable error", () => {
    const modules: readonly WebModule[] = [
      { id: "first", commands: [command("dup.run")] },
      { id: "second", commands: [command("dup.run")] },
    ];

    expect(() => buildCommands(modules)).toThrow(
      'The "second" module contributes the command "dup.run", but the ' +
        '"first" module already contributes it. Each command id can ' +
        "belong to exactly one module.",
    );
  });

  test("a duplicate command id fails at the boot path, not on first use", () => {
    // createAppRouter builds the command list in its context, so the
    // same mistake buildCommands rejects above brings the app down at
    // startup instead of running an ambiguous command later.
    const modules: readonly WebModule[] = [
      { id: "first", commands: [command("dup.run")] },
      { id: "second", commands: [command("dup.run")] },
    ];

    expect(() =>
      createAppRouter(
        stubApi,
        modules,
        createMemoryHistory({ initialEntries: ["/"] }),
      ),
    ).toThrow(/already contributes it/);
  });
});

describe("buildEntityLinks", () => {
  test("maps the calendar event kind from the shipped modules", () => {
    const links = buildEntityLinks(modulesUnderTest());

    const link = links.get("calendar.event");
    expect(link?.label).toBe("Event");
    expect(
      link?.buildLink({ entityId: "ev-1", occurredDate: "2023-11-14" }),
    ).toEqual({
      path: "/calendar",
      search: { view: "agenda", date: "2023-11-14" },
    });
  });

  test("maps the task item kind to the tasks page", () => {
    const links = buildEntityLinks(modulesUnderTest());

    const link = links.get("task.item");
    expect(link?.label).toBe("Task");
    expect(link?.buildLink({ entityId: "t-1", occurredDate: null })).toEqual({
      path: "/tasks",
    });
  });

  test("leaves kinds no module links absent", () => {
    const links = buildEntityLinks(modulesUnderTest());

    expect(links.get("note")).toBeUndefined();
  });

  test("rejects two modules linking the same kind with a readable error", () => {
    const link: EntityLinkContribution = {
      kind: "note",
      label: "Note",
      buildLink: () => ({ path: "/notes" }),
    };
    const modules: readonly WebModule[] = [
      { id: "first", entityLinks: [link] },
      { id: "second", entityLinks: [link] },
    ];

    expect(() => buildEntityLinks(modules)).toThrow(
      'The "second" module links the entity kind "note", but the "first" ' +
        "module already links it. Each entity kind can be linked by " +
        "exactly one module.",
    );
  });

  test("a duplicate kind fails at the boot path, not on first use", () => {
    // createAppRouter builds the entity-link map in its context, so the
    // same mistake that buildEntityLinks rejects above brings the app
    // down at startup instead of misrouting a palette hit later.
    const link: EntityLinkContribution = {
      kind: "note",
      label: "Note",
      buildLink: () => ({ path: "/notes" }),
    };
    const modules: readonly WebModule[] = [
      { id: "first", entityLinks: [link] },
      { id: "second", entityLinks: [link] },
    ];

    expect(() =>
      createAppRouter(
        stubApi,
        modules,
        createMemoryHistory({ initialEntries: ["/"] }),
      ),
    ).toThrow(/already links it/);
  });
});
