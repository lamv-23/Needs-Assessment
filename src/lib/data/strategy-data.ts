import { Shield, Layers, MapPin, BookOpen } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type PriorityCode = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';

export interface StrategyItem {
  id: string;
  name: string;
  description: string;
  mandatory: boolean;
  atapPhase?: string;
}

export interface StrategyLevel {
  level: string;
  icon: LucideIcon;
  items: StrategyItem[];
}

export interface ConnectingNSWPriority {
  code: PriorityCode;
  name: string;
  color: string;
  description: string;
  evidenceAvailable: boolean;
}

export const STRATEGY_HIERARCHY: StrategyLevel[] = [
  {
    level: 'Federal',
    icon: Shield,
    items: [
      {
        id: 'ia-assessment-framework',
        name: 'Infrastructure Australia Assessment Framework',
        description: 'Required for projects seeking federal co-funding. Five stages: problem identification, options assessment, business case, detailed business case, and evaluation.',
        mandatory: true,
        atapPhase: 'SMT / BCR',
      },
      {
        id: 'atap-guidelines',
        name: 'ATAP (Australian Transport Assessment & Planning) Guidelines',
        description: 'National framework for transport planning and appraisal covering strategic merit, options development and economic appraisal.',
        mandatory: true,
        atapPhase: 'All phases',
      },
    ],
  },
  {
    level: 'NSW State',
    icon: Layers,
    items: [
      {
        id: 'connecting-nsw-2024',
        name: 'Connecting NSW Strategy (2024)',
        description: 'Sets the six current NSW transport priorities. Projects should map clearly to one or more priorities in the strategic merit test.',
        mandatory: true,
        atapPhase: 'SMT',
      },
      {
        id: 'premiers-priorities',
        name: 'NSW Premier\'s Priorities',
        description: 'Current government priorities include improved transport access and reduced travel times in growth areas.',
        mandatory: false,
        atapPhase: 'SMT',
      },
      {
        id: 'inss-20-year-strategy',
        name: 'NSW 20-Year Infrastructure Strategy (INSS)',
        description: 'Infrastructure NSW\'s prioritised infrastructure pipeline. Alignment strengthens the strategic case.',
        mandatory: false,
        atapPhase: 'SMT',
      },
      {
        id: 'movement-and-place',
        name: 'Movement and Place Framework',
        description: 'Classifies corridors by movement function and place context, guiding mode priority, speed, and street design decisions.',
        mandatory: true,
        atapPhase: 'Options',
      },
      {
        id: 'net-zero-and-decarbonisation',
        name: 'Net Zero Plan & TfNSW Decarbonisation Roadmap',
        description: 'Business cases increasingly need to address decarbonisation, Scope 1-3 emissions, and mode shift outcomes.',
        mandatory: true,
        atapPhase: 'CBA',
      },
    ],
  },
  {
    level: 'Regional / District',
    icon: MapPin,
    items: [
      {
        id: 'greater-sydney-region-plan',
        name: 'Greater Sydney Region Plan / District Plans',
        description: 'Relevant for Sydney-region LGAs and supports alignment between land use and transport outcomes.',
        mandatory: false,
        atapPhase: 'SMT',
      },
      {
        id: 'regional-transport-plans',
        name: 'Regional Transport Plans (TfNSW)',
        description: 'Regional plans set connectivity objectives, service standards and network priorities across NSW transport regions.',
        mandatory: false,
        atapPhase: 'SMT',
      },
      {
        id: 'lsps',
        name: 'Local Strategic Planning Statements (LSPS)',
        description: 'Councils use LSPS documents to align local planning decisions with district and regional strategies.',
        mandatory: false,
        atapPhase: 'SMT',
      },
    ],
  },
  {
    level: 'Network / Mode-Specific',
    icon: BookOpen,
    items: [
      {
        id: 'sydney-metro-network-plan',
        name: 'Sydney Metro Network Plan',
        description: 'Relevant for rapid transit corridors and projects that interact with committed or investigated metro corridors.',
        mandatory: false,
        atapPhase: 'Options',
      },
      {
        id: 'bus-reform-point-to-point',
        name: 'Bus Reform & Point to Point Transport Strategy',
        description: 'Sets bus network reform, route rationalisation and service design expectations.',
        mandatory: false,
        atapPhase: 'Options',
      },
      {
        id: 'freight-and-ports-plan',
        name: 'NSW Freight and Ports Plan',
        description: 'Important for freight, logistics and corridor protection cases.',
        mandatory: false,
        atapPhase: 'SMT',
      },
      {
        id: 'active-transport-strategy',
        name: 'NSW Active Transport Strategy & Walking/Cycling Plans',
        description: 'Sets walking and cycling targets and helps demonstrate network continuity and healthy streets outcomes.',
        mandatory: false,
        atapPhase: 'Options',
      },
    ],
  },
];

export const CONNECTING_NSW_PRIORITIES: ConnectingNSWPriority[] = [
  {
    code: 'P1',
    name: 'Towards zero trauma',
    color: 'bg-red-100 text-red-800',
    description: 'Improve safety outcomes and reduce trauma risk across the network.',
    evidenceAvailable: true,
  },
  {
    code: 'P2',
    name: 'Restore reliability & build resilience',
    color: 'bg-blue-100 text-blue-800',
    description: 'Minimise disruption, improve reliability and strengthen network resilience.',
    evidenceAvailable: true,
  },
  {
    code: 'P3',
    name: 'Transition to net zero emissions',
    color: 'bg-teal-100 text-teal-800',
    description: 'Reduce emissions and support transport decarbonisation and mode shift.',
    evidenceAvailable: true,
  },
  {
    code: 'P4',
    name: 'Reduce transport disadvantage',
    color: 'bg-purple-100 text-purple-800',
    description: 'Improve access to jobs, services and opportunity for disadvantaged communities.',
    evidenceAvailable: true,
  },
  {
    code: 'P5',
    name: 'Reimagine road space to drive mode shift',
    color: 'bg-green-100 text-green-800',
    description: 'Use limited road space better and encourage shift to more efficient and sustainable modes.',
    evidenceAvailable: true,
  },
  {
    code: 'P6',
    name: 'Enable whole-of-government outcomes',
    color: 'bg-amber-100 text-amber-800',
    description: 'Support broader government goals including housing, jobs and productivity outcomes.',
    evidenceAvailable: true,
  },
];

export const BENCHMARK_VALUES = {
  carModeShare: { greaterSydney: 63, nsw: 66 },
  ptModeShare: { greaterSydney: 22, nsw: 16 },
  seifaScore: { greaterSydney: 1020, nsw: 1000 },
  unemploymentRate: { greaterSydney: 4.8, nsw: 5.2 },
  medianWeeklyIncome: { greaterSydney: 1750, nsw: 1500 },
  avgCommuteTime: { greaterSydney: 34, nsw: 30 },
  populationGrowthPct2041: { greaterSydney: 20, nsw: 15 },
  zeroCarHouseholds: { greaterSydney: 11, nsw: 8 },
  activeModeShare: { greaterSydney: 8, nsw: 6 },
  multiCarHouseholds: { greaterSydney: 27, nsw: 31 },
  jobsToPopulationRatio: { greaterSydney: 42, nsw: 39 },
} as const;

export function seifaBand(score: number): { label: string; color: string; description: string } {
  if (score >= 1050) return { label: 'Low disadvantage', color: 'text-emerald-700', description: 'Area is in the least disadvantaged quartile nationally.' };
  if (score >= 1000) return { label: 'Below average disadvantage', color: 'text-blue-700', description: 'Area is slightly below the national median of disadvantage.' };
  if (score >= 950) return { label: 'Moderate disadvantage', color: 'text-amber-700', description: 'Area is moderately disadvantaged relative to NSW average.' };
  return { label: 'High disadvantage', color: 'text-red-700', description: 'Area is in the most disadvantaged quartile, strengthening the equity case.' };
}
