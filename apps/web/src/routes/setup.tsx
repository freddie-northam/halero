import { Button, FormError, Spinner, TextField } from "@halero/ui";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, type ReactElement, useState } from "react";
import type { SetupInput } from "../lib/api";
import { useApi } from "../lib/api-context";
import { readableError } from "../lib/errors";

export interface SetupScreenProps {
  readonly onSuccess: () => void;
}

const detectTimezone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

const listTimezones = (detected: string): readonly string[] => {
  const zones = Intl.supportedValuesOf("timeZone");
  return zones.includes(detected) ? zones : [detected, ...zones];
};

const validate = (
  password: string,
  confirm: string,
  baseUrl: string,
): string | null => {
  if (password.length < 8) {
    return "Your password must be at least 8 characters long.";
  }
  if (password !== confirm) {
    return "The two passwords do not match.";
  }
  if (baseUrl !== "" && !URL.canParse(baseUrl)) {
    return 'Base URL must be a full URL, like "https://halero.example.com".';
  }
  return null;
};

export const SetupScreen = ({ onSuccess }: SetupScreenProps): ReactElement => {
  const api = useApi();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [homeTimezone, setHomeTimezone] = useState(detectTimezone);
  const [showBaseUrl, setShowBaseUrl] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const setup = useMutation({
    mutationFn: (input: SetupInput) => api.setup(input),
    onSuccess,
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (setup.isPending) {
      return;
    }
    const trimmedBaseUrl = baseUrl.trim();
    const problem = validate(password, confirm, trimmedBaseUrl);
    setValidationError(problem);
    if (problem !== null) {
      return;
    }
    setup.mutate({
      password,
      homeTimezone,
      baseUrl: trimmedBaseUrl === "" ? undefined : trimmedBaseUrl,
    });
  };

  const error =
    validationError ??
    (setup.error === null ? null : readableError(setup.error));

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-panel border border-border bg-surface p-6"
      >
        <h1 className="text-lg font-semibold tracking-tight">
          Welcome to Halero
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Claim this instance by choosing a password.
        </p>
        <div className="mt-5 flex flex-col gap-4">
          <TextField
            id="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <TextField
            id="confirm-password"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label
              htmlFor="home-timezone"
              className="text-xs font-medium text-text-muted"
            >
              Home timezone
            </label>
            <select
              id="home-timezone"
              value={homeTimezone}
              onChange={(event) => setHomeTimezone(event.target.value)}
              className="h-8 rounded-control border border-border bg-surface px-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
            >
              {listTimezones(homeTimezone).map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            aria-expanded={showBaseUrl}
            onClick={() => setShowBaseUrl((value) => !value)}
            className="self-start rounded-control text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            Hosting behind a domain?
          </button>
          {showBaseUrl ? (
            <TextField
              id="base-url"
              label="Base URL"
              type="url"
              placeholder="https://halero.example.com"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          ) : null}
          {error === null ? null : <FormError>{error}</FormError>}
          <Button type="submit" variant="primary" disabled={setup.isPending}>
            {setup.isPending ? (
              <Spinner className="border-white/40 border-t-white" />
            ) : null}
            Finish setup
          </Button>
        </div>
      </form>
    </div>
  );
};
