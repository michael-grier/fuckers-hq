import { describe, expect, test } from "bun:test";
import { evaluateDeliveryEligibility } from "@/lib/checkout/delivery-eligibility";
import { geocodeDeliveryAddress } from "@/lib/checkout/delivery-geocoder";
import {
  CALGARY_GEOGRAPHIC_CENTER,
  distanceFromCalgaryCenterMeters,
  LOCAL_DELIVERY_RADIUS_METERS,
} from "@/lib/checkout/delivery-radius";
import {
  createDeliveryEligibilityToken,
  verifyDeliveryEligibilityToken,
} from "@/lib/checkout/delivery-token";
import {
  deliveryAddressRequiresReview,
  resolveDeliveryAddressReview,
} from "@/lib/orders/shipping-address";
import { deliveryAddressSchema } from "@/lib/validators/delivery";

const address = { line1: "262075 Rocky View Point", postalCode: "T4A0X2" };
const items = [{ variantId: "3f5277e9-b73f-4a94-9bc8-5f9d06f9f5d6", quantity: 1 }];
const secret = "delivery-eligibility-test-secret-long-enough";
const earthRadiusMeters = 6_371_000;
const radiusLatitudeOffset = (LOCAL_DELIVERY_RADIUS_METERS / earthRadiusMeters) * (180 / Math.PI);

describe("Calgary delivery radius", () => {
  test("measures the 40 km boundary from the city's geographic center", () => {
    expect(distanceFromCalgaryCenterMeters(CALGARY_GEOGRAPHIC_CENTER)).toBe(0);
    expect(
      distanceFromCalgaryCenterMeters([
        CALGARY_GEOGRAPHIC_CENTER[0],
        CALGARY_GEOGRAPHIC_CENTER[1] + radiusLatitudeOffset,
      ]),
    ).toBeCloseTo(LOCAL_DELIVERY_RADIUS_METERS, 6);
  });
});

describe("delivery geocoder", () => {
  test("normalizes an address for the national locator after civic sources miss", async () => {
    const result = await geocodeDeliveryAddress(
      { line1: "800 Macleod Trail SE", postalCode: "T2G2M3" },
      async (input) => {
        const url = new URL(input.toString());

        if (url.origin === "https://data.calgary.ca") {
          return Response.json([]);
        }

        if (url.origin === "https://atlasmap.rockyview.ca") {
          return Response.json({ features: [] });
        }

        expect(url.origin).toBe("https://www.geolocator.api.geo.ca");
        expect(url.searchParams.get("q")).toBe("800 MACLEOD TRAIL SOUTHEAST, T2G 2M3, Alberta");

        return Response.json([
          {
            title: "800 Macleod Trail Southeast, Calgary, Alberta",
            qualifier: "INTERPOLATED_POSITION",
            type: "ca.gc.nrcan.geoloc.data.model.Street",
            geometry: { type: "Point", coordinates: [-114.0582289, 51.0445938] },
          },
        ]);
      },
    );

    expect(result).toEqual({
      status: "match",
      point: [-114.0582289, 51.0445938],
      confidence: "high",
    });
  });

  test("prefers Calgary's parcel index over the broader national locator", async () => {
    const result = await geocodeDeliveryAddress(
      { line1: "800 Macleod Trail SE", postalCode: "T2G2M3" },
      async (input) => {
        const url = new URL(input.toString());

        expect(url.origin).toBe("https://data.calgary.ca");
        expect(url.searchParams.get("$where")).toBe("address='800 MACLEOD TR SE'");

        return Response.json([
          {
            address: "800 MACLEOD TR SE",
            longitude: "-114.05792721246195",
            latitude: "51.04539715854496",
          },
        ]);
      },
    );

    expect(result).toEqual({
      status: "match",
      point: [-114.05792721246195, 51.04539715854496],
      confidence: "high",
    });
  });

  test("retries one transient Calgary lookup failure", async () => {
    let requestCount = 0;
    const result = await geocodeDeliveryAddress(
      { line1: "100 Example Boulevard SW", postalCode: "T2G2M3" },
      async (input) => {
        const url = new URL(input.toString());

        expect(url.origin).toBe("https://data.calgary.ca");
        expect(url.searchParams.get("$where")).toBe("address='100 EXAMPLE BV SW'");
        requestCount += 1;

        if (requestCount === 1) {
          return new Response(null, { status: 503 });
        }

        return Response.json([
          {
            address: "100 EXAMPLE BV SW",
            longitude: "-114.05792721246195",
            latitude: "51.04539715854496",
          },
        ]);
      },
    );

    expect(requestCount).toBe(2);
    expect(result).toMatchObject({ status: "match", confidence: "high" });
  });

  test("falls back to Rocky View's civic index for rural addresses", async () => {
    const result = await geocodeDeliveryAddress(address, async (input) => {
      const url = new URL(input.toString());

      if (url.origin === "https://data.calgary.ca") {
        return Response.json([]);
      }

      expect(url.searchParams.get("where")).toBe("intHouseNum=262075");

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

  test("uses the civic number when a pasted rural address starts with a unit", async () => {
    const result = await geocodeDeliveryAddress(
      {
        line1: "103 - 262075 Rocky View Point, Example, AB",
        unit: "103",
        postalCode: "T4A0X2",
      },
      async (input) => {
        const url = new URL(input.toString());

        if (url.origin === "https://data.calgary.ca") {
          return Response.json([]);
        }

        expect(url.searchParams.get("where")).toBe("intHouseNum=262075");

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
      },
    );

    expect(result).toMatchObject({ status: "match", confidence: "high" });
  });

  test("treats provider failures as unavailable", async () => {
    const result = await geocodeDeliveryAddress(address, async () => {
      throw new Error("timeout");
    });

    expect(result).toEqual({ status: "unavailable" });
  });

  test("rejects malformed provider candidates without throwing", async () => {
    const result = await geocodeDeliveryAddress(address, async (input) => {
      const url = new URL(input.toString());

      return url.origin === "https://atlasmap.rockyview.ca"
        ? Response.json({ features: [] })
        : Response.json([null]);
    });

    expect(result).toEqual({ status: "not_found" });
  });
});

describe("delivery address input", () => {
  test("separates a pasted apartment unit and removes city and province text", () => {
    expect(
      deliveryAddressSchema.parse({
        line1: "Unit 103, 262075 Rocky View Point, Example, AB",
        postalCode: "T4A 0X2",
      }),
    ).toEqual({
      line1: "262075 Rocky View Point",
      unit: "103",
      postalCode: "T4A0X2",
    });
  });

  test("keeps a separately entered unit out of the civic street line", () => {
    expect(
      deliveryAddressSchema.parse({
        line1: "262075 Rocky View Point, Example, AB",
        unit: "Apt 103",
        postalCode: "T4A 0X2",
      }),
    ).toEqual({
      line1: "262075 Rocky View Point",
      unit: "103",
      postalCode: "T4A0X2",
    });
  });
});

describe("delivery eligibility", () => {
  test("offers delivery for a match inside the radius and signs the checked address", async () => {
    const result = await evaluateDeliveryEligibility(
      { address, items },
      {
        getSubtotalCents: async () => 3_000,
        geocode: async () => ({
          status: "match",
          point: CALGARY_GEOGRAPHIC_CENTER,
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

  test("keeps shipping available outside the radius and after failed geocodes", async () => {
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
        point: [CALGARY_GEOGRAPHIC_CENTER[0], CALGARY_GEOGRAPHIC_CENTER[1] + 0.6],
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
        point: CALGARY_GEOGRAPHIC_CENTER,
        confidence: "low" as const,
      },
      {
        status: "match" as const,
        point: [
          CALGARY_GEOGRAPHIC_CENTER[0],
          CALGARY_GEOGRAPHIC_CENTER[1] +
            radiusLatitudeOffset +
            (100 / earthRadiusMeters) * (180 / Math.PI),
        ] as const,
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

  test("compares a checked unit with Stripe without including it in the civic address", () => {
    const checked = { ...address, unit: "103" };
    const matching = {
      name: "Test Skater",
      address: {
        line1: address.line1,
        line2: "Apartment 103",
        postal_code: "T4A 0X2",
      },
    };

    expect(deliveryAddressRequiresReview(checked, matching)).toBe(false);
    expect(
      deliveryAddressRequiresReview(checked, {
        ...matching,
        address: { ...matching.address, line2: "Unit 104" },
      }),
    ).toBe(true);
    expect(
      deliveryAddressRequiresReview(checked, {
        ...matching,
        address: { ...matching.address, line1: `103-${address.line1}`, line2: null },
      }),
    ).toBe(false);
  });
});
