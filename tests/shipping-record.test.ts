import { describe, expect, test } from "bun:test";
import { orderInsertSchema } from "@/lib/validators/order";
import {
  adminOrderShippingRecordSchema,
  toOrderShippingRecordValues,
} from "@/lib/validators/shipping-record";

const orderId = "823071ff-f180-43ed-82df-af334ccfe35a";

describe("admin shipping record contract", () => {
  test("accepts a new order while its shipping record is still pending", () => {
    expect(
      orderInsertSchema.safeParse({
        orderNumber: "FHQ-20260903-PENDING1",
        email: "rider@example.com",
        stripeSessionId: "cs_test_pending_shipping_record",
        refundStatus: "none",
        disputeStatus: "none",
        subtotalCents: 8_900,
        totalCents: 8_900,
        shippingAddress: null,
        destinationProvince: null,
      }).success,
    ).toBe(true);
  });

  test("converts carrier cost and packed weight to canonical integers", () => {
    const parsed = adminOrderShippingRecordSchema.parse({
      orderId,
      actualCostDollars: "14.25",
      actualCostUnknown: false,
      packedWeightGrams: "780",
      packedWeightUnknown: false,
    });

    expect(toOrderShippingRecordValues(parsed)).toEqual({
      shippingActualCostCents: 1_425,
      shippingActualCostUnknown: false,
      packedWeightGrams: 780,
      packedWeightUnknown: false,
    });
  });

  test("persists independent unknown decisions without inventing zero values", () => {
    const parsed = adminOrderShippingRecordSchema.parse({
      orderId,
      actualCostDollars: "",
      actualCostUnknown: true,
      packedWeightGrams: "",
      packedWeightUnknown: true,
    });

    expect(toOrderShippingRecordValues(parsed)).toEqual({
      shippingActualCostCents: null,
      shippingActualCostUnknown: true,
      packedWeightGrams: null,
      packedWeightUnknown: true,
    });
  });

  test("requires each missing fact to be explicitly marked unknown", () => {
    const result = adminOrderShippingRecordSchema.safeParse({
      orderId,
      actualCostDollars: "",
      actualCostUnknown: false,
      packedWeightGrams: "",
      packedWeightUnknown: false,
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.flatten().fieldErrors).toMatchObject({
        actualCostDollars: ["Enter the complete carrier charge or mark it unknown."],
        packedWeightGrams: ["Enter the packed weight or mark it unknown."],
      });
    }
  });

  test("rejects malformed money, fractional or zero weights, and stale unknown values", () => {
    const base = {
      orderId,
      actualCostDollars: "14.25",
      actualCostUnknown: false,
      packedWeightGrams: "780",
      packedWeightUnknown: false,
    };

    expect(
      adminOrderShippingRecordSchema.safeParse({ ...base, actualCostDollars: "14.256" }).success,
    ).toBe(false);
    expect(
      adminOrderShippingRecordSchema.safeParse({ ...base, packedWeightGrams: "780.5" }).success,
    ).toBe(false);
    expect(
      adminOrderShippingRecordSchema.safeParse({ ...base, packedWeightGrams: "0" }).success,
    ).toBe(false);
    expect(
      adminOrderShippingRecordSchema.safeParse({ ...base, actualCostUnknown: true }).success,
    ).toBe(false);
    expect(
      adminOrderShippingRecordSchema.safeParse({ ...base, packedWeightUnknown: true }).success,
    ).toBe(false);
  });
});
