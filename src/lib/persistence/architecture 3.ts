export type PersistenceScope =
  | 'global-cache'
  | 'project'
  | 'user'
  | 'operational';

export type CurrentPersistenceLocation =
  | 'sqlite'
  | 'localStorage'
  | 'bundled-static'
  | 'mixed';

export type TargetPersistenceLocation =
  | 'postgres'
  | 'object-storage'
  | 'worker-store';

export interface PersistenceEntityBoundary {
  id: string;
  label: string;
  scope: PersistenceScope;
  currentLocation: CurrentPersistenceLocation;
  targetLocation: TargetPersistenceLocation;
  description: string;
}

export const PRODUCTION_ENTITY_BOUNDARIES: PersistenceEntityBoundary[] = [
  {
    id: 'abs-cache',
    label: 'ABS cache',
    scope: 'global-cache',
    currentLocation: 'sqlite',
    targetLocation: 'postgres',
    description: 'Shared cached ABS census, labour, and ERP data keyed by LGA and dataset.',
  },
  {
    id: 'tfnsw-cache',
    label: 'TfNSW cache',
    scope: 'global-cache',
    currentLocation: 'sqlite',
    targetLocation: 'postgres',
    description: 'Shared cached TfNSW transport data and related static access metrics.',
  },
  {
    id: 'gtfs-stops',
    label: 'PT stops',
    scope: 'global-cache',
    currentLocation: 'sqlite',
    targetLocation: 'postgres',
    description: 'Shared stop-level PT spatial data used by map catchment queries.',
  },
  {
    id: 'projection-cache',
    label: 'Bundled and seeded projections',
    scope: 'global-cache',
    currentLocation: 'mixed',
    targetLocation: 'postgres',
    description: 'System-wide seeded population and employment projections available to all users.',
  },
  {
    id: 'business-case-draft',
    label: 'Business case draft',
    scope: 'project',
    currentLocation: 'localStorage',
    targetLocation: 'postgres',
    description: 'User-editable project narrative, area selection, themes, and visible sections.',
  },
  {
    id: 'strategic-alignment-draft',
    label: 'Strategic alignment draft',
    scope: 'project',
    currentLocation: 'localStorage',
    targetLocation: 'postgres',
    description: 'Selected priorities, strategies, and notes that belong to a saved project.',
  },
  {
    id: 'projection-upload-draft',
    label: 'Uploaded projection draft',
    scope: 'project',
    currentLocation: 'localStorage',
    targetLocation: 'object-storage',
    description: 'Uploaded projection artifacts plus their parsed metadata for project-specific analyses.',
  },
  {
    id: 'refresh-config',
    label: 'Refresh configuration',
    scope: 'operational',
    currentLocation: 'sqlite',
    targetLocation: 'postgres',
    description: 'Operational settings controlling refresh cadence and seeding behavior.',
  },
  {
    id: 'refresh-log',
    label: 'Refresh log',
    scope: 'operational',
    currentLocation: 'sqlite',
    targetLocation: 'worker-store',
    description: 'Job execution history, audit metadata, and failure details for refresh workflows.',
  },
];

export function getPersistenceBoundary(
  id: PersistenceEntityBoundary['id']
): PersistenceEntityBoundary | undefined {
  return PRODUCTION_ENTITY_BOUNDARIES.find((entity) => entity.id === id);
}
