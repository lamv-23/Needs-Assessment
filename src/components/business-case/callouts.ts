// src/components/business-case/callouts.ts
import type { SectionId } from '@/store/businessCaseStore';

export const CALLOUTS: Record<'road', Record<SectionId, string>> = {
  road: {
    scene: 'Establishes the demographic context of the study area — population size, age profile, and socio-economic characteristics that drive transport demand.',
    growth: 'Documents the scale of projected growth, a core requirement of the Benefits Management Framework. High growth rates strengthen the case for new capacity.',
    'car-dependency':
      'Demonstrates structural reliance on private vehicles — a key problem statement for road investment. Trend data shows this is not a short-term phenomenon.',
    congestion:
      'Quantifies the travel time burden on existing users. Commute time trends establish a deteriorating baseline against which project benefits are measured.',
    economy:
      'Links transport access to employment and economic activity. Relevant to the Strategic Economic Infrastructure test in NSW infrastructure guidelines.',
    'strategic-alignment':
      'Summarises how the project aligns with selected strategies and Connecting NSW priorities, ready for inclusion in the strategic case and report export.',
    gap: 'Benchmarks current performance against TfNSW level of service standards, providing an evidence-based statement of the infrastructure gap.',
    evidence:
      'Summary of available data quality. Informs the Evidence Assessment section of the business case and flags where supplementary data collection may be needed.',
  },
};
