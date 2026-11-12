import type { ComposeReport } from './mv-compose-validate.d.ts';

export const DEFAULT_LIPSYNC_WORKFLOW_ID: string;

export type LipsyncWorkflow = {
  id: string;
  key: string;
  name: string;
  label: string;
  aliases: string[];
  isDefault: boolean;
};

export const LIPSYNC_WORKFLOWS: LipsyncWorkflow[];

export type LipsyncWorkflowResolution = {
  ok: boolean;
  id?: string;
  key?: string;
  name?: string;
  label?: string;
  aliases?: string[];
  isDefault?: boolean;
  custom?: boolean;
  reason: string;
};

export function listLipsyncWorkflows(): LipsyncWorkflow[];

export function resolveLipsyncWorkflow(idOrAlias?: string): LipsyncWorkflowResolution;

export type LipsyncFinalizeMuxPlan = {
  videoPaths: string[];
  audioPath: string;
  outPath: string;
  audioSource: 'original';
  startSec?: number;
  endSec?: number;
};

export type LipsyncFinalizePlan = {
  ok: boolean;
  reason: string;
  workflow: LipsyncWorkflowResolution;
  compose: ComposeReport;
  mux: LipsyncFinalizeMuxPlan | null;
};

export function planLipsyncFinalize(input?: {
  videoPath?: string;
  videoPaths?: string[];
  audioPath?: string;
  audioSource?: 'original' | 'generated' | 'unknown';
  startSec?: number;
  endSec?: number;
  sourceAudioDuration?: number;
  videoDuration?: number;
  outPath?: string;
  workflowId?: string;
}): LipsyncFinalizePlan;
