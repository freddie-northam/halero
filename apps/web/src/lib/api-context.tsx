import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";
import type { HaleroApi } from "./api";

const ApiContext = createContext<HaleroApi | null>(null);

export interface ApiProviderProps {
  readonly api: HaleroApi;
  readonly children: ReactNode;
}

export const ApiProvider = ({
  api,
  children,
}: ApiProviderProps): ReactElement => (
  <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
);

export const useApi = (): HaleroApi => {
  const api = useContext(ApiContext);
  if (api === null) {
    throw new Error(
      "This part of the app could not reach its API. Wrap it in an ApiProvider.",
    );
  }
  return api;
};
