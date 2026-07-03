import { Button, Loader2 } from "@halero/ui";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, type ReactElement, useState } from "react";
import { PasswordInput } from "../components/password-input";
import { useApi } from "../lib/api-context";
import { readableError } from "../lib/errors";
import { AuthLayout } from "./auth-layout";

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
    <AuthLayout
      title="Welcome back"
      subtitle="Enter your password to continue."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <PasswordInput
          id="password"
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {login.error === null ? null : (
          <p className="text-sm text-destructive">
            {readableError(login.error)}
          </p>
        )}
        <Button type="submit" disabled={login.isPending} className="w-full">
          {login.isPending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : null}
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
};
