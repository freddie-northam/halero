import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Loader2,
} from "@halero/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import type { FormEvent, ReactElement } from "react";
import { useApi } from "../lib/api-context";
import { readableError } from "../lib/errors";
import { ApiTokensSection } from "./settings-api-tokens";
import { IntegrationsSection } from "./settings-integrations";

/** The sub-nav sections; the URL segment selects the active one. */
export const SETTINGS_SECTIONS = [
  "profile",
  "notifications",
  "tokens",
  "server",
  "integrations",
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const isSettingsSection = (value: string): value is SettingsSection =>
  (SETTINGS_SECTIONS as readonly string[]).includes(value);

export interface SettingsScreenProps {
  readonly section: SettingsSection;
  /** OAuth callback flags, only meaningful on the integrations section. */
  readonly connected: boolean;
  readonly errorCode: string | null;
  readonly errorConnector: string | null;
}

const NAV: readonly { section: SettingsSection; label: string }[] = [
  { section: "profile", label: "Profile" },
  { section: "notifications", label: "Notifications" },
  { section: "tokens", label: "API Tokens" },
  { section: "server", label: "Server address" },
  { section: "integrations", label: "Integrations" },
];

const ProfileSection = (): ReactElement => {
  const api = useApi();
  const router = useRouter();
  const logout = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      void router.navigate({ to: "/login" });
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2 className="text-sm">Profile</h2>
        </CardTitle>
        <CardDescription>
          Halero runs as a single local account secured by your password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          variant="outline"
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
        >
          {logout.isPending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : null}
          Log out
        </Button>
      </CardContent>
    </Card>
  );
};

const TestSendOutcome = ({
  delivered,
  mutationError,
}: {
  readonly delivered?: boolean;
  readonly mutationError: unknown;
}): ReactElement | null => {
  if (mutationError != null || delivered === false) {
    return (
      <p role="status" className="text-sm text-destructive">
        The test notification could not be delivered. Check the URL and try
        again.
      </p>
    );
  }
  if (delivered === true) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Test notification delivered.
      </p>
    );
  }
  return null;
};

const NotificationsForm = ({
  savedUrl,
  onSaved,
}: {
  readonly savedUrl: string | null;
  readonly onSaved: () => void;
}): ReactElement => {
  const api = useApi();
  const save = useMutation({
    mutationFn: (url: string) => api.saveNotifyUrl(url),
    onSuccess: onSaved,
  });
  const test = useMutation({ mutationFn: () => api.sendTestNotification() });
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (save.isPending) {
      return;
    }
    const url = new FormData(event.currentTarget).get("url");
    save.mutate(String(url ?? "").trim());
  };
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notify-url">Notification URL</Label>
        <Input
          id="notify-url"
          name="url"
          type="url"
          autoComplete="off"
          placeholder="https://ntfy.sh/your-topic"
          defaultValue={savedUrl ?? ""}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : null}
          Save URL
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={savedUrl === null || test.isPending}
          onClick={() => test.mutate()}
        >
          {test.isPending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : null}
          {test.isPending ? "Sending" : "Send test notification"}
        </Button>
      </div>
      {save.error !== null ? (
        <p role="status" className="text-sm text-destructive">
          {readableError(save.error)}
        </p>
      ) : null}
      {save.isSuccess && save.error === null ? (
        <p role="status" className="text-sm text-muted-foreground">
          Notification settings saved.
        </p>
      ) : null}
      {test.isPending ? null : (
        <TestSendOutcome
          delivered={test.data?.delivered}
          mutationError={test.error}
        />
      )}
    </form>
  );
};

const NotificationsSection = (): ReactElement => {
  const api = useApi();
  const settings = useQuery({
    queryKey: ["notification-settings"],
    queryFn: () => api.notificationSettings(),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2 className="text-sm">Notifications</h2>
        </CardTitle>
        <CardDescription>
          When a sync keeps failing or a connection needs a reconnect, Halero
          sends a JSON alert to this URL. Works with ntfy: use a topic URL like
          https://ntfy.sh/your-topic. Leave the field empty and save to turn
          notifications off.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {settings.data === undefined ? (
          <Loader2
            aria-hidden="true"
            className="size-4 animate-spin text-muted-foreground"
          />
        ) : (
          <NotificationsForm
            savedUrl={settings.data.url}
            onSaved={() => {
              void settings.refetch();
            }}
          />
        )}
      </CardContent>
    </Card>
  );
};

const ServerAddressForm = ({
  savedUrl,
  onSaved,
}: {
  readonly savedUrl: string;
  readonly onSaved: () => void;
}): ReactElement => {
  const api = useApi();
  const save = useMutation({
    mutationFn: (url: string) => api.saveBaseUrl(url),
    onSuccess: onSaved,
  });
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (save.isPending) {
      return;
    }
    const url = new FormData(event.currentTarget).get("url");
    save.mutate(String(url ?? "").trim());
  };
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="server-address">Server address</Label>
        <Input
          id="server-address"
          name="url"
          type="url"
          autoComplete="off"
          placeholder="https://halero.example.com"
          defaultValue={savedUrl}
        />
      </div>
      <Alert className="border-amber-300 bg-amber-50 text-amber-900">
        <AlertDescription className="text-inherit">
          Changing this address changes each integration's OAuth redirect URI.
          Update the authorized redirect URI in the provider's console to match
          before reconnecting, or connecting will fail.
        </AlertDescription>
      </Alert>
      <Button type="submit" disabled={save.isPending} className="self-start">
        {save.isPending ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : null}
        Save address
      </Button>
      {save.error !== null ? (
        <p role="status" className="text-sm text-destructive">
          {readableError(save.error)}
        </p>
      ) : null}
      {save.isSuccess && save.error === null ? (
        <p role="status" className="text-sm text-muted-foreground">
          Server address saved.
        </p>
      ) : null}
    </form>
  );
};

const ServerAddressSection = (): ReactElement => {
  const api = useApi();
  const address = useQuery({
    queryKey: ["base-url"],
    queryFn: () => api.baseUrl(),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2 className="text-sm">Server address</h2>
        </CardTitle>
        <CardDescription>
          The public address this Halero instance is reached at. It decides
          which browser origins may make changes and each integration's OAuth
          redirect URI.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {address.data === undefined ? (
          <Loader2
            aria-hidden="true"
            className="size-4 animate-spin text-muted-foreground"
          />
        ) : (
          <ServerAddressForm
            savedUrl={address.data.url}
            onSaved={() => {
              void address.refetch();
            }}
          />
        )}
      </CardContent>
    </Card>
  );
};

const sectionBody = (props: SettingsScreenProps): ReactElement => {
  switch (props.section) {
    case "profile":
      return <ProfileSection />;
    case "notifications":
      return <NotificationsSection />;
    case "tokens":
      return <ApiTokensSection />;
    case "server":
      return <ServerAddressSection />;
    case "integrations":
      return (
        <IntegrationsSection
          connected={props.connected}
          errorCode={props.errorCode}
          errorConnector={props.errorConnector}
        />
      );
  }
};

export const SettingsScreen = (props: SettingsScreenProps): ReactElement => (
  <div className="mx-auto flex w-full max-w-4xl gap-8 px-6 py-8">
    <nav className="w-44 shrink-0">
      <h1 className="mb-3 text-lg font-semibold tracking-tight">Settings</h1>
      <ul className="flex flex-col gap-0.5">
        {NAV.map((item) => (
          <li key={item.section}>
            <Link
              to="/settings/$section"
              params={{ section: item.section }}
              className={`block rounded-md px-2.5 py-1.5 text-sm ${
                item.section === props.section
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/60"
              }`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
    <div className="min-w-0 flex-1">{sectionBody(props)}</div>
  </div>
);
