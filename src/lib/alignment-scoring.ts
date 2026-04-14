import type { PriorityCode } from '@/lib/data/strategy-data';

export type AlignmentStrength = 'Strong' | 'Moderate' | 'Weak';

export interface AlignmentMetrics {
  popGrowthPct: number;
  avgCommuteTime: number | null;
  carModeShare: number;
  seifaScore: number;
  unemploymentRate: number;
}

export interface AlignmentScoreResult {
  strength: AlignmentStrength;
  metric: string;
  value: number;
  rationale: string;
}

function classify(value: number, strong: boolean, moderate: boolean): AlignmentStrength {
  if (strong) return 'Strong';
  if (moderate) return 'Moderate';
  return 'Weak';
}

export function computeAlignmentStrength(priority: PriorityCode, metrics: AlignmentMetrics): AlignmentScoreResult {
  switch (priority) {
    case 'P1': {
      const strength = classify(metrics.popGrowthPct, metrics.popGrowthPct > 25, metrics.popGrowthPct >= 15);
      return {
        strength,
        metric: 'Population growth to 2041',
        value: metrics.popGrowthPct,
        rationale: `${metrics.popGrowthPct.toFixed(1)}% growth indicates ${strength.toLowerCase()} pressure for safety-focused network planning.`,
      };
    }
    case 'P2': {
      if (metrics.avgCommuteTime === null) {
        return {
          strength: 'Weak',
          metric: 'Average commute time',
          value: 0,
          rationale: 'Official commute-time data is not currently integrated for this area, so P2 alignment should rely on other resilience evidence.',
        };
      }
      const strength = classify(metrics.avgCommuteTime, metrics.avgCommuteTime > 35, metrics.avgCommuteTime >= 25);
      return {
        strength,
        metric: 'Average commute time',
        value: metrics.avgCommuteTime,
        rationale: `${metrics.avgCommuteTime.toFixed(1)} minute average commute suggests ${strength.toLowerCase()} reliability and resilience evidence.`,
      };
    }
    case 'P3': {
      const strength = classify(metrics.carModeShare, metrics.carModeShare > 75, metrics.carModeShare >= 60);
      return {
        strength,
        metric: 'Car mode share',
        value: metrics.carModeShare,
        rationale: `${metrics.carModeShare.toFixed(1)}% car mode share suggests ${strength.toLowerCase()} decarbonisation pressure.`,
      };
    }
    case 'P4': {
      const strength = classify(metrics.seifaScore, metrics.seifaScore < 950, metrics.seifaScore <= 1000);
      return {
        strength,
        metric: 'SEIFA score',
        value: metrics.seifaScore,
        rationale: `SEIFA score of ${metrics.seifaScore.toFixed(0)} indicates ${strength.toLowerCase()} transport disadvantage alignment.`,
      };
    }
    case 'P5': {
      const strength = classify(metrics.carModeShare, metrics.carModeShare > 75, metrics.carModeShare >= 60);
      return {
        strength,
        metric: 'Car mode share',
        value: metrics.carModeShare,
        rationale: `${metrics.carModeShare.toFixed(1)}% car mode share indicates ${strength.toLowerCase()} mode shift evidence.`,
      };
    }
    case 'P6':
    default: {
      const strength = classify(metrics.unemploymentRate, metrics.unemploymentRate > 7, metrics.unemploymentRate >= 5);
      return {
        strength,
        metric: 'Unemployment rate',
        value: metrics.unemploymentRate,
        rationale: `${metrics.unemploymentRate.toFixed(1)}% unemployment indicates ${strength.toLowerCase()} whole-of-government outcome alignment.`,
      };
    }
  }
}

export function strongestPriorityNarrative(results: Record<PriorityCode, AlignmentScoreResult>, areaName: string) {
  const strong = Object.entries(results).filter(([, result]) => result.strength === 'Strong').map(([code]) => code);
  const moderate = Object.entries(results).filter(([, result]) => result.strength === 'Moderate').map(([code]) => code);

  if (strong.length > 0) {
    return `Based on available data for ${areaName}, the strongest strategic alignment evidence currently exists for ${strong.join(', ')}.`;
  }
  if (moderate.length > 0) {
    return `Based on available data for ${areaName}, the clearest moderate alignment evidence currently exists for ${moderate.join(', ')}.`;
  }
  return `Based on available data for ${areaName}, the strongest alignment case will likely depend on project-specific qualitative evidence rather than headline indicators alone.`;
}
