import rockyViewCounty from "@/lib/checkout/data/rocky-view-county.geo.json";

export type GeoPoint = readonly [longitude: number, latitude: number];
type LinearRing = GeoPoint[];
type Polygon = LinearRing[];
type MultiPolygon = Polygon[];

const boundary = rockyViewCounty.geometry.coordinates as unknown as MultiPolygon;
const earthRadiusMeters = 6_371_000;

/** Returns true when a coordinate is inside the county and outside every municipal enclave. */
export function isInsideRockyViewCounty(point: GeoPoint): boolean {
  return boundary.some((polygon) => isInsidePolygon(point, polygon));
}

/** The nearest straight-line distance to any edge, used to route close calls to manual review. */
export function distanceToRockyViewBoundaryMeters(point: GeoPoint): number {
  let nearest = Number.POSITIVE_INFINITY;

  for (const polygon of boundary) {
    for (const ring of polygon) {
      for (let index = 1; index < ring.length; index += 1) {
        nearest = Math.min(nearest, distanceToSegmentMeters(point, ring[index - 1], ring[index]));
      }
    }
  }

  return nearest;
}

function isInsidePolygon(point: GeoPoint, polygon: Polygon): boolean {
  const [outer, ...holes] = polygon;

  return Boolean(
    outer && isInsideRing(point, outer) && !holes.some((ring) => isInsideRing(point, ring)),
  );
}

function isInsideRing([longitude, latitude]: GeoPoint, ring: LinearRing): boolean {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [currentLongitude, currentLatitude] = ring[index];
    const [previousLongitude, previousLatitude] = ring[previous];
    const crossesLatitude = currentLatitude > latitude !== previousLatitude > latitude;
    const crossingLongitude =
      ((previousLongitude - currentLongitude) * (latitude - currentLatitude)) /
        (previousLatitude - currentLatitude) +
      currentLongitude;

    if (crossesLatitude && longitude < crossingLongitude) {
      inside = !inside;
    }
  }

  return inside;
}

function distanceToSegmentMeters(point: GeoPoint, start: GeoPoint, end: GeoPoint): number {
  const latitudeRadians = (point[1] * Math.PI) / 180;
  const scaleLongitude = Math.cos(latitudeRadians);
  const toLocal = ([longitude, latitude]: GeoPoint): GeoPoint => [
    ((longitude - point[0]) * Math.PI * earthRadiusMeters * scaleLongitude) / 180,
    ((latitude - point[1]) * Math.PI * earthRadiusMeters) / 180,
  ];
  const [startX, startY] = toLocal(start);
  const [endX, endY] = toLocal(end);
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const projection =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, -(startX * deltaX + startY * deltaY) / lengthSquared));

  return Math.hypot(startX + projection * deltaX, startY + projection * deltaY);
}
