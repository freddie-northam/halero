// bun test preload (see the root bunfig.toml): evaluates the UI
// component graph once, with a DOM present, before any test file
// loads.
//
// Why: bun test shares one module graph across every test file in the
// run, and Radix freezes its SSR useLayoutEffect guard when its module
// first evaluates. Without this preload, whichever test file first
// pulls in @halero/ui (usually via a plain non-DOM import chain) would
// freeze that guard to a no-op, and portals (Dialog, the command
// palette) would silently never mount in any later DOM test.
//
// react-dom must evaluate BEFORE the DOM registers (hoisted static
// imports run first): its own load-time environment detection has to
// match the bare-Bun conditions every test file loads under, or
// change/keydown synthetic events stop reaching portal content.
import "react-dom";
import "react-dom/client";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
await import("@halero/ui");
await GlobalRegistrator.unregister();
