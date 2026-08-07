import type { z } from "zod";

export type ActionFailure = {
  success: false;
  message: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export type ActionResult<T = undefined> =
  | {
      success: true;
      data: T;
    }
  | ActionFailure;

export function validationFailure(error: z.ZodError): ActionFailure {
  return {
    success: false,
    message: "Please correct the highlighted fields.",
    fieldErrors: error.flatten().fieldErrors,
  };
}

/**
 * Like validationFailure, but keys errors by the full dotted issue path
 * (`variants.2.sku`) so react-hook-form can target rows inside field arrays.
 * flatten() would collapse those to the top-level `variants` key.
 */
export function nestedValidationFailure(error: z.ZodError): ActionFailure {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.join(".");
    const messages = fieldErrors[key] ?? [];
    messages.push(issue.message);
    fieldErrors[key] = messages;
  }

  return {
    success: false,
    message: "Please correct the highlighted fields.",
    fieldErrors,
  };
}
