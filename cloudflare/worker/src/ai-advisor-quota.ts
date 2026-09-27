/** Provider-neutral quota policy. Stage 2 intentionally has no live usage source. */
export type QuotaMode = 'NORMAL' | 'ECONOMY' | 'CONSERVATIVE' | 'SURVIVAL';

export type QuotaUsageSnapshot = {
  searchUsageRatio?: number;
  generationUsageRatio?: number;
  ingestionUsageRatio?: number;
};

export type QuotaThresholds = {
  economyAt: number;
  conservativeAt: number;
  survivalAt: number;
};

export const DEFAULT_ADVISOR_QUOTA_THRESHOLDS: QuotaThresholds = {
  economyAt: 0.7,
  conservativeAt: 0.85,
  survivalAt: 0.95,
};

export type QuotaDecision = {
  mode: QuotaMode;
  measured: boolean;
  highestUsageRatio: number | null;
  preferCache: boolean;
  preferDirectAnswer: boolean;
  allowGeneration: boolean;
};

const validRatio = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

export const evaluateAdvisorQuota = (
  snapshot: QuotaUsageSnapshot | undefined,
  thresholds: QuotaThresholds = DEFAULT_ADVISOR_QUOTA_THRESHOLDS,
): QuotaDecision => {
  const ratios = snapshot
    ? [snapshot.searchUsageRatio, snapshot.generationUsageRatio, snapshot.ingestionUsageRatio].filter(validRatio)
    : [];
  const highestUsageRatio = ratios.length ? Math.max(...ratios) : null;
  const mode: QuotaMode = highestUsageRatio === null ? 'NORMAL'
    : highestUsageRatio >= thresholds.survivalAt ? 'SURVIVAL'
      : highestUsageRatio >= thresholds.conservativeAt ? 'CONSERVATIVE'
        : highestUsageRatio >= thresholds.economyAt ? 'ECONOMY'
          : 'NORMAL';
  return {
    mode,
    measured: highestUsageRatio !== null,
    highestUsageRatio,
    preferCache: mode !== 'NORMAL',
    preferDirectAnswer: mode !== 'NORMAL',
    allowGeneration: mode !== 'SURVIVAL',
  };
};
