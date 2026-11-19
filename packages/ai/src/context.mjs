import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import {git,safeRead,text,exclusion,eligible,MAX_FILE} from '../../engine/src/io.mjs';
import {lineRanges} from '../../engine/src/engine.mjs';
import {LIMITS,AI_VERSION} from './contract.mjs';
import {redact,PRIVACY_NOTICE} from './redact.mjs';
import {checkRequest} from './validate.mjs';
import {profileFor,estimateTokens,validateProfileRequest} from './profiles.mjs';
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function contexts(file,content,ranges,revision,revision_id,omit,limits=LIMITS){
 if(!content)return [];
 const lines=content.split('\n');const source=ts.createSourceFile(file,content,ts.ScriptTarget.Latest,true);
 if(source.parseDiagnostics.length){omit('Syntax could not be parsed; only bounded changed-line windows are included.');}
 const functions=[];
 function visit(node){if(ts.isFunctionLike(node)&&node.body){functions.push({start:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,end:source.getLineAndCharacterOfPosition(node.end).line+1});}ts.forEachChild(node,visit);}
 if(!source.parseDiagnostics.length)visit(source);
 const windows=[];
 for(const r of ranges){
  const start=revision==='before'?r.old_start:r.new_start,count=revision==='before'?r.old_count:r.new_count;
  const end=Math.min(lines.length,start+Math.max(count,1)-1);
  const enclosing=functions.filter(f=>f.start<=start&&f.end>=end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];
  let a,b;
  if(enclosing&&enclosing.end-enclosing.start+1<=limits.chunkLines){a=enclosing.start;b=enclosing.end;}
  else {a=Math.max(1,start-8);b=Math.min(lines.length,end+8);if(enclosing)omit('An enclosing function exceeds '+limits.chunkLines+' lines; only a bounded changed-line window is included.');else omit('Changed code is outside a resolved enclosing function; only a local line window is included.');}
  if(b-a+1>limits.chunkLines){b=a+limits.chunkLines-1;omit('Changed-line window truncated to '+limits.chunkLines+' lines.');}
  if(a>lines.length)continue;
  if(windows.some(w=>w.start_line<=a&&w.end_line>=b))continue;
  windows.push({revision,revision_id,start_line:a,end_line:b,text:lines.slice(a-1,b).join('\n')});
 }
 return windows;
}
export function collectContext(project,{profile='full'}={}){
 const limits=profileFor(profile);
 let root,gitRoot,baseline;
 try{root=fs.realpathSync(project);gitRoot=fs.realpathSync(git(root,['rev-parse','--show-toplevel']).toString().trimEnd());baseline=git(root,['rev-parse','--verify','HEAD^{commit}']).toString().trim();}catch{throw new Error('AI review needs a readable Git working tree with a HEAD baseline commit. Local Current files review still works without Git.');}
 const prefix=path.relative(gitRoot,root).split(path.sep).join('/');
 if(prefix==='..'||prefix.startsWith('../')||path.isAbsolute(prefix))throw new Error('Selected project is outside the Git boundary.');
 const relative=file=>!prefix?file:file.startsWith(prefix+'/')?file.slice(prefix.length+1):null;
 let changed,tree,index,ignored;
 try{
  changed=git(gitRoot,['diff','--no-ext-diff','--no-textconv','--no-renames','--name-only','-z',baseline,'--']).toString().split('\0').filter(Boolean);
  tree=git(gitRoot,['ls-tree','-r','-z',baseline]).toString().split('\0').filter(Boolean);
  index=git(gitRoot,['ls-files','--stage','-z']).toString().split('\0').filter(Boolean);
  ignored=new Set(git(gitRoot,['ls-files','--cached','--ignored','--exclude-standard','-z']).toString().split('\0').filter(Boolean));
 }catch{throw new Error('Git inputs could not be safely read. No target command was executed.');}
 const head=new Map(tree.map(e=>{const i=e.indexOf('\t');const [mode,type,oid]=e.slice(0,i).split(' ');return [e.slice(i+1),{mode,type,oid}];}));
 const stage=new Map();for(const e of index){const i=e.indexOf('\t');const [mode,,number]=e.slice(0,i).split(' ');const file=e.slice(i+1);stage.set(file,{mode,conflict:number!=='0'||stage.get(file)?.conflict});}
 const omissions=new Set(['Untracked files are not included in AI changes review. Only saved tracked JS/TS changes against HEAD are eligible.','Unchanged files, dependencies, imported helpers and application policy may be missing. This is bounded context, not a whole-application review.']);
 const files=[],snapshots=[];let contextBytes=0,totalChunks=0,redactions=0;
 const omit=message=>{if(omissions.size<90)omissions.add(redact(message).text);};
 const selected=changed.map(f=>({gitFile:f,file:relative(f)})).filter(f=>f.file);
 if(selected.length>2000)throw new Error('More than 2000 changed paths; narrow the selected project before AI review.');
 for(const {gitFile,file} of selected){
  const reason=exclusion(file);
  if(reason||ignored.has(gitFile)||!eligible(file)){omit('One or more paths omitted by exclusions, Git ignore rules or unsupported language.');continue;}
  // File paths are transmitted too. Do not transmit a path containing recognizable credentials.
  if(redact(file).text!==file){omit('A file path contains recognizable secret text and was omitted.');continue;}
  if(file.length>400){omit('An overlong file path was omitted.');continue;}
  const old=head.get(gitFile),next=stage.get(gitFile);
  if(next?.conflict||[old?.mode,next?.mode].some(m=>['120000','160000'].includes(m))){omit('A conflicted, symbolic-link or submodule path was omitted.');continue;}
  let before,after,bytes;
  try{
   if(old&&(old.type!=='blob'||Number(git(gitRoot,['cat-file','-s',old.oid]).toString())>MAX_FILE))throw new Error('baseline_size_or_type');
   before=old?text(git(gitRoot,['cat-file','blob',old.oid])):'';
   bytes=next?safeRead(root,file):null;after=bytes===null?'':text(bytes);
  }catch{omit(`Could not safely include ${file}: unreadable, symbolic link, oversized, binary, invalid UTF-8 or concurrent edit.`);continue;}
  snapshots.push({file,snapshot:bytes?.snapshot??null,hash:digest(after)});
  if(before===after)continue;
  if(files.length>=limits.files){omit('Changed-file limit reached for '+profile+' profile; additional eligible files omitted.');continue;}
  const before_id=old?.oid||'absent',after_id='sha256:'+digest(after),ranges=lineRanges(before,after);
  const chunks=contexts(file,before,ranges,'before',before_id,omit,limits).concat(contexts(file,after,ranges,'after',after_id,omit,limits));
  const accepted=[];
  for(const chunk of chunks){
   const redacted=redact(chunk.text);redactions+=redacted.count;chunk.text=redacted.text;
   const size=Buffer.byteLength(chunk.text);
   if(totalChunks>=limits.chunks||contextBytes+size>limits.contextBytes||chunk.text.length>24000){omit('Context chunk/byte limit reached; additional context omitted.');continue;}
   totalChunks++;contextBytes+=size;accepted.push(chunk);
  }
  if(accepted.length)files.push({file,before_id,after_id,chunks:accepted});
 }
 const request={schema_version:AI_VERSION,request_id:crypto.randomBytes(16).toString('hex'),baseline,files,omissions:[...omissions],privacy_notice:PRIVACY_NOTICE};
 const envelope={profile,folder:root,request,snapshots,redactions,changed_paths_hash:digest(JSON.stringify(selected)),index_hash:digest(index.join('\0'))};
 while(files.length&&Buffer.byteLength(JSON.stringify(request))>LIMITS.requestBytes){const f=files.at(-1);f.chunks.pop();if(!f.chunks.length)files.pop();omit('JSON encoding size limit reached; additional context omitted.');request.omissions=[...omissions];}
 if(profile==='demo'){
  omit('Demo profile: at most 3 files, 8 chunks, 3 findings and 3000 completion tokens; context may be omitted.');request.omissions=[...omissions];
  while(files.length&&estimateTokens(request,profile).total_estimate>limits.approximateTotalBudget){const f=files.at(-1);f.chunks.pop();if(!f.chunks.length)files.pop();omit('Approximate demo token budget reached; additional context omitted.');request.omissions=[...omissions];}
 }
 envelope.token_estimate=estimateTokens(request,profile);
 if(files.length)validateProfileRequest(request,profile);
 if(git(gitRoot,['rev-parse','--verify','HEAD^{commit}']).toString().trim()!==baseline)throw new Error('HEAD changed during collection. Refresh the AI preview explicitly.');
 if(files.length)checkRequest(request);
 return envelope;
}
export function sameSnapshot(a,b){return a.folder===b.folder&&a.request.baseline===b.request.baseline&&a.changed_paths_hash===b.changed_paths_hash&&a.index_hash===b.index_hash&&JSON.stringify(a.snapshots)===JSON.stringify(b.snapshots)&&JSON.stringify(a.request.files)===JSON.stringify(b.request.files)&&JSON.stringify(a.request.omissions)===JSON.stringify(b.request.omissions);}
