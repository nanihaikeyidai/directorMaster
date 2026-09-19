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
    { name: "wide-to-portrait", opening: "low wide 24 mm stage reveal", middle: "chest-up 50 mm frontal push-in", ending: "lateral medium-wide sweep" },
    { name: "profile-to-overhead", opening: "side-profile 35 mm tracking entrance", middle: "85 mm three-quarter portrait with compressed background", ending: "brief high-angle stage geography reveal" },
    { name: "audience-to-low-angle", opening: "audience-side 28 mm point of view", middle: "low-angle 50 mm performer portrait", ending: "fast lateral arc across the instrument line" },
    { name: "rear-stage-to-orbit", opening: "rear-stage 32 mm silhouette and depth composition", middle: "70 mm side close-up with a controlled rack focus", ending: "wide orbit that reverses the opening screen direction" },
    { name: "top-detail-to-crane", opening: "high-angle 24 mm formation map", middle: "tight 85 mm detail on face, hands, or microphone", ending: "crane-back to a diagonal full-band frame" },
    { name: "telephoto-to-handheld", opening: "long-lens 100 mm layered stage compression", middle: "restrained handheld 50 mm emotional close-up", ending: "locked frontal tableau after a sharp axis change" },
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
  const secondary = performerCount > 1 ? "the other instrumentalist or backing performer assigned in the uploaded references" : "the full band formation and assigned instruments";
  const targetByShot = shotCount === 1
    ? ["the clearest primary performance action"]
    : shotCount === 2
      ? ["the lead vocalist and the musical setup", secondary]
      : shotCount === 3
        ? ["the lead vocalist and stage geography", secondary, "an audience-side or rear-stage perspective that reveals the relationship between audience, stage, and performers"]
        : ["the lead vocalist and stage geography", secondary, "an audience-side or rear-stage perspective with a strong depth change", "the lead vocalist's emotional payoff in a tight but stable closing composition"];
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
        ? `Use two clear shot beats, cutting once at ${segmentTimestamp(cut2)} after the first musical phrase or action beat; make the second beat a different subject or camera grammar.`
        : shotCount === 3
          ? `Use three distinct shot beats, cutting at ${segmentTimestamp(cut2)} and ${segmentTimestamp(cut3)} on motivated musical or performance accents; include a different performer or audience relationship in at least one beat.`
          : `Use four distinct shot beats, cutting at ${segmentTimestamp(cut2)}, ${segmentTimestamp(cut3)}, and ${segmentTimestamp(cut4)} on motivated musical or performance accents; rotate lead, other musician, audience/stage depth, and lead payoff without repeating the same framing.`,
  };
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
        : "Build a clear multi-shot performance arc with a strong change of scale, angle, and camera movement at each cut.",
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
    ? "This is the first segment and must function as a prelude: begin with a deliberate preparation action, not a singing performance. Keep every mouth closed and do not lip-sync, even if a vocal appears later in the source file; the next segment will take over audible singing."
    : `This is segment ${segmentLabel}. Use the ${shotPlan.plan.name} camera grammar and make the transition from the previous segment visibly large: the previous pattern is ${shotPlan.previous.name}, so do not reuse its opening scale, lens family, camera direction, or movement. Change at least two of shot size, camera height, screen side, lens compression, movement direction, and subject focus while preserving the stage geography and performer identity. Within this segment, do not repeat the same framing: rotate between ${shotPlan.targets.join(", ")}.`;
  const shotSections = [
    `[Shot 1] ${shotPlan.plan.opening} establishes ${sceneLabels}, using <Picture ${primaryScene.pictureIndex}> as the primary spatial and lighting reference without copying it as a first frame. Show ${shotPlan.shotCount === 1 ? "the most important readable action" : "the complete readable band formation"} with ${performerLabels} in the positions and roles stated by the uploaded descriptions and global member rules. ${isOpeningPrelude ? "The lead performs a deliberate pre-vocal preparation action: hears the opening music, adjusts posture, checks the microphone or instrument, takes one controlled breath, and fixes a focused gaze; keep lips naturally closed." : "On the opening musical accent from <Audio 1>, stage lights and performer movement begin in a physically plausible way."} Musicians may play only what is audible. Hands remain correctly connected to microphones, drumsticks, keys, strings, and instruments; no member or instrument changes owner.`,
  ];
  if (shotPlan.shotCount >= 2) {
    shotSections.push(
      `[Shot 2] At ${segmentTimestamp(shotPlan.cut2)}, hard cut to ${shotPlan.plan.middle} focused on ${secondary}. The editorial target is ${shotPlan.targets[1]}; make the change obvious from Shot 1 through a different subject, scale, camera height, lens family, and movement direction, not a small crop adjustment. If ${secondary} is the lead, its pose, gaze, breath, microphone distance, mouth, and jaw obey the vocal timing gate exactly: keep closed lips before vocals and during pauses; if it is another performer, show only that person's assigned instrument and physically credible playing while the lead remains recognizable in the composition. ${lyricInstruction}`,
    );
  }
  if (shotPlan.shotCount >= 3) {
    shotSections.push(
      `[Shot 3] At ${segmentTimestamp(shotPlan.cut3)}, cut on a strong beat to ${shotPlan.plan.ending}, using an audience-side, rear-stage, or elevated perspective. The editorial target is ${shotPlan.targets[2]}; show a clearly changed spatial relationship and depth, not another front-facing portrait. Reveal the audience/stage relationship only as a natural concert context without inventing readable signs or unrelated people, and keep the referenced performers' identities, positions, and instruments stable. ${lead} follows only the audible vocal state from <Audio 1>, never phantom-singing through silence or instrumental gaps.`,
    );
  }
  if (shotPlan.shotCount >= 4) {
    shotSections.push(
      `[Shot 4] At ${segmentTimestamp(shotPlan.cut4)}, make a final hard change to a tight but stable emotional payoff on ${lead}. The editorial target is ${shotPlan.targets[3]}; use a distinctly different lens distance and screen direction from Shot 3, then settle instead of adding another small pan. ${lead}'s mouth, jaw, breath, gaze, and microphone distance remain driven only by <Audio 1>. End at ${segmentTimestamp(duration)} on a stable forward-readable formation with all instruments intact, the stage axis unchanged, mouths naturally settled at the phrase boundary, and a clean pose suitable for continuation into the next segment.`,
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
    `Vocal timing gate: ${vocalGate}`,
    `Segment-specific direction: ${direction}`,
    `Camera timing and adjacency rule: ${adjacentCutRule}`,
    ...shotSections,
    `Continuity: ${continuity} Preserve the previous segment's exit pose only as a continuity anchor, but make this segment's first composition and camera movement visibly different. Do not reproduce reference-sheet backgrounds, printed labels, signatures, logos, subtitles, captions, lyric text, watermarks, or other readable text. Do not create extra musicians, duplicate performers, exchange faces, swap instruments, move a member away from the described role, deform hands, or turn an instrumental band performance into unrelated choreography.`,
    "",
    "overall_soundscape:",
    "<Audio 1> is the authoritative synchronized soundtrack. Preserve the original vocal, instruments, mix balance, timing, phrase ending, dynamics, and loudness relationships exactly. Add only extremely subtle natural stage-room reflections when necessary; no crowd chanting, dialogue, applause, or unrelated effects may compete with the music.",
    "",
    "non_diegetic_music:",
    "Use <Audio 1> unchanged as the complete final music track. Do not compose, replace, extend, shorten, fade, remix, time-stretch, pitch-shift, or add a second music layer. After video generation, restore the exported original segment as the final master audio and remove any generated audio track.",
  ].join("\n");
}

export const BAND_MV_PROMPT_TEMPLATE_VERSION = "band-live-ref2va-v4-duration-shot-grammar";
