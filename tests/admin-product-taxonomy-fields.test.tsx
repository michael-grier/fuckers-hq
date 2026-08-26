import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// The workspace calls useRouter().refresh() after a save, which needs an app router context that
// only exists inside a running Next.js app.
mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: () => {
    throw new Error("redirect");
  },
  usePathname: () => "/admin/products",
  useSearchParams: () => new URLSearchParams(),
}));

// Captures the payload the form would send, so a save can be asserted without a database.
const savedPayloads: Array<Record<string, unknown>> = [];

mock.module("@/lib/actions/product-workspace", () => ({
  // Bun shares module mocks across test files, so keep every action imported by either admin form.
  createProductFromComposer: async () => {
    throw new Error("createProductFromComposer is not used in taxonomy field tests.");
  },
  saveProductWorkspace: async (input: Record<string, unknown>) => {
    savedPayloads.push(input);
    return { success: true, data: { variants: [] } };
  },
}));

const { ProductWorkspace } = await import("@/components/admin/product-workspace");

beforeEach(() => {
  savedPayloads.length = 0;
});

afterEach(cleanup);

function renderWorkspace() {
  render(
    <ProductWorkspace
      defaultValues={{
        name: "Street Deck",
        slug: "street-deck",
        description: "",
        category: "hardgoods",
        subcategory: "decks",
        shippingProfile: "deck",
        status: "active",
        variants: [],
      }}
      media={null}
      productId="8f1f2f5e-0f0e-4a3c-9d2b-1c7a5e6d4b3a"
      reservedQuantities={{}}
      savedStatus="active"
    />,
  );

  return {
    category: screen.getByLabelText("Category") as HTMLSelectElement,
    subcategory: screen.getByLabelText("Subcategory") as HTMLSelectElement,
    shippingProfile: screen.getByLabelText("Shipping profile") as HTMLSelectElement,
    save: () => fireEvent.click(screen.getByRole("button", { name: /save changes/i })),
  };
}

function optionValues(select: HTMLSelectElement): string[] {
  // Excludes the leading placeholder option, which carries an empty value.
  return [...select.options].map((option) => option.value).filter((value) => value !== "");
}

describe("admin product taxonomy fields", () => {
  test("offers every checkout shipping profile", () => {
    const { shippingProfile } = renderWorkspace();

    expect(optionValues(shippingProfile)).toEqual(["deck", "softgood", "flat"]);
  });

  test("offers only the selected category's subcategories", () => {
    const { category, subcategory } = renderWorkspace();

    expect(optionValues(subcategory)).toEqual([
      "decks",
      "trucks",
      "wheels",
      "bearings",
      "griptape",
      "hardware",
    ]);

    fireEvent.change(category, { target: { value: "accessories" } });

    expect(optionValues(subcategory)).toEqual([
      "stickers",
      "patches",
      "keychains",
      "buttons",
      "papers",
    ]);
  });

  test("clears the stored subcategory when the category changes", async () => {
    const { category, save } = renderWorkspace();

    fireEvent.change(category, { target: { value: "softgoods" } });
    save();

    // Asserted through the validation message rather than the select's value, because the
    // select blanks itself whenever its options no longer contain its value — so it reads empty
    // either way. Only the form's own state distinguishes the two: without the reset,
    // react-hook-form still holds "decks" and reports a pair mismatch for a field the user sees
    // as blank, instead of asking them to choose.
    await waitFor(() => {
      expect(screen.getByText("Choose a subcategory.")).toBeDefined();
    });

    expect(savedPayloads).toHaveLength(0);
  });

  test("saves the chosen pair once the subcategory is reselected", async () => {
    const { category, subcategory, save } = renderWorkspace();

    fireEvent.change(category, { target: { value: "softgoods" } });
    fireEvent.change(subcategory, { target: { value: "hoodies" } });
    save();

    await waitFor(() => {
      expect(savedPayloads).toHaveLength(1);
    });

    expect(savedPayloads[0]).toMatchObject({ category: "softgoods", subcategory: "hoodies" });
    expect(
      (screen.getByRole("button", { name: "Archive product" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  test("closes the save bar after a successful save", async () => {
    renderWorkspace();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Renamed Deck" } });
    expect(screen.getByRole("region", { name: "Product save controls" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(savedPayloads).toHaveLength(1);
      expect(screen.queryByRole("region", { name: "Product save controls" })).toBeNull();
    });

    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Product saved.");
  });

  test("disables the subcategory select until a category is chosen", () => {
    const { category, subcategory } = renderWorkspace();

    fireEvent.change(category, { target: { value: "" } });

    expect(subcategory.disabled).toBe(true);
    expect(optionValues(subcategory)).toEqual([]);
  });
});
