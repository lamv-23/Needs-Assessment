// src/components/business-case/WizardModal.tsx
'use client';

import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Wand2 } from 'lucide-react';
import { THEMES, type ThemeKey } from '@/store/businessCaseStore';
import { SAMPLE_AREAS } from '@/lib/data/sample-areas';

interface WizardModalProps {
  onGenerate: (config: {
    projectName: string;
    areaIds: string[];
    themes: ThemeKey[];
  }) => void;
  onClose: () => void;
}

const PROJECT_TYPES = [
  { key: 'road', label: 'Road', available: true },
  { key: 'rail', label: 'Rail / Metro', available: false },
  { key: 'active', label: 'Active Transport', available: false },
  { key: 'freight', label: 'Freight', available: false },
] as const;

export default function WizardModal({ onGenerate, onClose }: WizardModalProps) {
  const [step, setStep] = useState(1);
  const [projectType, setProjectType] = useState<'road'>('road');
  const [projectName, setProjectName] = useState('');
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [areaSearch, setAreaSearch] = useState('');
  const [themes, setThemes] = useState<ThemeKey[]>(THEMES.map(t => t.key));

  const filteredAreas = SAMPLE_AREAS.filter(a =>
    a.type === 'lga' &&
    a.name.toLowerCase().includes(areaSearch.toLowerCase())
  ).slice(0, 40);

  const toggleArea = (id: string) => {
    setAreaIds(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const toggleTheme = (key: ThemeKey) => {
    setThemes(prev =>
      prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key]
    );
  };

  const canProceedStep1 = projectName.trim().length > 0 && areaIds.length > 0;
  const canProceedStep2 = themes.length > 0;

  const handleGenerate = () => {
    onGenerate({ projectName: projectName.trim(), areaIds, themes });
  };

  const selectedAreaNames = areaIds.map(id => SAMPLE_AREAS.find(a => a.id === id)?.name ?? id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 text-gray-900 font-semibold">
            <Wand2 className="w-5 h-5 text-indigo-600" />
            Business Case Wizard
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex px-6 pt-4 gap-2">
          {[1, 2, 3].map(n => (
            <div key={n} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step >= n ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'
              }`}>{n}</div>
              {n < 3 && <div className={`flex-1 h-0.5 ${step > n ? 'bg-indigo-600' : 'bg-gray-100'}`} />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="px-6 py-5 min-h-[320px]">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Step 1 of 3</p>
                <h2 className="text-lg font-semibold text-gray-900">Project Context</h2>
              </div>

              {/* Project type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Project type</label>
                <div className="grid grid-cols-2 gap-2">
                  {PROJECT_TYPES.map(pt => (
                    <button
                      key={pt.key}
                      disabled={!pt.available}
                      onClick={() => pt.available && setProjectType('road')}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium text-left transition-colors ${
                        pt.available
                          ? projectType === pt.key
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                          : 'border-gray-100 text-gray-300 cursor-not-allowed bg-gray-50'
                      }`}
                    >
                      {pt.label}
                      {!pt.available && <span className="ml-1 text-xs text-gray-300">(soon)</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Project name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  placeholder="e.g. Western Sydney Airport Connector Road"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* Area selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Study area LGAs <span className="text-gray-400 font-normal">(up to 4)</span>
                </label>
                {areaIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {areaIds.map(id => (
                      <span key={id} className="flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs">
                        {SAMPLE_AREAS.find(a => a.id === id)?.name ?? id}
                        <button onClick={() => toggleArea(id)} className="hover:text-indigo-900">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  value={areaSearch}
                  onChange={e => setAreaSearch(e.target.value)}
                  placeholder="Search LGA..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <div className="border border-gray-200 rounded-lg max-h-36 overflow-y-auto">
                  {filteredAreas.map(area => (
                    <button
                      key={area.id}
                      onClick={() => toggleArea(area.id)}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors ${
                        areaIds.includes(area.id) ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'
                      }`}
                    >
                      {area.name}
                    </button>
                  ))}
                  {filteredAreas.length === 0 && (
                    <p className="px-3 py-2 text-sm text-gray-400">No results</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Step 2 of 3</p>
                <h2 className="text-lg font-semibold text-gray-900">Problem Framing</h2>
                <p className="text-sm text-gray-500 mt-1">Select the problems this project addresses. Each theme adds relevant evidence sections to your report.</p>
              </div>
              <div className="space-y-2">
                {THEMES.map(theme => (
                  <label key={theme.key} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={themes.includes(theme.key)}
                      onChange={() => toggleTheme(theme.key)}
                      className="w-4 h-4 accent-indigo-600"
                    />
                    <span className="text-sm text-gray-800">{theme.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Step 3 of 3</p>
                <h2 className="text-lg font-semibold text-gray-900">Review & Generate</h2>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3 text-sm">
                <div>
                  <span className="text-gray-500">Project:</span>{' '}
                  <span className="font-medium text-gray-900">{projectName}</span>
                </div>
                <div>
                  <span className="text-gray-500">Type:</span>{' '}
                  <span className="font-medium text-gray-900 capitalize">{projectType}</span>
                </div>
                <div>
                  <span className="text-gray-500">Areas:</span>{' '}
                  <span className="font-medium text-gray-900">{selectedAreaNames.join(', ')}</span>
                </div>
                <div>
                  <span className="text-gray-500">Evidence themes:</span>
                  <ul className="mt-1 space-y-0.5 ml-2">
                    {THEMES.filter(t => themes.includes(t.key)).map(t => (
                      <li key={t.key} className="text-gray-700">· {t.label}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="flex items-center gap-1 px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
              className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >
              <Wand2 className="w-4 h-4" />
              Generate Business Case Evidence
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
