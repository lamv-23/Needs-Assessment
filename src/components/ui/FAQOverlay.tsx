'use client';

import { useState } from 'react';
import { X, ChevronDown, ArrowRight, HelpCircle } from 'lucide-react';

const faqs = [
  {
    q: 'What is a transport needs assessment and why does it matter?',
    a: 'A transport needs assessment is a structured analysis of how people in an area travel, what transport services exist, and where gaps or problems occur. It is usually the first step in building a business case for new infrastructure or services — it establishes the "problem" that a proposed project aims to solve. Government agencies like Transport for NSW and Infrastructure NSW require a needs assessment to justify funding and prioritise investment.',
  },
  {
    q: 'What is an LGA and how do I choose the right one?',
    a: 'LGA stands for Local Government Area — the geographic boundary managed by a local council (e.g. City of Parramatta, Blacktown City). This tool organises data by LGA because councils and state agencies commonly plan and report at this scale. Choose the LGA that contains the area or corridor you are assessing. If a project crosses multiple LGAs, use the Compare Areas tool to view them side by side.',
  },
  {
    q: 'What data is available and how current is it?',
    a: 'The tool draws on three main sources: ABS Census data from 2011, 2016, and 2021 (covering population, employment, housing, education, and journey-to-work); TfNSW transport data (mode share and commute patterns); and NSW Department of Planning & Environment (DPE) population and employment projections through to 2041. Census data is updated every five years; projections are updated periodically by DPE and TfNSW.',
  },
  {
    q: 'What is mode share and why is it important?',
    a: 'Mode share is the percentage of trips made by each type of transport — for example, 65% by private car, 20% by train, 10% by bus, and 5% by walking or cycling. It is a key indicator of how reliant an area is on a single mode (usually the car) and how well public transport is performing. A low public transport mode share in a growing area is often the starting point for a transport needs argument.',
  },
  {
    q: 'What is SEIFA and what does it tell me about an area?',
    a: 'SEIFA stands for Socio-Economic Indexes for Areas, produced by the ABS. The most commonly used index is the Index of Relative Socio-economic Advantage and Disadvantage (IRSAD). A lower SEIFA score means an area has more households experiencing disadvantage — lower incomes, higher unemployment, lower education levels. This matters for transport planning because disadvantaged communities are often more dependent on public transport and have fewer alternatives if services are inadequate.',
  },
  {
    q: 'What is the Future Transport Strategy 2056 (FTS 2056)?',
    a: 'The Future Transport Strategy 2056 is the NSW Government\'s overarching 40-year vision for transport in the state, published by Transport for NSW. It sets six customer outcomes — such as "connected communities", "liveable cities", and "accessible services" — that all transport investments are expected to contribute to. Demonstrating alignment with FTS 2056 outcomes is a standard requirement in NSW business cases. The Strategic Alignment module in this tool maps your selected area\'s data against these outcomes.',
  },
  {
    q: 'What is ATAP and how does strategic alignment work?',
    a: 'ATAP stands for the Australian Transport Assessment and Planning guidelines — a national framework that standardises how transport projects are assessed and evaluated. It covers the five-case business case model (strategic, economic, commercial, financial, and management cases). Strategic alignment means showing that a proposed project is consistent with government policies and strategies. In this tool, the Strategic Alignment module helps you identify which FTS 2056 outcomes and ATAP criteria are supported by the data for your area.',
  },
  {
    q: 'How do I use this tool to support a business case?',
    a: 'Start by selecting your LGA using the area selector at the top of the page. Then work through the modules in order: Demographics gives you the population context; Transport shows existing travel behaviour and gaps; Economy and Housing provide supporting evidence for growth pressures; Growth & Projections quantifies future demand. Use Problem Definition to articulate the transport problem, and Strategic Alignment to connect it to government priorities. Finally, use the Report Builder to export a PDF summary suitable for inclusion in a business case or briefing document.',
  },
];

interface FAQOverlayProps {
  onClose: () => void;
  onStartExploring?: () => void;
}

export default function FAQOverlay({ onClose, onStartExploring }: FAQOverlayProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  const handleStart = () => {
    onClose();
    onStartExploring?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Getting Started"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-primary-600 to-blue-500">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 rounded-lg p-1.5">
              <HelpCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Getting Started</h2>
              <p className="text-xs text-blue-100">Answers to common questions about this tool</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white hover:bg-white/20 rounded-lg p-1.5 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Accordion body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-2">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="border border-gray-100 rounded-xl overflow-hidden"
            >
              <button
                onClick={() => toggle(i)}
                className="w-full flex items-center justify-between gap-4 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="flex items-center gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-50 text-primary-600 text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-800">{faq.q}</span>
                </span>
                <ChevronDown
                  className={`flex-shrink-0 w-4 h-4 text-gray-400 transition-transform duration-200 ${
                    openIndex === i ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {openIndex === i && (
                <div className="px-4 pb-4 pt-0">
                  <div className="ml-9 text-sm text-gray-600 leading-relaxed border-l-2 border-primary-100 pl-4">
                    {faq.a}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-4">
          <p className="text-xs text-gray-500">
            Select an LGA using the area selector in the top bar to begin exploring data.
          </p>
          <button
            onClick={handleStart}
            className="flex-shrink-0 flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Start Exploring
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
