import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { ActionResult } from "@/lib/actions/result";

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: () => {
    throw new Error("redirect");
  },
  usePathname: () => "/admin/shipping-rates",
  useSearchParams: () => new URLSearchParams(),
}));

const savedPayloads: Array<Record<string, unknown>> = [];
let actionResult: ActionResult = { success: true, data: undefined };
let actionError: Error | null = null;

mock.module("@/lib/actions/shipping-rates", () => ({
  updateShippingRates: async (input: Record<string, unknown>) => {
    savedPayloads.push(input);

    if (actionError) {
      throw actionError;
    }

    return actionResult;
  },
}));

const { ShippingRateEditor } = await import("@/components/admin/shipping-rate-editor");

const rates = [
  {
    value: "deck" as const,
    label: "Deck",
    description: "Rigid deck mailer.",
    rateCents: 2200,
    productCount: 4,
  },
  {
    value: "softgood" as const,
    label: "Softgood",
    description: "Parcel for apparel and compact parts.",
    rateCents: 1200,
    productCount: 2,
  },
  {
    value: "flat" as const,
    label: "Flat",
    description: "Letter mail for stickers.",
    rateCents: 300,
    productCount: 1,
  },
];

beforeEach(() => {
  savedPayloads.length = 0;
  actionResult = { success: true, data: undefined };
  actionError = null;
});

afterEach(cleanup);

describe("admin shipping rate editor", () => {
  test("shows the profile guidance, product usage, and current dollar rates", () => {
    render(<ShippingRateEditor rates={rates} />);

    expect(screen.getByText("Rigid deck mailer.")).toBeDefined();
    expect(screen.getByText("Parcel for apparel and compact parts.")).toBeDefined();
    expect(screen.getByText("Letter mail for stickers.")).toBeDefined();
    expect(screen.getByText("4 products")).toBeDefined();
    expect((screen.getByLabelText("Deck rate in Canadian dollars") as HTMLInputElement).value).toBe(
      "22.00",
    );
  });

  test("saves all three rates as one form payload", async () => {
    render(<ShippingRateEditor rates={rates} />);

    fireEvent.change(screen.getByLabelText("Deck rate in Canadian dollars"), {
      target: { value: "24.50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(savedPayloads).toHaveLength(1);
    });
    expect(savedPayloads[0]).toEqual({ deck: "24.50", softgood: "12.00", flat: "3.00" });
    expect(screen.getByRole("status").textContent).toBe("Shipping rates saved.");
  });

  test("keeps malformed rates out of the server action", async () => {
    render(<ShippingRateEditor rates={rates} />);

    fireEvent.change(screen.getByLabelText("Flat rate in Canadian dollars"), {
      target: { value: "3.999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(
        screen.getByText("Use a non-negative dollar amount with no more than two decimals."),
      ).toBeDefined();
    });
    expect(savedPayloads).toHaveLength(0);
  });

  test("shows field feedback returned by the server action", async () => {
    actionResult = {
      success: false,
      message: "Please correct the highlighted fields.",
      fieldErrors: { deck: ["That deck rate is not available."] },
    };
    render(<ShippingRateEditor rates={rates} />);

    const deckRate = screen.getByLabelText("Deck rate in Canadian dollars");
    fireEvent.change(deckRate, { target: { value: "24.50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Please correct the highlighted fields.");
    });
    expect(screen.getByText("That deck rate is not available.")).toBeDefined();
    expect(deckRate.getAttribute("aria-invalid")).toBe("true");
  });

  test("shows a retryable error when the server action throws", async () => {
    actionError = new Error("Database unavailable");
    render(<ShippingRateEditor rates={rates} />);

    fireEvent.change(screen.getByLabelText("Deck rate in Canadian dollars"), {
      target: { value: "24.50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "The shipping rates could not be saved. Try again shortly.",
      );
    });
  });
});
