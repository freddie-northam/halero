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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@halero/ui";
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
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-sm p-6">
        <CardHeader className="p-0">
          <CardTitle asChild>
            <h1 className="text-lg tracking-tight">Welcome to Halero</h1>
          </CardTitle>
          <CardDescription>
            Claim this instance by choosing a password.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="home-timezone">Home timezone</Label>
              <Select value={homeTimezone} onValueChange={setHomeTimezone}>
                <SelectTrigger id="home-timezone" size="sm" className="w-full">
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
              className="h-auto self-start p-0 text-xs"
            >
              Hosting behind a domain?
            </Button>
            {showBaseUrl ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="base-url">Base URL</Label>
                <Input
                  id="base-url"
                  type="url"
                  placeholder="https://halero.example.com"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                />
              </div>
            ) : null}
            {error === null ? null : (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={setup.isPending}>
              {setup.isPending ? <Loader2 className="animate-spin" /> : null}
              Finish setup
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
