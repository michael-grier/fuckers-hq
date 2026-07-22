import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(16).optional(),
);

const optionalIntegerString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().int().nonnegative().optional(),
);

const defaultTrueBooleanString = z.preprocess(
  (value) => {
    if (value == null || value === "") {
      return "true";
    }

    return typeof value === "string" ? value.toLowerCase() : value;
  },
  z.enum(["true", "false"]).transform((value) => value === "true"),
);

const envSchema = z.object({
  DATABASE_URL: optionalString,
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  STRIPE_TAX_ENABLED: defaultTrueBooleanString,
  CLERK_SECRET_KEY: optionalString,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: optionalString,
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  SUPPORT_EMAIL: optionalString,
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
  SHIPPING_ALLOWED_COUNTRIES: optionalString.default("CA,US"),
  SHIPPING_STANDARD_RATE_CENTS: optionalIntegerString,
  SHIPPING_FREE_THRESHOLD_CENTS: optionalIntegerString,
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
