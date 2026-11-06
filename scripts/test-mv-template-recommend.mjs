import assert from 'node:assert/strict';
import {
  recommendMvPromptTemplate,
  MV_PROMPT_TEMPLATES,
  listMvPromptTemplates,
} from '../lib/mv-prompt.mjs';

const registered = new Set(Object.keys(MV_PROMPT_TEMPLATES));

function assertValidResult(result, expectedId) {
  assert.ok(result && typeof result === 'object');
  assert.ok(registered.has(result.templateId), `templateId ${result.templateId} must be registered`);
  assert.equal(result.templateId, expectedId);
  assert.equal(result.label, MV_PROMPT_TEMPLATES[expectedId].label);
  assert.equal(result.version, MV_PROMPT_TEMPLATES[expectedId].version);
  assert.ok(typeof result.confidence === 'number');
  assert.ok(result.confidence >= 0 && result.confidence <= 1);
  assert.ok(Array.isArray(result.reasons) && result.reasons.length >= 1);
  for (const r of result.reasons) assert.equal(typeof r, 'string');
  assert.ok(Array.isArray(result.alternatives));
  assert.ok(result.alternatives.length <= 2);
  for (const alt of result.alternatives) {
    assert.ok(registered.has(alt.templateId));
    assert.ok(alt.label);
    assert.ok(typeof alt.confidence === 'number');
  }
  // alternatives sorted desc by confidence
  for (let i = 1; i < result.alternatives.length; i++) {
    assert.ok(result.alternatives[i - 1].confidence >= result.alternatives[i].confidence);
  }
}

// 1. empty → band low confidence
{
  const r = recommendMvPromptTemplate();
  assertValidResult(r, 'band');
  assert.ok(r.confidence < 0.4, `empty confidence should be low, got ${r.confidence}`);
  assert.ok(r.reasons.some((x) => /信号不足|默认|乐队|band/i.test(x)));
}

{
  const r = recommendMvPromptTemplate({});
  assertValidResult(r, 'band');
  assert.ok(r.confidence < 0.4);
}

// 2. hints 说唱 → rap-hiphop
{
  const r = recommendMvPromptTemplate({ hints: '说唱街头' });
  assertValidResult(r, 'rap-hiphop');
  assert.ok(r.confidence >= 0.55);
}

{
  const r = recommendMvPromptTemplate({ hints: 'rap hip-hop vibe' });
  assertValidResult(r, 'rap-hiphop');
}

// 3. bpm 130 + synth + high → dance-edm
{
  const r = recommendMvPromptTemplate({
    bpm: 130,
    energy: 'high',
    instruments: ['synth', 'drums'],
  });
  assertValidResult(r, 'dance-edm');
  assert.ok(r.confidence >= 0.5);
}

// 4. piano + sparse + bpm 72 → piano-ballad
{
  const r = recommendMvPromptTemplate({
    bpm: 72,
    vocalDensity: 'sparse',
    instruments: ['piano'],
    energy: 'low',
  });
  assertValidResult(r, 'piano-ballad');
  assert.ok(r.confidence >= 0.5);
}

// 5. performers 2 + acoustic → folk-duo
{
  const r = recommendMvPromptTemplate({
    performers: 2,
    instruments: ['acoustic-guitar'],
  });
  assertValidResult(r, 'folk-duo');
  assert.ok(r.confidence >= 0.5);
}

// 6. dense vocalDensity + urban hints → rap-hiphop
{
  const r = recommendMvPromptTemplate({
    vocalDensity: 'dense',
    hints: 'urban street cypher',
  });
  assertValidResult(r, 'rap-hiphop');
  assert.ok(r.confidence >= 0.5);
}

// numeric vocalDensity dense (>=4 syllables/sec)
{
  const r = recommendMvPromptTemplate({
    vocalDensity: 5.2,
    hints: 'urban',
  });
  assertValidResult(r, 'rap-hiphop');
}

// 7. electric-guitar + high → rock-solo
{
  const r = recommendMvPromptTemplate({
    instruments: ['electric-guitar'],
    energy: 'high',
  });
  assertValidResult(r, 'rock-solo');
  assert.ok(r.confidence >= 0.5);
}

// registry sanity: every list entry is recommendable as a registered id
{
  for (const t of listMvPromptTemplates()) {
    assert.ok(registered.has(t.id));
  }
}

console.log('test-mv-template-recommend: ok');
