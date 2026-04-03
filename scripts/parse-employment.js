#!/usr/bin/env node

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

async function parseExcel() {
  try {
    console.log('🔍 Parsing TfNSW Employment Projections Excel file...');
    
    // Try multiple common file locations
    const possiblePaths = [
      '/tmp/tzp24_employment.xlsx',
      '/tmp/employment_projections.xlsx',
      path.join(process.cwd(), 'TZP24-Employment-Summary.xlsx'),
      path.join(process.cwd(), 'employment-projections.xlsx'),
    ];
    
    let filePath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }
    
    if (!filePath) {
      throw new Error(
        `Employment Excel file not found. Please download TZP24 Employment Summary from:\n` +
        `https://opendata.transport.nsw.gov.au/data/dataset/employment-projections\n\n` +
        `Then place it in one of these locations:\n` +
        possiblePaths.join('\n')
      );
    }
    
    console.log(`📂 Reading file: ${filePath}`);
    const workbook = XLSX.readFile(filePath);
    
    console.log(`📋 Available sheets: ${workbook.SheetNames.join(', ')}`);
    
    // Try to find a sheet with employment data (common names)
    const sheetCandidates = [
      'Total Employment',
      'Employment',
      'Total Employed',
      'Summary',
      workbook.SheetNames[0], // fallback to first sheet
    ];
    
    let worksheet = null;
    let sheetName = null;
    for (const candidate of sheetCandidates) {
      if (workbook.Sheets[candidate]) {
        worksheet = workbook.Sheets[candidate];
        sheetName = candidate;
        break;
      }
    }
    
    if (!worksheet) {
      throw new Error(`No suitable employment sheet found in workbook`);
    }
    
    console.log(`📄 Using sheet: ${sheetName}`);
    
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (rows.length < 5) {
      throw new Error('Excel sheet is empty or unexpected format');
    }
    
    console.log(`✓ Found ${rows.length} rows`);
    
    // Find header row (typically contains "Local Government Area", "LGA", or "Travel Zone" in first column)
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const firstCell = String(rows[i][0] || '').toLowerCase();
      if (firstCell.includes('lga') || firstCell.includes('area') || firstCell.includes('zone')) {
        headerRowIndex = i;
        break;
      }
    }
    
    const headers = rows[headerRowIndex];
    console.log(`✓ Headers (first 8): ${headers.slice(0, 8).join(', ')}`);
    
    // Find year columns (2021 onwards for 2041 projection)
    const yearColumns = [];
    headers.forEach((header, idx) => {
      const year = parseInt(header, 10);
      if (!isNaN(year) && year >= 2021 && year <= 2041) {
        yearColumns.push({ index: idx, year });
      }
    });
    
    if (yearColumns.length === 0) {
      // If no years found, assume columns are sequential starting after first column
      console.log('⚠️ No year headers found, attempting sequential year detection...');
      for (let idx = 1; idx < headers.length; idx++) {
        const year = 2021 + (idx - 1);
        if (year <= 2041) {
          yearColumns.push({ index: idx, year });
        }
      }
    }
    
    console.log(`✓ Found ${yearColumns.length} year columns (${yearColumns[0]?.year}-${yearColumns[yearColumns.length - 1]?.year})`);
    
    // Parse data starting from row after header
    const projections = [];
    let lgaCount = 0;
    
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      const lgaName = String(row[0] || '').trim();
      
      // Skip empty rows, totals, and NSW-wide rows
      if (!lgaName || lgaName.toLowerCase() === 'total' || lgaName.toLowerCase() === 'nsw') {
        continue;
      }
      
      lgaCount++;
      
      for (const { year, index } of yearColumns) {
        const empValue = row[index];
        const employment = parseInt(String(empValue).replace(/,/g, ''), 10);
        
        if (!isNaN(employment) && employment > 0) {
          projections.push({
            lgaName,
            year,
            totalEmployed: employment,
          });
        }
      }
    }
    
    if (projections.length === 0) {
      throw new Error('No employment data parsed from Excel file. Check sheet structure.');
    }
    
    console.log(`✅ Parsed ${projections.length} projections for ${lgaCount} LGAs`);
    
    return projections;
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

async function main() {
  const projections = await parseExcel();
  
  const years = [...new Set(projections.map(p => p.year))].sort((a, b) => a - b);
  const lgas = [...new Set(projections.map(p => p.lgaName))].sort();
  
  // For 2032-2041, interpolate from 5-yearly data if available
  let finalProjections = [...projections];
  
  // If we have 2031 but not 2032-2041, extrapolate
  if (years.includes(2031) && !years.includes(2036)) {
    console.log('📊 Extrapolating 2032-2041 from available 5-yearly intervals...');
    // Create annual interpolation from available years
    for (const lga of lgas) {
      const lgaData = projections.filter(p => p.lgaName === lga).sort((a, b) => a.year - b.year);
      const lastYear = lgaData[lgaData.length - 1].year;
      const lastValue = lgaData[lgaData.length - 1].totalEmployed;
      const prevYear = lgaData[lgaData.length - 2]?.year || lastYear - 1;
      const prevValue = lgaData[lgaData.length - 2]?.totalEmployed || lastValue;
      
      // Linear interpolation rate
      const annualChange = (lastValue - prevValue) / (lastYear - prevYear);
      
      for (let y = lastYear + 1; y <= 2041; y++) {
        const projectedValue = Math.round(lastValue + annualChange * (y - lastYear));
        finalProjections.push({
          lgaName: lga,
          year: y,
          totalEmployed: projectedValue,
        });
      }
    }
  }
  
  // Update years list
  const finalYears = [...new Set(finalProjections.map(p => p.year))].sort((a, b) => a - b);
  
  // Generate TypeScript file
  const tsContent = `/**
 * AUTO-GENERATED: NSW Employment Projections Data
 * Source: Transport for NSW - Travel Zone Projections 2024 (TZP24)
 * Date: ${new Date().toISOString()}
 */

export interface EmploymentProjection {
  lgaName: string;
  year: number;
  totalEmployed: number;
}

export const nsw_employment_projections: EmploymentProjection[] = ${JSON.stringify(finalProjections, null, 2)};

export const EMPLOYMENT_PROJECTION_YEARS = [${finalYears.join(', ')}];

export const EMPLOYMENT_PROJECTION_LGAS = [${lgas.map(n => `'${n}'`).join(', ')}];

export function getEmploymentProjection(lgaName: string, year: number): EmploymentProjection | undefined {
  return nsw_employment_projections.find(p => p.lgaName === lgaName && p.year === year);
}

export function getEmploymentProjectionsForLGA(lgaName: string): EmploymentProjection[] {
  return nsw_employment_projections
    .filter(p => p.lgaName === lgaName)
    .sort((a, b) => a.year - b.year);
}

export function getEmploymentProjectionsForYear(year: number): EmploymentProjection[] {
  return nsw_employment_projections
    .filter(p => p.year === year)
    .sort((a, b) => a.lgaName.localeCompare(b.lgaName));
}

// Mapping from dashboard area IDs/names to employment projection LGA names
const AREA_TO_EMPLOYMENT_LGA: Record<string, string> = {
  // Add mappings as needed based on your dashboard area naming
};

export function resolveEmploymentProjectionName(areaIdOrName: string): string | undefined {
  const key = areaIdOrName.toLowerCase().trim();
  
  // Try direct mapping first
  if (AREA_TO_EMPLOYMENT_LGA[key]) {
    return AREA_TO_EMPLOYMENT_LGA[key];
  }
  
  // Try to find by exact LGA name match
  const exactMatch = EMPLOYMENT_PROJECTION_LGAS.find(
    lga => lga.toLowerCase() === key
  );
  if (exactMatch) return exactMatch;
  
  // Try to find by prefix match (e.g., "City of Sydney" -> "Sydney")
  const prefixMatch = EMPLOYMENT_PROJECTION_LGAS.find(
    lga => key.includes(lga.toLowerCase()) || lga.toLowerCase().includes(key)
  );
  return prefixMatch;
}

export function getEmploymentProjectionsForArea(areaIdOrName: string): EmploymentProjection[] {
  const lgaName = resolveEmploymentProjectionName(areaIdOrName);
  if (!lgaName) return [];
  return getEmploymentProjectionsForLGA(lgaName);
}

export function getEmploymentProjectionForArea(areaIdOrName: string, year: number): EmploymentProjection | undefined {
  const lgaName = resolveEmploymentProjectionName(areaIdOrName);
  if (!lgaName) return undefined;
  return getEmploymentProjection(lgaName, year);
}
`;

  const outputPath = path.join(process.cwd(), 'src/lib/data/nsw-employment-projections.ts');
  
  fs.writeFileSync(outputPath, tsContent);
  console.log(`\n📝 Generated: ${outputPath}`);
  console.log(`📊 Total records: ${finalProjections.length}`);
  console.log(`🏛️ LGAs: ${lgas.length}`);
  console.log(`📅 Years: ${finalYears[0]}-${finalYears[finalYears.length - 1]}`);
  console.log('\n✅ Employment data file generated successfully!');
}

main();
