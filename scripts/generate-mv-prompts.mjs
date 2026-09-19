import { promises as fs } from "node:fs";
import path from "node:path";
import {
  BAND_MV_PROMPT_TEMPLATE_VERSION,
  buildStandardBandMvPrompt,
} from "../lib/mv-prompt.mjs";

const projectId = process.argv[2];
if (!projectId) throw new Error("用法: node scripts/generate-mv-prompts.mjs <projectId>");

const projectFile = path.join(
  "D:\\HermesWorkspace\\directorMaster\\workspace\\mv",
  projectId,
  "project.json",
);
const project = JSON.parse(await fs.readFile(projectFile, "utf8"));
const cuts = Array.isArray(project.cuts) ? project.cuts.map(Number) : [];
const trimRange = {
  start: Math.max(0, Number(project.trimStart || 0)),
  end: Math.min(Number(project.duration), Number(project.trimEnd || project.duration)),
};
const points = [
  trimRange.start,
  ...cuts.filter((value) => value > trimRange.start && value < trimRange.end),
  trimRange.end,
];
const segments = points.slice(0, -1).map((start, index) => ({
  index: index + 1,
  start,
  end: points[index + 1],
  duration: points[index + 1] - start,
}));
const notes = segments.map((_, index) => {
  const item = project.segments?.[index] || {};
  return {
    kind: item.kind === "instrumental" ? "instrumental" : "vocal",
    lyrics: String(item.lyrics || ""),
    direction: String(item.direction || ""),
  };
});
const settings = project.settings || {};
const visualAssets = Array.isArray(project.visualAssets) ? project.visualAssets : [];
if (!visualAssets.some((asset) => asset.category === "人物")) throw new Error("缺少人物素材");
if (!visualAssets.some((asset) => asset.category === "场景")) throw new Error("缺少场景素材");

const prompts = segments.map((segment, index) =>
  buildStandardBandMvPrompt({
    projectName: project.projectName,
    segment,
    note: notes[index],
    assets: visualAssets,
    settings,
    leadSilenceSec: Number(project.leadSilenceSec || 0),
  }),
);
const signature = JSON.stringify({
  templateVersion: BAND_MV_PROMPT_TEMPLATE_VERSION,
  cuts,
  duration: Number(project.duration || 0),
  notes,
  visualAssets: visualAssets.map(({ id, category, description }) => ({ id, category, description })),
  settings,
  leadSilenceSec: Number(project.leadSilenceSec || 0),
  trimRange,
});
const updated = {
  ...project,
  segments: notes,
  promptBundle: { prompts, signature },
  updatedAt: new Date().toISOString(),
};
const temporary = projectFile + ".tmp";
await fs.writeFile(temporary, JSON.stringify(updated, null, 2), "utf8");
await fs.rename(temporary, projectFile);
process.stdout.write(JSON.stringify({ projectId, promptCount: prompts.length, assetCount: visualAssets.length }));
