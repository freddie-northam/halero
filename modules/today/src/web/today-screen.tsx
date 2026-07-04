// The Today page: greeting, the full date, connection nudges, then the
// host-wired sections in order. Data arrives through the narrow TodayApi
// seam: the host registry backs `home` with the calendar module's today
// anchor (modules.calendar.today, which already carries the home
// timezone and its current date) and `googleConnectionStatus` with the
// core connections facade, so this module needs no server code of its
// own. The greeting hour is the CURRENT instant read in that home
// timezone, never the browser's.

import { Alert, AlertDescription, Loader2, PageHeader } from "@halero/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { formatFullDate } from "./format";
import { greetingForHour, hourInZone } from "./greeting";
import { readableError } from "./readable-error";
import type { TodaySection } from "./sections";

/** The server-computed home anchor (the calendar module's today shape). */
export interface TodayHome {
  readonly homeTimezone: string;
  /** Calendar date ("YYYY-MM-DD") of now in the home timezone. */
  readonly today: string;
  /** The owner's name for the greeting; absent when none was set. */
  readonly displayName?: string | null;
}

/** What the Today page needs from the host. */
export interface TodayApi {
  readonly home: () => Promise<TodayHome>;
  /**
   * The Google connection's status ("active", "reauth_required", ...),
   * or null when no connection is configured yet.
   */
  readonly googleConnectionStatus: () => Promise<string | null>;
}

const SettingsLink = ({ label }: { readonly label: string }): ReactElement => (
  <Link
    to="/settings"
    className="font-medium underline underline-offset-4 hover:text-foreground"
  >
    {label}
  </Link>
);

const ReauthAlert = (): ReactElement => (
  <Alert variant="destructive" className="mt-6">
    <AlertDescription>
      <span>
        Google Calendar needs to be reconnected.{" "}
        <SettingsLink label="Open Settings" />
      </span>
    </AlertDescription>
  </Alert>
);

const ConnectPointer = (): ReactElement => (
  <p className="mt-6 text-sm text-muted-foreground">
    Connect Google Calendar in <SettingsLink label="Settings" /> to bring your
    events in.
  </p>
);

const TodayBody = ({
  home,
  connectionStatus,
  now,
  sections,
}: {
  readonly home: TodayHome;
  readonly connectionStatus: string | null | undefined;
  readonly now: () => number;
  readonly sections: readonly TodaySection[];
}): ReactElement => (
  <>
    <PageHeader
      title={`${greetingForHour(hourInZone(now(), home.homeTimezone))}${
        home.displayName ? `, ${home.displayName}` : ""
      }`}
      description={formatFullDate(home.today)}
    />
    {connectionStatus === "reauth_required" ? <ReauthAlert /> : null}
    {connectionStatus === null ? <ConnectPointer /> : null}
    <div className="mt-8 flex flex-col gap-8">
      {sections.map((section) => {
        const Section = section.component;
        return <Section key={section.id} />;
      })}
    </div>
  </>
);

/** Builds the page component around the host-wired data and sections. */
export const createTodayScreen = (
  api: TodayApi,
  sections: readonly TodaySection[],
  now: () => number = Date.now,
) => {
  const ordered = [...sections].toSorted((a, b) => a.order - b.order);
  const TodayScreen = (): ReactElement => {
    const home = useQuery({
      queryKey: ["today", "home"],
      queryFn: () => api.home(),
    });
    // Auxiliary nudges only: while this is loading or failing the page
    // simply shows no connection hint. Settings owns connection error
    // reporting, and a server-wide outage surfaces via the home query.
    const connection = useQuery({
      queryKey: ["today", "google-connection"],
      queryFn: () => api.googleConnectionStatus(),
    });

    const body = (): ReactElement => {
      if (home.error !== null) {
        return (
          <Alert variant="destructive">
            <AlertDescription>{readableError(home.error)}</AlertDescription>
          </Alert>
        );
      }
      if (home.data === undefined) {
        return (
          <Loader2
            aria-hidden="true"
            className="size-4 animate-spin text-muted-foreground"
          />
        );
      }
      return (
        <TodayBody
          home={home.data}
          connectionStatus={connection.data}
          now={now}
          sections={ordered}
        />
      );
    };

    // No width/padding wrapper here: the shell frames every page in
    // PageContainer, so pages only supply their PageHeader and body.
    return body();
  };
  return TodayScreen;
};
