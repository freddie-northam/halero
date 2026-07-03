import {
  Button,
  Input,
  Label,
  Loader2,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@halero/ui";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, type ReactElement, useState } from "react";
import { authFieldClassName } from "../components/auth-field";
import { PasswordInput } from "../components/password-input";
import type { SetupInput } from "../lib/api";
import { useApi } from "../lib/api-context";
import { readableError } from "../lib/errors";
import { AuthLayout } from "./auth-layout";

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
    <AuthLayout subtitle="Create a password to claim this instance.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <PasswordInput
          id="password"
          label="Password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <PasswordInput
          id="confirm-password"
          label="Confirm password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="home-timezone" className="text-[13px]">
            Home timezone
          </Label>
          <Select value={homeTimezone} onValueChange={setHomeTimezone}>
            <SelectTrigger
              id="home-timezone"
              className={`w-full ${authFieldClassName}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {listTimezones(homeTimezone).map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="link"
          size="sm"
          aria-expanded={showBaseUrl}
          onClick={() => setShowBaseUrl((value) => !value)}
          className="h-auto self-start p-0 text-xs text-muted-foreground"
        >
          Hosting behind a domain?
        </Button>
        {showBaseUrl ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="base-url" className="text-[13px]">
              Base URL
            </Label>
            <Input
              id="base-url"
              type="url"
              placeholder="https://halero.example.com"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              className={authFieldClassName}
            />
          </div>
        ) : null}
        {error === null ? null : (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <Button
          type="submit"
          disabled={setup.isPending}
          className="mt-2 h-11 w-full rounded-lg bg-foreground text-[15px] text-background hover:bg-foreground/90"
        >
          {setup.isPending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : null}
          Finish setup
        </Button>
      </form>
    </AuthLayout>
  );
};
