import { mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

/**
 * Web platform globals that happy-dom replaces with its own implementations, but that server-side
 * code under test relies on Bun's native versions of.
 *
 * happy-dom's copies are separate realms, so cross-checks fail: `readJsonRequest`'s byte-limit
 * guard stops rejecting oversized bodies, and `@react-email/render` throws "ReadableStream pipeTo
 * requires a WritableStream". Restoring these keeps the DOM (window, document, HTMLElement,
 * events) available for component tests while leaving request, stream, and body handling native.
 */
const nativeGlobals = [
  "Request",
  "Response",
  "Headers",
  "fetch",
  "FormData",
  "Blob",
  "File",
  "ReadableStream",
  "WritableStream",
  "TransformStream",
] as const;

const natives = new Map<string, unknown>(
  nativeGlobals.map((name) => [name, Reflect.get(globalThis, name)]),
);

// Loaded through `[test] preload` in bunfig.toml rather than per file, because ESM imports are
// hoisted — Testing Library must not be imported before the DOM globals exist.
//
// A concrete origin is required: with a `window` present, react-dom/server switches to its
// browser build, and resolving a relative href against happy-dom's default `about:blank` throws
// "Invalid URL" in any test that renders a component containing a link.
GlobalRegistrator.register({ url: "https://localhost:3000/" });

for (const [name, value] of natives) {
  if (value !== undefined) {
    Reflect.set(globalThis, name, value);
  }
}

// `server-only` throws on import outside a Server Component. Client components under test import
// server actions, which Next.js turns into RPC stubs at build time but which resolve to the real
// module here. Stubbing the guard lets those components mount; it does not make calling an action
// safe, so tests must not submit forms that would invoke one.
mock.module("server-only", () => ({}));
