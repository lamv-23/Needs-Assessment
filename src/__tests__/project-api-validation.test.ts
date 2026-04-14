import {
  canWriteProject,
  parseProjectId,
  parseProjectIdParam,
  parseProjectSaveRequest,
} from '@/lib/api/project-api';

describe('project API validation helpers', () => {
  it('accepts valid project IDs and rejects malformed ones', () => {
    expect(parseProjectId('project_123')).toBe('project_123');
    expect(parseProjectIdParam('project-abc')).toBe('project-abc');
    expect(parseProjectId('bad id with spaces')).toBeNull();
  });

  it('parses a valid project save payload', () => {
    const parsed = parseProjectSaveRequest({
      name: 'Test project',
      projectType: 'road',
      areaIds: ['lga_sydney', 'lga_sydney', 'benchmark_gsy'],
      businessCaseDraft: { projectName: 'Test project', projectType: 'road', areaIds: ['lga_sydney'], themes: [], sectionToggles: {} },
      strategicAlignmentDraft: { selectedStrategyIds: [], strategyNotes: {}, selectedPriorities: [], priorityNotes: {} },
      projectionUploadDraft: { populationProjections: [], projectionMetadata: null },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.areaIds).toEqual(['lga_sydney', 'benchmark_gsy']);
  });

  it('rejects invalid save payloads', () => {
    expect(parseProjectSaveRequest({})).toBeNull();
    expect(parseProjectSaveRequest({ name: '', projectType: 'road', areaIds: [] })).toBeNull();
    expect(parseProjectSaveRequest({ name: 'X', projectType: 'rail', areaIds: [] })).toBeNull();
    expect(parseProjectSaveRequest({ name: 'X', projectType: 'road', areaIds: ['not-real'] })).toBeNull();
  });

  it('allows writes only for matching owners', () => {
    expect(canWriteProject(null, 'user-1')).toBe(true);
    expect(canWriteProject('user-1', 'user-1')).toBe(true);
    expect(canWriteProject('user-2', 'user-1')).toBe(false);
  });
});
