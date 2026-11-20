/**
 * Browser-safe close-up face assessment for lipsync / character packs.
 * No node: imports and no filesystem access.
 */

export const CLOSEUP_PATH_RE = /(ref-crop|still-b|close-?up|face-?front|bust|胸像|近脸)/i;
export const SCENE_PATH_RE = /(scene|场景|wide|远景|establishing)/i;

export function assessFaceCloseUpRef(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, score: 0, reason: '人物参考元数据缺失。', signals: {} };
  }
  const width = Number(input.width);
  const height = Number(input.height);
  const pathName = typeof input.path === 'string' ? input.path : '';
  const centerSkinFraction =
    typeof input.centerSkinFraction === 'number' && Number.isFinite(input.centerSkinFraction)
      ? input.centerSkinFraction
      : undefined;
  const faceHeightRatio =
    typeof input.faceHeightRatio === 'number' && Number.isFinite(input.faceHeightRatio)
      ? input.faceHeightRatio
      : undefined;

  if (!(width > 0 && height > 0)) {
    return { ok: false, score: 0, reason: '人物参考宽高无效，无法判断是否近脸。', signals: { width, height } };
  }

  const signals = {
    path: pathName,
    width,
    height,
    portrait: height >= width,
    centerSkinFraction: centerSkinFraction ?? null,
    faceHeightRatio: faceHeightRatio ?? null,
    pathCloseUpHint: CLOSEUP_PATH_RE.test(pathName),
    pathSceneHint: SCENE_PATH_RE.test(pathName),
  };

  if (faceHeightRatio != null && faceHeightRatio >= 0.25) {
    return {
      ok: true,
      score: Math.min(1, faceHeightRatio),
      reason: '人脸框高度占比足够，可作为口型近脸参考。',
      signals,
    };
  }

  if (signals.pathCloseUpHint) {
    return {
      ok: true,
      score: 0.85,
      reason: '路径提示为近脸/胸像裁剪，接受为口型人物参考。',
      signals,
    };
  }

  if (signals.pathSceneHint) {
    return {
      ok: false,
      score: 0.1,
      reason: '人物参考路径像场景/远景，不适合评口型；请换近脸特写。',
      signals,
    };
  }

  const skinOk = centerSkinFraction != null && centerSkinFraction >= 0.18;
  if (signals.portrait && skinOk) {
    return {
      ok: true,
      score: Math.min(1, 0.5 + centerSkinFraction),
      reason: '竖幅人像且中心肤色占比足够，接受为近脸参考。',
      signals,
    };
  }

  return {
    ok: false,
    score: 0.15,
    reason: '人物参考不像近脸特写（缺人脸框/近脸路径/足够中心肤色），换 still-B 或 ref-crop 再评口型。',
    signals,
  };
}
