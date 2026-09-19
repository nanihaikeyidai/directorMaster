import fs from 'node:fs';
import path from 'node:path';
const src='D:/HermesWorkspace/ai小说/红绳/05-workflow/ep03';
const root='D:/HermesWorkspace/directorMaster/workspace/production/ep03';
if(fs.existsSync(path.join(root,'director-project.json'))) fs.copyFileSync(path.join(root,'director-project.json'),path.join(root,'director-project.before-import-'+Date.now()+'.json'));
fs.mkdirSync(root,{recursive:true});
function copyTree(from,to){fs.mkdirSync(to,{recursive:true});for(const entry of fs.readdirSync(from,{withFileTypes:true})){const a=path.join(from,entry.name),b=path.join(to,entry.name);if(entry.isDirectory())copyTree(a,b);else fs.writeFileSync(b,fs.readFileSync(a));}}
copyTree(path.join(src,'归档素材'),path.join(root,'assets'));
fs.copyFileSync('D:/HermesWorkspace/ai小说/红绳/02-manuscript/screenplays/红绳_第03集_泳池里的一点.md',path.join(root,'剧本.md'));
const graph={version:1,updatedAt:new Date().toISOString(),referenceNodes:[],commonPromptNodes:[{id:'common-ep03',title:'EP03 · 日漫青春电影',visualStyle:'高精度日漫青春电影感，赛璐璐人物、手绘背景、稳定线稿。16:9横屏，实际分辨率以生成设置为准。',soundRules:'仅环境声、对白和动作音，无BGM。',globalRules:'无字幕、文字、水印、Logo。保持人物身份和空间连续。',negativePrompt:'',enabled:true}],connections:[],segments:[],promptPartOverrides:{},canvasLayout:{'__episode-script':{x:0,y:0,width:420,height:520},'common-ep03':{x:0,y:550,width:420,height:320}}};
const audioNames=[['旁白'],['李想'],['李想','安娜']];
for(let i=1;i<=3;i++){
 const nn=String(i).padStart(2,'0'),folder=path.join(src,'红绳片段'+nn),target=path.join(root,'segment'+nn);
 fs.mkdirSync(target,{recursive:true});
 const markdown=fs.readFileSync(path.join(folder,'视频提示词.md'),'utf8');
 let prompt=markdown.match(/```text\s*\n([\s\S]*?)```/)[1].trim();
 if(i===2)prompt=prompt.replace(/^<Audio 2> 是/gm,'未绑定参考音频的自然声音：');
 const section=(name,next)=>prompt.split(name+':')[1]?.split(next+':')[0].trim()||'';
 const paths=[...markdown.split('## 可直接粘贴')[0].matchAll(/文件 `([^`]+)`/g)].map(m=>path.join(root,'assets',m[1].replace('../归档素材/','')));
 const storyboard=path.join(root,'assets','故事板','EP03_SEG'+nn+'_故事板.png');fs.mkdirSync(path.dirname(storyboard),{recursive:true});fs.copyFileSync(path.join(folder,'故事板.png'),storyboard);fs.copyFileSync(storyboard,path.join(target,'故事板.png'));paths.push(storyboard);
 const audios=audioNames[i-1].map(name=>{const dest=path.join(root,'assets','声音',name+'.wav');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync('D:/HermesWorkspace/ai小说/红绳/05-workflow/ep02/归档素材/人物参考音色/'+name+'.wav',dest);return dest;});
 const localId=p=>'local:'+p.replaceAll('/','\\').toLowerCase();
 const id='redstring-ep03-s'+nn,ref='ref-ep03-s'+nn;
 graph.referenceNodes.push({id:ref,title:'SEG '+nn+' · 素材引用',enabled:true,imageSlots:[...paths.map(localId),...Array(9-paths.length).fill(null)],audioSlots:[...audios.map(localId),...Array(3-audios.length).fill(null)]});
 graph.connections.push({id:'link-ep03-'+nn,type:'reference',sourceId:ref,targetId:id});
 graph.segments.push({id,sequenceNo:i,title:'EP03 · '+['校园恢复','社长李想','新成员安娜'][i-1],shotPrompt:section('detailed_description','overall_soundscape'),negativePrompt:markdown.match(/## negativePrompt\s*```text\s*([\s\S]*?)```/)?.[1]?.trim()||'',pictureIds:paths.map(localId),audioIds:audios.map(localId),durationSec:15,enabled:true,continuityFromPrev:false,status:'ready'});
 graph.promptPartOverrides[id]={material:'subject_definitions:\n'+section('subject_definitions','summary')};
 graph.canvasLayout[ref]={x:470+(i-1)*610,y:0,width:560,height:370};graph.canvasLayout[id]={x:470+(i-1)*610,y:420,width:560,height:440};
 fs.writeFileSync(path.join(target,'视频提示词.md'),prompt);
 const expectedP=paths.map((_,n)=>n+1),expectedA=audios.map((_,n)=>n+1);
 for(const [kind,expected]of [['Picture',expectedP],['Audio',expectedA]]) {const found=[...new Set([...prompt.matchAll(new RegExp('<'+kind+' (\\d+)>','g'))].map(m=>+m[1]))].sort();if(JSON.stringify(found)!==JSON.stringify(expected))throw new Error(nn+' '+kind+' 标签不匹配');}
}
fs.writeFileSync(path.join(root,'director-project.json'),JSON.stringify(graph,null,2));
console.log('EP03: 3 SEG、3 素材节点、3 连线、1 全局节点、剧本与故事板就绪；未提交生成。');
