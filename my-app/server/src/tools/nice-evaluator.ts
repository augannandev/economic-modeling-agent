import { getNICEComplianceChecklist, formatNICEComplianceReport } from '../lib/nice-guidelines';

export interface NICEComplianceResult {
  checklist: Record<string, boolean>;
  report: string;
  score: number;
  total: number;
}

/**
 * Evaluate model compliance with NICE DSU TSD 14 & 21
 */
export function evaluateNICECompliance(analysisData: {
  ph_tested: boolean;
  separate_arms: boolean;
  multiple_approaches: boolean;
  visual_assessment: boolean;
  external_validation: boolean;
  milestones_reported: boolean;
  aic_bic_within_approach: boolean;
  all_models_documented: boolean;
  rationale_provided: boolean;
  sensitivity_analyses: boolean;
  assumptions_stated: boolean;
  extrapolation_plausible: boolean;
}): NICEComplianceResult {
  const checklist = getNICEComplianceChecklist();
  const compliance: Record<string, boolean> = {};
  
  checklist.forEach((item, index) => {
    const key = Object.keys(analysisData)[index];
    compliance[item] = analysisData[key as keyof typeof analysisData] || false;
  });
  
  const compliantCount = Object.values(compliance).filter(Boolean).length;
  const totalCount = checklist.length;
  
  return {
    checklist: compliance,
    report: formatNICEComplianceReport(compliance),
    score: compliantCount,
    total: totalCount,
  };
}

