// Shared Raycast-side failure feedback for the three API commands: one
// toast vocabulary (missing token, unreachable server, rejected token,
// server message) so they all fail the same way. The pure message
// taxonomy lives in errors.ts; this file owns the Raycast surfaces.

import {
  Action,
  ActionPanel,
  List,
  openExtensionPreferences,
  showToast,
  Toast,
} from "@raycast/api";
import type { ReactElement } from "react";
import { apiFailureMessage, MISSING_TOKEN_MESSAGE } from "./errors";

const OPEN_PREFERENCES_TITLE = "Open Extension Preferences";

/** The missing-token failure toast, with a jump to the preferences. */
export const showMissingTokenToast = (): Promise<Toast> =>
  showToast({
    style: Toast.Style.Failure,
    title: MISSING_TOKEN_MESSAGE,
    primaryAction: {
      title: OPEN_PREFERENCES_TITLE,
      onAction: () => {
        void openExtensionPreferences();
      },
    },
  });

/** The failure toast for any rejected or unreachable API call. */
export const showApiFailureToast = (
  error: unknown,
  baseUrl: string,
): Promise<Toast> =>
  showToast({
    style: Toast.Style.Failure,
    title: apiFailureMessage(error, baseUrl),
  });

/** What the view commands render instead of results without a token. */
export const MissingTokenEmptyView = (): ReactElement => (
  <List.EmptyView
    title="API token needed"
    description={MISSING_TOKEN_MESSAGE}
    actions={
      <ActionPanel>
        <Action
          title={OPEN_PREFERENCES_TITLE}
          onAction={() => {
            void openExtensionPreferences();
          }}
        />
      </ActionPanel>
    }
  />
);
