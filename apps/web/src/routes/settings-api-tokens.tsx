// The Settings "API tokens" card: mint, list, revoke. Show-once is the
// rule that shapes this file: the plaintext token lives only in local
// state fed by the create response, and it disappears on navigation or
// when a new token is minted over it.

import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
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
import { type FormEvent, type ReactElement, useState } from "react";
import { CopyField } from "../components/copy-field";
import type { ApiTokenSummary, CreatedApiToken } from "../lib/api";
import { useApi } from "../lib/api-context";
import { readableError } from "../lib/errors";
import { relativeTimeText } from "../lib/relative-time";

const TOKEN_WARNING =
  "A token has the same power as your password session, including data " +
  "export. Treat it like a password.";

const ShowOnceToken = ({
  created,
}: {
  readonly created: CreatedApiToken;
}): ReactElement => (
  <div className="flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 p-3">
    <p className="text-sm font-medium">Token created: {created.name}</p>
    <CopyField value={created.token} />
    <p className="mt-1 text-sm text-amber-900">
      This is the only time the token is shown.
    </p>
  </div>
);

const MintForm = ({
  onCreated,
}: {
  readonly onCreated: (created: CreatedApiToken) => void;
}): ReactElement => {
  const api = useApi();
  const create = useMutation({
    mutationFn: (name: string) => api.createApiToken(name),
    onSuccess: onCreated,
  });
  // Uncontrolled on purpose: the name only matters at submit.
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (create.isPending) {
      return;
    }
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    create.mutate(name, { onSuccess: () => form.reset() });
  };
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor="api-token-name">Token name</Label>
          <Input
            id="api-token-name"
            name="name"
            autoComplete="off"
            placeholder="Raycast on my laptop"
          />
        </div>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : null}
          Create token
        </Button>
      </div>
      {create.error === null ? null : (
        <p role="status" className="text-sm text-destructive">
          {readableError(create.error)}
        </p>
      )}
    </form>
  );
};

const tokenMetaText = (token: ApiTokenSummary, now: number): string => {
  const lastUsed =
    token.lastUsedAt === null
      ? "Never"
      : relativeTimeText(token.lastUsedAt, now);
  return `Created ${relativeTimeText(token.createdAt, now)} · Last used ${lastUsed}`;
};

const TokenRow = ({
  token,
  onChanged,
}: {
  readonly token: ApiTokenSummary;
  readonly onChanged: () => void;
}): ReactElement => {
  const api = useApi();
  const revoke = useMutation({
    mutationFn: () => api.revokeApiToken(token.id),
    onSuccess: onChanged,
  });
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {token.name}
        </span>
        {token.revokedAt === null ? (
          <Button
            variant="outline"
            size="sm"
            aria-label={`Revoke token: ${token.name}`}
            disabled={revoke.isPending}
            onClick={() => revoke.mutate()}
          >
            {revoke.isPending ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : null}
            {revoke.isPending ? "Revoking" : "Revoke"}
          </Button>
        ) : (
          <Badge variant="secondary" className="bg-stone-100 text-stone-700">
            Revoked
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {tokenMetaText(token, Date.now())}
      </p>
      {revoke.error === null ? null : (
        <p role="status" className="text-xs text-destructive">
          {readableError(revoke.error)}
        </p>
      )}
    </li>
  );
};

const TokenList = ({
  data,
  error,
  onChanged,
}: {
  readonly data: readonly ApiTokenSummary[] | undefined;
  readonly error: unknown;
  readonly onChanged: () => void;
}): ReactElement => {
  if (data === undefined) {
    if (error !== null && error !== undefined) {
      return (
        <Alert variant="destructive">
          <AlertDescription>{readableError(error)}</AlertDescription>
        </Alert>
      );
    }
    return (
      <Loader2
        aria-hidden="true"
        className="size-4 animate-spin text-muted-foreground"
      />
    );
  }
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No API tokens yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {data.map((token) => (
        <TokenRow key={token.id} token={token} onChanged={onChanged} />
      ))}
    </ul>
  );
};

export const ApiTokensSection = (): ReactElement => {
  const api = useApi();
  // Local state only: the plaintext is never cached, stored, or logged,
  // so leaving the page (or minting again) discards it for good.
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const tokens = useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => api.listApiTokens(),
  });
  const refresh = (): void => {
    void tokens.refetch();
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2 className="text-sm">API tokens</h2>
        </CardTitle>
        <CardDescription>
          Tokens let tools like the Raycast extension use this Halero instance
          without your password.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertDescription className="text-inherit">
            {TOKEN_WARNING}
          </AlertDescription>
        </Alert>
        <MintForm
          onCreated={(token) => {
            setCreated(token);
            refresh();
          }}
        />
        {created === null ? null : <ShowOnceToken created={created} />}
        <Separator />
        <TokenList
          data={tokens.data}
          error={tokens.error}
          onChanged={refresh}
        />
      </CardContent>
    </Card>
  );
};
