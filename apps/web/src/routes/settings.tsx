import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Loader2,
  Separator,
} from "@halero/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  type FormEvent,
  type ReactElement,
  type ReactNode,
  useState,
} from "react";
import type {
  GoogleConnection,
  GoogleStatus,
  SaveGoogleClientInput,
  SyncNowResult,
} from "../lib/api";
import { useApi } from "../lib/api-context";
import { readableError } from "../lib/errors";

export interface SettingsScreenProps {
  readonly connected: boolean;
  readonly errorCode: string | null;
}

// Short codes arrive from the OAuth callback redirect; they never carry
// token material. Each one maps to guidance a person can act on.
const CALLBACK_ERRORS: Record<string, string> = {
  google_denied:
    "Google reported that access was declined. If that was unintended, try connecting again.",
  missing_code:
    "Google sent back an incomplete response. Start the connection again from this page.",
  state_invalid:
    "That connection attempt expired or was already used. Start it again from this page.",
  client_not_configured:
    "The saved Google client details went missing partway through. Save them again below, then reconnect.",
  token_exchange_failed:
    "Google rejected the connection attempt. Check that the client ID, client secret, and redirect URI in Google Cloud match exactly, then try again.",
  no_refresh_token:
    "Google signed you in but did not grant offline access, which syncing needs. Try connecting again and accept the consent screen fully.",
  identity_missing:
    "Google did not say which account was connected. Try connecting again.",
};

const callbackErrorMessage = (code: string): string =>
  CALLBACK_ERRORS[code] ?? "Connecting to Google failed. Please try again.";

type BannerTone = "success" | "error";

const BANNER_CLASSES: Record<BannerTone, string> = {
  success: "border-emerald-300 bg-emerald-50 text-emerald-900",
  error: "border-red-300 bg-red-50 text-red-900",
};

// Banners announce politely (role=status), unlike Alert's default
// interrupting role=alert; the OAuth redirect already moved focus.
const Banner = ({
  tone,
  children,
}: {
  readonly tone: BannerTone;
  readonly children: ReactNode;
}): ReactElement => (
  <Alert role="status" className={`mt-4 ${BANNER_CLASSES[tone]}`}>
    <AlertDescription className="text-inherit">{children}</AlertDescription>
  </Alert>
);

const LinkButton = ({
  href,
  children,
}: {
  readonly href: string;
  readonly children: ReactNode;
}): ReactElement => (
  <Button asChild>
    <a href={href}>{children}</a>
  </Button>
);

const HttpsGatePanel = (): ReactElement => (
  <Card className="border-amber-300 bg-amber-50">
    <CardHeader>
      <CardTitle asChild>
        <h2 className="text-sm">Google Calendar needs an HTTPS address</h2>
      </CardTitle>
    </CardHeader>
    <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
      <p>
        This Halero instance is reachable over plain http at an address that is
        not localhost. Google refuses OAuth redirect URIs like that, so the
        connection would fail partway through. Pick one of these, then come
        back:
      </p>
      <ul className="flex list-disc flex-col gap-1.5 pl-5">
        <li>
          Serve Halero over HTTPS on a domain you own. A reverse proxy such as
          Caddy or nginx can handle the certificate for you.
        </li>
        <li>
          Use Tailscale Serve, which gives this machine a trusted HTTPS address
          inside your tailnet with one command.
        </li>
        <li>
          Run Halero on the computer you browse from and open it at
          http://localhost, which Google does allow without HTTPS.
        </li>
      </ul>
      <p>
        Once the address has changed, update Halero's base URL and reload this
        page.
      </p>
    </CardContent>
  </Card>
);

const CopyField = ({ value }: { readonly value: string }): ReactElement => {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    const clipboard: Clipboard | undefined = navigator.clipboard;
    if (clipboard === undefined) {
      return;
    }
    void clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <span className="mt-2 flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1.5 text-xs">
        {value}
      </code>
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </span>
  );
};

const ProductionStatusNote = (): ReactElement => (
  <span className="mt-2 block rounded-md border border-amber-300 bg-amber-50 p-3">
    <span className="block font-medium">
      Set the publishing status to "In production": on the consent screen page,
      click "Publish app".
    </span>
    <span className="mt-1 block text-muted-foreground">
      This step is easy to skip and it matters. While an app stays in Testing,
      Google expires its sign-ins after 7 days and syncing silently stops.
      Publishing needs no review from Google for personal use.
    </span>
    <span className="mt-1 block text-muted-foreground">
      Because your app is unverified, Google shows a one-time "Google hasn't
      verified this app" screen when you connect. That is expected for a
      personal app: click "Advanced", then "Go to (your app's name)" to
      continue.
    </span>
  </span>
);

const GoogleSetupGuide = ({
  redirectUri,
}: {
  readonly redirectUri: string;
}): ReactElement => (
  <Card>
    <CardHeader>
      <CardTitle asChild>
        <h2 className="text-sm">Connect Google Calendar</h2>
      </CardTitle>
      <CardDescription>
        Halero never ships a shared Google app. You create your own free OAuth
        client instead, so your calendar data only ever flows between Google and
        this instance. The steps take about ten minutes, once.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
        <li>
          Create a Google Cloud project: open console.cloud.google.com, click
          the project picker in the top bar, then "New project". Any name works.
        </li>
        <li>
          Enable the Calendar API: in the left menu choose "APIs &amp;
          Services", then "Library", search for "Google Calendar API" and click
          Enable.
        </li>
        <li>
          Configure the consent screen: under "APIs &amp; Services" choose
          "OAuth consent screen", pick the External user type, and fill in the
          app name and your email address.
          <ProductionStatusNote />
        </li>
        <li>
          Create the OAuth client: under "APIs &amp; Services" choose
          "Credentials", then "Create credentials", then "OAuth client ID". Pick
          the application type "Web application". Under "Authorized redirect
          URIs" add exactly this address:
          <CopyField value={redirectUri} />
        </li>
        <li>
          Copy the client ID and client secret Google shows you into the form
          below.
        </li>
      </ol>
    </CardContent>
  </Card>
);

const ClientForm = ({
  onSaved,
}: {
  readonly onSaved: () => void;
}): ReactElement => {
  const api = useApi();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const save = useMutation({
    mutationFn: (input: SaveGoogleClientInput) => api.saveGoogleClient(input),
    onSuccess: onSaved,
  });
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (save.isPending) {
      return;
    }
    save.mutate({
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
    });
  };
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle asChild>
          <h2 className="text-sm">OAuth client details</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="google-client-id">Client ID</Label>
            <Input
              id="google-client-id"
              required
              autoComplete="off"
              placeholder="1234567890-abc.apps.googleusercontent.com"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="google-client-secret">Client secret</Label>
            <Input
              id="google-client-secret"
              type="password"
              required
              autoComplete="off"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
            />
          </div>
          {save.error === null ? null : (
            <Alert variant="destructive">
              <AlertDescription>{readableError(save.error)}</AlertDescription>
            </Alert>
          )}
          <Button
            type="submit"
            disabled={save.isPending}
            className="self-start"
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : null}
            Save client
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

const ConnectCard = (): ReactElement => (
  <Card>
    <CardHeader>
      <CardTitle asChild>
        <h2 className="text-sm">Ready to connect</h2>
      </CardTitle>
      <CardDescription>
        Your Google OAuth client is saved. Connecting opens Google's sign-in
        page. Because the app is your own and unverified, Google shows a
        one-time "Google hasn't verified this app" screen: click "Advanced",
        then continue. That is expected.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <LinkButton href="/api/oauth/google/start">
        Connect Google Calendar
      </LinkButton>
    </CardContent>
  </Card>
);

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-100 text-emerald-800" },
  reauth_required: {
    label: "Needs reconnect",
    className: "bg-amber-100 text-amber-800",
  },
  error: { label: "Error", className: "bg-red-100 text-red-700" },
};

const SyncOutcome = ({
  result,
  mutationError,
}: {
  readonly result: SyncNowResult | undefined;
  readonly mutationError: unknown;
}): ReactElement | null => {
  if (mutationError !== null && mutationError !== undefined) {
    return (
      <p role="status" className="text-sm text-destructive">
        {readableError(mutationError)}
      </p>
    );
  }
  if (result === undefined) {
    return null;
  }
  if (result.status === "success") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Synced: {result.upserts} updated, {result.deletes} removed
      </p>
    );
  }
  return (
    <p role="status" className="text-sm text-destructive">
      {result.error ?? "Syncing failed. Please try again."}
    </p>
  );
};

const SyncControls = ({
  onSynced,
}: {
  readonly onSynced: () => void;
}): ReactElement => {
  const api = useApi();
  const sync = useMutation({
    mutationFn: () => api.syncGoogleNow(),
    // Refetch the connection either way: a failed run can flip the
    // status to reauth_required, which swaps in the Reconnect prompt.
    onSettled: onSynced,
  });
  return (
    <div className="flex flex-col gap-3">
      <Separator />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
        >
          {sync.isPending ? <Loader2 className="animate-spin" /> : null}
          {sync.isPending ? "Syncing" : "Sync now"}
        </Button>
        {sync.isPending ? null : (
          <SyncOutcome result={sync.data} mutationError={sync.error} />
        )}
      </div>
    </div>
  );
};

const ConnectionCard = ({
  connection,
  onChanged,
}: {
  readonly connection: GoogleConnection;
  readonly onChanged: () => void;
}): ReactElement => {
  const badge = STATUS_BADGES[connection.status] ?? {
    label: connection.status,
    className: "bg-stone-100 text-stone-700",
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2 className="text-sm">Google Calendar</h2>
        </CardTitle>
        <CardDescription className="truncate">
          {connection.email ?? "Connected account"}
        </CardDescription>
        <CardAction>
          <Badge variant="secondary" className={badge.className}>
            {badge.label}
          </Badge>
        </CardAction>
      </CardHeader>
      {connection.status === "reauth_required" ? (
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Google needs you to sign in again before syncing can continue.
          </p>
          <div>
            <LinkButton href="/api/oauth/google/start">Reconnect</LinkButton>
          </div>
        </CardContent>
      ) : null}
      {connection.status === "error" && connection.lastError !== null ? (
        <CardContent>
          <p className="text-sm text-destructive">{connection.lastError}</p>
        </CardContent>
      ) : null}
      {connection.status === "active" ? (
        <CardContent>
          <SyncControls onSynced={onChanged} />
        </CardContent>
      ) : null}
    </Card>
  );
};

const GoogleSection = ({
  status,
  onChanged,
}: {
  readonly status: GoogleStatus;
  readonly onChanged: () => void;
}): ReactElement => {
  if (status.connection !== null) {
    return (
      <ConnectionCard connection={status.connection} onChanged={onChanged} />
    );
  }
  if (!status.httpsOk) {
    return <HttpsGatePanel />;
  }
  if (status.clientConfigured) {
    return <ConnectCard />;
  }
  return (
    <>
      <GoogleSetupGuide redirectUri={status.redirectUri} />
      <ClientForm onSaved={onChanged} />
    </>
  );
};

export const SettingsScreen = ({
  connected,
  errorCode,
}: SettingsScreenProps): ReactElement => {
  const api = useApi();
  const status = useQuery({
    queryKey: ["google-status"],
    queryFn: () => api.googleStatus(),
  });

  const body = (): ReactElement => {
    if (status.data !== undefined) {
      return (
        <GoogleSection
          status={status.data}
          onChanged={() => {
            void status.refetch();
          }}
        />
      );
    }
    if (status.error !== null) {
      return (
        <Alert variant="destructive">
          <AlertDescription>{readableError(status.error)}</AlertDescription>
        </Alert>
      );
    }
    return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect Google Calendar to bring your events into Halero.
      </p>
      {connected ? (
        <Banner tone="success">Google Calendar is connected.</Banner>
      ) : null}
      {errorCode === null ? null : (
        <Banner tone="error">{callbackErrorMessage(errorCode)}</Banner>
      )}
      <div className="mt-6">{body()}</div>
    </div>
  );
};
