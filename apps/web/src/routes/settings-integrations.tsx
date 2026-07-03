import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Check,
  ConnectorLogo,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ExternalLink,
  Input,
  InterestedAvatars,
  Label,
  Loader2,
  Search,
} from "@halero/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactElement, useState } from "react";
import { CopyField } from "../components/copy-field";
import type { ConnectionCatalogItem } from "../lib/api";
import { useApi } from "../lib/api-context";
import { readableError } from "../lib/errors";

const CATALOG_KEY = ["connections", "catalog"] as const;

const CALLBACK_ERRORS: Record<string, string> = {
  provider_denied: "The provider cancelled the connection. Try again.",
  missing_code: "The provider did not return an authorization code.",
  state_invalid: "The sign-in link expired. Start the connection again.",
  client_unreadable:
    "The saved OAuth client secret could not be read. Enter it again.",
  client_not_configured: "Add the OAuth client ID and secret, then connect.",
  token_exchange_failed:
    "The provider rejected the connection. Check the client ID and secret.",
  no_refresh_token:
    "The provider did not return a refresh token. Reconnect and grant offline access.",
  identity_missing: "The provider did not return an account identity.",
  unknown_connector: "That integration is not part of this Halero build.",
};

const callbackMessage = (code: string): string =>
  CALLBACK_ERRORS[code] ?? "The connection could not be completed.";

export interface IntegrationsSectionProps {
  readonly connected: boolean;
  readonly errorCode: string | null;
  readonly errorConnector: string | null;
}

export const IntegrationsSection = ({
  connected,
  errorCode,
}: IntegrationsSectionProps): ReactElement => {
  const api = useApi();
  const [search, setSearch] = useState("");
  const catalog = useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => api.connectionsCatalog(),
  });

  const query = search.trim().toLowerCase();
  const items = (catalog.data ?? []).filter((item) =>
    query === "" ? true : item.displayName.toLowerCase().includes(query),
  );
  const live = items.filter((item) => item.implemented);
  const soon = items.filter((item) => !item.implemented);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Integrations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect the tools you use so their activity flows into Halero.
        </p>
      </div>

      {connected ? (
        <Alert className="border-emerald-300 bg-emerald-50 text-emerald-900">
          <AlertDescription className="text-inherit">
            Connected. Your integration is ready.
          </AlertDescription>
        </Alert>
      ) : null}
      {errorCode === null ? null : (
        <Alert variant="destructive">
          <AlertDescription>{callbackMessage(errorCode)}</AlertDescription>
        </Alert>
      )}

      <div className="relative">
        <Search
          aria-hidden="true"
          className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search integrations"
          className="pl-8"
          aria-label="Search integrations"
        />
      </div>

      {catalog.data === undefined ? (
        <Loader2
          aria-hidden="true"
          className="size-4 animate-spin text-muted-foreground"
        />
      ) : (
        <>
          {live.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {live.map((item) => (
                <ConnectionCard key={item.id} item={item} />
              ))}
            </div>
          ) : null}
          {soon.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Coming soon
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {soon.map((item) => (
                  <ComingSoonCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

const CardShell = ({
  item,
  action,
  muted = false,
}: {
  readonly item: ConnectionCatalogItem;
  readonly action: ReactElement;
  readonly muted?: boolean;
}): ReactElement => (
  <div
    className={`flex flex-col gap-3 rounded-lg border p-4 ${
      muted ? "opacity-70" : "bg-card"
    }`}
  >
    <div className="flex items-start gap-3">
      <ConnectorLogo iconId={item.iconId} size={32} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.displayName}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {item.description}
        </p>
      </div>
    </div>
    <div className="mt-auto">{action}</div>
  </div>
);

const ComingSoonCard = ({
  item,
}: {
  readonly item: ConnectionCatalogItem;
}): ReactElement => (
  <CardShell
    item={item}
    muted
    action={
      <div className="flex items-center justify-between">
        <InterestedAvatars />
        <Badge variant="secondary">Coming soon</Badge>
      </div>
    }
  />
);

const ConnectionCard = ({
  item,
}: {
  readonly item: ConnectionCatalogItem;
}): ReactElement => {
  const api = useApi();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: CATALOG_KEY });
  };
  const disconnect = useMutation({
    mutationFn: () => api.disconnectConnection(item.id),
    onSuccess: invalidate,
  });
  const connectLocal = useMutation({
    mutationFn: () => api.connectLocal(item.id),
    onSuccess: invalidate,
  });

  if (item.connection !== null) {
    return (
      <CardShell
        item={item}
        action={
          <div className="flex items-center justify-between gap-2">
            <Badge className="border-emerald-300 bg-emerald-100 text-emerald-800">
              <Check aria-hidden="true" /> Connected
            </Badge>
            <div className="flex items-center gap-2">
              {item.connection.accountLabel !== null ? (
                <span className="truncate text-xs text-muted-foreground">
                  {item.connection.accountLabel}
                </span>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disconnect.isPending}
                onClick={() => disconnect.mutate()}
              >
                Disconnect
              </Button>
            </div>
          </div>
        }
      />
    );
  }

  // A local source (authKind "none") has nothing to enter, so Connect just
  // enables it; apiKey and oauth2 open a dialog.
  const onConnect = (): void => {
    if (item.authKind === "none") {
      connectLocal.mutate();
      return;
    }
    setDialogOpen(true);
  };

  return (
    <>
      <CardShell
        item={item}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={connectLocal.isPending}
            onClick={onConnect}
          >
            {connectLocal.isPending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : null}
            Connect
          </Button>
        }
      />
      {item.authKind === "none" ? null : (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            {item.authKind === "apiKey" ? (
              <ApiKeyConnect
                item={item}
                onDone={() => {
                  setDialogOpen(false);
                  invalidate();
                }}
              />
            ) : (
              <OauthConnect item={item} />
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

const ApiKeyConnect = ({
  item,
  onDone,
}: {
  readonly item: ConnectionCatalogItem;
  readonly onDone: () => void;
}): ReactElement => {
  const api = useApi();
  const [token, setToken] = useState("");
  const connect = useMutation({
    mutationFn: () => api.connectApiKey(item.id, token.trim()),
    onSuccess: onDone,
  });
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (connect.isPending || token.trim() === "") {
      return;
    }
    connect.mutate();
  };
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Connect {item.displayName}</DialogTitle>
        <DialogDescription>
          Paste a {item.displayName} personal access token. For GitHub, create
          one with the read:user scope (and enable private contributions to
          include private activity).
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="apikey-token">Access token</Label>
        <Input
          id="apikey-token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="ghp_..."
        />
      </div>
      {connect.error !== null ? (
        <Alert variant="destructive">
          <AlertDescription>{readableError(connect.error)}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        type="submit"
        disabled={connect.isPending || token.trim() === ""}
        className="self-start"
      >
        {connect.isPending ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : null}
        Connect
      </Button>
    </form>
  );
};

const OauthConnect = ({
  item,
}: {
  readonly item: ConnectionCatalogItem;
}): ReactElement => {
  const api = useApi();
  const config = useQuery({
    queryKey: ["connections", "oauth-config", item.id],
    queryFn: () => api.connectionOauthConfig(item.id),
  });
  if (config.data === undefined) {
    return (
      <Loader2
        aria-hidden="true"
        className="size-4 animate-spin text-muted-foreground"
      />
    );
  }
  if (!config.data.httpsOk) {
    return (
      <div className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>Connect {item.displayName}</DialogTitle>
        </DialogHeader>
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertDescription className="text-inherit">
            {item.displayName} needs an HTTPS server address for its OAuth
            redirect. Set an HTTPS address under Server address, or open Halero
            at http://localhost.
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!config.data.clientConfigured) {
    return (
      <OauthClientForm item={item} redirectUri={config.data.redirectUri} />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Connect {item.displayName}</DialogTitle>
        <DialogDescription>
          You will be redirected to {item.displayName} to authorize Halero.
        </DialogDescription>
      </DialogHeader>
      <Button asChild className="self-start">
        <a href={`/api/oauth/${item.id}/start`}>
          <ExternalLink aria-hidden="true" /> Continue to {item.displayName}
        </a>
      </Button>
    </div>
  );
};

const OauthClientForm = ({
  item,
  redirectUri,
}: {
  readonly item: ConnectionCatalogItem;
  readonly redirectUri: string;
}): ReactElement => {
  const api = useApi();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (input: { clientId: string; clientSecret: string }) =>
      api.saveOauthClient(item.id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["connections", "oauth-config", item.id],
      });
    },
  });
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (save.isPending) {
      return;
    }
    const form = new FormData(event.currentTarget);
    save.mutate({
      clientId: String(form.get("clientId") ?? "").trim(),
      clientSecret: String(form.get("clientSecret") ?? "").trim(),
    });
  };
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Set up {item.displayName}</DialogTitle>
        <DialogDescription>
          Register an OAuth client with {item.displayName} using the redirect
          URI below, then paste its client ID and secret.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label>Authorized redirect URI</Label>
        <CopyField value={redirectUri} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="oauth-client-id">Client ID</Label>
        <Input id="oauth-client-id" name="clientId" autoComplete="off" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="oauth-client-secret">Client secret</Label>
        <Input
          id="oauth-client-secret"
          name="clientSecret"
          type="password"
          autoComplete="off"
        />
      </div>
      {save.error !== null ? (
        <Alert variant="destructive">
          <AlertDescription>{readableError(save.error)}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={save.isPending} className="self-start">
        {save.isPending ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : null}
        Save and continue
      </Button>
    </form>
  );
};
