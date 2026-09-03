export type RatingSummary = {
  average: number | null;
  count: number;
  /** 星ごとの件数。平均だけでは分からない偏りを示す */
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
};

/**
 * 評価の平均と星ごとの件数。
 *
 * 平均だけだと「4.5」が全員4〜5なのか、5が多くて1が混じるのか区別できない。
 * 誰から買うかを決める材料なので内訳まで出す。
 */
export function summarizeRatings(ratings: number[]): RatingSummary {
  const breakdown: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const rating of ratings) {
    const star = Math.min(5, Math.max(1, Math.round(rating))) as 1 | 2 | 3 | 4 | 5;
    breakdown[star] += 1;
  }

  if (ratings.length === 0) return { average: null, count: 0, breakdown };

  const total = ratings.reduce((sum, rating) => sum + rating, 0);
  return {
    average: Math.round((total / ratings.length) * 10) / 10,
    count: ratings.length,
    breakdown,
  };
}
