const TRACK_KINDS = new Set(["dialogue", "vocal", "bed", "sfx"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonEmptyString(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const text = value.trim();
  return text || fallback;
}

function normalizeClip(rawClip, trackId) {
  const clip = isRecord(rawClip) ? rawClip : {};
  const sourceDuration = finiteNumber(clip.sourceDuration, 0);
  return {
    id: nonEmptyString(clip.id),
    source: nonEmptyString(clip.source),
    trackId: nonEmptyString(clip.trackId, trackId),
    start: finiteNumber(clip.start, 0),
    duration: finiteNumber(clip.duration, 0),
    offset: finiteNumber(clip.offset, 0),
    gain: finiteNumber(clip.gain, 1),
    fadeIn: finiteNumber(clip.fadeIn, 0),
    fadeOut: finiteNumber(clip.fadeOut, 0),
    mute: typeof clip.mute === "boolean" ? clip.mute : false,
    audioPath: nonEmptyString(clip.audioPath),
    ...(sourceDuration > 0 ? { sourceDuration } : {}),
    ...(nonEmptyString(clip.text) ? { text: nonEmptyString(clip.text) } : {}),
    ...(isRecord(clip.metadata) ? { metadata: clip.metadata } : {}),
  };
}

function normalizeTrack(rawTrack) {
  const track = isRecord(rawTrack) ? rawTrack : {};
  const id = nonEmptyString(track.id);
  const clips = Array.isArray(track.clips)
    ? track.clips.map((clip) => normalizeClip(clip, id))
    : [];
  return {
    id,
    name: nonEmptyString(track.name, id),
    kind: nonEmptyString(track.kind, "dialogue"),
    volume: finiteNumber(track.volume, 1),
    muted: typeof track.muted === "boolean" ? track.muted : false,
    solo: typeof track.solo === "boolean" ? track.solo : false,
    pan: finiteNumber(track.pan, 0),
    clips,
  };
}

/**
 * 将外部 JSON 规整成稳定的时间轴结构，并补齐字段默认值。
 * 这里不做合法性判断，校验结果由 validateTimeline 单独返回。
 */
export function normalizeTimeline(value) {
  const timeline = isRecord(value) ? value : {};
  return {
    version: finiteNumber(timeline.version, 1),
    name: nonEmptyString(timeline.name, "台词重配时间轴"),
    duration: finiteNumber(timeline.duration, 0),
    tracks: Array.isArray(timeline.tracks)
      ? timeline.tracks.map((track) => normalizeTrack(track))
      : [],
  };
}

function makeValidationError(code, message, location, detail = {}) {
  return { code, message, location, ...detail };
}

/**
 * 校验时间轴。所有问题都作为结构化错误返回，调用方决定如何展示或中断。
 * 重叠只在同一轨道内判定；不同轨道本来就应该允许叠放。
 */
export function validateTimeline(value, { requireAudioPath = true } = {}) {
  const timeline = normalizeTimeline(value);
  const errors = [];
  const trackIds = new Set();
  const clipIds = new Set();

  if (!(timeline.duration > 0)) {
    errors.push(
      makeValidationError(
        "TIMELINE_DURATION_INVALID",
        "timeline.duration 必须是大于 0 的秒数",
        "duration",
      ),
    );
  }
  if (!timeline.tracks.length) {
    errors.push(
      makeValidationError(
        "TIMELINE_TRACKS_EMPTY",
        "timeline.tracks 不能为空",
        "tracks",
      ),
    );
  }

  timeline.tracks.forEach((track, trackIndex) => {
    const trackLocation = `tracks[${trackIndex}]`;
    if (!track.id) {
      errors.push(
        makeValidationError("TRACK_ID_MISSING", "轨道缺少 id", `${trackLocation}.id`, {
          trackId: track.id,
        }),
      );
    } else if (trackIds.has(track.id)) {
      errors.push(
        makeValidationError(
          "TRACK_ID_DUPLICATE",
          `轨道 id 重复：${track.id}`,
          `${trackLocation}.id`,
          { trackId: track.id },
        ),
      );
    } else {
      trackIds.add(track.id);
    }

    if (!TRACK_KINDS.has(track.kind)) {
      errors.push(
        makeValidationError(
          "TRACK_KIND_INVALID",
          `轨道 ${track.id} 的 kind 必须是 dialogue/vocal/bed/sfx`,
          `${trackLocation}.kind`,
          { trackId: track.id },
        ),
      );
    }
    if (!(track.volume >= 0)) {
      errors.push(
        makeValidationError(
          "TRACK_VOLUME_INVALID",
          `轨道 ${track.id} 的 volume 不能小于 0`,
          `${trackLocation}.volume`,
          { trackId: track.id },
        ),
      );
    }
    if (track.pan < -1 || track.pan > 1) {
      errors.push(
        makeValidationError(
          "TRACK_PAN_INVALID",
          `轨道 ${track.id} 的 pan 必须在 -1 到 1 之间`,
          `${trackLocation}.pan`,
          { trackId: track.id },
        ),
      );
    }

    const intervals = [];
    track.clips.forEach((clip, clipIndex) => {
      const clipLocation = `${trackLocation}.clips[${clipIndex}]`;
      if (!clip.id) {
        errors.push(
          makeValidationError("CLIP_ID_MISSING", "片段缺少 id", `${clipLocation}.id`, {
            trackId: track.id,
          }),
        );
      } else if (clipIds.has(clip.id)) {
        errors.push(
          makeValidationError(
            "CLIP_ID_DUPLICATE",
            `片段 id 重复：${clip.id}`,
            `${clipLocation}.id`,
            { trackId: track.id, clipId: clip.id },
          ),
        );
      } else {
        clipIds.add(clip.id);
      }

      if (!clip.source) {
        errors.push(
          makeValidationError(
            "CLIP_SOURCE_MISSING",
            `片段 ${clip.id} 缺少 source`,
            `${clipLocation}.source`,
            { trackId: track.id, clipId: clip.id },
          ),
        );
      }
      if (clip.trackId !== track.id) {
        errors.push(
          makeValidationError(
            "CLIP_TRACK_REFERENCE_INVALID",
            `片段 ${clip.id} 的 trackId=${clip.trackId} 与所在轨道 ${track.id} 不一致`,
            `${clipLocation}.trackId`,
            { trackId: track.id, clipId: clip.id },
          ),
        );
      }
      if (requireAudioPath && !clip.audioPath) {
        errors.push(
          makeValidationError(
            "CLIP_AUDIO_PATH_MISSING",
            `片段 ${clip.id} 缺少 audioPath`,
            `${clipLocation}.audioPath`,
            { trackId: track.id, clipId: clip.id },
          ),
        );
      }
      if (!(clip.start >= 0)) {
        errors.push(
          makeValidationError(
            "CLIP_START_INVALID",
            `片段 ${clip.id} 的 start 不能小于 0`,
            `${clipLocation}.start`,
            { trackId: track.id, clipId: clip.id },
          ),
        );
      }
      if (!(clip.duration > 0)) {
        errors.push(
          makeValidationError(
            "CLIP_DURATION_INVALID",
            `片段 ${clip.id} 的 duration 必须大于 0`,
            `${clipLocation}.duration`,
            { trackId: track.id, clipId: clip.id },
          ),
        );
      }
      if (!(clip.offset >= 0)) {
        errors.push(
          makeValidationError(
            "CLIP_OFFSET_INVALID",
            `片段 ${clip.id} 的 offset 不能小于 0`,
            `${clipLocation}.offset`,
            { trackId: track.id, clipId: clip.id },
          ),
        );
      }
      if (!(clip.gain >= 0)) {
        errors.push(
          makeValidationError(
            "CLIP_GAIN_INVALID",
            `片段 ${clip.id} 的 gain 不能小于 0`,
            `${clipLocation}.gain`,
            { trackId: track.id, clipId: clip.id },
          ),
        );
      }
      if (!(clip.fadeIn >= 0) || !(clip.fadeOut >= 0)) {
        errors.push(
          makeValidationError(
            "CLIP_FADE_INVALID",
            `片段 ${clip.id} 的 fadeIn/fadeOut 不能小于 0`,
            `${clipLocation}.fadeIn`,
            { trackId: track.id, clipId: clip.id },
          ),
        );
      } else if (clip.fadeIn + clip.fadeOut > clip.duration + 1e-6) {
        errors.push(
          makeValidationError(
            "CLIP_FADE_TOO_LONG",
            `片段 ${clip.id} 的淡入淡出总时长不能超过 duration`,
            `${clipLocation}.fadeOut`,
            { trackId: track.id, clipId: clip.id },
          ),
        );
      }
      if (
        clip.sourceDuration != null &&
        (!(clip.sourceDuration > 0) || clip.offset >= clip.sourceDuration)
      ) {
        errors.push(
          makeValidationError(
            "CLIP_SOURCE_RANGE_INVALID",
            `片段 ${clip.id} 的 offset 超出素材时长`,
            `${clipLocation}.offset`,
            { trackId: track.id, clipId: clip.id },
          ),
        );
      }
      if (clip.start + clip.duration > timeline.duration + 1e-6) {
        errors.push(
          makeValidationError(
            "CLIP_OUT_OF_BOUNDS",
            `片段 ${clip.id} 超出时间轴时长`,
            `${clipLocation}.duration`,
            { trackId: track.id, clipId: clip.id },
          ),
        );
      }
      if (clip.start >= 0 && clip.duration > 0) {
        intervals.push({ clipId: clip.id, start: clip.start, end: clip.start + clip.duration });
      }
    });

    intervals.sort((a, b) => a.start - b.start || a.end - b.end);
    for (let index = 1; index < intervals.length; index += 1) {
      const previous = intervals[index - 1];
      const current = intervals[index];
      if (current.start < previous.end - 1e-6) {
        errors.push(
          makeValidationError(
            "CLIP_OVERLAP",
            `轨道 ${track.id} 内片段 ${previous.clipId} 与 ${current.clipId} 重叠`,
            `${trackLocation}.clips`,
            {
              trackId: track.id,
              clipId: current.clipId,
              previousClipId: previous.clipId,
            },
          ),
        );
      }
    }
  });

  return errors;
}

/**
 * 把旧的扁平 script.segments 与 TTS manifest 迁成多轨时间轴。
 * 默认把原时间窗长度作为片段 duration，保持旧 job 的听感与重跑行为。
 */
export function migrateScriptToTimeline(scriptValue, manifestValue, options = {}) {
  const script = isRecord(scriptValue) ? scriptValue : {};
  const segments = Array.isArray(script.segments) ? script.segments : [];
  const manifestRows = Array.isArray(manifestValue)
    ? manifestValue
    : isRecord(manifestValue) && Array.isArray(manifestValue.items)
      ? manifestValue.items
      : [];
  const manifestById = new Map();

  for (const item of manifestRows) {
    if (!isRecord(item) || !nonEmptyString(item.id)) continue;
    manifestById.set(nonEmptyString(item.id), item);
  }

  const tracks = [];
  const tracksBySpeaker = new Map();
  const usedTrackIds = new Set();

  for (const rawSegment of segments) {
    if (!isRecord(rawSegment)) continue;
    const id = nonEmptyString(rawSegment.id);
    if (!id) continue;
    const item = manifestById.get(id);
    const audioPath = nonEmptyString(item?.path, nonEmptyString(rawSegment.audioPath));
    if (!audioPath) continue;

    const speaker = nonEmptyString(rawSegment.speaker, "A");
    let track = tracksBySpeaker.get(speaker);
    if (!track) {
      let suffix = String(tracks.length + 1).padStart(2, "0");
      let trackId = `dialogue-${suffix}`;
      while (usedTrackIds.has(trackId)) {
        suffix = String(Number(suffix) + 1).padStart(2, "0");
        trackId = `dialogue-${suffix}`;
      }
      track = {
        id: trackId,
        name: speaker,
        kind: "dialogue",
        volume: 1,
        muted: false,
        solo: false,
        pan: 0,
        clips: [],
      };
      usedTrackIds.add(trackId);
      tracksBySpeaker.set(speaker, track);
      tracks.push(track);
    }

    const start = Math.max(
      0,
      finiteNumber(rawSegment.start, finiteNumber(item?.start, 0)),
    );
    const slotEnd = finiteNumber(rawSegment.end, finiteNumber(item?.end, start + 0.35));
    const legacyDuration = Math.max(0.35, slotEnd - start);
    const clipDuration = finiteNumber(
      rawSegment.duration,
      options.preserveOriginalSlots === false
        ? finiteNumber(item?.ttsDuration, legacyDuration)
        : legacyDuration,
    );
    const sourceDuration = finiteNumber(
      rawSegment.sourceDuration,
      finiteNumber(item?.ttsDuration, 0),
    );

    track.clips.push({
      id,
      source: speaker,
      trackId: track.id,
      start,
      duration: Math.max(0.35, clipDuration),
      offset: Math.max(0, finiteNumber(rawSegment.offset, 0)),
      gain: finiteNumber(rawSegment.gain, 1),
      fadeIn: Math.max(0, finiteNumber(rawSegment.fadeIn, 0)),
      fadeOut: Math.max(0, finiteNumber(rawSegment.fadeOut, 0)),
      mute: rawSegment.mute === true,
      audioPath,
      ...(sourceDuration > 0 ? { sourceDuration } : {}),
      text: nonEmptyString(rawSegment.newText, nonEmptyString(item?.text)),
      metadata: {
        legacySegment: { ...rawSegment },
        legacyManifest: { ...item },
      },
    });
  }

  let duration = finiteNumber(options.duration, 0);
  for (const track of tracks) {
    for (const clip of track.clips) duration = Math.max(duration, clip.start + clip.duration);
  }
  duration = Math.max(0.001, duration);

  const instrumentalPath = nonEmptyString(options.instrumentalPath);
  if (
    instrumentalPath &&
    options.includeInstrumental !== false &&
    options.separation !== "skipped"
  ) {
    const bedSourceDuration = finiteNumber(options.instrumentalDuration, 0);
    tracks.push({
      id: "bed-01",
      name: "伴奏",
      kind: "bed",
      volume: 1,
      muted: false,
      solo: false,
      pan: 0,
      clips: [
        {
          id: "BED001",
          source: "instrumental",
          trackId: "bed-01",
          start: 0,
          duration,
          offset: 0,
          gain: 1,
          fadeIn: 0,
          fadeOut: 0,
          mute: false,
          audioPath: instrumentalPath,
          ...(bedSourceDuration > 0 ? { sourceDuration: bedSourceDuration } : {}),
          metadata: { migrated: true, kind: "bed" },
        },
      ],
    });
  }

  return {
    version: 1,
    name: nonEmptyString(options.name, "台词重配时间轴"),
    duration,
    tracks,
  };
}

/**
 * 返回当前可发声的轨道。存在任意 solo 轨道时，只保留 solo 轨道。
 */
export function getAudibleTracks(value) {
  const timeline = normalizeTimeline(value);
  const hasSolo = timeline.tracks.some((track) => track.solo);
  return timeline.tracks.filter((track) => !track.muted && (!hasSolo || track.solo));
}
