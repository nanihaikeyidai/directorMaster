import assert from 'node:assert/strict';
import {
  createInitialReviews,
  resetReviewsForPromptChange,
  approveSegment,
  markSubmitted,
  markFailed,
  approvedIndexes,
  filterSelectableForBatch,
} from '../lib/mv-segment-review.mjs';

// --- createInitialReviews: all pending ---
{
  const reviews = createInitialReviews(3);
  assert.deepEqual(reviews, ['pending', 'pending', 'pending']);
  assert.deepEqual(createInitialReviews(0), []);
}

// --- approveSegment: only with valid prompt ---
{
  let reviews = createInitialReviews(3);
  reviews = approveSegment(reviews, 1, true);
  assert.equal(reviews[1], 'approved');
  assert.equal(reviews[0], 'pending');
  assert.equal(reviews[2], 'pending');

  // no-op / keep pending when prompt invalid
  const before = [...reviews];
  const afterInvalid = approveSegment(reviews, 0, false);
  assert.equal(afterInvalid[0], 'pending');
  assert.deepEqual(afterInvalid, before);

  // out of range: keep array unchanged (or throw — either ok if documented)
  assert.throws(() => approveSegment(reviews, -1, true), /index|range/i);
  assert.throws(() => approveSegment(reviews, 99, true), /index|range/i);
}

// --- resetReviewsForPromptChange: all pending, length = segmentCount ---
{
  let reviews = createInitialReviews(2);
  reviews = approveSegment(reviews, 0, true);
  reviews = markSubmitted(reviews, [0]);
  const reset = resetReviewsForPromptChange(reviews, 4);
  assert.deepEqual(reset, ['pending', 'pending', 'pending', 'pending']);
  assert.deepEqual(resetReviewsForPromptChange(reviews, 1), ['pending']);
}

// --- approvedIndexes ---
{
  let reviews = createInitialReviews(4);
  reviews = approveSegment(reviews, 0, true);
  reviews = approveSegment(reviews, 2, true);
  assert.deepEqual(approvedIndexes(reviews), [0, 2]);
  assert.deepEqual(approvedIndexes(createInitialReviews(2)), []);
}

// --- filterSelectableForBatch: rejects non-approved ---
{
  let reviews = createInitialReviews(4);
  reviews = approveSegment(reviews, 1, true);
  reviews = approveSegment(reviews, 3, true);
  const { allowed, rejected } = filterSelectableForBatch(reviews, [0, 1, 2, 3]);
  assert.deepEqual(allowed, [1, 3]);
  assert.deepEqual(rejected, [0, 2]);

  const empty = filterSelectableForBatch(reviews, []);
  assert.deepEqual(empty.allowed, []);
  assert.deepEqual(empty.rejected, []);

  const noneApproved = filterSelectableForBatch(createInitialReviews(2), [0, 1]);
  assert.deepEqual(noneApproved.allowed, []);
  assert.deepEqual(noneApproved.rejected, [0, 1]);
}

// --- markSubmitted / markFailed ---
{
  let reviews = createInitialReviews(3);
  reviews = approveSegment(reviews, 0, true);
  reviews = approveSegment(reviews, 1, true);
  reviews = markSubmitted(reviews, [0, 1]);
  assert.equal(reviews[0], 'submitted');
  assert.equal(reviews[1], 'submitted');
  assert.equal(reviews[2], 'pending');

  reviews = markFailed(reviews, [1]);
  assert.equal(reviews[1], 'failed');
  assert.equal(reviews[0], 'submitted');

  // ignore out-of-range indexes without throwing
  reviews = markSubmitted(reviews, [99]);
  assert.equal(reviews[0], 'submitted');
}

console.log('test-mv-segment-review: ok');
