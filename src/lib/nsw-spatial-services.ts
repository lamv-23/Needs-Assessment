import { getLGAGeometry } from '@/lib/geo';

/**
 * NSW Spatial Services — Transport Infrastructure Dataset client.
 * Fetches authoritative active transport infrastructure lengths per LGA.
 * Source: portal.spatial.nsw.gov.au (NSW Government, free, no auth required)
 * Feature service: NSW_Transport_Theme / AggregatedWay
 */

const NSW_SPATIAL_BASE =
  'https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Transport_Theme/FeatureServer';

const ACTIVE_TRANSPORT_SEGMENTS = [
  {
    feature_type: 'CycleTrack',
    layerId: 12,
    wayTypes: [6, 7],
  },
  {
    feature_type: 'WalkingTrack',
    layerId: 12,
    wayTypes: [10],
  },
] as const;

interface ArcGISStatsResponse {
  features?: Array<{
    attributes?: {
      total_length_metres?: number | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

function geometryToArcGISPolygon(
  geometry: GeoJSON.Geometry,
): { rings: number[][][]; spatialReference: { wkid: number } } | null {
  if (geometry.type === 'Polygon') {
    return {
      rings: geometry.coordinates.map((ring) => ring.map(([lng, lat]) => [lng, lat])),
      spatialReference: { wkid: 4326 },
    };
  }

  if (geometry.type === 'MultiPolygon') {
    return {
      rings: geometry.coordinates.flatMap((polygon) =>
        polygon.map((ring) => ring.map(([lng, lat]) => [lng, lat])),
      ),
      spatialReference: { wkid: 4326 },
    };
  }

  return null;
}

async function fetchLengthWithinGeometry(
  layerId: number,
  geometry: GeoJSON.Geometry,
  where: string,
): Promise<number | null> {
  const polygon = geometryToArcGISPolygon(geometry);
  if (!polygon) {
    return null;
  }

  const params = new URLSearchParams({
    where,
    geometry: JSON.stringify(polygon),
    geometryType: 'esriGeometryPolygon',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outStatistics: JSON.stringify([
      {
        statisticType: 'sum',
        onStatisticField: 'Shape__Length',
        outStatisticFieldName: 'total_length_metres',
      },
    ]),
    returnGeometry: 'false',
    f: 'json',
  });

  const res = await fetch(`${NSW_SPATIAL_BASE}/${layerId}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: params.toString(),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`NSW Spatial query failed with status ${res.status}`);
  }

  const json = (await res.json()) as ArcGISStatsResponse;
  if (json.error) {
    throw new Error(json.error.message ?? 'NSW Spatial query returned an error');
  }

  const totalMetres = json.features?.[0]?.attributes?.total_length_metres;
  if (totalMetres == null) {
    return null;
  }

  return Math.round((totalMetres / 1000) * 10) / 10;
}

export interface NSWInfrastructureLength {
  feature_type: string;
  total_length_km: number;
}

/**
 * Queries total infrastructure length (km) within an LGA geometry.
 * Uses ArcGIS REST API statistics with the app's local LGA polygons.
 */
export async function getNSWInfrastructureLengths(areaId: string): Promise<NSWInfrastructureLength[]> {
  const geometry = getLGAGeometry(areaId);
  if (!geometry) {
    return [];
  }

  const results: NSWInfrastructureLength[] = [];

  for (const segment of ACTIVE_TRANSPORT_SEGMENTS) {
    const totalLength = await fetchLengthWithinGeometry(
      segment.layerId,
      geometry,
      `waytype IN (${segment.wayTypes.join(',')})`,
    );

    if (totalLength != null) {
      results.push({
        feature_type: segment.feature_type,
        total_length_km: totalLength,
      });
    }
  }

  return results;
}
