/* eslint-disable @typescript-eslint/no-explicit-any */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { adaptRunningHubWorkflow } from './runninghub-workflow-adapters';

const root = path.resolve('D:/HermesWorkspace/directorMaster');
const jobs = path.join(root, 'workspace/runninghub');
const templatePath = path.join(root, 'workspace/workflows/runninghub-director-api.json');
const mvWorkflowRoot = path.join(root, 'workspace/workflows/mv');
const mvCloudWorkflowRoot = path.join(mvWorkflowRoot, 'cloud');
const mvTemplatePath = path.join(mvCloudWorkflowRoot, 'minimax_h3_remix_ref2va_dual_sampling_api.json');
const apiBase = 'https://www.runninghub.cn';
const defaultWorkflowId = '2090979599860719618';
const mvWorkflowId = '2087128116820013058';
const allowedWorkflowIds = new Set([defaultWorkflowId, mvWorkflowId]);
const sizes: Record<string, number[]> = { '0.2':[608,352], '0.3':[736,416], '0.4':[864,480], '0.5':[960,544], '0.6':[1056,608], '0.7':[1152,640], '0.8':[1216,672], '0.9':[1280,736], '1':[1376,768] };
const inflight = new Map<string, Promise<any>>();
async function key() {
  if (process.env.RUNNINGHUB_API_KEY) return process.env.RUNNINGHUB_API_KEY;
  const script = "$s=Get-Content -Raw -LiteralPath 'C:\\Users\\Administrator\\.codex\\secrets\\runninghub-api-key.dpapi'|ConvertTo-SecureString;$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{[Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}";
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>name.toLowerCase()!=='psmodulepath'));
  try { return (await promisify(execFile)('powershell.exe', ['-NoProfile','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')], { windowsHide:true,env })).stdout.trim(); }
  catch(error:any) { throw new Error('RunningHub 密钥不可用（'+String(error.code||error.name)+'），请配置 RUNNINGHUB_API_KEY 或当前用户的 DPAPI 凭据'); }
}
async function call(endpoint: string, body: any, secret: string): Promise<any> {
  const response = await fetch(apiBase + endpoint, { method:'POST', headers:{ 'content-type':'application/json', Authorization:'Bearer '+secret }, body:JSON.stringify({...body,apiKey:secret}), signal:AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error('RunningHub HTTP '+response.status);
  return response.json();
}
async function save(job: any) {
  await fs.mkdir(jobs,{recursive:true});
  const target = path.join(jobs, job.id+'.json');
  const temporary = target+'.'+randomUUID()+'.tmp';
  await fs.writeFile(temporary,JSON.stringify(job,null,2)); await fs.rename(temporary,target);
}
export async function cloudConfig() {
  let configured = false, error = ''; try { configured = Boolean(await key()); } catch(e) {error=String(e);}
  return { configured, error, templatePath, mvTemplatePath, mvWorkflowRoot, mvCloudWorkflowRoot, workflowId:defaultWorkflowId, mvWorkflowId, instanceType:'plus', steps:8, megapixels:0.6 };
}

function resolveMvWorkflowPath(value: unknown, workflowId: string) {
  const requested = String(value || '').trim();
  if (!requested) return workflowId === mvWorkflowId ? mvTemplatePath : templatePath;
  const resolved = path.resolve(requested);
  if (path.extname(resolved).toLowerCase() !== '.json' || (resolved !== mvCloudWorkflowRoot && !resolved.startsWith(mvCloudWorkflowRoot + path.sep))) {
    throw new Error('云端工作流必须位于 workspace/workflows/mv/cloud 目录内');
  }
  return resolved;
}

export async function listCloudJobs() {
  await fs.mkdir(jobs,{recursive:true});
  const files=(await fs.readdir(jobs)).filter(name=>/^[\da-f-]{36}\.json$/.test(name));
  const items=await Promise.all(files.map(async name=>JSON.parse(await fs.readFile(path.join(jobs,name),'utf8'))));
  return items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,50);
}
export async function submitCloud(request: any) {
  const episode=request.episode||'ep02';if(!/^ep\d{2}$/.test(episode))throw new Error('集数格式无效');
  const segments = structuredClone(request.segments);
  if (!Array.isArray(segments) || !segments.length || segments.length>32) throw new Error('请选择 1–32 个片段');
  const steps = Number(request.settings?.steps ?? 8), megapixels=Number(request.settings?.megapixels ?? 0.6);
  const workflowId = String(request.workflowId || defaultWorkflowId);
  if (!allowedWorkflowIds.has(workflowId) && !/^\d{10,30}$/.test(workflowId)) throw new Error('RunningHub 工作流 ID 无效');
  if (!Number.isInteger(steps)||steps<1||steps>100||!sizes[String(megapixels)]) throw new Error('步数或分辨率无效');
  const [width,height]=sizes[String(megapixels)];
  const settings = { taskType:'r2v',frameRate:24,width,height,refMaxSize:width,megapixels,cfg:1,seed:666,steps,sampler:'euler',scheduler:'simple',shiftVideo:6,shiftAudio:3,audioMode:'generate',exportMode:'all',continuityEnabled:true,continuityOverlapFrames:5,runSelectEnabled:false,clearVram:true,exportSourceImages:false } as const;
  const selectedTemplatePath = resolveMvWorkflowPath(request.workflowPath, workflowId);
  const template = JSON.parse(await fs.readFile(selectedTemplatePath,'utf8'));
  for (const segment of segments) {
    if (!segment.id || !segment.prompt?.trim() || !Number.isFinite(segment.durationSec) || segment.durationSec<1 || segment.durationSec>15) throw new Error('片段需有提示词且时长为 1–15 秒');
    if (segment.pictures.length>9 || segment.audios.length>3) throw new Error('每段最多 9 张图片、3 个参考音频');
    for (const asset of [...segment.pictures,...segment.audios]) {
      if (!asset.path) throw new Error('素材尚未保存到工作区');
      const resolved = await fs.realpath(asset.path), relative=path.relative(await fs.realpath(root),resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('素材必须位于当前工作区');
      asset.path=resolved;
    }
  }
  const preview = adaptRunningHubWorkflow(template, segments, settings);
  const job = { id:randomUUID(),provider:'runninghub',workflowId,workflowPath:selectedTemplatePath,workflowKind:preview.kind,status:'UPLOADING',stage:'上传素材',percent:5,createdAt:new Date().toISOString(),settings,sequenceNos:request.sequenceNos||[],taskId:'',outputs:[] } as any;
  job.episode=episode;
  await save(job);
  // Keep submission work alive independently of the browser connection.
  void (async()=>{
    try {
      const secret=await key(), uploaded=new Map<string,string>();
      const assets=segments.flatMap((s:any)=>[...s.pictures,...s.audios]);
      for (const asset of assets) {
        if (!uploaded.has(asset.path)) {
          const form=new FormData(); form.append('apiKey',secret); form.append('file',new Blob([await fs.readFile(asset.path)]),path.basename(asset.path));
          const response=await fetch(apiBase+'/task/openapi/upload',{method:'POST',body:form,signal:AbortSignal.timeout(120000)});
          const result:any=await response.json(); const name=result.data?.fileName;
          if (!response.ok||result.code!==0||!name) throw new Error('素材上传失败：'+path.basename(asset.path));
          uploaded.set(asset.path,name);
        }
        asset.fileName=uploaded.get(asset.path);
      }
      const adapted = adaptRunningHubWorkflow(template, segments, settings, true);
      const workflow = adapted.workflow;
      await fs.writeFile(path.join(jobs,job.id+'.workflow.json'),JSON.stringify(workflow,null,2));
      job.stage='正在提交 RunningHub';job.percent=30;await save(job);
      // MiniMax H3 reference-video inference can exceed the smaller cloud tier's
      // VRAM even at 0.6 MP. Run MV and director jobs on RunningHub Plus (48 GB)
      // so a valid project does not fail after all assets have been uploaded.
      const result=await call('/task/openapi/create',{workflowId,instanceType:'plus',workflow:JSON.stringify(workflow),nodeInfoList:[]},secret);
      if(result.code!==0||!result.data?.taskId) throw new Error('RunningHub 提交失败：'+result.msg);
      job.taskId=result.data.taskId;job.status=result.data.taskStatus||'RUNNING';job.stage='云端排队 / 生成中';job.percent=40;await save(job);
    } catch(error) { job.status='FAILED';job.error=error instanceof Error?error.message:String(error);job.stage='生成失败';await save(job); }
  })();
  return job;
}
export async function cloudStatus(id: string) {
  if (!/^[\da-f-]{36}$/.test(id)) throw new Error('任务 ID 无效');
  if(inflight.has(id)) return inflight.get(id);
  const pending=(async()=>{
    const job=JSON.parse(await fs.readFile(path.join(jobs,id+'.json'),'utf8'));
    if(!job.taskId || ['SUCCESS','FAILED'].includes(job.status)) return job;
    const secret=await key(), result=await call('/task/openapi/status',{taskId:job.taskId},secret);
    if(result.code!==0) throw new Error('状态查询失败：'+result.msg);
    job.status=result.data;job.stage=result.data==='QUEUED'?'云端排队':'云端生成中';
    if(['SUCCESS','FAILED'].includes(job.status)) {
      const output=await call('/task/openapi/outputs',{taskId:job.taskId},secret);
      if(job.status==='FAILED') {job.error=output.data?.failedReason?.exception_message||output.msg;job.stage='生成失败';}
      else {
        if(output.code!==0) throw new Error('成片暂未就绪，请重试查询');
        const videos=output.data
          .filter((o:any)=>o.fileType==='mp4'||o.fileType==='webm')
          .sort((left:any,right:any)=>{
            if(job.workflowKind!=='feihou-remix') return 0;
            const rank:Record<string,number>={ '350':0,'351':1,'349':2 };
            return (rank[String(left.nodeId)]??99)-(rank[String(right.nodeId)]??99);
          });
        if(!videos.length) throw new Error('任务完成但未返回视频');
        const outputDir=path.join(jobs,id);await fs.mkdir(outputDir,{recursive:true});
        job.outputs=[];
        for(const [index,video] of videos.entries()) {
          const url=new URL(video.fileUrl);
          if(url.protocol!=='https:') throw new Error('成片地址无效');
          const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
          if(!response.ok) throw new Error('成片下载失败');
          const fileName=`RunningHub_${job.taskId}_${index}.${video.fileType}`,target=path.join(outputDir,fileName);
          await fs.writeFile(target,Buffer.from(await response.arrayBuffer()));
          job.outputs.push({path:target,fileName,nodeId:String(video.nodeId||''),role:job.workflowKind==='feihou-remix'?(String(video.nodeId)==='350'?'face-refined-final':String(video.nodeId)==='351'?'second-sampling':'first-sampling'):'output',size:(await fs.stat(target)).size,createdAt:new Date().toISOString()});
        }
        job.percent=100;job.stage='生成完成';job.costCoins=output.data[0]?.consumeCoins;
      }
    }
    await save(job);return job;
  })();
  inflight.set(id,pending);try{return await pending;}finally{inflight.delete(id);}
}
