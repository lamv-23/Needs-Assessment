'use client';

import Header from '@/components/layout/Header';
import ProjectionUploadPanel from '@/components/admin/ProjectionUploadPanel';
import { useProjectionStore } from '@/store/projectionStore';

export default function UploadPage() {
  const { projectionMetadata } = useProjectionStore();

  return (
    <div>
      <Header
        title="Data Management"
        subtitle="Upload and manage NSW population projections"
      />

      <div className="p-6 max-w-2xl">
        <div className="bg-white rounded-lg shadow p-6">
          <ProjectionUploadPanel />
        </div>

        {/* Data Status */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
              Population Projections
            </h3>
            {projectionMetadata ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className="font-medium text-green-700">✓ Loaded</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">LGAs:</span>
                  <span className="font-medium">{projectionMetadata.lgaCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Records:</span>
                  <span className="font-medium">{projectionMetadata.projections.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Period:</span>
                  <span className="font-medium">{projectionMetadata.referenceYears}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Uploaded:</span>
                  <span className="font-medium text-xs">
                    {new Date(projectionMetadata.lastUpdated).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                <p>No projection data loaded</p>
                <p className="text-xs mt-2">Upload an Excel file to get started</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
              ABS Real Data
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className="font-medium text-green-700">✓ Active</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Source:</span>
                <span className="font-medium">ABS Data API</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Update Freq:</span>
                <span className="font-medium">Monthly/Annually</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Coverage:</span>
                <span className="font-medium">All LGAs</span>
              </div>
              <p className="text-xs text-gray-500 mt-4">
                Real-time population, demographics, and employment data from the Australian Bureau of Statistics
              </p>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="text-sm font-semibold text-blue-900 mb-2">📊 Data Integration</h4>
          <p className="text-sm text-blue-800 mb-3">
            Your dashboard uses two complementary data sources:
          </p>
          <ul className="text-sm text-blue-700 space-y-2 list-disc list-inside">
            <li>
              <strong>Real Data (ABS):</strong> Current census 2021 and estimated resident population via API (automatic updates)
            </li>
            <li>
              <strong>Projections (NSW Planning):</strong> Future population scenarios 2021-2041 (manual quarterly updates recommended)
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
