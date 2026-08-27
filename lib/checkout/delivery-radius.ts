export type GeoPoint = readonly [longitude: number, latitude: number];

// Area-weighted centroid of Calgary's 14 official ward polygons, which partition the city limits:
// https://services1.arcgis.com/AVP60cs0Q9PEA8rH/arcgis/rest/services/Ward_Boundaries/FeatureServer/0
export const CALGARY_GEOGRAPHIC_CENTER = [-114.052762, 51.034761] as const satisfies GeoPoint;
// Forty kilometres approximates one hour at a 40 km/h average across mostly urban roads.
export const LOCAL_DELIVERY_RADIUS_METERS = 40_000;

const earthRadiusMeters = 6_371_000;

/** Measures straight-line distance from Calgary's geographic center using the Haversine formula. */
export function distanceFromCalgaryCenterMeters(point: GeoPoint): number {
  const latitudeDelta = degreesToRadians(point[1] - CALGARY_GEOGRAPHIC_CENTER[1]);
  const longitudeDelta = degreesToRadians(point[0] - CALGARY_GEOGRAPHIC_CENTER[0]);
  const originLatitude = degreesToRadians(CALGARY_GEOGRAPHIC_CENTER[1]);
  const destinationLatitude = degreesToRadians(point[1]);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}
