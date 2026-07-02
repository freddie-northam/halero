import { Button, FormError, Spinner, TextField } from "@halero/ui";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, type ReactElement, useState } from "react";
import { useApi } from "../lib/api-context";
import { readableError } from "../lib/errors";

export interface LoginScreenProps {
  readonly onSuccess: () => void;
}

export const LoginScreen = ({ onSuccess }: LoginScreenProps): ReactElement => {
  const api = useApi();
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: (value: string) => api.login(value),
    onSuccess,
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (login.isPending) {
      return;
    }
    login.mutate(password);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xs rounded-panel border border-border bg-surface p-6"
      >
        <h1 className="text-lg font-semibold tracking-tight">Halero</h1>
        <p className="mt-1 text-sm text-text-muted">Sign in to continue.</p>
        <div className="mt-5 flex flex-col gap-4">
          <TextField
            id="password"
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {login.error === null ? null : (
            <FormError>{readableError(login.error)}</FormError>
          )}
          <Button type="submit" variant="primary" disabled={login.isPending}>
            {login.isPending ? (
              <Spinner className="border-white/40 border-t-white" />
            ) : null}
            Sign in
          </Button>
        </div>
      </form>
    </div>
  );
};
