export const RUSH_TARGETS = [1000, 2000, 3000, 4000, 5000] as const;

export type RushAttemptResult = {
  targetMs: number;
  elapsedMs: number;
  errorMs: number;
  totalErrorMs: number;
};

export function rushTarget(completedAttempts: number): number {
  return RUSH_TARGETS[Math.min(completedAttempts, RUSH_TARGETS.length - 1)];
}

export function rushScore(attempts: readonly number[]): number {
  const breakdown = rushBreakdown(attempts);
  return breakdown.length ? breakdown[breakdown.length - 1].totalErrorMs : 0;
}

export function rushBreakdown(attempts: readonly number[]): RushAttemptResult[] {
  const breakdown: RushAttemptResult[] = [];
  let totalErrorMs = 0;

  for (const [index, elapsedMs] of attempts.entries()) {
    const targetMs = RUSH_TARGETS[index];
    const errorMs = Math.abs(elapsedMs - targetMs);
    totalErrorMs += errorMs;
    breakdown.push({ targetMs, elapsedMs, errorMs, totalErrorMs });
  }

  return breakdown;
}
