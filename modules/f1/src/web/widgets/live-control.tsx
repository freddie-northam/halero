// The live-control widget: a small status card for the OpenF1 live-timing
// connection. Disconnected, it offers a Connect button that opens a dialog
// asking for the user's OpenF1 account (the paid live tier); connected, it
// shows a Connected pill and a Disconnect button. The dialog and its
// connect mutation are exported (LiveConnectDialog / useLiveConnect) so the
// timing tower's own "connect" call-to-action reuses the exact same flow.

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from "@halero/ui";
import {
  type UseMutationResult,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import { type ReactElement, type ReactNode, useEffect, useState } from "react";
import type { F1Api } from "../api";
import { f1LiveLeafKey } from "../queries";
import { readableError } from "../readable-error";
import { WidgetEmpty, WidgetError, WidgetSkeleton } from "../widget-chrome";

type ConnectResult = { readonly connected: true };
type ConnectInput = { readonly username: string; readonly password: string };

/**
 * The connect mutation, shared by the control card and the tower's CTA. It
 * calls the (already invalidation-wrapped) live.connect seam, so a success
 * refreshes every live query without this hook knowing the cache shape.
 */
export const useLiveConnect = (
  api: F1Api,
  onConnected?: () => void,
): UseMutationResult<ConnectResult, unknown, ConnectInput> =>
  useMutation({
    mutationFn: (input: ConnectInput) => api.live.connect(input),
    onSuccess: () => onConnected?.(),
  });

/**
 * The connect dialog: username + password fields that store the user's
 * OpenF1 live-timing credential. Owns its own open and field state and
 * closes on a successful connect; the caller supplies only the trigger.
 */
export const LiveConnectDialog = ({
  api,
  trigger,
}: {
  readonly api: F1Api;
  readonly trigger: ReactNode;
}): ReactElement => {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const connect = useLiveConnect(api, () => setOpen(false));

  // Clear the fields and any prior error each time the dialog reopens, so a
  // cancelled attempt never leaks into the next one.
  useEffect(() => {
    if (open) {
      setUsername("");
      setPassword("");
      connect.reset();
    }
  }, [open, connect.reset]);

  const submit = (): void => {
    if (username.trim() === "" || password === "") {
      return;
    }
    connect.mutate({ username: username.trim(), password });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Connect live timing</DialogTitle>
          <DialogDescription>
            Sign in with your OpenF1 account for the paid live tier. The free
            schedule and results need no login.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="live-username">OpenF1 username</Label>
            <Input
              id="live-username"
              value={username}
              autoFocus
              autoComplete="username"
              placeholder="you@example.com"
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="live-password">Password</Label>
            <Input
              id="live-password"
              type="password"
              value={password}
              autoComplete="current-password"
              placeholder="Password"
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          </div>
        </div>
        {connect.error === null || connect.error === undefined ? null : (
          <p className="text-sm text-destructive">
            {readableError(connect.error)}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              connect.isPending || username.trim() === "" || password === ""
            }
            onClick={submit}
          >
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ConnectedState = ({ api }: { readonly api: F1Api }): ReactElement => {
  const disconnect = useMutation({
    mutationFn: () => api.live.disconnect(),
  });
  return (
    <div className="flex h-full min-h-24 flex-col items-center justify-center gap-3 px-2 text-center">
      <Badge className="border-transparent bg-[#43B02A] text-white">
        Connected
      </Badge>
      <p className="text-sm text-muted-foreground">
        Your OpenF1 account is linked. Live timing updates automatically.
      </p>
      {disconnect.error === null || disconnect.error === undefined ? null : (
        <p className="text-sm text-destructive">
          {readableError(disconnect.error)}
        </p>
      )}
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
  );
};

const DisconnectedState = ({ api }: { readonly api: F1Api }): ReactElement => (
  <WidgetEmpty
    message="Connect your OpenF1 account to see live timing."
    action={
      <LiveConnectDialog
        api={api}
        trigger={
          <Button type="button" size="sm">
            Connect
          </Button>
        }
      />
    }
  />
);

export const LiveControlWidget = ({
  api,
}: {
  readonly api: F1Api;
  readonly config: Record<string, unknown>;
}): ReactElement => {
  const query = useQuery({
    queryKey: f1LiveLeafKey("status"),
    queryFn: () => api.live.status(),
  });

  if (query.error !== null) {
    return <WidgetError message={readableError(query.error)} />;
  }
  const status = query.data;
  if (status === undefined) {
    return <WidgetSkeleton rows={3} />;
  }
  return status.connected ? (
    <ConnectedState api={api} />
  ) : (
    <DisconnectedState api={api} />
  );
};
