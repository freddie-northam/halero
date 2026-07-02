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
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-xs p-6">
        <CardHeader className="p-0">
          <CardTitle asChild>
            <h1 className="text-lg tracking-tight">Halero</h1>
          </CardTitle>
          <CardDescription>Sign in to continue.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {login.error === null ? null : (
              <Alert variant="destructive">
                <AlertDescription>
                  {readableError(login.error)}
                </AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={login.isPending}>
              {login.isPending ? <Loader2 className="animate-spin" /> : null}
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
