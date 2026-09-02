import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalEmail = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().email().optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(16).optional(),
);

const optionalNeonEndpointId = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .regex(/^ep-[a-z0-9-]+$/)
    .optional(),
);

const optionalIntegerString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().int().nonnegative().optional(),
);

const defaultFalseBooleanString = z.preprocess(
  (value) => {
    if (value == null || value === "") {
      return "false";
    }

    return typeof value === "string" ? value.toLowerCase() : value;
  },
  z.enum(["true", "false"]).transform((value) => value === "true"),
);

const envSchema = z.object({
  DATABASE_URL: optionalString,
  // This non-secret identifier lets production verify a write-only DATABASE_URL without
  // exposing its credentials. Pooled and direct URLs share the same Neon endpoint ID.
  PRODUCTION_NEON_ENDPOINT_ID: optionalNeonEndpointId,
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  // Tax collection is opt-in: a missing flag must never cause the store to collect tax the
  // brand is not registered to remit.
  STRIPE_TAX_ENABLED: defaultFalseBooleanString,
  CLERK_SECRET_KEY: optionalString,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: optionalString,
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  // The operational recipient is separate from customer support. This currently targets the one
  // administrator responsible for managing and fulfilling orders.
  ADMIN_ORDER_EMAIL: optionalEmail,
  // Defaulted rather than optional so the policy pages always have a real address to print.
  // An unset variable used to render an empty string mid-sentence, which reads as finished copy
  // and leaves a customer with no way to reach the store.
  SUPPORT_EMAIL: optionalString.default("fu3kers.hq@gmail.com"),
  CRON_SECRET: optionalSecret,
  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET: optionalString,
  R2_PUBLIC_URL: optionalUrl,
  SENTRY_DSN: optionalUrl,
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
  SENTRY_ORG: optionalString,
  SENTRY_PROJECT: optionalString,
  SENTRY_AUTH_TOKEN: optionalString,
  NEXT_PUBLIC_APP_URL: optionalUrl.default("http://localhost:3000"),
  ADMIN_USER_IDS: optionalString,
  // Defaults to the countries the shipping policy page names. A default wider than the published
  // policy would let checkout accept an address the page tells the customer it will reject.
  SHIPPING_ALLOWED_COUNTRIES: optionalString.default("CA"),
  SHIPPING_FREE_THRESHOLD_CENTS: optionalIntegerString,
  // Search indexing is opt-in. A deploy that can take no payment, or a preview of unfinished copy,
  // must not be indexable by default — an accidental index is far more work to undo than to prevent.
  ALLOW_INDEXING: defaultFalseBooleanString,
  // Local delivery stays off unless it is explicitly enabled and its service area is named, so a
  // half-configured deploy cannot offer delivery without saying where it applies.
  DELIVERY_ENABLED: defaultFalseBooleanString,
  DELIVERY_AREA_NAME: optionalString,
  DELIVERY_INSTRUCTIONS: optionalString,
});

export type Env = z.infer<typeof envSchema>;
export type EnvKey = keyof Env;

export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    throw new Error(`Invalid environment variables: ${z.prettifyError(parsed.error)}`);
  }

  return parsed.data;
}

export const env = parseEnv();

export function requireEnv<K extends EnvKey>(key: K): NonNullable<Env[K]> {
  const value = env[key];

  if (value == null || value === "") {
    throw new Error(`${key} is required.`);
  }

  return value as NonNullable<Env[K]>;
}
