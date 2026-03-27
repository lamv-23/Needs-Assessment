/**
 * LGA Mapping: Internal IDs to Names and NSW Planning Names
 */

export interface LGAData {
  id: string;
  name: string;
  nswPlanningName: string; // Name used in NSW Planning Excel files
  region: 'Greater Sydney' | 'Central Coast' | 'Illawarra-Shoalhaven';
  absCode?: string; // 5-digit ABS code
}

export const LGA_MAPPING: Record<string, LGAData> = {
  // Greater Sydney - Inner
  lga_sydney: {
    id: 'lga_sydney',
    name: 'City of Sydney',
    nswPlanningName: 'City of Sydney',
    region: 'Greater Sydney',
    absCode: '17200',
  },
  lga_innerwest: {
    id: 'lga_innerwest',
    name: 'Inner West Council',
    nswPlanningName: 'Inner West',
    region: 'Greater Sydney',
    absCode: '17420',
  },
  lga_bayside: {
    id: 'lga_bayside',
    name: 'Bayside Council',
    nswPlanningName: 'Bayside',
    region: 'Greater Sydney',
    absCode: '17070',
  },
  lga_randwick: {
    id: 'lga_randwick',
    name: 'Randwick City',
    nswPlanningName: 'Randwick',
    region: 'Greater Sydney',
    absCode: '17320',
  },
  lga_waverley: {
    id: 'lga_waverley',
    name: 'Waverley Council',
    nswPlanningName: 'Waverley',
    region: 'Greater Sydney',
    absCode: '17370',
  },
  lga_woollahra: {
    id: 'lga_woollahra',
    name: 'Woollahra Municipal Council',
    nswPlanningName: 'Woollahra',
    region: 'Greater Sydney',
    absCode: '17390',
  },

  // Greater Sydney - South
  lga_canterbury: {
    id: 'lga_canterbury',
    name: 'Canterbury-Bankstown Council',
    nswPlanningName: 'Canterbury-Bankstown',
    region: 'Greater Sydney',
    absCode: '17080',
  },
  lga_strathfield: {
    id: 'lga_strathfield',
    name: 'Strathfield Regional Council',
    nswPlanningName: 'Strathfield',
    region: 'Greater Sydney',
    absCode: '17340',
  },
  lga_kogarah: {
    id: 'lga_kogarah',
    name: 'Kogarah Council',
    nswPlanningName: 'Kogarah',
    region: 'Greater Sydney',
    absCode: '17240',
  },
  lga_rockdale: {
    id: 'lga_rockdale',
    name: 'Rockdale City Council',
    nswPlanningName: 'Rockdale',
    region: 'Greater Sydney',
    absCode: '17330',
  },
  lga_hurstville: {
    id: 'lga_hurstville',
    name: 'Hurstville City Council',
    nswPlanningName: 'Hurstville',
    region: 'Greater Sydney',
    absCode: '17230',
  },
  lga_canadabay: {
    id: 'lga_canadabay',
    name: 'Canada Bay Council',
    nswPlanningName: 'Canada Bay',
    region: 'Greater Sydney',
    absCode: '17100',
  },
  lga_burwood: {
    id: 'lga_burwood',
    name: 'Burwood Council',
    nswPlanningName: 'Burwood',
    region: 'Greater Sydney',
    absCode: '17090',
  },

  // Greater Sydney - East
  lga_manly: {
    id: 'lga_manly',
    name: 'Northern Beaches Council',
    nswPlanningName: 'Manly',
    region: 'Greater Sydney',
  },
  lga_northernbeaches: {
    id: 'lga_northernbeaches',
    name: 'Northern Beaches Council',
    nswPlanningName: 'Northern Beaches',
    region: 'Greater Sydney',
    absCode: '17290',
  },
  lga_willoughby: {
    id: 'lga_willoughby',
    name: 'Willoughby City Council',
    nswPlanningName: 'Willoughby',
    region: 'Greater Sydney',
    absCode: '17380',
  },
  lga_ryde: {
    id: 'lga_ryde',
    name: 'City of Ryde',
    nswPlanningName: 'Ryde',
    region: 'Greater Sydney',
    absCode: '17330',
  },
  lga_hornsby: {
    id: 'lga_hornsby',
    name: 'Hornsby Shire Council',
    nswPlanningName: 'Hornsby',
    region: 'Greater Sydney',
    absCode: '17220',
  },
  lga_kuringgai: {
    id: 'lga_kuringgai',
    name: 'Ku-ring-gai Council',
    nswPlanningName: 'Ku-ring-gai',
    region: 'Greater Sydney',
    absCode: '17250',
  },
  lga_sutherland: {
    id: 'lga_sutherland',
    name: 'Sutherland Shire Council',
    nswPlanningName: 'Sutherland',
    region: 'Greater Sydney',
    absCode: '17350',
  },

  // Greater Sydney - West
  lga_fairfield: {
    id: 'lga_fairfield',
    name: 'Fairfield City Council',
    nswPlanningName: 'Fairfield',
    region: 'Greater Sydney',
    absCode: '17180',
  },
  lga_wollondilly: {
    id: 'lga_wollondilly',
    name: 'Wollondilly Shire Council',
    nswPlanningName: 'Wollondilly',
    region: 'Greater Sydney',
    absCode: '17400',
  },
  lga_campbelltown: {
    id: 'lga_campbelltown',
    name: 'Campbelltown City Council',
    nswPlanningName: 'Campbelltown',
    region: 'Greater Sydney',
    absCode: '17110',
  },
  lga_bluemountains: {
    id: 'lga_bluemountains',
    name: 'Blue Mountains City Council',
    nswPlanningName: 'Blue Mountains',
    region: 'Greater Sydney',
    absCode: '17085',
  },
  lga_penrith: {
    id: 'lga_penrith',
    name: 'Penrith City Council',
    nswPlanningName: 'Penrith',
    region: 'Greater Sydney',
    absCode: '17310',
  },
  lga_blacktown: {
    id: 'lga_blacktown',
    name: 'Blacktown City Council',
    nswPlanningName: 'Blacktown',
    region: 'Greater Sydney',
    absCode: '17087',
  },
  lga_parramatta: {
    id: 'lga_parramatta',
    name: 'City of Parramatta',
    nswPlanningName: 'Parramatta',
    region: 'Greater Sydney',
    absCode: '17300',
  },

  // Central Coast
  lga_centralcoast: {
    id: 'lga_centralcoast',
    name: 'Central Coast Council',
    nswPlanningName: 'Central Coast (NSW)',
    region: 'Central Coast',
    absCode: '16120',
  },

  // Illawarra-Shoalhaven
  lga_wollongong: {
    id: 'lga_wollongong',
    name: 'City of Wollongong',
    nswPlanningName: 'Wollongong',
    region: 'Illawarra-Shoalhaven',
    absCode: '16830',
  },
  lga_illawarra: {
    id: 'lga_illawarra',
    name: 'Illawarra Shoalhaven',
    nswPlanningName: 'Illawarra',
    region: 'Illawarra-Shoalhaven',
  },

  // Newcastle & Hunter
  lga_newcastle: {
    id: 'lga_newcastle',
    name: 'Newcastle City Council',
    nswPlanningName: 'Newcastle',
    region: 'Greater Sydney',
    absCode: '16260',
  },
  lga_lakemacquarie: {
    id: 'lga_lakemacquarie',
    name: 'Lake Macquarie City Council',
    nswPlanningName: 'Lake Macquarie',
    region: 'Greater Sydney',
    absCode: '16220',
  },

  // Regional (included for reference)
  lga_lismore: {
    id: 'lga_lismore',
    name: 'Lismore City Council',
    nswPlanningName: 'Lismore',
    region: 'Greater Sydney',
    absCode: '16240',
  },
  lga_coffsharbour: {
    id: 'lga_coffsharbour',
    name: 'Coffs Harbour City Council',
    nswPlanningName: 'Coffs Harbour',
    region: 'Greater Sydney',
    absCode: '16130',
  },
};

/**
 * Get LGA mapping (ID -> name)
 */
export function getLGAMapping(): Record<string, string> {
  const mapping: Record<string, string> = {};
  Object.entries(LGA_MAPPING).forEach(([id, data]) => {
    mapping[id] = data.name;
  });
  return mapping;
}

/**
 * Get reverse mapping (name -> ID)
 */
export function getLGANameToIdMapping(): Record<string, string> {
  const mapping: Record<string, string> = {};
  Object.entries(LGA_MAPPING).forEach(([id, data]) => {
    mapping[data.name] = id;
    mapping[data.nswPlanningName] = id; // Also map NSW Planning names
  });
  return mapping;
}

/**
 * Get NSW Planning name from internal ID
 */
export function getNSWPlanningName(lgaId: string): string | undefined {
  return LGA_MAPPING[lgaId]?.nswPlanningName;
}

/**
 * Get all LGAs for a region
 */
export function getLGAsByRegion(
  region: 'Greater Sydney' | 'Central Coast' | 'Illawarra-Shoalhaven'
): LGAData[] {
  return Object.values(LGA_MAPPING).filter((lga) => lga.region === region);
}
