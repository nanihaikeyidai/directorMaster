/** @typedef {'pending' | 'approved' | 'submitted' | 'failed'} SegmentReviewStatus */

/**
 * @param {number} segmentCount
 * @returns {SegmentReviewStatus[]}
 */
export function createInitialReviews(segmentCount) {
  const n = Math.max(0, Math.floor(Number(segmentCount) || 0));
  return Array.from({ length: n }, () => /** @type {SegmentReviewStatus} */ ('pending'));
}

/**
 * @param {SegmentReviewStatus[]} reviews
 * @param {number} segmentCount
 * @returns {SegmentReviewStatus[]}
 */
export function resetReviewsForPromptChange(reviews, segmentCount) {
  return createInitialReviews(segmentCount);
}

/**
 * @param {SegmentReviewStatus[]} reviews
 * @param {number} index
 * @param {boolean} hasValidPrompt
 * @returns {SegmentReviewStatus[]}
 */
export function approveSegment(reviews, index, hasValidPrompt) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= reviews.length) {
    throw new RangeError(`index out of range: ${index}`);
  }
  if (!hasValidPrompt) {
    return [...reviews];
  }
  const next = [...reviews];
  next[i] = 'approved';
  return next;
}

/**
 * @param {SegmentReviewStatus[]} reviews
 * @param {number[]} indexes
 * @returns {SegmentReviewStatus[]}
 */
export function markSubmitted(reviews, indexes) {
  const next = [...reviews];
  for (const idx of indexes) {
    const i = Number(idx);
    if (Number.isInteger(i) && i >= 0 && i < next.length) {
      next[i] = 'submitted';
    }
  }
  return next;
}

/**
 * @param {SegmentReviewStatus[]} reviews
 * @param {number[]} indexes
 * @returns {SegmentReviewStatus[]}
 */
export function markFailed(reviews, indexes) {
  const next = [...reviews];
  for (const idx of indexes) {
    const i = Number(idx);
    if (Number.isInteger(i) && i >= 0 && i < next.length) {
      next[i] = 'failed';
    }
  }
  return next;
}

/**
 * @param {SegmentReviewStatus[]} reviews
 * @returns {number[]}
 */
export function approvedIndexes(reviews) {
  const out = [];
  for (let i = 0; i < reviews.length; i++) {
    if (reviews[i] === 'approved') out.push(i);
  }
  return out;
}

/**
 * @param {SegmentReviewStatus[]} reviews
 * @param {number[]} selected
 * @returns {{ allowed: number[]; rejected: number[] }}
 */
export function filterSelectableForBatch(reviews, selected) {
  const allowed = [];
  const rejected = [];
  for (const idx of selected) {
    const i = Number(idx);
    if (Number.isInteger(i) && i >= 0 && i < reviews.length && reviews[i] === 'approved') {
      allowed.push(i);
    } else {
      rejected.push(i);
    }
  }
  return { allowed, rejected };
}
