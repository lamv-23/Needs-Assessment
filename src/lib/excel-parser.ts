/**
 * Excel Parser for NSW Population Projections
 * 
 * Parses the NSW Population Projections Excel file:
 * https://www.planning.nsw.gov.au/sites/default/files/2024-11/2024-nsw-population-projections-local-government-areas.xlsx
 * 
 * Expected structure:
 * - Sheet: "LGA" or "Data"
 * - Columns: LGA Name, Financial Year (2020-21 to 2040-41), Population breakdowns by age/sex
 */

// Note: We'll use a library like 'xlsx' to parse Excel files
// This file demonstrates the data extraction logic

export interface PopulationProjection {
  lgaName: string;
  lgaCode?: string;
  financialYear: string; // e.g., "2020-21", "2024-25", "2040-41"
  year: number; // e.g., 2021, 2025, 2041
  totalPopulation: number;
  malePopulation?: number;
  femalePopulation?: number;
  ageDistribution?: Record<string, number>; // e.g., "0-4": 5000, "5-9": 6000, etc.
}

export interface ProjectionDataSet {
  releaseDate: string; // e.g., "November 2024"
  referenceYears: string; // e.g., "2021-2041"
  lgaCount: number;
  projections: PopulationProjection[];
  lastUpdated: string; // ISO timestamp
}

/**
 * Maps NSW Planning LGA names to our internal LGA IDs
 * This is used to match Excel data with our sample-areas mapping
 */
const LGA_NAME_TO_ID: Record<string, string> = {
  // Greater Sydney
  'City of Sydney': 'lga_sydney',
  'Inner West': 'lga_innerwest',
  'Bayside': 'lga_bayside',
  'Canterbury-Bankstown': 'lga_canterbury',
  'Strathfield': 'lga_strathfield',
  'Wollondilly': 'lga_wollondilly',
  'Campbelltown': 'lga_campbelltown',
  'Blue Mountains': 'lga_bluemountains',
  'Penrith': 'lga_penrith',
  'Blacktown': 'lga_blacktown',
  'Hornsby': 'lga_hornsby',
  'Ku-ring-gai': 'lga_kuringgai',
  'Ryde': 'lga_ryde',
  'Willoughby': 'lga_willoughby',
  'Manly': 'lga_manly',
  'Northern Beaches': 'lga_northernbeaches',
  'Pittwater': 'lga_pittwater',
  'Sutherland': 'lga_sutherland',
  'Waverley': 'lga_waverley',
  'Woollahra': 'lga_woollahra',
  'Randwick': 'lga_randwick',
  'Burwood': 'lga_burwood',
  'Canada Bay': 'lga_canadabay',
  'Hurstville': 'lga_hurstville',
  'Kogarah': 'lga_kogarah',
  'Rockdale': 'lga_rockdale',
  'Newcastle': 'lga_newcastle',
  'Lake Macquarie': 'lga_lakemacquarie',
  'Central Coast (NSW)': 'lga_centralcoast',
  'Wollongong': 'lga_wollongong',
  'Illawarra': 'lga_illawarra',
  'Sutherland Shire': 'lga_sutherland',
  'Fairfield': 'lga_fairfield',
  'Parramatta': 'lga_parramatta',
  'Lismore': 'lga_lismore',
  'Coffs Harbour': 'lga_coffsharbour',
};

/**
 * Parse Excel file content (as ArrayBuffer or Base64)
 * Uses xlsx library to read NSW Population Projections file
 * 
 * @param excelBuffer - The Excel file as ArrayBuffer or Base64 string
 * @returns Parsed projection data
 */
export async function parseNSWProjectionsExcel(
  excelBuffer: ArrayBuffer | string
): Promise<ProjectionDataSet> {
  // Dynamic import to avoid issues in browser environments
  const XLSX = await import('xlsx');
  
  console.log('Parsing NSW Population Projections Excel file...');
  
  try {
    // Parse the Excel file
    const workbook = XLSX.read(excelBuffer, {
      type: typeof excelBuffer === 'string' ? 'base64' : 'array',
    });
    
    // Get the first sheet (typically named "LGA" or similar)
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error('No sheets found in Excel file');
    }
    
    console.log(`Reading sheet: ${sheetName}`);
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert sheet to JSON
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (rawData.length < 2) {
      throw new Error('Excel file has insufficient data');
    }
    
    // Parse headers (first row)
    const headers = (rawData[0] as string[]).map((h: string) => h?.trim() || '');
    
    // Find key column indices
    const lgaNameIndex = headers.findIndex(h => 
      h.toLowerCase().includes('lga') || h.toLowerCase().includes('name')
    );
    
    if (lgaNameIndex === -1) {
      throw new Error('Cannot find LGA name column in Excel file');
    }
    
    console.log(`LGA Name column index: ${lgaNameIndex}`);
    console.log(`Headers: ${headers.slice(0, 10).join(', ')}`);
    
    // Extract financial year columns (typically formatted as "2020-21", "2021-22", etc.)
    const yearColumns: { index: number; year: string }[] = [];
    headers.forEach((header, idx) => {
      if (header.match(/^\d{4}-\d{2}$|^\d{4}$/)) {
        yearColumns.push({ index: idx, year: header });
      }
    });
    
    if (yearColumns.length === 0) {
      throw new Error('No financial year columns found in Excel file');
    }
    
    console.log(`Found ${yearColumns.length} year columns`);
    
    // Extract projections
    const projections: PopulationProjection[] = [];
    
    for (let rowIdx = 1; rowIdx < rawData.length; rowIdx++) {
      const row = rawData[rowIdx] as (string | number)[];
      
      if (!row[lgaNameIndex]) continue; // Skip empty rows
      
      const lgaName = String(row[lgaNameIndex]).trim();
      
      // Skip header-like rows or summary rows
      if (lgaName.toLowerCase() === 'total' || 
          lgaName.toLowerCase() === 'state' ||
          lgaName.toLowerCase().includes('total')) {
        continue;
      }
      
      // For each year column, create a projection record
      for (const yearCol of yearColumns) {
        const populationValue = row[yearCol.index];
        
        if (populationValue === null || populationValue === undefined) {
          continue;
        }
        
        const totalPopulation = parseInt(String(populationValue).replace(/,/g, ''), 10);
        
        if (isNaN(totalPopulation)) {
          console.warn(`Invalid population for ${lgaName} ${yearCol.year}: ${populationValue}`);
          continue;
        }
        
        projections.push({
          lgaName,
          financialYear: yearCol.year,
          year: financialYearToCalendarYear(yearCol.year),
          totalPopulation,
        });
      }
    }
    
    if (projections.length === 0) {
      throw new Error('No valid projections extracted from Excel file');
    }
    
    const dataset: ProjectionDataSet = {
      releaseDate: 'November 2024',
      referenceYears: '2021-2041',
      lgaCount: new Set(projections.map(p => p.lgaName)).size,
      projections,
      lastUpdated: new Date().toISOString(),
    };
    
    // Validate before returning
    const validation = validateProjectionDataset(dataset);
    if (!validation.valid) {
      console.warn('Validation warnings:', validation.errors);
    }
    
    console.log(`Successfully parsed ${projections.length} projections for ${dataset.lgaCount} LGAs`);
    
    return dataset;
  } catch (error) {
    console.error('Error parsing Excel file:', error);
    throw new Error(
      `Failed to parse Excel file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Convert financial year format to calendar year
 * e.g., "2020-21" → 2021, "2024-25" → 2025
 */
export function financialYearToCalendarYear(financialYear: string): number {
  if (/^\d{4}$/.test(financialYear)) {
    return parseInt(financialYear, 10);
  }

  const match = financialYear.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid financial year format: ${financialYear}`);
  }

  const startYear = parseInt(match[1], 10);
  const endYearSuffix = parseInt(match[2], 10);
  let endYear = Math.floor(startYear / 100) * 100 + endYearSuffix;

  if (endYear < startYear) {
    endYear += 100;
  }

  return endYear;
}

/**
 * Get LGA ID from NSW Planning LGA name
 */
export function getLGAIdFromName(lgaName: string): string | undefined {
  return LGA_NAME_TO_ID[lgaName] || 
    LGA_NAME_TO_ID[lgaName.toLowerCase()] ||
    LGA_NAME_TO_ID[lgaName.replace(/\s+/g, ' ').trim()];
}

/**
 * Format projection data for storage/display
 */
export function formatProjectionForStorage(
  projection: PopulationProjection
): PopulationProjection {
  return {
    ...projection,
    year: financialYearToCalendarYear(projection.financialYear),
    totalPopulation: Math.round(projection.totalPopulation),
    malePopulation: projection.malePopulation 
      ? Math.round(projection.malePopulation)
      : undefined,
    femalePopulation: projection.femalePopulation
      ? Math.round(projection.femalePopulation)
      : undefined,
  };
}

/**
 * Validate projection dataset
 */
export function validateProjectionDataset(dataset: ProjectionDataSet): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!dataset.projections || dataset.projections.length === 0) {
    errors.push('No projections found in dataset');
  }

  if (!dataset.releaseDate) {
    errors.push('Missing release date');
  }

  // Check for data quality issues
  dataset.projections.forEach((proj, idx) => {
    if (!proj.lgaName) {
      errors.push(`Projection ${idx}: Missing LGA name`);
    }
    if (!proj.financialYear) {
      errors.push(`Projection ${idx}: Missing financial year`);
    }
    if (proj.totalPopulation <= 0) {
      errors.push(`Projection ${idx}: Invalid population value`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
