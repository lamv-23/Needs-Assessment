'use client';

import React, { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { parseNSWProjectionsExcel } from '@/lib/excel-parser';
import { useProjectionStore } from '@/store/projectionStore';

export default function ProjectionUploadPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const { setProjections, setImporting, setImportError, importError, isImporting, projectionMetadata } =
    useProjectionStore();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setImporting(true);
    setImportError(null);

    try {
      console.log(`Processing file: ${file.name}`);

      // Read file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      // Parse the Excel file
      const result = await parseNSWProjectionsExcel(arrayBuffer);

      console.log(`Successfully parsed ${result.projections.length} projections`);

      // Store in Zustand
      setProjections(result.projections, result);
      setImporting(false);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Import failed:', errorMsg);
      setImportError(errorMsg);
      setImporting(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (fileInputRef.current) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInputRef.current.files = dataTransfer.files;

        const event = new Event('change', { bubbles: true });
        fileInputRef.current.dispatchEvent(event);
      }
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">NSW Population Projections</h3>

      {/* Upload Area */}
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-400 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isImporting}
        />

        <div className="flex flex-col items-center gap-2">
          {isImporting ? (
            <>
              <Loader className="w-8 h-8 text-primary-600 animate-spin" />
              <p className="text-sm font-medium text-gray-700">Importing...</p>
            </>
          ) : (
            <>
              <Upload className="w-8 h-8 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Drop Excel file here or click to upload
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Download from: NSW Planning Population Projections 2024
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Status Messages */}
      {importError && (
        <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-900">Import Failed</p>
            <p className="text-xs text-red-700 mt-1">{importError}</p>
          </div>
        </div>
      )}

      {projectionMetadata && !importError && (
        <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-900">Import Successful</p>
            <div className="text-xs text-green-700 mt-1 space-y-1">
              <p>✓ Loaded {projectionMetadata.lgaCount} LGAs</p>
              <p>✓ {projectionMetadata.projections.length} total projections</p>
              <p>✓ Years: {projectionMetadata.referenceYears}</p>
              <p>✓ Last updated: {new Date(projectionMetadata.lastUpdated).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {fileName && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs font-medium text-blue-900">Current file: {fileName}</p>
        </div>
      )}

      {/* Instructions */}
      <div className="p-4 bg-gray-50 rounded-lg">
        <h4 className="text-xs font-semibold text-gray-900 uppercase mb-2">How to use:</h4>
        <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
          <li>
            Download the LGA file from{' '}
            <a
              href="https://www.planning.nsw.gov.au/data-and-insights/population-projections/explore-the-data#data-downloads"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:underline"
            >
              NSW Planning
            </a>
          </li>
          <li>Select the "Local government areas" Excel file (4.3 MB)</li>
          <li>Upload it using this panel</li>
          <li>Projections will be automatically integrated into all pages</li>
        </ol>
      </div>
    </div>
  );
}
