#!/usr/bin/env node

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

async function parseExcel() {
  try {
    console.log('🔍 Parsing NSW Population Projections Excel file...');
    
    const workbook = XLSX.readFile('/tmp/nsw_projections.xlsx');
    const sheetName = 'Total population';
    console.log(`📄 Reading sheet: ${sheetName}`);
    
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (rows.length < 8) {
      throw new Error('Excel file is empty or unexpected format');
    }
    
    console.log(`✓ Found ${rows.length} rows`);
    
    // Row index 6 (row 7) contains headers: ["Local Government Area", 2001, 2002, ...]
    const headerRowIndex = 6;
    const headers = rows[headerRowIndex];
    console.log(`✓ Headers: ${headers.slice(0, 5).join(', ')} ...`);
    
    // Find year columns (we only want 2021 onwards = projections)
    const yearColumns = [];
    headers.forEach((header, idx) => {
      const year = parseInt(header, 10);
      if (!isNaN(year) && year >= 2021 && year <= 2041) {
        yearColumns.push({ index: idx, year });
      }
    });
    
    console.log(`✓ Found ${yearColumns.length} year columns`);
    
    // Parse data starting from row after header
    const projections = [];
    let lgaCount = 0;
    
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      const lgaName = String(row[0]).trim();
      
      if (!lgaName || lgaName.toLowerCase() === 'total' || lgaName.toLowerCase() === 'nsw') {
        continue;
      }
      
      lgaCount++;
      
      for (const { year, index } of yearColumns) {
        const popValue = row[index];
        const population = parseInt(String(popValue).replace(/,/g, ''), 10);
        
        if (!isNaN(population) && population > 0) {
          projections.push({
            lgaName,
            year,
            totalPopulation: population,
          });
        }
      }
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
  
  // Generate TypeScript file for client-side use
  const tsContent = `/**
 * AUTO-GENERATED: NSW Population Projections Data
 * Source: NSW Department of Planning, Housing and Infrastructure
 * Date: ${new Date().toISOString()}
 */

export interface NSWProjection {
  lgaName: string;
  year: number;
  totalPopulation: number;
}

export const nsw_population_projections: NSWProjection[] = ${JSON.stringify(projections, null, 2)};

export const PROJECTION_YEARS = [${years.join(', ')}];

export const PROJECTION_LGAS = [${lgas.map(n => `'${n}'`).join(', ')}];

export function getProjection(lgaName: string, year: number): NSWProjection | undefined {
  return nsw_population_projections.find(p => p.lgaName === lgaName && p.year === year);
}

export function getProjectionsForLGA(lgaName: string): NSWProjection[] {
  return nsw_population_projections
    .filter(p => p.lgaName === lgaName)
    .sort((a, b) => a.year - b.year);
}

export function getProjectionsForYear(year: number): NSWProjection[] {
  return nsw_population_projections
    .filter(p => p.year === year)
    .sort((a, b) => a.lgaName.localeCompare(b.lgaName));
}
`;

  const outputPath = '/Users/victor/Documents/Needs Assessment/Needs-Assessment/src/lib/data/nsw-projections-data.ts';
  
  fs.writeFileSync(outputPath, tsContent);
  console.log(`\n📝 Generated: ${outputPath}`);
  console.log(`📊 Total records: ${projections.length}`);
  console.log(`🏛️ LGAs: ${lgas.length}`);
  console.log(`📅 Years: ${years[0]}-${years[years.length - 1]}`);
}

main();
