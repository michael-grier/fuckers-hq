import type { CreateEmailOptions, CreateEmailResponse } from "resend";

/** Transport pieces shared by every order email, whatever template it renders. */
export type OrderEmailConfig = {
  from: string;
  supportEmail: string;
};

export type OrderEmailClient = {
  send: (
    message: CreateEmailOptions,
    options: { idempotencyKey: string },
  ) => Promise<CreateEmailResponse>;
};

export class OrderEmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderEmailDeliveryError";
  }
}
