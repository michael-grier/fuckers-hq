import { type ChildProcess, spawn } from "node:child_process";

/**
 * A `stripe listen` relay forwarding real sandbox webhooks to the local app. Used only by the
 * opt-in live tier: the deterministic tiers sign their own events and need no CLI.
 */
export type StripeRelay = { stop: () => void };

const FORWARDED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
].join(",");

/**
 * Starts the relay and resolves once it is ready. Throws with an actionable message when the CLI
 * is missing or its signing secret is not the one the app verifies with — a mismatch would make
 * every forwarded event 400 and the failure would otherwise look like an app bug. Every failure
 * path kills the child, so an unready relay can never outlive the suite.
 */
export async function startStripeRelay(): Promise<StripeRelay> {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey?.startsWith("sk_test_")) {
    throw new Error("The live tier needs a sandbox STRIPE_SECRET_KEY.");
  }

  let child: ChildProcess;
  try {
    child = spawn(
      "stripe",
      [
        "listen",
        "--api-key",
        apiKey,
        "--events",
        FORWARDED_EVENTS,
        "--forward-to",
        "localhost:3000/api/webhooks/stripe",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    throw new Error(`Could not spawn the Stripe CLI (is it installed?): ${String(error)}`);
  }

  const secret = await new Promise<string>((resolve, reject) => {
    let output = "";
    let timer: NodeJS.Timeout;
    const settle = (outcome: () => void) => {
      clearTimeout(timer);
      outcome();
    };
    const fail = (error: Error) =>
      settle(() => {
        child.kill();
        reject(error);
      });
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const match = output.match(/whsec_[A-Za-z0-9]+/);
      if (match) settle(() => resolve(match[0]));
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("error", (error) => fail(new Error(`Stripe CLI failed to start: ${error.message}`)));
    child.on("exit", (code) =>
      fail(new Error(`Stripe CLI exited early (code ${code}): ${output}`)),
    );
    timer = setTimeout(() => fail(new Error(`Stripe CLI never became ready: ${output}`)), 30_000);
  });

  if (secret !== process.env.STRIPE_WEBHOOK_SECRET) {
    child.kill();
    throw new Error(
      "The Stripe CLI's signing secret does not match STRIPE_WEBHOOK_SECRET, so the app would " +
        "reject every forwarded event. Update STRIPE_WEBHOOK_SECRET in .env.local to the " +
        "listener's whsec_... value and restart the dev server.",
    );
  }

  return { stop: () => child.kill() };
}
