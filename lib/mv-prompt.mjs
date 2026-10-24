const DEFAULT_STYLE =
  "premium photorealistic live-action concert cinematography with real adult performers, natural skin texture, physically accurate hair, fabric, metal, instruments, stage lighting, reflections, lens behavior, and motion blur";

const DEFAULT_MEMBERS =
  "Use the uploaded performer descriptions and Picture order to preserve every member's identity, role, instrument, and stage position; never exchange faces, instruments, or positions.";

const DEFAULT_STAGE =
  "Use the uploaded scene descriptions as the authoritative stage architecture, spatial layout, lighting palette, and performer-placement reference.";

const DEFAULT_WARDROBE =
  "Keep every performer's wardrobe, hair, makeup, accessories, and instrument consistent throughout the segment and across adjacent segments unless explicitly directed otherwise.";

const DEFAULT_PERFORMANCE =
  "Keep instrument playing physically credible and synchronized to the beat. The visible lead vocalist follows the source vocal phrasing with natural mouth, jaw, breath, and shoulder movement.";

const DEFAULT_CONTINUITY =
  "Preserve performer identity, screen direction, stage geography, wardrobe, props, lighting progression, instrument ownership, and the previous segment's exit pose.";

const DEFAULT_CAMERA_STABILITY =
  "Favor stable, mostly locked-off tripod or stabilized compositions. Hold each framing for most of its shot and allow at most one subtle, slow micro-adjustment when it clarifies the performance. Do not use continuous tracking, orbiting, crane movement, handheld shake, or a long uninterrupted push-in; create editorial energy through motivated cuts, changed scale, changed angle, and changed subject focus instead.";

function clean(value, fallback = "") {
  return String(value ?? "").trim() || fallback;
}

function segmentTimestamp(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(3).padStart(6, "0")}`;
}

function lyricLanguage(value) {
  if (/[一-鿿]/u.test(value)) return "Chinese";
  if (/[぀-ヿ]/u.test(value)) return "Japanese";
  if (/[가-힯]/u.test(value)) return "Korean";
  return "English";
}

function subjectDefinition(asset, pictureIndex, subjectIndex) {
  const description = clean(
    asset.description,
    asset.category === "场景"
      ? "An uploaded concert environment whose architecture, layout, lighting anchors, palette, and stage geography must be preserved."
      : "An uploaded adult performer reference whose facial identity, hairstyle, body proportions, wardrobe, accessories, role, and instrument must be preserved.",
  );
  if (asset.category === "场景") {
    return `<Subject ${subjectIndex}> is the concert environment shown in <Picture ${pictureIndex}>: ${description} Preserve every described architectural, spatial, material, lighting, and staging anchor; ignore accidental text, logos, borders, and UI.`;
  }
  return `<Subject ${subjectIndex}> is the adult performer or performer group shown in <Picture ${pictureIndex}>: ${description} Preserve every separately described person's face, adult age, body proportions, skin tone, hair, makeup, wardrobe, accessories, role, instrument, and assigned position; ignore printed labels, reference-sheet borders, and poses that are not requested for the target shot.`;
}

function retentionLine(asset, pictureIndex, subjectIndex, shotList) {
  if (asset.category === "场景") {
    return `<Subject ${subjectIndex}> (from <Picture ${pictureIndex}>, appears in ${shotList}): fully_preserved - preserve the described stage architecture, spatial orientation, floor, background, lighting anchors, palette, props, audience relationship, and performer geography.`;
  }
  return `<Subject ${subjectIndex}> (from <Picture ${pictureIndex}>, appears in ${shotList}): fully_preserved - preserve every described performer identity, adult appearance, face, body proportions, hair, makeup, wardrobe, accessories, role, instrument, and assigned position without merging or swapping people.`;
}

/**
 * Build the shared Director Master MiniMax H3 full-reference band-MV prompt.
 * Picture numbering always follows the supplied asset order, including mixed
 * performer and scene assets. One Subject is assigned to every Picture so the
 * reference audit can remain deterministic even when one image is a group sheet.
 */
export function getSegmentVocalTiming(segment, note = {}, settings = {}, leadSilenceSec = 0) {
  const duration = Math.max(0.25, Number(segment.duration) || 0.25);
  const segmentStart = Math.max(0, Number(segment.start) || 0);
  const vocalStartOnTrack = Math.max(0, Number(leadSilenceSec) || 0) + Math.max(0, Number(settings.vocalStartSec) || 0);
  if (note.kind === "instrumental") return { mode: "instrumental", vocalStartOnTrack, relativeStart: null };
  if (segmentStart + duration <= vocalStartOnTrack + 0.001)
    return { mode: "pre_vocal", vocalStartOnTrack, relativeStart: null };
  if (segmentStart < vocalStartOnTrack)
    return { mode: "vocal_enters", vocalStartOnTrack, relativeStart: vocalStartOnTrack - segmentStart };
  return { mode: "vocal_active", vocalStartOnTrack, relativeStart: 0 };
}

function segmentShotPlan(segment, duration, performerCount = 1) {
  const index = Math.max(1, Number(segment.index) || 1);
  // Keep very short clips readable, but use the available duration to create
  // real editorial contrast instead of stretching one generic shot. At the
  // 15-second ceiling, four beats are still long enough for H3 to render a
  // distinct action in each beat.
  const shotCount = duration < 4 ? 1 : duration < 8 ? 2 : duration < 12 ? 3 : 4;
  const plans = [
    {
      name: "locked-wide-lead-musician-payoff",
      opening: "locked-off low wide 24 mm full-band establishing frame",
      middle: "locked-off 50 mm three-quarter lead-vocalist close-up from camera-left",
      ending: "locked-off 85 mm close-up of the featured instrumentalist's hands and instrument",
      closing: "locked-off 35 mm frontal lead-vocalist medium shot",
      targets: ["the complete band in a distant full-band establishing composition", "the lead vocalist in a clearly angled three-quarter close-up", "MUSICIAN_CLOSE", "the lead vocalist in a frontal emotional close-up"],
    },
    {
      name: "locked-profile-musician-lead-payoff",
      opening: "locked-off side-profile 35 mm wide stage tableau",
      middle: "locked-off 85 mm side close-up of the featured instrumentalist with compressed background",
      ending: "locked-off high-angle 28 mm audience-side stage geography tableau",
      closing: "locked-off 50 mm lead-vocalist profile close-up from the opposite screen side",
      targets: ["the band in a side-profile wide establishing composition", "MUSICIAN_CLOSE", "the audience and stage relationship in a high-angle wide composition", "the lead vocalist in a profile emotional close-up"],
    },
    {
      name: "locked-audience-lead-musician-wide",
      opening: "locked-off audience-side 28 mm distant stage view",
      middle: "locked-off low-angle 50 mm lead-vocalist close-up",
      ending: "locked-off 100 mm detail of the featured instrumentalist's hands, strings, keys, or drumsticks",
      closing: "locked-off 35 mm medium-wide full-band tableau",
      targets: ["the audience-side relationship to the complete band in a distant wide composition", "the lead vocalist in a low-angle close-up", "MUSICIAN_CLOSE", "the complete band in a medium-wide closing composition"],
    },
    {
      name: "locked-rear-musician-stage-lead",
      opening: "locked-off rear-stage 32 mm wide silhouette and depth composition",
      middle: "locked-off 70 mm side close-up of the featured instrumentalist",
      ending: "locked-off 24 mm elevated stage-geometry wide shot",
      closing: "locked-off 85 mm lead-vocalist frontal close-up",
      targets: ["the full band from a distant rear-stage wide composition", "MUSICIAN_CLOSE", "the stage geometry and audience depth in an elevated wide composition", "the lead vocalist in a tight frontal emotional close-up"],
    },
    {
      name: "locked-high-lead-musician-side",
      opening: "locked-off high-angle 24 mm formation map",
      middle: "locked-off tight 85 mm lead-vocalist eye-line close-up",
      ending: "locked-off 50 mm close-up of the featured instrumentalist's shoulder, hands, and instrument",
      closing: "locked-off 32 mm side wide full-band frame",
      targets: ["the entire formation in a distant high-angle wide composition", "the lead vocalist in a tight eye-line close-up", "MUSICIAN_CLOSE", "the full band in a side-oriented wide closing composition"],
    },
    {
      name: "locked-telephoto-lead-audience-payoff",
      opening: "locked-off long-lens 100 mm layered full-band compression",
      middle: "locked-off 50 mm lead-vocalist three-quarter close-up",
      ending: "locked-off 35 mm audience-side rear-stage medium-wide composition",
      closing: "locked-off 85 mm lead-vocalist frontal close-up",
      targets: ["the full band layered into a distant telephoto composition", "the lead vocalist in a three-quarter close-up", "the audience and rear-stage depth in a medium-wide composition", "the lead vocalist in a frontal closing close-up"],
    },
  ];
  const plan = plans[(index - 1) % plans.length];
  const previous = plans[(index - 2 + plans.length) % plans.length];
  const fractions = shotCount === 2 ? [0.5] : shotCount === 3 ? [0.3, 0.67] : shotCount === 4 ? [0.24, 0.5, 0.76] : [];
  const cuts = [];
  fractions.forEach((fraction, cutIndex) => {
    cuts.push(Math.min(duration - 0.2, Math.max((cuts[cutIndex - 1] || 0) + 0.35, duration * fraction)));
  });
  const cut2 = cuts[0] || null;
  const cut3 = cuts[1] || null;
  const cut4 = cuts[2] || null;
  const targetByShot = shotPlanTargets(plan, performerCount).slice(0, shotCount);
  return {
    index,
    shotCount,
    plan,
    previous,
    cut2,
    cut3,
    cut4,
    targets: targetByShot,
    performerCount,
    timingRule: shotCount === 1
      ? "The segment is very short; use one readable continuous shot and do not force a distracting cut."
      : shotCount === 2
        ? `Use two stable shot beats, cutting once at ${segmentTimestamp(cut2)} after the first musical phrase or action beat; make the second beat a clearly different subject, scale, angle, and lens, not a small crop change.`
        : shotCount === 3
          ? `Use three stable shot beats, cutting at ${segmentTimestamp(cut2)} and ${segmentTimestamp(cut3)} on motivated musical or performance accents; include a lead or instrumentalist close-up and a large change of scale or depth, with no similar adjacent compositions.`
          : `Use four stable shot beats, cutting at ${segmentTimestamp(cut2)}, ${segmentTimestamp(cut3)}, and ${segmentTimestamp(cut4)} on motivated musical or performance accents; include a distant or wide setup, a lead-vocalist close-up, a featured instrumentalist close-up, and a contrasting payoff without repeating adjacent framing.`,
  };
}

function shotPlanTargets(plan, performerCount) {
  const musicianTarget = performerCount > 1
    ? "a distinct close-up of the other instrumentalist or backing performer assigned in the uploaded references"
    : "a tight close-up of the lead performer's assigned instrument and hands";
  return plan.targets.map((target) => target === "MUSICIAN_CLOSE" ? musicianTarget : target);
}

const SHOT_FOCUS_PRESETS = {
  lead: {
    title: "主唱特写",
    target: "the lead vocalist identified by the uploaded performer descriptions",
    action: "Frame the identified lead vocalist as the unmistakable subject; capture expressive eyes, natural breath, microphone distance, and mouth movement driven only by audible vocals. Keep all other performers secondary and never invent lyrics.",
    cameras: ["locked-off 85 mm intimate lead-vocal close-up", "locked-off 50 mm three-quarter lead-vocal close-up", "locked-off 100 mm eye-and-microphone detail", "locked-off 70 mm profile lead-vocal close-up"],
  },
  guitar: {
    title: "吉他手演奏特写",
    target: "the guitarist explicitly identified by the uploaded performer descriptions; if the source is a group reference, isolate its guitar-playing member without changing identity or role",
    action: "Feature the assigned guitarist's face, fretting hand, picking hand, and guitar in a physically credible performance; show only the strings and gestures that match the audible music. Do not transfer the guitar to another member.",
    cameras: ["locked-off 70 mm three-quarter guitarist close-up with guitar neck visible", "locked-off 85 mm side close-up of the guitarist's fretting and picking hands", "locked-off 50 mm low-angle guitarist performance close-up", "locked-off 100 mm detail of guitar strings and the assigned player's hands"],
  },
  drums: {
    title: "鼓手演奏特写",
    target: "the drummer explicitly identified by the uploaded performer descriptions; if the source is a group reference, isolate its drummer without changing identity or role",
    action: "Feature the assigned drummer's face, sticks, hands, and drum kit; show physically credible strikes that follow audible percussion, with sticks contacting the correct drums and cymbals. Do not assign the drum kit to another member.",
    cameras: ["locked-off 70 mm side close-up of the drummer and kit", "locked-off 85 mm detail of drumsticks striking the snare or cymbal", "locked-off 50 mm low-angle drummer portrait framed through the kit", "locked-off 100 mm overhead-leaning detail of the drummer's hands and cymbals"],
  },
  bass: {
    title: "贝斯手演奏特写",
    target: "the bassist explicitly identified by the uploaded performer descriptions; if the source is a group reference, isolate its bass-playing member without changing identity or role",
    action: "Feature the assigned bassist and bass guitar, with credible fretting and plucking synchronized to the audible bass rhythm. Keep the bass with its described owner; do not exchange instruments or member identities.",
    cameras: ["locked-off 70 mm side close-up of the bassist with bass neck visible", "locked-off 85 mm detail of plucking fingers and bass strings", "locked-off 50 mm low-angle bassist performance close-up", "locked-off 100 mm detail of fretting hand on the bass neck"],
  },
  audience: {
    title: "观众反应特写",
    target: "a small, believable group of concert audience members reacting naturally in the foreground while the referenced band and stage remain recognizable in the background",
    action: "Show a concise audience reaction close-up—focused faces, restrained cheering, or raised light sticks—then retain enough stage context to connect the reaction to this performance. Do not add readable signs, lyrics, logos, or a crowd that overwhelms the band.",
    cameras: ["locked-off 85 mm audience reaction close-up with the stage softly visible behind", "locked-off 50 mm side close-up of a few audience silhouettes and light sticks", "locked-off 70 mm over-shoulder audience view toward the stage", "locked-off 35 mm audience-and-stage reaction composition"],
  },
  wide: {
    title: "乐队全景",
    target: "the complete referenced band in its uploaded member order, instrument assignments, and stage positions",
    action: "Keep the complete band formation and stage geography readable; every member retains the instrument and position assigned by the uploaded references. Do not crop out or duplicate performers.",
    cameras: ["locked-off 24 mm full-band wide establishing frame", "locked-off 35 mm side-wide formation frame", "locked-off 28 mm elevated full-stage tableau", "locked-off 32 mm rear-stage wide silhouette and depth composition"],
  },
};

const ACTION_PRESETS = {
  opening_wait: { title: "开场等待", role: "wide", camera: "locked-off 24 mm extreme long shot from the far rear of the venue, framing the full dark stage before any performance light switches on", action: "This is the pre-show opening wait, seen from a distant extreme-wide viewpoint. The stage performance lights remain completely OFF throughout this shot: no spotlights, wash lights, beams, strobes, LED-wall glow, or audience light show. The band members appear only as small, dim human silhouettes marking their assigned stage positions; use only the faintest venue house or safety spill, just enough to suggest occupied positions. Keep every face unreadable and lost in shadow: no identifiable facial features, eyes, expressions, skin detail, or individual portrait framing. Do not reveal or clearly feature every member's face; do not turn the lineup into a row of portraits. Add a very faint, distant, diffuse wash of fans cheering from far across the concert venue to establish a live-show atmosphere; keep every voice indistinct and unintelligible, with no clear words, chants, or foreground calls, and well below the music. The performers wait with instruments ready, making only subtle natural breathing or settling movements; no singing, lip-sync, or dialogue. Do not turn on any stage light during this shot; the next shot may begin the lighting cue." },
  lead_front: { title: "主唱正面近景", role: "lead", camera: "locked-off 85 mm frontal tight close-up", action: "Frame the lead vocalist from the front, capturing expressive eyes, microphone distance, breath, and mouth movement only during audible syllables." },
  lead_three_quarter: { title: "主唱三分之四侧脸特写", role: "lead", camera: "locked-off 70 mm three-quarter close-up from camera-left", action: "Feature the lead vocalist at a three-quarter angle; keep the microphone, facial expression, and natural vocal articulation clear." },
  lead_profile: { title: "主唱侧脸特写", role: "lead", camera: "locked-off 100 mm clean side-profile close-up from camera-right", action: "Capture the lead vocalist's side profile and microphone silhouette, with the jaw and lips following only the audible vocal phrasing." },
  lead_low_angle: { title: "主唱低机位仰拍特写", role: "lead", camera: "locked-off 50 mm low-angle close-up", action: "Frame the lead vocalist from a restrained low angle against the stage lights; preserve a natural face and audio-driven mouth movement." },
  lead_eye_mic: { title: "主唱眼神与麦克风细节", role: "lead", camera: "locked-off 100 mm eye-line and microphone detail", action: "Hold a tight detail on the lead vocalist's eyes, microphone, and subtle breath; do not crop the mouth when audible singing is present." },
  guitar_full: { title: "吉他手全身演奏特写", role: "guitar", camera: "locked-off 50 mm full-body guitarist portrait", action: "Show the assigned guitarist head-to-toe with the complete guitar and readable stance; keep the guitar attached to its described owner and strumming physically credible." },
  guitar_hands: { title: "吉他手手部指法特写", role: "guitar", camera: "locked-off 100 mm macro close-up of fretting and picking hands", action: "Show the assigned guitarist's fretting and picking hands on the correct guitar strings, with physically accurate finger placement synchronized to the music." },
  drums_full: { title: "鼓手全身演奏特写", role: "drums", camera: "locked-off 50 mm full-body drummer portrait framed with the complete kit", action: "Show the assigned drummer head-to-toe behind the complete drum kit, preserving posture and credible stick movement synchronized to audible percussion." },
  drums_hands: { title: "鼓手手部鼓槌特写", role: "drums", camera: "locked-off 100 mm detail of drumsticks, hands, snare, and cymbal", action: "Show the assigned drummer's hands and sticks striking the correct drum or cymbal in time; preserve contact points and realistic rebound." },
  bass_full: { title: "贝斯手全身演奏特写", role: "bass", camera: "locked-off 50 mm full-body bassist portrait", action: "Show the assigned bassist head-to-toe with the complete bass guitar, stable stance, and credible performance; do not exchange the instrument owner." },
  bass_hands: { title: "贝斯手手部指法特写", role: "bass", camera: "locked-off 100 mm close-up of plucking fingers and bass fretboard", action: "Show the assigned bassist's plucking and fretting hands on the bass strings, following the audible rhythm with correct finger placement." },
  audience: { title: "观众反应近景", role: "audience", camera: "locked-off 85 mm close-up of a few audience members with the stage softly visible behind", action: "Show a small believable audience reaction and light sticks, retaining recognizable stage context without overwhelming the band." },
  band_wide: { title: "乐队全景", role: "wide", camera: "locked-off 24 mm distant full-band establishing frame", action: "Show all referenced members in their assigned order, roles, instruments, and stage positions; keep the complete stage geography readable." },
};

function performerForRole(role, performers) {
  const patterns = {
    lead: [/主唱|主唱兼|lead\s*vocal|vocalist|singer/i],
    guitar: [/吉他手|吉他|guitarist|guitar\s*player/i],
    drums: [/鼓手|架子鼓|drummer|drums?/i],
    bass: [/贝斯手|贝斯|bass\s*player|bassist/i],
  };
  if (role === "audience" || role === "wide") return null;
  const patternsForRole = patterns[role] || [];
  const candidates = performers.filter(({ asset }) => patternsForRole.some((pattern) => pattern.test(`${clean(asset.description)} ${clean(asset.name)}`)));
  if (!candidates.length) throw new Error(`当前人物素材描述中找不到${({ lead: "主唱", guitar: "吉他手", drums: "鼓手", bass: "贝斯手" })[role] || role}，请先补全素材角色描述`);
  // Prefer an explicitly named role over a performer who merely holds that instrument.
  const explicit = candidates.filter(({ asset }) => {
    const description = `${clean(asset.description)} ${clean(asset.name)}`;
    return role === "guitar" ? /吉他手|guitarist|guitar\s*player/i.test(description)
      : role === "lead" ? /主唱|lead\s*vocal|vocalist|singer/i.test(description)
        : role === "drums" ? /鼓手|drummer/i.test(description)
          : /贝斯手|bassist|bass\s*player/i.test(description);
  });
  return (explicit.length ? explicit : candidates)[0];
}

function actionTarget(action, performers, memberId) {
  if (action.role === "audience") return "a few believable audience members in the foreground, with the referenced stage visible behind";
  if (action.role === "wide") return `the complete band (${performers.map(({ subjectIndex }) => `<Subject ${subjectIndex}>`).join(", ")}) in the uploaded member order and assigned stage positions`;
  const rolePatterns = { lead: /主唱|lead\s*vocal|vocalist|singer/i, guitar: /吉他手|吉他|guitarist|guitar\s*player/i, drums: /鼓手|架子鼓|drummer|drums?/i, bass: /贝斯手|贝斯|bass\s*player|bassist/i };
  const performer = memberId
    ? performers.find(({ asset }) => String(asset.id || "") === String(memberId) && rolePatterns[action.role]?.test(`${clean(asset.description)} ${clean(asset.name)}`)) || performerForRole(action.role, performers)
    : performerForRole(action.role, performers);
  const assetLabel = clean(performer.asset.name, clean(performer.asset.description).split(/[，,。；;]/)[0]);
  return `<Subject ${performer.subjectIndex}> (${assetLabel}, the ${action.role === "lead" ? "lead vocalist" : action.role === "guitar" ? "guitarist" : action.role === "drums" ? "drummer" : "bassist"} identified by <Picture ${performer.pictureIndex}>)`;
}

export function defaultBandMvActions(shotType = "auto", duration = 10) {
  const seconds = Math.max(0.25, Number(duration) || 0.25);
  const count = Math.max(1, seconds >= 8 ? 3 : seconds >= 4 ? 2 : 1);
  const sequences = {
    auto: ["band_wide", "lead_three_quarter", "guitar_hands"],
    lead: ["lead_front", "lead_three_quarter", "lead_profile", "lead_low_angle", "lead_eye_mic"],
    guitar: ["guitar_full", "guitar_hands", "guitar_full"],
    drums: ["drums_full", "drums_hands", "drums_full"],
    bass: ["bass_full", "bass_hands", "bass_full"],
    audience: ["audience", "band_wide", "audience"],
    wide: ["band_wide", "lead_three_quarter", "band_wide"],
  };
  const targetCount = shotType === "lead" && seconds >= 1.5
    ? Math.min(5, Math.max(3, count))
    : ["guitar", "drums", "bass"].includes(shotType) && seconds >= 1
      ? Math.max(2, count)
      : count;
  const chosen = (sequences[shotType] || sequences.auto).slice(0, targetCount);
  return chosen.map((type) => ({ type, duration: Number((Number(duration) / count).toFixed(3)) }));
}

function inferShotType(target = "") {
  if (/audience/i.test(target)) return "观众反应特写";
  if (/lead vocalist/i.test(target)) return "主唱特写";
  if (/band|full.band|complete band|formation/i.test(target)) return "乐队全景";
  if (/instrumentalist|instrument|hands|musician/i.test(target)) return "乐手演奏特写";
  return "演出镜头";
}

export function buildStandardBandMvPrompt({ projectName, segment, note = {}, assets = [], settings = {}, leadSilenceSec = 0 }) {
  const usableAssets = assets.filter((asset) => asset?.mediaType !== "audio");
  const performers = usableAssets
    .map((asset, index) => ({ asset, pictureIndex: index + 1, subjectIndex: index + 1 }))
    .filter(({ asset }) => asset.category !== "场景");
  const scenes = usableAssets
    .map((asset, index) => ({ asset, pictureIndex: index + 1, subjectIndex: index + 1 }))
    .filter(({ asset }) => asset.category === "场景");

  if (!performers.length) throw new Error("乐队 MV 提示词至少需要一张人物素材");
  if (!scenes.length) throw new Error("乐队 MV 提示词至少需要一张场景素材");

  const duration = Math.max(0.25, Number(segment.duration) || 0.25);
  const segmentLabel = String(segment.index || 1).padStart(2, "0");
  const lead = `<Subject ${performers[0].subjectIndex}>`;
  const secondary = performers[1] ? `<Subject ${performers[1].subjectIndex}>` : lead;
  const performerLabels = performers.map(({ subjectIndex }) => `<Subject ${subjectIndex}>`).join(", ");
  const sceneLabels = scenes.map(({ subjectIndex }) => `<Subject ${subjectIndex}>`).join(", ");
  const primaryScene = scenes[0];
  const shotPlan = segmentShotPlan(segment, duration, performers.length);
  const customActions = Array.isArray(note.shotActions)
    ? note.shotActions.map((action) => ({ ...action, preset: ACTION_PRESETS[action?.type] })).filter((action) => action.preset).slice(0, 8)
    : [];
  const hasOpeningWait = customActions.some((action) => action.type === "opening_wait");
  if (customActions.length) {
    shotPlan.shotCount = customActions.length;
    shotPlan.targets = customActions.map((action) => actionTarget(action.preset, performers, action.memberId));
    const customCuts = [];
    let elapsed = 0;
    customActions.slice(0, -1).forEach((action) => {
      elapsed += Math.max(0.25, Number(action.duration) || 0.25);
      customCuts.push(Math.min(duration - 0.1, elapsed));
    });
    shotPlan.cut2 = customCuts[0] ?? null;
    shotPlan.cut3 = customCuts[1] ?? null;
    shotPlan.cut4 = customCuts[2] ?? null;
    shotPlan.timingRule = `Use the user's ${customActions.length}-action shot sequence with the individually assigned durations: ${customActions.map((action) => `${action.preset.title} ${Number(action.duration).toFixed(2)} seconds`).join(" → ")}. Cut at each listed boundary; fit the final action exactly to the ${duration.toFixed(3)}-second segment.`;
  }
  const shotFocus = SHOT_FOCUS_PRESETS[note.shotType] || null;
  if (shotFocus && !customActions.length) {
    shotPlan.plan = {
      ...shotPlan.plan,
      opening: shotFocus.cameras[0],
      middle: shotFocus.cameras[1],
      ending: shotFocus.cameras[2],
      closing: shotFocus.cameras[3],
    };
    shotPlan.targets = Array.from({ length: shotPlan.shotCount }, () => shotFocus.target);
    shotPlan.timingRule = `${shotPlan.timingRule} Primary shot type: ${shotFocus.title}. Keep this selected subject/action as the segment's visual anchor while varying shot size, angle, depth, and camera side at every cut.`;
  }
  const lyric = clean(note.lyrics);
  // SEG 01 is always the visual opening/prelude, even when the user trims
  // the source track and its absolute start is no longer 00:00.
  const isOpeningPrelude = Number(segment.index || 0) === 1;
  const direction = clean(
    note.direction,
    shotPlan.shotCount === 1
      ? "Use one readable continuous preparation or performance beat; do not force a cut into a very short segment."
      : shotPlan.shotCount === 2
        ? "Build two clearly different shot beats with one motivated cut after the first musical or action beat."
        : "Build a clear multi-shot performance arc with a strong change of scale, angle, and camera placement at each cut while keeping each shot mostly stable and readable.",
  );
  const style = clean(settings.style, DEFAULT_STYLE);
  const members = clean(settings.members, DEFAULT_MEMBERS);
  const stage = clean(settings.stage, DEFAULT_STAGE);
  const wardrobe = clean(settings.wardrobe, DEFAULT_WARDROBE);
  const performance = clean(settings.performance, DEFAULT_PERFORMANCE);
  const continuity = clean(settings.continuity, DEFAULT_CONTINUITY);
  const vocalTiming = isOpeningPrelude
    ? { ...getSegmentVocalTiming(segment, note, settings, leadSilenceSec), mode: "pre_vocal", relativeStart: null }
    : getSegmentVocalTiming(segment, note, settings, leadSilenceSec);

  const definitions = usableAssets.map((asset, index) => subjectDefinition(asset, index + 1, index + 1));
  const retentions = usableAssets.map((asset, index) =>
    retentionLine(asset, index + 1, index + 1, Array.from({ length: shotPlan.shotCount }, (_, shotIndex) => `[Shot ${shotIndex + 1}]`).join(", ") + " as visible or compositionally relevant"),
  );
  const lyricInstruction = isOpeningPrelude
    ? "This opening prelude is preparation only. Do not perform, lip-sync, or display the lyric text in this segment; any supplied lyric note belongs to a later segment and must not trigger mouth movement here."
    : lyric
      ? `The complete sung phrase is <d>[${lyricLanguage(lyric)}] ${lyric}</d>. Preserve its exact words, pronunciation, phrase timing, and release from <Audio 1>; every visible singing mouth follows the audible syllable attacks without inventing lyrics.`
      : note.kind === "instrumental"
        ? "This is an instrumental passage. All visible mouths remain naturally closed except for nonverbal performance breathing; do not invent singing or dialogue."
        : "No lyric transcript is supplied. Follow <Audio 1>'s audible vocal syllables and phrase boundaries without inventing, displaying, or paraphrasing lyrics.";
  const vocalGate = vocalTiming.mode === "instrumental"
    ? "This entire segment is instrumental: every performer keeps naturally closed lips and never mimics singing; use only breathing, eye focus, posture, restrained body rhythm, and physically credible instrument performance."
    : vocalTiming.mode === "pre_vocal"
      ? "No audible vocal occurs in this segment: the lead never sings or lip-syncs. Keep the mouth naturally closed and stage an intentional pre-vocal introduction with a composed hero pose, calm breathing, focused gaze, microphone held away from the lips or hands prepared on the instrument, and restrained movement driven only by the music."
      : vocalTiming.mode === "vocal_enters"
        ? `The lead begins singing only when the first audible vocal syllable in <Audio 1> starts at ${segmentTimestamp(vocalTiming.relativeStart)}. Before that exact moment, keep the mouth naturally closed and use an intentional pre-vocal pose, controlled breathing, eye focus, and instrument or microphone preparation. At the audible onset, begin natural mouth and jaw articulation; never anticipate the voice.`
      : "The lead sings only while a vocal is audibly present in <Audio 1>. Every mouth opening, jaw motion, breath, syllable attack, hold, and phrase release must be driven by that audio signal; during any vocal pause, the lips settle naturally closed and never continue phantom singing.";

  const adjacentCutRule = isOpeningPrelude
    ? "This is the first segment and must function as a prelude: begin with a deliberate preparation action, not a singing performance. Keep every mouth closed and do not lip-sync, even if a vocal appears later in the source file; the next segment will take over audible singing. Keep the opening composition stable and let the preparation action, not camera motion, carry the beat."
    : `This is segment ${segmentLabel}. Use the ${shotPlan.plan.name} camera grammar and make the transition from the previous segment visibly large through a new subject, scale, angle, or camera placement: the previous pattern is ${shotPlan.previous.name}, so do not reuse its opening scale, lens family, camera direction, or subject focus. Change at least three of shot size, subject identity, camera height, screen side, lens compression, depth relationship, and axis while preserving the stage geography and performer identity; movement direction is only a secondary accent, never continuous motion. Within this segment, do not repeat the same framing: rotate between ${shotPlan.targets.join(", ")}.`;
  const hardCutContract = "Adjacent-shot hard-cut contract: every neighboring shot must differ in at least three visual dimensions, including at least one of subject identity, shot size, lens family, camera height, screen side, depth relationship, or axis. Never place the same subject at the same scale with the same lens family in consecutive shots. Use a motivated hard cut on the musical accent; do not carry one continuous camera move across the cut.";
  const shotTitle = (shotIndex) => customActions[shotIndex]?.preset.title || shotFocus?.title || inferShotType(shotPlan.targets[shotIndex] || "");
  const shotAction = shotFocus?.action || "Use the uploaded member and scene descriptions to keep this action physically credible, recognizable, and consistent with the assigned roles.";
  const openingAction = isOpeningPrelude
    ? shotFocus
      ? `This opening prelude is preparation only. Keep the lead vocalist naturally closed-lipped and do not lip-sync; ${shotAction}`
      : "The lead performs a deliberate pre-vocal preparation action: hears the opening music, adjusts posture, checks the microphone or instrument, takes one controlled breath, and fixes a focused gaze; keep lips naturally closed."
    : "On the opening musical accent from <Audio 1>, stage lights and performer movement begin in a physically plausible way.";
  const shotSections = customActions.length ? customActions.map((action, index) => {
    const preset = action.preset;
    const target = shotPlan.targets[index];
    const start = customActions.slice(0, index).reduce((sum, prior) => sum + Math.max(0.25, Number(prior.duration) || 0.25), 0);
    const cameraBase = preset.camera.replace(/^locked-off\s*/i, "");
    const moveType = action.moveType || "locked";
    const moveDuration = Math.max(0, Math.min(Number(action.duration) || 0, Number(action.moveDuration) || 0));
    const moveDescriptions = {
      slow_push: "a slow, straight push-in",
      slow_pull: "a slow, straight pull-back",
      pan_left: "a slow pan to camera-left",
      pan_right: "a slow pan to camera-right",
      tilt_up: "a slow upward tilt",
      tilt_down: "a slow downward tilt",
    };
    const camera = moveType === "locked" || !moveDescriptions[moveType]
      ? `locked-off ${cameraBase}`
      : `stable tripod ${cameraBase}; during the first ${moveDuration.toFixed(2)} seconds, perform ${moveDescriptions[moveType]}, then settle into a fully locked composition for the remainder of this shot`;
    const intro = index === 0 ? "" : `At ${segmentTimestamp(start)}, hard cut from the previous action; change subject or framing, lens scale, angle, and depth clearly. `;
    const scene = index === 0 ? ` Establish ${sceneLabels}, using <Picture ${primaryScene.pictureIndex}> as the primary spatial and lighting reference without copying it as a first frame.` : "";
    const vocal = action.type === "opening_wait"
      ? " This is a pre-show waiting shot: all visible performers keep their mouths naturally closed and do not sing, lip-sync, or speak."
      : preset.role === "lead"
      ? ` ${vocalGate} ${lyricInstruction}`
      : " Keep the lead vocalist in any background naturally lip-synced only to audible vocals; never show phantom singing during silence.";
    return `[Shot ${index + 1}] 【动作类型：${preset.title}】 ${intro}${camera} focuses on ${target}.${scene} ${preset.action}${vocal} Hold this distinct composition for ${Math.max(0.25, Number(action.duration) || 0.25).toFixed(2)} seconds. Preserve identity, instrument ownership, stage geography, and natural motion blur.`;
  }) : [
    `[Shot 1] 【动作类型：${shotTitle(0)}】 ${shotPlan.plan.opening} establishes ${sceneLabels}, using <Picture ${primaryScene.pictureIndex}> as the primary spatial and lighting reference without copying it as a first frame. ${shotFocus ? `${shotAction} The selected segment focus is ${shotFocus.target}.` : `Show ${shotPlan.shotCount === 1 ? "the most important readable action" : "the complete readable band formation"} with ${performerLabels} in the positions and roles stated by the uploaded descriptions and global member rules.`} ${openingAction} Musicians may play only what is audible. Hands remain correctly connected to microphones, drumsticks, keys, strings, and instruments; no member or instrument changes owner.`,
  ];
  if (!customActions.length && shotPlan.shotCount >= 2) {
    shotSections.push(
      `[Shot 2] 【动作类型：${shotTitle(1)}】 At ${segmentTimestamp(shotPlan.cut2)}, hard cut to ${shotPlan.plan.middle} focused on ${shotFocus?.target || secondary}. The editorial target is ${shotPlan.targets[1]}; ${shotFocus ? shotAction : `make the change obvious from Shot 1 through a different subject, scale, camera height, lens family, and screen side, not a small crop adjustment or a continued move. If ${secondary} is the lead, its pose, gaze, breath, microphone distance, mouth, and jaw obey the vocal timing gate exactly: keep closed lips before vocals and during pauses; if it is another performer, show only that person's assigned instrument and physically credible playing while the lead remains recognizable in the composition.`} ${lyricInstruction}`,
    );
  }
  if (!customActions.length && shotPlan.shotCount >= 3) {
    shotSections.push(
      `[Shot 3] 【动作类型：${shotTitle(2)}】 At ${segmentTimestamp(shotPlan.cut3)}, hard cut on a strong beat to ${shotPlan.plan.ending}. The editorial target is ${shotPlan.targets[2]}; ${shotFocus ? shotAction : "show a clearly changed spatial relationship and depth, not another front-facing portrait."} Keep the referenced performers' identities, positions, and instruments stable, show only the subjects and stage relationships appropriate to this shot, and do not invent readable signs or unrelated people. ${lead} follows only the audible vocal state from <Audio 1>, never phantom-singing through silence or instrumental gaps.`,
    );
  }
  if (!customActions.length && shotPlan.shotCount >= 4) {
    shotSections.push(
      `[Shot 4] 【动作类型：${shotTitle(3)}】 At ${segmentTimestamp(shotPlan.cut4)}, make a final hard change to ${shotPlan.plan.closing}. The editorial target is ${shotPlan.targets[3]}; ${shotFocus ? shotAction : "use a distinctly different lens distance, subject relationship, and screen direction from Shot 3, then settle instead of adding another small pan."} ${lead}'s mouth, jaw, breath, gaze, and microphone distance remain driven only by <Audio 1>. End at ${segmentTimestamp(duration)} on a stable composition that keeps ${shotFocus?.target || "the complete formation"} readable, preserves all instruments and stage geography, follows the audible phrase boundary, and gives the next segment a clean continuation pose.`,
    );
  }

  return [
    "subject_definitions:",
    ...definitions,
    `<Audio 1> is the exact exported ${duration.toFixed(3)}-second source music segment from the current edited SOURCE TRACK. Preserve the complete music, silence, lead vocal, rhythm, phrasing, dynamics, loudness, and timing without replacement or remixing. It is the sole authoritative trigger for singing: visible mouths may sing only while vocals are audibly present in <Audio 1>.`,
    "",
    "summary:",
    `[reference generation + audio reuse] Create a ${duration.toFixed(3)}-second 16:9 photorealistic live-action band-performance MV shot for segment ${segmentLabel} of “${clean(projectName, "Band MV")}”. ${performerLabels} perform in ${sceneLabels}; ${lead} is the visual lead unless the segment direction states otherwise. Reuse <Audio 1> as the complete final soundtrack and do not use any uploaded image as a literal first frame. ${shotPlan.timingRule}`,
    "",
    "retention_analysis:",
    ...retentions,
    "<Audio 1>: fully_copy - reuse the exact source signal as the complete synchronized final soundtrack, preserving its vocal identity, instruments, mix balance, tempo, beat, phrase ending, dynamics, and duration.",
    "",
    "detailed_description:",
    `The target video uses ${style}. It must look like footage captured by a professional cinema camera at a real concert, never anime, illustration, game art, doll-like CGI, or a character sheet. ${members} ${stage} ${wardrobe} ${performance}`,
    `Camera stability rule: ${clean(settings.cameraStability, DEFAULT_CAMERA_STABILITY)}`,
    `Vocal timing gate: ${vocalGate}`,
    `Segment-specific direction: ${direction}`,
    `Camera timing and adjacency rule: ${adjacentCutRule} ${hardCutContract}`,
    ...shotSections,
    `Continuity: ${continuity} Preserve the previous segment's exit pose only as a continuity anchor, but make this segment's first composition and stable camera treatment visibly different. Do not reproduce reference-sheet backgrounds, printed labels, signatures, logos, subtitles, captions, lyric text, watermarks, or other readable text. Do not create extra musicians, duplicate performers, exchange faces, swap instruments, move a member away from the described role, deform hands, or turn an instrumental band performance into unrelated choreography.`,
    "",
    "overall_soundscape:",
    hasOpeningWait
      ? "<Audio 1> is the authoritative synchronized soundtrack. Preserve the original vocal, instruments, mix balance, timing, phrase ending, dynamics, and loudness relationships exactly. Only during the shot labeled 开场等待, add a very faint, distant, diffuse crowd cheer as venue ambience: voices must remain indistinct and unintelligible, with no clear words, chants, applause, or foreground calls, and must stay well below the music. Do not continue the crowd sound into later shots. Elsewhere, add only extremely subtle natural stage-room reflections when necessary."
      : "<Audio 1> is the authoritative synchronized soundtrack. Preserve the original vocal, instruments, mix balance, timing, phrase ending, dynamics, and loudness relationships exactly. Add only extremely subtle natural stage-room reflections when necessary; no crowd chanting, dialogue, applause, or unrelated effects may compete with the music.",
    "",
    "non_diegetic_music:",
    "Use <Audio 1> unchanged as the complete final music track. Do not compose, replace, extend, shorten, fade, remix, time-stretch, pitch-shift, or add a second music layer. After video generation, restore the exported original segment as the final master audio and remove any generated audio track.",
  ].join("\n");
}

export const BAND_MV_PROMPT_TEMPLATE_VERSION = "band-live-ref2va-v8-timed-multi-action-role-mapping";
