import fs from 'node:fs';
import path from 'node:path';
import {currentInputs} from '../../engine/src/current-files.mjs';
import {exclusion} from '../../engine/src/io.mjs';

// No install, lifecycle script, target package loading or advisory lookup occurs
// unless the caller explicitly enables remote advisory queries.
const MAX_LOCK_BYTES=4*1024*1024;
const MAX_PACKAGES=2000;
const BATCH_SIZE=100;
const LOCK=/^(?:.*\/)?(?:package-lock\.json|npm-shrinkwrap\.json)$/;
export const OSV_ENDPOINT='https://api.osv.dev/v1/querybatch';

export function emptyDependencies(mode='current',enabled=false) {
 return {status:'not_assessed',reason:mode!=='current'?'Dependency inventory is current-files only.':enabled?'Dependency assessment has not run.':'Advisory lookup is disabled until explicitly enabled.',
  source:'OSV',ecosystem:'npm',online_lookup:enabled,files_inspected:[],packages_checked:0,advisories:0,findings:[],errors:[],skipped_files:[],
  limitations:['Only npm package-lock v2/v3 or npm-shrinkwrap v2/v3 with concrete version entries is supported. No npm install, package code or scripts execute.',
   'Only package names and installed versions are sent to OSV when the user enables advisory lookup; no source text, lockfile contents or paths are uploaded.',
   'An advisory is not proof of exploitability or reachability; lack of advisories is not a security guarantee.']};
}
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{3,100}$/.test(value);
const safeVersion=value=>typeof value==='string'&&value.length<=160&&/^[A-Za-z0-9][A-Za-z0-9.+_:-]*$/.test(value);
const packageName=(key,record)=>{
 const tail=key.slice(key.lastIndexOf('node_modules/')+'node_modules/'.length);
 if(!tail||tail.includes('/node_modules/')||(!tail.startsWith('@')&&tail.includes('/')))return null;
 const name=tail.startsWith('@')?tail.split('/').slice(0,2).join('/'):tail;
 return typeof record.name==='string'&&record.name.length<=200?record.name:name;
};
export function parseNpmLock(source,file='package-lock.json'){
 const lock=JSON.parse(source);
 if(!lock||![2,3].includes(lock.lockfileVersion)||!lock.packages||typeof lock.packages!=='object'||Array.isArray(lock.packages))throw Error('unsupported_lockfile');
 const entries=[],seen=new Set();
 for(const [key,value] of Object.entries(lock.packages)){
  if(!key.includes('node_modules/')||!value||typeof value!=='object'||value.link===true)continue;
  const name=packageName(key,value),version=value.version;
  if(!name||name.length>200||!/^(@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/.test(name)||!safeVersion(version))continue;
  const signature=name+'@'+version;
  if(seen.has(signature))continue;
  seen.add(signature);
  const escaped=JSON.stringify(key);
  const start=source.indexOf(escaped);
  const line=start<0?1:source.slice(0,start).split('\n').length;
  entries.push({name,version,file,line});
  if(entries.length>MAX_PACKAGES)throw Error('package_limit');
 }
 return entries;
}
function safeLockRead(root,file){
 if(exclusion(file)||!LOCK.test(file))throw Error('invalid_lock_path');
 let candidate=root;
 for(const segment of file.split('/')){
  if(!segment||segment==='.'||segment==='..')throw Error('invalid_lock_path');
  candidate=path.join(candidate,segment);
  if(fs.lstatSync(candidate).isSymbolicLink())throw Error('lock_symlink');
 }
 const fd=fs.openSync(candidate,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{
  const stat=fs.fstatSync(fd);
  if(!stat.isFile()||stat.size>MAX_LOCK_BYTES)throw Error('lock_size');
  const bytes=Buffer.alloc(stat.size);
  if(fs.readSync(fd,bytes,0,stat.size,0)!==stat.size)throw Error('lock_changed');
  const after=fs.fstatSync(fd);
  if(stat.size!==after.size||stat.mtimeMs!==after.mtimeMs)throw Error('lock_changed');
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 }finally{fs.closeSync(fd);}
}
async function queryBatch(packages,fetcher){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetcher(OSV_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({queries:packages.map(p=>({package:{ecosystem:'npm',name:p.name},version:p.version}))}),signal:controller.signal});
  if(!response.ok)throw Error('advisory_http_error');
  const parsed=await response.json();
  if(!Array.isArray(parsed?.results)||parsed.results.length!==packages.length)throw Error('advisory_schema_error');
  return parsed.results;
 }finally{clearTimeout(timer);}
}
export async function scanDependencies(project,{mode='current',enabled=false,fetcher=globalThis.fetch}={}){
 const result=emptyDependencies(mode,enabled);
 if(mode!=='current'||!enabled)return result;
 if(typeof fetcher!=='function'){result.errors.push({code:'network_unavailable',message:'Advisory lookup is unavailable.'});return result;}
 let root;try{root=fs.realpathSync(project);}catch{return result;}
 const inputs=currentInputs(root,{accept:file=>LOCK.test(file),maxFiles:30});
 result.skipped_files=inputs.skipped.filter(entry=>LOCK.test(entry.file));
 if(inputs.errors.length)result.errors.push({code:'enumeration_incomplete',message:'Some project files could not be enumerated.'});
 const found=[],packageSet=new Set();
 for(const file of inputs.files){
  try{
   const source=safeLockRead(root,file);
   const packages=parseNpmLock(source,file);
   result.files_inspected.push({file,package_count:packages.length});
   for(const pkg of packages){const key=pkg.name+'@'+pkg.version;if(!packageSet.has(key)){packageSet.add(key);found.push(pkg);if(found.length>MAX_PACKAGES)throw Error('package_limit');}}
  }catch{result.errors.push({code:'lock_unreadable',file,message:'Lockfile could not be safely read or is unsupported (requires npm lockfile v2/v3).'});}
 }
 if(!result.files_inspected.length){result.reason='No supported npm lockfile was found.';result.status=result.errors.length?'partial':'not_applicable';return result;}
 try{
  for(let offset=0;offset<found.length;offset+=BATCH_SIZE){
   const group=found.slice(offset,offset+BATCH_SIZE);
   const answers=await queryBatch(group,fetcher);
   for(let i=0;i<group.length;i++){
    const pkg=group[i],response=answers[i];
    if(!response||typeof response!=='object'||response.vulns!==undefined&&!Array.isArray(response.vulns))throw Error('advisory_schema_error');
    result.packages_checked++;
    const ids=[...new Set((response.vulns||[]).map(v=>v.id).filter(safeId))].slice(0,50);
    for(const id of ids){
     if(result.findings.length>=500)throw Error('finding_limit');
     result.findings.push({rule_id:'DEP001',title:'Known dependency advisory: '+id,severity:'warning',
      explanation:'The pinned npm dependency '+pkg.name+'@'+pkg.version+' matches OSV advisory '+id+'. Confirm applicability and upgrade or mitigate.',
      location:{file:pkg.file,start:{line:pkg.line,column:1},end:{line:pkg.line,column:1}},
      newly_introduced:null,runtime_verification:false,
      evidence:{kind:'dependency_advisory',source:'OSV',advisory_id:id,package_name:pkg.name,installed_version:pkg.version,advisory_url:'https://osv.dev/vulnerability/'+id},
      limitations:['OSV advisory match, not proof of execution or exploitability.','No full dependency reachability, fix-version determination or transitive code execution was performed.']});
    }
   }
  }
  result.advisories=result.findings.length;
  result.status=result.errors.length?'partial':'assessed';
  result.reason='Queried OSV for concrete npm dependency versions in supported lockfiles.';
 }catch{
  result.status=result.packages_checked?'partial':'not_assessed';
  result.errors.push({code:'advisory_lookup_failed',message:'OSV lookup timed out, failed, or returned invalid data; unqueried packages remain unassessed.'});
  result.reason='Dependency advisory lookup was incomplete.';
 }
 return result;
}
