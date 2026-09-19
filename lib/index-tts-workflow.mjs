const LANGUAGES = new Set(["ZH", "EN", "JA", "ES", "AR"]);
const EMOTIONS = ["happy", "angry", "sad", "afraid", "disgusted", "melancholic", "surprised", "calm"];

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

export function normalizeIndexTtsRequest(input = {}) {
  const text = String(input.text || "").trim();
  if (!text) throw new Error("待合成台词不能为空");
  if (text.length > 2000) throw new Error("单次台词不能超过 2000 个字符，请拆分后批量生成");
  const mode = ["speaker", "text", "vector", "audio"].includes(input.emotionMode)
    ? input.emotionMode
    : "speaker";
  const vector = Object.fromEntries(
    EMOTIONS.map((name) => [name, clamp(input.emotionVector?.[name], 0, 1, 0)]),
  );
  return {
    text,
    language: LANGUAGES.has(input.language) ? input.language : "ZH",
    durationFactor: clamp(input.durationFactor, 0.5, 2, 1),
    emotionMode: mode,
    emotionText: String(input.emotionText || "").trim(),
    emotionVector: vector,
    emotionStrength: clamp(input.emotionStrength, 0, 1, 0.65),
    seed: Math.max(0, Math.floor(Number(input.seed) || 20260913)),
    qualityRetryCount: Math.floor(clamp(input.qualityRetryCount, 0, 3, 0)),
    outputPrefix: String(input.outputPrefix || "DirectorMaster/voice").replace(/[^\w\-./\u4e00-\u9fff]/g, "_").slice(0, 120),
  };
}

export function buildIndexTtsWorkflow(input = {}) {
  const request = normalizeIndexTtsRequest(input);
  const workflow = {
    "1": {
      class_type: "T8_IndexTTS25_ModelLoader",
      inputs: {
        model_name: "IndexTTS-2.5",
        device: "auto",
        precision: "auto",
        acceleration_mode: "off",
        use_cuda_kernel: false,
        release_after_run: false,
        recycle_after_runs: 0,
        verify_hashes: false,
        custom_model_path: "",
        reference_device: "auto",
        reuse_spk_cond_for_emo: false,
        persistent_reference_cache: true,
        download_missing: false,
        accept_model_license: false,
      },
    },
    "2": { class_type: "LoadAudio", inputs: { audio: String(input.speakerFile || "voice_reference.wav") } },
    "3": {
      class_type: "T8_IndexTTS25_ReferenceQuality",
      inputs: { audio: ["2", 0], auto_prepare: true, maximum_seconds: 15, silence_padding_ms: 120 },
    },
  };

  let emotionNodeId = "4";
  if (request.emotionMode === "audio") {
    workflow["4"] = { class_type: "LoadAudio", inputs: { audio: String(input.emotionFile || "emotion_reference.wav") } };
    workflow["5"] = {
      class_type: "T8_IndexTTS25_EmotionControl",
      inputs: { mode: "reference_audio", "mode.emotion_audio": ["4", 0], "mode.strength": request.emotionStrength },
    };
    emotionNodeId = "5";
  } else if (request.emotionMode === "text") {
    workflow["4"] = {
      class_type: "T8_IndexTTS25_EmotionControl",
      inputs: { mode: "text", "mode.emotion_text": request.emotionText, "mode.strength": request.emotionStrength },
    };
  } else if (request.emotionMode === "vector") {
    workflow["4"] = {
      class_type: "T8_IndexTTS25_EmotionControl",
      inputs: {
        mode: "vector",
        ...Object.fromEntries(EMOTIONS.map((name) => [`mode.${name}`, request.emotionVector[name]])),
        "mode.strength": request.emotionStrength,
        "mode.use_random": false,
      },
    };
  } else {
    workflow["4"] = { class_type: "T8_IndexTTS25_EmotionControl", inputs: { mode: "speaker" } };
  }

  const generateId = request.emotionMode === "audio" ? "6" : "5";
  const saveId = request.emotionMode === "audio" ? "7" : "6";
  workflow[generateId] = {
    class_type: "T8_IndexTTS25_Generate",
    inputs: {
      model: ["1", 0],
      speaker_audio: ["3", 0],
      text: request.text,
      language: request.language,
      duration_factor: request.durationFactor,
      target_duration_mode: "off",
      target_duration_seconds: 0,
      postprocess_preset: "off",
      postprocess_strength: 1,
      seed: request.seed,
      quality_retry_count: request.qualityRetryCount,
      quality_asr_backend: "auto",
      quality_asr_model: "base",
      quality_asr_device: "auto",
      quality_threshold: 0.82,
      emotion: [emotionNodeId, 0],
    },
  };
  workflow[saveId] = {
    class_type: "SaveAudio",
    inputs: { audio: [generateId, 0], filename_prefix: request.outputPrefix },
  };
  return workflow;
}

export const INDEX_TTS_EMOTIONS = [...EMOTIONS];

