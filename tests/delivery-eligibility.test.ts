import { describe, expect, test } from "bun:test";

import {
  distanceToRockyViewBoundaryMeters,
  isInsideRockyViewCounty,
} from "@/lib/checkout/delivery-boundary";
import { evaluateDeliveryEligibility } from "@/lib/checkout/delivery-eligibility";
import { geocodeRockyViewAddress } from "@/lib/checkout/delivery-geocoder";
import {
  createDeliveryEligibilityToken,
  verifyDeliveryEligibilityToken,
} from "@/lib/checkout/delivery-token";
import {
  deliveryAddressRequiresReview,
  resolveDeliveryAddressReview,
} from "@/lib/orders/shipping-address";

const address = { line1: "262075 Rocky View Point", postalCode: "T4A0X2" };
const items = [{ variantId: "3f5277e9-b73f-4a94-9bc8-5f9d06f9f5d6", quantity: 1 }];
const secret = "delivery-eligibility-test-secret-long-enough";

describe("Rocky View County boundary", () => {
  test("includes a known county address while excluding nearby municipal enclaves", () => {
    expect(isInsideRockyViewCounty([-113.9400966, 51.2165656])).toBe(true);
    // Calgary and Airdrie share postal prefixes with the county but are separate municipalities.
    expect(isInsideRockyViewCounty([-114.0719, 51.0447])).toBe(false);
    expect(isInsideRockyViewCounty([-114.0144, 51.2917])).toBe(false);
  });

  test("measures points close enough to an edge for manual review", () => {
    const nearBoundary = [-114.676554, 50.965247] as const;

    expect(isInsideRockyViewCounty(nearBoundary)).toBe(true);
    expect(distanceToRockyViewBoundaryMeters(nearBoundary)).toBeLessThan(250);
  });
});

describe("Rocky View municipal-address geocoder", () => {
  test("normalizes road suffixes and returns a high-confidence coordinate", async () => {
    const result = await geocodeRockyViewAddress(address, async (input) => {
      expect(new URL(input.toString()).searchParams.get("where")).toBe("intHouseNum=262075");

      return Response.json({
        features: [
          {
            attributes: {
              vchAddress: "262075 ROCKY VIEW PT",
              vchPostalCode: "T4A 0X2",
              AddressStatus: "Current",
            },
            geometry: { x: -113.9400966, y: 51.2165656 },
          },
        ],
      });
    });

    expect(result).toEqual({
      status: "match",
      point: [-113.9400966, 51.2165656],
      confidence: "high",
    });
  });

  test("routes a postal mismatch to low confidence and provider errors to unavailable", async () => {
    const lowConfidence = await geocodeRockyViewAddress(address, async () =>
      Response.json({
        features: [
          {
            attributes: {
              vchAddress: "262075 ROCKY VIEW PT",
              vchPostalCode: "T4A9Z9",
              AddressStatus: "Current",
            },
            geometry: { x: -113.9400966, y: 51.2165656 },
          },
        ],
      }),
    );
    const unavailable = await geocodeRockyViewAddress(address, async () => {
      throw new Error("timeout");
    });

    expect(lowConfidence.status === "match" && lowConfidence.confidence).toBe("low");
    expect(unavailable).toEqual({ status: "unavailable" });
  });
});

describe("delivery eligibility", () => {
  test("offers delivery for an in-county match and signs the checked address", async () => {
    const result = await evaluateDeliveryEligibility(
      { address, items },
      {
        getSubtotalCents: async () => 3_000,
        geocode: async () => ({
          status: "match",
          point: [-113.9400966, 51.2165656],
          confidence: "high",
        }),
        createToken: () => "signed-token",
      },
    );

    expect(result).toMatchObject({
      status: "eligible",
      token: "signed-token",
      reviewRequired: false,
    });
  });

  test("does not call the geocoder below the $30 server-price minimum", async () => {
    let geocoderCalled = false;
    const result = await evaluateDeliveryEligibility(
      { address, items },
      {
        getSubtotalCents: async () => 2_999,
        geocode: async () => {
          geocoderCalled = true;
          return { status: "not_found" };
        },
        createToken: () => "unused",
      },
    );

    expect(result).toMatchObject({
      status: "below_minimum",
      minimumCents: 3_000,
      subtotalCents: 2_999,
    });
    expect(geocoderCalled).toBe(false);
  });

  test("keeps shipping available for out-of-county and failed geocodes", async () => {
    const evaluate = (
      geocode: () => Promise<
        | { status: "unavailable" }
        | {
            status: "match";
            point: readonly [number, number];
            confidence: "high";
          }
      >,
    ) =>
      evaluateDeliveryEligibility(
        { address, items },
        {
          getSubtotalCents: async () => 8_900,
          geocode,
          createToken: () => "unused",
        },
      );

    expect(
      await evaluate(async () => ({
        status: "match",
        point: [-114.0719, 51.0447],
        confidence: "high",
      })),
    ).toMatchObject({ status: "ineligible", message: expect.stringContaining("Shipping") });
    expect(await evaluate(async () => ({ status: "unavailable" }))).toMatchObject({
      status: "unavailable",
      message: expect.stringContaining("Shipping"),
    });
  });

  test("flags low-confidence and near-boundary matches for manual review", async () => {
    for (const geocode of [
      {
        status: "match" as const,
        point: [-113.9400966, 51.2165656] as const,
        confidence: "low" as const,
      },
      {
        status: "match" as const,
        point: [-114.676554, 50.965247] as const,
        confidence: "high" as const,
      },
      {
        // A point exactly on the simplified line can ray-cast to either side. Human confirmation
        // is safer than silently rejecting it.
        status: "match" as const,
        point: [-114.676054, 50.965147] as const,
        confidence: "high" as const,
      },
    ]) {
      const result = await evaluateDeliveryEligibility(
        { address, items },
        {
          getSubtotalCents: async () => 8_900,
          geocode: async () => geocode,
          createToken: (_checkedAddress, reviewRequired) => String(reviewRequired),
        },
      );

      expect(result).toMatchObject({ status: "eligible", reviewRequired: true, token: "true" });
    }
  });
});

describe("delivery eligibility proof", () => {
  test("rejects tampering and expiry", () => {
    const now = new Date("2026-08-27T18:00:00.000Z");
    const token = createDeliveryEligibilityToken(address, true, secret, now);

    expect(verifyDeliveryEligibilityToken(token, secret, now)).toMatchObject({
      address,
      reviewRequired: true,
    });
    expect(verifyDeliveryEligibilityToken(`${token}x`, secret, now)).toBeNull();
    expect(
      verifyDeliveryEligibilityToken(token, secret, new Date(now.getTime() + 16 * 60 * 1_000)),
    ).toBeNull();
  });

  test("flags a changed or missing Stripe address", () => {
    const matching = {
      name: "Test Skater",
      address: {
        line1: "262075 ROCKY VIEW PT",
        postal_code: "T4A 0X2",
      },
    };

    expect(deliveryAddressRequiresReview(address, matching)).toBe(false);
    expect(
      deliveryAddressRequiresReview(address, {
        ...matching,
        address: { ...matching.address, line1: "123 Calgary Trail" },
      }),
    ).toBe(true);
    expect(deliveryAddressRequiresReview(null, matching)).toBe(true);
    expect(deliveryAddressRequiresReview({}, matching)).toBe(true);
    expect(resolveDeliveryAddressReview("delivery", true, address, matching)).toBe(true);
    expect(resolveDeliveryAddressReview("delivery", false, address, matching)).toBe(false);
    expect(resolveDeliveryAddressReview("shipping", true, null, null)).toBe(false);
  });
});
