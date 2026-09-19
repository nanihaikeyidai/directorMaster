import { readFileSync } from 'node:fs';
const base='http://localhost:3000';
const template=JSON.parse(readFileSync(new URL('../workspace/workflows/runninghub-director-api.json',import.meta.url),'utf8'));
const timeline=JSON.parse(template['12'].inputs.timeline_data);
const source=timeline.segments[0];
const asset=(name,folder,mediaType)=>({id:name,name,fileName:name,path:`D:/HermesWorkspace/directorMaster/workspace/assets/${folder}/${name}`,mediaType,description:''});
const payload={sequenceNos:[7],settings:{steps:8,megapixels:0.6},segments:[{id:'runninghub-import-smoke',durationSec:source.durationSec,enabled:true,continuityFromPrev:false,prompt:source.prompt.replaceAll('<Audio 3>','<Audio 1>'),negativePrompt:'',definitions:'',pictures:[asset('校长_人设.png','人物','image'),asset('场景_雨天校长办公室_无人.png','场景','image')],audios:[asset('校长.wav','人物参考音色','audio')]}]};
const response=await fetch(base+'/api/local/runninghub/jobs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
const result=await response.json();console.log(JSON.stringify(result,null,2));if(!response.ok)process.exitCode=1;
