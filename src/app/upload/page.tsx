'use client';

import { useState, useCallback } from 'react';
import Header from '@/components/layout/Header';
import { Upload, FileText, CheckCircle, AlertCircle, X, Download } from 'lucide-react';

interface UploadedFile {
  name: string;
  size: number;
  category: string;
  status: 'pending' | 'success' | 'error';
  rows?: number;
  error?: string;
}

const CATEGORIES = [
  { value: 'demographics', label: 'Population & Demographics' },
  { value: 'transport', label: 'Transport & Commuting' },
  { value: 'economy', label: 'Economy & Employment' },
  { value: 'education', label: 'Education' },
  { value: 'housing', label: 'Housing & Land Use' },
  { value: 'growth', label: 'Growth & Projections' },
  { value: 'custom', label: 'Custom Data' },
];

const TEMPLATES = [
  { name: 'Census Population Template', filename: 'census_population_template.csv', description: 'ABS Census population data by SA2/LGA' },
  { name: 'Journey to Work Template', filename: 'jtw_template.csv', description: 'Mode share data by SA2/LGA' },
  { name: 'Employment Template', filename: 'employment_template.csv', description: 'Employment by industry data' },
  { name: 'DPE Projections Template', filename: 'projections_template.csv', description: 'Population/employment projections' },
];

export default function UploadPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('demographics');

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const processFile = (file: File) => {
    const uploadedFile: UploadedFile = {
      name: file.name,
      size: file.size,
      category: selectedCategory,
      status: 'pending',
    };

    // Simulate processing
    setFiles(prev => [...prev, uploadedFile]);

    setTimeout(() => {
      setFiles(prev =>
        prev.map(f =>
          f.name === file.name && f.status === 'pending'
            ? {
                ...f,
                status: file.name.endsWith('.csv') || file.name.endsWith('.xlsx')
                  ? 'success'
                  : 'error',
                rows: file.name.endsWith('.csv') || file.name.endsWith('.xlsx')
                  ? Math.floor(Math.random() * 500) + 50
                  : undefined,
                error: !(file.name.endsWith('.csv') || file.name.endsWith('.xlsx'))
                  ? 'Unsupported file format. Please upload CSV or Excel files.'
                  : undefined,
              }
            : f
        )
      );
    }, 1500);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      Array.from(e.dataTransfer.files).forEach(processFile);
    }
  }, [selectedCategory]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      Array.from(e.target.files).forEach(processFile);
    }
  };

  const removeFile = (name: string) => {
    setFiles(files.filter(f => f.name !== name));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      <Header title="Upload Data" subtitle="Import CSV or Excel data to supplement the assessment" />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Upload Section */}
          <div className="col-span-8 space-y-6">
            {/* Category Selection */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Data Category</h3>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            {/* Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`bg-white rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
                dragActive
                  ? 'border-primary-400 bg-primary-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <Upload className={`w-12 h-12 mx-auto mb-4 ${dragActive ? 'text-primary-500' : 'text-gray-400'}`} />
              <p className="text-lg font-medium text-gray-700">
                Drag and drop files here
              </p>
              <p className="text-sm text-gray-500 mt-1">
                or click to browse — CSV, Excel (.xlsx) supported
              </p>
              <label className="inline-block mt-4 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg cursor-pointer hover:bg-primary-700 transition-colors">
                Browse Files
                <input
                  type="file"
                  className="hidden"
                  accept=".csv,.xlsx,.xls"
                  multiple
                  onChange={handleFileInput}
                />
              </label>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-4 py-3 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700">Uploaded Files</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {files.map((file, i) => (
                    <div key={`${file.name}-${i}`} className="flex items-center gap-4 px-4 py-3">
                      <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                        <p className="text-xs text-gray-400">
                          {formatFileSize(file.size)} • {CATEGORIES.find(c => c.value === file.category)?.label}
                          {file.rows && ` • ${file.rows} rows`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {file.status === 'pending' && (
                          <div className="w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                        )}
                        {file.status === 'success' && (
                          <CheckCircle className="w-5 h-5 text-emerald-500" />
                        )}
                        {file.status === 'error' && (
                          <div className="flex items-center gap-1">
                            <AlertCircle className="w-5 h-5 text-red-500" />
                            <span className="text-xs text-red-500">{file.error}</span>
                          </div>
                        )}
                        <button onClick={() => removeFile(file.name)} className="p-1 text-gray-400 hover:text-gray-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Templates & Help */}
          <div className="col-span-4 space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Data Templates</h3>
              <p className="text-xs text-gray-500 mb-4">
                Download CSV templates pre-formatted for each data category
              </p>
              <div className="space-y-2">
                {TEMPLATES.map(template => (
                  <button
                    key={template.filename}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm rounded-lg hover:bg-gray-50 transition-colors border border-gray-100"
                  >
                    <Download className="w-4 h-4 text-primary-600 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-gray-700">{template.name}</p>
                      <p className="text-xs text-gray-400">{template.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
              <h3 className="text-sm font-semibold text-blue-800 mb-2">Data Format Guide</h3>
              <ul className="text-xs text-blue-700 space-y-1.5">
                <li>• First row should contain column headers</li>
                <li>• Include an &lsquo;area_id&rsquo; or &lsquo;area_name&rsquo; column</li>
                <li>• Include a &lsquo;year&rsquo; column for time series data</li>
                <li>• Numeric values should not contain commas</li>
                <li>• Use SA2 codes or LGA names matching the tool</li>
              </ul>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Supported Sources</h3>
              <ul className="text-xs text-gray-500 space-y-1">
                <li>• ABS TableBuilder exports</li>
                <li>• ABS Community Profiles CSV</li>
                <li>• TfNSW Open Data exports</li>
                <li>• DPE population projections</li>
                <li>• Custom formatted CSVs</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
