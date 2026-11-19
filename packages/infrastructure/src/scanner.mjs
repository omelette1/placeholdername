import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {currentInputs} from '../../engine/src/current-files.mjs';
import {safeRead,text} from '../../engine/src/io.mjs';
import {CHECKOV_VERSION,POLICIES,frameworkFor} from './policies.mjs';
import {GUARD} from './guard.mjs';
const FRAMEWORKS=['terraform','kubernetes','dockerfile','github_actions'];
export function emptyInfrastructure(mode='current'){
 return {status:'not_assessed',reason:mode==='changes'?'Infrastructure comparison against HEAD is unsupported; use Current files.':'Infrastructure scan has not run.',scanner:{name:'Checkov',version:CHECKOV_VERSION},frameworks:FRAMEWORKS.map(framework=>({framework,files:0,checks:0,failed:0,skipped:0,status:'not_assessed'})),files_inspected:[],findings:[],skipped_files:[],errors:[],guard:{active:false,network:0,subprocess:0,outside_read:0,outside_write:0,metadata_probes:0},limitations:['Current configuration snapshot only; no baseline/newness, deployed-state assessment, exploit verification or general cloud-account audit.','Only the selected Checkov policy IDs are enabled; unsupported configuration, external modules, variables and inherited image state can remain unassessed.','Checkov is a third-party policy engine. Valid configuration locations do not prove runtime exposure.']};
}
const inside=(root,file)=>{const rel=path.relative(root,file);return rel===''||rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
function executable(value,root){
 if(value&&value!=='checkov'&&!path.isAbsolute(value))throw new Error('invalid_executable');
 const candidates=path.isAbsolute(value||'')?[value]:(process.env.PATH||'').split(path.delimiter).map(p=>path.join(p,'checkov'));
 for(const candidate of candidates){try{fs.accessSync(candidate,fs.constants.X_OK);const resolved=fs.realpathSync(candidate);if(inside(root,resolved))throw new Error('project_executable');return resolved;}catch(e){if(e.message==='project_executable')throw e;}}
 throw new Error('missing_checkov');
}
function run(exe,args,options){return new Promise((resolve,reject)=>execFile(exe,args,{...options,windowsHide:true,timeout:options.timeout??45000,maxBuffer:8*1024*1024},(error,stdout)=>{if(error&&![0,1].includes(error.code))reject(new Error(error.killed?'scanner_timeout':'scanner_failed'));else resolve(stdout);}));}
export function normalizeCheckov(raw,files,snapshots,output){
 const reports=Array.isArray(raw)?raw:[raw],seen=new Set();let checks=0;
 for(const report of reports){
  if(!report||!FRAMEWORKS.includes(report.check_type)||!report.results||!Array.isArray(report.results.failed_checks)||!Array.isArray(report.results.passed_checks)||!Array.isArray(report.results.skipped_checks))throw new Error('invalid_scanner_output');
  const framework=output.frameworks.find(f=>f.framework===report.check_type);
  for(const bucket of ['failed_checks','passed_checks','skipped_checks'])for(const item of report.results[bucket]){
   const policy=POLICIES[item.check_id];if(!policy||policy.framework!==report.check_type)throw new Error('invalid_policy');
   // file_path is snapshot-relative. Never accept an arbitrary absolute path,
   // filename, resource ID, snippet, suppression message or title from stdout.
   const file=String(item.file_path||'').replace(/^\//,'');
   if(!files.has(file)||file.split(/[\\/]/).some(p=>!p||p==='.'||p==='..'))throw new Error('invalid_scanner_path');
   framework.checks++;checks++;
   if(bucket==='skipped_checks'){framework.skipped++;continue;}
   if(bucket!=='failed_checks')continue;
   framework.failed++;
   const lines=files.get(file).split('\n');let range=item.file_line_range;
   // Pinned GitHub Actions runner reports a job's EOF end one line beyond
   // the saved text. Map only that exact EOF shape, never arbitrary ranges.
   const adjusted=report.check_type==='github_actions'&&Array.isArray(range)&&range[0]>=1&&range[0]<=lines.length&&range[1]===lines.length+1;
   if(adjusted)range=[range[0],lines.length];
   if(!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger)||range[0]<1||range[1]<range[0]||range[1]>lines.length)throw new Error('invalid_scanner_range');
   const key=item.check_id+':'+file+':'+range.join(':');if(seen.has(key))continue;seen.add(key);
   if(output.findings.length>=500)throw new Error('finding_limit');
   output.findings.push({rule_id:item.check_id,title:policy.title,severity:'warning',explanation:policy.impact+' This is a Checkov-backed static configuration observation, not verified deployed exposure.',location:{file,start:{line:range[0],column:1},end:{line:range[1],column:lines[range[1]-1].length+1}},newly_introduced:null,runtime_verification:false,evidence:{kind:'infrastructure_policy',scanner:'Checkov',scanner_version:CHECKOV_VERSION,framework:report.check_type,policy_id:item.check_id,source_values_included:false},limitations:[...output.limitations,...(adjusted?['The pinned GitHub Actions scanner reported an EOF span one line beyond the snapshot; its end was bounded to the current file.']:[]),'Current configuration has no baseline; newness is not applicable.']});
  }
  if(report.results.parsing_errors?.length||report.summary?.parsing_errors>0){output.errors.push({code:'configuration_parse_error',message:'Checkov could not parse one or more configuration files; source text is omitted.'});}
 }
 for(const framework of output.frameworks){framework.status=framework.checks?(framework.skipped?'partial':'assessed'):framework.files?'not_assessed':'not_applicable';}
 return checks;
}
export async function scanInfrastructure(project,{mode='current',checkovPath='checkov'}={}){
 const output=emptyInfrastructure(mode);if(mode!=='current')return output;
 let root;try{root=fs.realpathSync(project);}catch{output.reason='Selected directory is unreadable.';return output;}
 let inputs;
 try{inputs=currentInputs(root,{accept:file=>!!frameworkFor(file),maxFiles:100});}catch{output.errors.push({code:'enumeration_failed',message:'Configuration enumeration failed.'});return output;}
 output.skipped_files=inputs.skipped;
 if(inputs.errors.length)output.errors.push({code:'enumeration_incomplete',message:'Configuration inputs could not be fully enumerated within safety limits.'});
 const files=new Map(),snapshots=new Map();let size=0;
 for(const file of inputs.files){
  try{const buffer=safeRead(root,file);if(!buffer)continue;size+=buffer.length;if(size>4*1024*1024){output.errors.push({code:'input_limit',message:'Configuration input exceeds 4 MiB; select a smaller folder.'});break;}const source=text(buffer);files.set(file,source);snapshots.set(file,buffer.snapshot);output.files_inspected.push({file,snapshot:buffer.snapshot});output.frameworks.find(f=>f.framework===frameworkFor(file)).files++;}
  catch{output.skipped_files.push({file,reason:'configuration_unreadable_or_excluded'});output.errors.push({code:'configuration_read_failed',message:'A configuration file could not be safely read.'});}
 }
 if(!files.size){output.status=output.errors.length?'partial':'not_applicable';output.reason=output.errors.length?'Configuration input incomplete.':'No eligible infrastructure configuration files found.';return output;}
 let exe;try{exe=executable(checkovPath,root);}catch(e){output.reason=e.message==='missing_checkov'?'Checkov is not installed. Install pinned Checkov and configure the user-level executable path; code checks remain available.':'Checkov must be a trusted executable outside the reviewed project.';output.errors.push({code:e.message,message:output.reason});return output;}
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'changeproof-infra-'));
 try{
  const input=path.join(directory,'input'),guard=path.join(directory,'guard');fs.mkdirSync(input);fs.mkdirSync(guard);
  for(const [file,source] of files){const p=path.join(input,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,source,{mode:0o600});}
  fs.writeFileSync(path.join(guard,'sitecustomize.py'),GUARD,{mode:0o600});fs.writeFileSync(path.join(directory,'config.yml'),'{}\n',{mode:0o600});
  // Whitelist environment: never inherit API/cloud keys, Python startup paths,
  // scanner config, proxy credentials, or the target's environment.
  const env={PATH:'/usr/bin:/bin',HOME:directory,TMPDIR:directory,XDG_CONFIG_HOME:directory,XDG_CACHE_HOME:directory,PYTHONPATH:guard,PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1',PYTHONHASHSEED:'0',CHANGEPROOF_SCAN_ROOT:directory,CHANGEPROOF_TOOL_ROOT:path.dirname(path.dirname(exe)),CKV_SKIP_PACKAGE_UPDATE_CHECK:'true',CHECKOV_PARALLELIZATION_TYPE:'sequential',CHECKOV_WORKERS_NUMBER:'1',GIT_PYTHON_REFRESH:'quiet',LOG_LEVEL:'ERROR'};
  const opts={cwd:directory,env};const version=(await run(exe,['--version'],{...opts,timeout:15000})).trim();
  if(!fs.existsSync(path.join(directory,'guard.active')))throw new Error('guard_not_loaded');
  if(version!==CHECKOV_VERSION)throw new Error('scanner_version_mismatch');
  output.guard.active=true;
  const stdout=await run(exe,['--directory',input,'--framework',...FRAMEWORKS,'--check',Object.keys(POLICIES).join(','),'--output','json','--compact','--skip-download','--skip-results-upload','--download-external-modules','false','--config-file',path.join(directory,'config.yml')],opts);
  normalizeCheckov(JSON.parse(stdout),files,snapshots,output);
  for(const entry of output.files_inspected){try{const current=safeRead(root,entry.file);if(!current||current.snapshot!==entry.snapshot)throw new Error();}catch{throw new Error('snapshot_changed');}}
  output.status=output.errors.length||output.frameworks.some(f=>f.status==='partial'||f.status==='not_assessed')?'partial':'assessed';output.reason='Current configuration reviewed with the curated Checkov policy set.';
 }catch(error){output.findings=[];output.status='not_assessed';output.reason='Infrastructure scan did not produce a validated complete result.';const codes=['guard_not_loaded','scanner_version_mismatch','invalid_scanner_output','invalid_scanner_path','invalid_scanner_range','invalid_policy','finding_limit','snapshot_changed','scanner_timeout'];output.errors.push({code:codes.includes(error.message)?error.message:'scanner_failed',message:'Scanner failed, timed out, or produced incompatible output; raw output and source are omitted.'});}
 finally{
  try{const events=JSON.parse(fs.readFileSync(path.join(directory,'guard-events.json'),'utf8'));for(const key of ['network','subprocess','outside_read','outside_write','metadata_probes'])if(Number.isSafeInteger(events[key]))output.guard[key]=events[key];if(['network','subprocess','outside_read','outside_write'].some(key=>events[key]>0)){output.status=output.findings.length?'partial':'not_assessed';output.reason='Scanner attempted a blocked operation; coverage is incomplete.';output.errors.push({code:'blocked_operation',message:'The isolated scanner attempted networking, a subprocess, or access outside its allowed snapshot/tool paths.'});}}catch{}
  fs.rmSync(directory,{recursive:true,force:true});
 }
 return output;
}
