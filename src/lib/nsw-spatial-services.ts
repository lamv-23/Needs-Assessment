/**
 * NSW Spatial Services — Transport Infrastructure Dataset client.
 * Fetches authoritative cycling and walking infrastructure lengths per LGA.
 * Source: portal.spatial.nsw.gov.au (NSW Government, free, no auth required)
 * Feature service: NSW_Transport_Theme — CycleTrack, FootPath layers
 */

const NSW_SPATIAL_BASE =
  'https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Transport_Theme/FeatureServer';

// Layer IDs in the NSW_Transport_Theme feature service
const LAYER_IDS: Record<string, number> = {
  CycleTrack: 19,
  FootPath: 18,
};

export interface NSWInfrastructureLength {
  feature_type: string;
  total_length_km: number;
}

/**
 * Queries total infrastructure length (km) within an LGA name.
 * Uses ArcGIS REST API — no authentication required.
 */
export async function getNSWInfrastructureLengths(
  lgaName: string
): Promise<NSWInfrastructureLength[]> {
  const results: NSWInfrastructureLength[] = [];

  for (const [featureType, layerId] of Object.entries(LAYER_IDS)) {
    try {
      const params = new URLSearchParams({
        where: `LGA_NAME LIKE '%${lgaName.replace(/'/g, "''")}%'`,
        outFields: 'Shape_Length',
        returnGeometry: 'false',
        f: 'json',
        resultRecordCount: '5000',
      });

      const url = `${NSW_SPATIAL_BASE}/${layerId}/query?${params}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;

      const json = await res.json() as {
        features?: Array<{ attributes?: { Shape_Length?: number } }>;
        error?: { message?: string };
      };

      if (json.error || !json.features) continue;

      const totalMetres = json.features.reduce((sum, f) => {
        return sum + (f.attributes?.Shape_Length ?? 0);
      }, 0);

      results.push({
        feature_type: featureType,
        total_length_km: Math.round((totalMetres / 1000) * 10) / 10,
      });
    } catch {
      // Skip this feature type if fetch fails
    }
  }

  return results;
}
