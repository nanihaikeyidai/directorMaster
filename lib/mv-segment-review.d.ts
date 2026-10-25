export type SegmentReviewStatus = 'pending' | 'approved' | 'submitted' | 'failed';

export function createInitialReviews(segmentCount: number): SegmentReviewStatus[];

export function resetReviewsForPromptChange(
  reviews: SegmentReviewStatus[],
  segmentCount: number,
): SegmentReviewStatus[];

export function approveSegment(
  reviews: SegmentReviewStatus[],
  index: number,
  hasValidPrompt: boolean,
): SegmentReviewStatus[];

export function markSubmitted(
  reviews: SegmentReviewStatus[],
  indexes: number[],
): SegmentReviewStatus[];

export function markFailed(
  reviews: SegmentReviewStatus[],
  indexes: number[],
): SegmentReviewStatus[];

export function approvedIndexes(reviews: SegmentReviewStatus[]): number[];

export function filterSelectableForBatch(
  reviews: SegmentReviewStatus[],
  selected: number[],
): { allowed: number[]; rejected: number[] };
