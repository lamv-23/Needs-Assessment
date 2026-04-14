import { getDb } from '@/lib/db';
import { ensurePostgresAppSchema, getPostgresPool } from '@/lib/postgres';

async function main() {
  await ensurePostgresAppSchema();

  const sqlite = getDb();
  const postgres = getPostgresPool();

  const absRows = sqlite.prepare(`
    SELECT lga_code, dataset, data_json, census_year, fetched_at
    FROM abs_cache
  `).all() as Array<{
    lga_code: string;
    dataset: string;
    data_json: string;
    census_year: number;
    fetched_at: string;
  }>;

  for (const row of absRows) {
    await postgres.query(
      `INSERT INTO abs_cache (lga_code, dataset, data_json, census_year, fetched_at)
       VALUES ($1, $2, $3::jsonb, $4, $5::timestamptz)
       ON CONFLICT (lga_code, dataset) DO UPDATE SET
         data_json = EXCLUDED.data_json,
         census_year = EXCLUDED.census_year,
         fetched_at = EXCLUDED.fetched_at`,
      [row.lga_code, row.dataset, row.data_json, row.census_year, row.fetched_at]
    );
  }

  const tfnswRows = sqlite.prepare(`
    SELECT lga_code, dataset, data_json, data_year, fetched_at
    FROM tfnsw_cache
  `).all() as Array<{
    lga_code: string;
    dataset: string;
    data_json: string;
    data_year: number;
    fetched_at: string;
  }>;

  for (const row of tfnswRows) {
    await postgres.query(
      `INSERT INTO tfnsw_cache (lga_code, dataset, data_json, data_year, fetched_at)
       VALUES ($1, $2, $3::jsonb, $4, $5::timestamptz)
       ON CONFLICT (lga_code, dataset) DO UPDATE SET
         data_json = EXCLUDED.data_json,
         data_year = EXCLUDED.data_year,
         fetched_at = EXCLUDED.fetched_at`,
      [row.lga_code, row.dataset, row.data_json, row.data_year, row.fetched_at]
    );
  }

  const projectionRows = sqlite.prepare(`
    SELECT lga_name, projection_type, data_json, uploaded_at
    FROM nsw_projections
  `).all() as Array<{
    lga_name: string;
    projection_type: string;
    data_json: string;
    uploaded_at: string;
  }>;

  for (const row of projectionRows) {
    await postgres.query(
      `INSERT INTO nsw_projections (lga_name, projection_type, data_json, uploaded_at)
       VALUES ($1, $2, $3::jsonb, $4::timestamptz)
       ON CONFLICT (lga_name, projection_type) DO UPDATE SET
         data_json = EXCLUDED.data_json,
         uploaded_at = EXCLUDED.uploaded_at`,
      [row.lga_name, row.projection_type, row.data_json, row.uploaded_at]
    );
  }

  const transportRows = sqlite.prepare(`
    SELECT lga_name, year, data_json, seeded_at
    FROM transport_static
  `).all() as Array<{
    lga_name: string;
    year: number;
    data_json: string;
    seeded_at: string;
  }>;

  for (const row of transportRows) {
    await postgres.query(
      `INSERT INTO transport_static (lga_name, year, data_json, seeded_at)
       VALUES ($1, $2, $3::jsonb, $4::timestamptz)
       ON CONFLICT (lga_name, year) DO UPDATE SET
         data_json = EXCLUDED.data_json,
         seeded_at = EXCLUDED.seeded_at`,
      [row.lga_name, row.year, row.data_json, row.seeded_at]
    );
  }

  const refreshConfigRows = sqlite.prepare(`
    SELECT key, value, updated_at
    FROM refresh_config
  `).all() as Array<{ key: string; value: string; updated_at: string }>;

  for (const row of refreshConfigRows) {
    await postgres.query(
      `INSERT INTO refresh_config (key, value, updated_at)
       VALUES ($1, $2, $3::timestamptz)
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         updated_at = EXCLUDED.updated_at`,
      [row.key, row.value, row.updated_at]
    );
  }

  const refreshLogRows = sqlite.prepare(`
    SELECT source, status, lgas_updated, error_message, started_at, completed_at
    FROM refresh_log
    ORDER BY id
  `).all() as Array<{
    source: string;
    status: string;
    lgas_updated: number;
    error_message: string | null;
    started_at: string;
    completed_at: string | null;
  }>;

  for (const row of refreshLogRows) {
    await postgres.query(
      `INSERT INTO refresh_log (source, status, lgas_updated, error_message, started_at, completed_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)`,
      [
        row.source,
        row.status,
        row.lgas_updated,
        row.error_message,
        row.started_at,
        row.completed_at,
      ]
    );
  }

  const stopRows = sqlite.prepare(`
    SELECT stop_id, stop_name, lat, lng, mode, feed
    FROM gtfs_stops
  `).all() as Array<{
    stop_id: string;
    stop_name: string;
    lat: number;
    lng: number;
    mode: string;
    feed: string;
  }>;

  for (const row of stopRows) {
    await postgres.query(
      `INSERT INTO gtfs_stops (stop_id, stop_name, lat, lng, mode, feed)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (stop_id) DO UPDATE SET
         stop_name = EXCLUDED.stop_name,
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng,
         mode = EXCLUDED.mode,
         feed = EXCLUDED.feed`,
      [row.stop_id, row.stop_name, row.lat, row.lng, row.mode, row.feed]
    );
  }

  const userRows = sqlite.prepare(`
    SELECT user_id, email, display_name, role, created_at, updated_at
    FROM app_users
  `).all() as Array<{
    user_id: string;
    email: string | null;
    display_name: string;
    role: string;
    created_at: string;
    updated_at: string;
  }>;

  for (const row of userRows) {
    await postgres.query(
      `INSERT INTO app_users (user_id, email, display_name, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)
       ON CONFLICT (user_id) DO UPDATE SET
         email = EXCLUDED.email,
         display_name = EXCLUDED.display_name,
         role = EXCLUDED.role,
         updated_at = EXCLUDED.updated_at`,
      [row.user_id, row.email, row.display_name, row.role, row.created_at, row.updated_at]
    );
  }

  const projectRows = sqlite.prepare(`
    SELECT project_id, owner_id, name, project_type, created_at, updated_at
    FROM saved_projects
  `).all() as Array<{
    project_id: string;
    owner_id: string;
    name: string;
    project_type: string | null;
    created_at: string;
    updated_at: string;
  }>;

  for (const row of projectRows) {
    await postgres.query(
      `INSERT INTO saved_projects (project_id, owner_id, name, project_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)
       ON CONFLICT (project_id) DO UPDATE SET
         owner_id = EXCLUDED.owner_id,
         name = EXCLUDED.name,
         project_type = EXCLUDED.project_type,
         updated_at = EXCLUDED.updated_at`,
      [row.project_id, row.owner_id, row.name, row.project_type, row.created_at, row.updated_at]
    );
  }

  const projectAreaRows = sqlite.prepare(`
    SELECT project_id, area_id
    FROM project_area_selections
  `).all() as Array<{ project_id: string; area_id: string }>;

  for (const row of projectAreaRows) {
    await postgres.query(
      `INSERT INTO project_area_selections (project_id, area_id)
       VALUES ($1, $2)
       ON CONFLICT (project_id, area_id) DO NOTHING`,
      [row.project_id, row.area_id]
    );
  }

  const projectDraftRows = sqlite.prepare(`
    SELECT project_id, draft_kind, version, data_json, updated_at
    FROM project_drafts
  `).all() as Array<{
    project_id: string;
    draft_kind: string;
    version: number;
    data_json: string;
    updated_at: string;
  }>;

  for (const row of projectDraftRows) {
    await postgres.query(
      `INSERT INTO project_drafts (project_id, draft_kind, version, data_json, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz)
       ON CONFLICT (project_id, draft_kind) DO UPDATE SET
         version = EXCLUDED.version,
         data_json = EXCLUDED.data_json,
         updated_at = EXCLUDED.updated_at`,
      [row.project_id, row.draft_kind, row.version, row.data_json, row.updated_at]
    );
  }

  console.log(
    JSON.stringify({
      absCache: absRows.length,
      tfnswCache: tfnswRows.length,
      projections: projectionRows.length,
      transportStatic: transportRows.length,
      refreshConfig: refreshConfigRows.length,
      refreshLog: refreshLogRows.length,
      gtfsStops: stopRows.length,
      users: userRows.length,
      projects: projectRows.length,
      projectAreas: projectAreaRows.length,
      projectDrafts: projectDraftRows.length,
    })
  );

  await postgres.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
