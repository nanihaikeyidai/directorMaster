/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";

type VoiceAsset = {
  id: string;
  kind: "speaker" | "emotion";
  name: string;
  path: string;
  duration: number;
  sampleRate: number;
  channels: number;
  leadingSilence: number;
  recommended: boolean;
};

type VoiceJob = {
  id: string;
  status: "queued" | "running" | "done" | "error";
  stage: string;
  character?: string;
  text: string;
  emotionMode: string;
  emotionText?: string;
  outputPath?: string;
  outputFile?: string;
  error?: string;
  audio?: { duration: number; sampleRate: number };
  createdAt: string;
};

const emotionFields = [
  ["happy", "高兴"], ["angry", "愤怒"], ["sad", "悲伤"], ["afraid", "恐惧"],
  ["disgusted", "厌恶"], ["melancholic", "低落"], ["surprised", "惊讶"], ["calm", "自然"],
] as const;

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatTime(value: number) {
  return `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, "0")}`;
}

export default function VoiceCloneStudio() {
  const [assets, setAssets] = useState<VoiceAsset[]>([]);
  const [speaker, setSpeaker] = useState<VoiceAsset | null>(null);
  const [emotionAudio, setEmotionAudio] = useState<VoiceAsset | null>(null);
  const [jobs, setJobs] = useState<VoiceJob[]>([]);
  const [character, setCharacter] = useState("");
  const [text, setText] = useState("校长深吸一口气，压低声音说道：这件事，先不要告诉任何人。");
  const [language, setLanguage] = useState("ZH");
  const [emotionMode, setEmotionMode] = useState<"speaker" | "text" | "vector" | "audio">("text");
  const [emotionText, setEmotionText] = useState("紧张、克制，试图保持镇定，句尾略微发虚。");
  const [emotionVector, setEmotionVector] = useState<Record<string, number>>({ happy: 0, angry: 0, sad: 0, afraid: 0.35, disgusted: 0, melancholic: 0.1, surprised: 0.05, calm: 0.35 });
  const [strength, setStrength] = useState(0.65);
  const [durationFactor, setDurationFactor] = useState(1);
  const [qualityRetryCount, setQualityRetryCount] = useState(0);
  const [seed, setSeed] = useState(20260913);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("正在检查本地环境…");
  const [comfy, setComfy] = useState<{ found: boolean; port?: number }>({ found: false });

  const speakerAssets = useMemo(() => assets.filter((asset) => asset.kind === "speaker"), [assets]);
  const canGenerate = Boolean(speaker && text.trim() && consent && comfy.found && (emotionMode !== "audio" || emotionAudio) && !busy);

  useEffect(() => {
    void Promise.all([
      fetch("/api/local/voice/assets").then((response) => response.json()),
      fetch("/api/local/voice/jobs").then((response) => response.json()),
      fetch("/api/local/comfyui/discover").then((response) => response.json()),
    ]).then(([savedAssets, savedJobs, runtime]) => {
      const nextAssets = Array.isArray(savedAssets) ? savedAssets : [];
      setAssets(nextAssets);
      setSpeaker(nextAssets.find((asset: VoiceAsset) => asset.kind === "speaker") || null);
      setEmotionAudio(nextAssets.find((asset: VoiceAsset) => asset.kind === "emotion") || null);
      setJobs(Array.isArray(savedJobs) ? savedJobs : []);
      setComfy(runtime);
      setNotice(runtime.found ? `已连接当前 ComfyUI · 端口 ${runtime.port}` : "未发现正在运行的 ComfyUI");
    }).catch((error) => setNotice(error instanceof Error ? error.message : String(error)));
  }, []);

  async function upload(file: File, kind: "speaker" | "emotion") {
    setBusy(kind === "speaker" ? "正在分析音色参考…" : "正在分析情绪参考…");
    try {
      const response = await fetch("/api/local/voice/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, fileName: file.name, dataBase64: await toBase64(file) }),
      });
      const asset = await response.json();
      if (!response.ok) throw new Error(asset.error || "声音素材上传失败");
      setAssets((current) => [asset, ...current]);
      if (kind === "speaker") setSpeaker(asset); else setEmotionAudio(asset);
      setNotice(asset.recommended
        ? `参考音频可用 · ${asset.duration.toFixed(2)} 秒`
        : `参考音频为 ${asset.duration.toFixed(2)} 秒；建议改用 3–10 秒的清晰单人干声`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function monitor(id: string) {
    for (let attempt = 0; attempt < 720; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2500));
      const response = await fetch(`/api/local/voice/jobs?id=${encodeURIComponent(id)}`);
      const job = await response.json();
      if (!response.ok) throw new Error(job.error || "读取声音任务失败");
      setJobs((current) => [job, ...current.filter((item) => item.id !== id)]);
      setNotice(job.stage || "生成中");
      if (job.status === "done") return;
      if (job.status === "error") throw new Error(job.error || job.stage || "生成失败");
    }
    throw new Error("等待声音生成超时");
  }

  async function generate() {
    if (!canGenerate || !speaker) return;
    setBusy("正在提交声音克隆任务…");
    try {
      const response = await fetch("/api/local/voice/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          speakerPath: speaker.path,
          emotionAudioPath: emotionAudio?.path,
          character,
          text,
          language,
          emotionMode,
          emotionText,
          emotionVector,
          emotionStrength: strength,
          durationFactor,
          qualityRetryCount,
          seed,
          consent,
        }),
      });
      const job = await response.json();
      if (!response.ok) throw new Error(job.error || "声音任务提交失败");
      setJobs((current) => [job, ...current]);
      setBusy("IndexTTS 2.5 正在生成…");
      await monitor(job.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  return <main className="voice-app">
    <header className="mv-topbar">
      <a className="mv-brand" href="/"><span>DM</span><b>DIRECTOR MASTER</b></a>
      <nav><a href="/">导演画布</a><a href="/mv">MV 制作</a><a className="active" href="/voice">声音克隆</a></nav>
      <div className={`voice-runtime ${comfy.found ? "online" : "offline"}`}><i />{comfy.found ? `COMFY : ${comfy.port}` : "COMFY OFFLINE"}</div>
    </header>

    <section className="voice-shell">
      <div className="voice-heading">
        <div><small>INDEXTTS 2.5 · LOCAL VOICE LAB</small><h1>声音克隆工坊</h1><p>用一段授权参考音色，为每句台词配置情绪、语言与节奏，生成可直接加入导演台时间轴的声音素材。</p></div>
        <strong>{notice}</strong>
      </div>

      <div className="voice-workbench">
        <aside className="voice-sources">
          <section className="voice-card">
            <header><div><small>VOICE IDENTITY</small><h2>音色参考</h2></div><b>{speakerAssets.length}</b></header>
            <label className="voice-drop">
              <input hidden type="file" accept="audio/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, "speaker"); event.target.value = ""; }} />
              <span>＋</span><b>上传参考音频</b><i>建议 3–10 秒 · 单人 · 无音乐 · 无混响</i>
            </label>
            {speaker && <div className="voice-selected">
              <div><b>{speaker.name}</b><span>{speaker.duration.toFixed(2)}s · {speaker.sampleRate} Hz · {speaker.channels === 1 ? "单声道" : `${speaker.channels} 声道`}</span></div>
              <audio controls preload="metadata" src={`/api/local/file?path=${encodeURIComponent(speaker.path)}`} />
              <p className={speaker.recommended ? "ok" : "warn"}>{speaker.recommended ? "时长适合克隆" : "建议裁成 3–10 秒"}{speaker.leadingSilence > 0.04 ? ` · 检测到开头 ${speaker.leadingSilence.toFixed(2)}s 静音，生成时自动整理` : " · 开头无明显静音"}</p>
            </div>}
            {speakerAssets.length > 1 && <label className="voice-library">已保存音色<select value={speaker?.id || ""} onChange={(event) => setSpeaker(speakerAssets.find((asset) => asset.id === event.target.value) || null)}>{speakerAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {asset.duration.toFixed(1)}s</option>)}</select></label>}
          </section>

          <section className="voice-card voice-guide">
            <small>REFERENCE CHECK</small><h3>参考音频检查</h3>
            <ul><li>只保留一个人的声音</li><li>避免音乐、环境噪声和强混响</li><li>情绪音频只转移表达，不替换音色身份</li><li>数字、年份和多音字建议使用口语写法</li></ul>
          </section>
        </aside>

        <section className="voice-card voice-editor">
          <header><div><small>DIALOGUE LINE</small><h2>台词与表演</h2></div><span>{text.length}/2000</span></header>
          <div className="voice-form-row"><label>角色名<input value={character} onChange={(event) => setCharacter(event.target.value)} placeholder="例如：校长" /></label><label>语言<select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="ZH">中文</option><option value="EN">英语</option><option value="JA">日语</option><option value="ES">西班牙语</option><option value="AR">阿拉伯语</option></select></label></div>
          <label className="voice-script">台词<textarea maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} placeholder="输入要生成的完整台词。每次建议生成一句，便于逐句审核和时间轴对齐。" /></label>

          <div className="voice-section-title"><div><small>EMOTION CONTROL</small><h3>情绪控制</h3></div><b>{Math.round(strength * 100)}%</b></div>
          <div className="voice-mode-tabs">
            {([['speaker','跟随音色'],['text','情绪描述'],['vector','八维控制'],['audio','情绪音频']] as const).map(([value,label]) => <button key={value} className={emotionMode === value ? "active" : ""} onClick={() => setEmotionMode(value)}>{label}</button>)}
          </div>
          {emotionMode === "speaker" && <p className="voice-mode-help">沿用参考音频本身的表达方式，显存占用最低，适合稳定复刻。</p>}
          {emotionMode === "text" && <label className="voice-emotion-text">情绪导演说明<textarea value={emotionText} onChange={(event) => setEmotionText(event.target.value)} placeholder="例如：紧张但克制，语速略快，尾音压低，不要喊叫。留空时由模型根据台词分析。" /></label>}
          {emotionMode === "vector" && <div className="voice-vector-grid">{emotionFields.map(([key,label]) => <label key={key}><span><b>{label}</b><i>{emotionVector[key].toFixed(2)}</i></span><input type="range" min="0" max="1" step="0.05" value={emotionVector[key]} onChange={(event) => setEmotionVector({ ...emotionVector, [key]: Number(event.target.value) })} /></label>)}</div>}
          {emotionMode === "audio" && <div className="voice-emotion-audio"><label className="voice-drop compact"><input hidden type="file" accept="audio/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, "emotion"); event.target.value = ""; }} /><span>＋</span><b>{emotionAudio ? emotionAudio.name : "上传情绪参考音频"}</b><i>仅提取情绪与表达方式</i></label>{emotionAudio && <audio controls src={`/api/local/file?path=${encodeURIComponent(emotionAudio.path)}`} />}</div>}

          {emotionMode !== "speaker" && <label className="voice-slider"><span>情绪强度 <b>{strength.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.05" value={strength} onChange={(event) => setStrength(Number(event.target.value))} /></label>}
          <div className="voice-form-row three"><label>时长倍率 <input type="number" min="0.5" max="2" step="0.05" value={durationFactor} onChange={(event) => setDurationFactor(Number(event.target.value))} /><small>小于 1 更短，大于 1 更长</small></label><label>候选重试<select value={qualityRetryCount} onChange={(event) => setQualityRetryCount(Number(event.target.value))}><option value="0">单次生成</option><option value="1">2 个候选选优</option><option value="2">3 个候选选优</option><option value="3">4 个候选选优</option></select></label><label>Seed<input type="number" min="0" value={seed} onChange={(event) => setSeed(Number(event.target.value))} /></label></div>

          <footer className="voice-submit"><label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>我确认已获得该声音的克隆与使用授权</span></label><button disabled={!canGenerate} onClick={() => void generate()}>{busy || "生成这句台词"}</button></footer>
        </section>
      </div>

      <section className="voice-card voice-results">
        <header><div><small>TAKE HISTORY</small><h2>生成记录</h2></div><b>{jobs.length}</b></header>
        {!jobs.length && <div className="voice-empty">生成后的每句台词会保留参数、状态和音频路径，方便逐句审核。</div>}
        <div className="voice-takes">{jobs.map((job) => <article key={job.id}>
          <div className="voice-take-index"><span className={job.status} /><b>{job.character || "未命名角色"}</b><i>{new Date(job.createdAt).toLocaleString()}</i></div>
          <p>{job.text}</p>
          <div className="voice-take-meta"><span>{job.emotionMode === "text" ? job.emotionText || "自动分析情绪" : job.emotionMode}</span><strong>{job.stage}</strong>{job.audio && <span>{formatTime(job.audio.duration)} · {job.audio.sampleRate} Hz</span>}</div>
          {job.outputPath && <audio controls preload="metadata" src={`/api/local/file?path=${encodeURIComponent(job.outputPath)}`} />}
          {job.outputPath && <a href={`/api/local/file?path=${encodeURIComponent(job.outputPath)}`} download={job.outputFile}>下载音频</a>}
          {job.error && <code>{job.error}</code>}
        </article>)}</div>
      </section>
    </section>
  </main>;
}

