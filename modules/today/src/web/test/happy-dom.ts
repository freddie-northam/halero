import { GlobalRegistrator } from "@happy-dom/global-registrator";

/**
 * Registers happy-dom globals for a single DOM test file (Bun's documented
 * GlobalRegistrator pattern), scoped with beforeAll/afterAll so the rest of
 * the repo's tests keep running against Bun's own globals.
 */
export const registerHappyDom = (): void => {
  GlobalRegistrator.register();
  // Lets React's act() know it is running under a test runner, which keeps
  // the console free of act() environment warnings.
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
};

export const unregisterHappyDom = async (): Promise<void> => {
  await GlobalRegistrator.unregister();
};
