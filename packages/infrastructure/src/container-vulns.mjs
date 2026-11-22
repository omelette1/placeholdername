import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {currentInputs} from '../../engine/src/current-files.mjs';
import {safeRead,text} from '../../engine/src/io.mjs';

const IMAGE_LIMIT=8, FINDING_LIMIT=120;
const IMAGE=/^[a-zA-Z0-9_][a-zA-Z0-9_./:@-]{0,240}$/;
const VULN=/^(?:CVE-\d{4}-\d{4,}|GHSA-[a-z0-9]{4}(?:-[a-z0-9]{4}){2})$/i;
const local=(root,file)=>{const rel=path.relative(root,file);return rel!==''&&rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
const imageFile=file=>/(?:^|\/)Dockerfile(?:\.[^/]+)?$|\.dockerfile$|\.ya?ml$/i.test(file);
const truncated=(value,max=160)=>String(value??'').replace(/[\r\n\x00-\x1f]/g,' ').slice(0,max);
export function emptyContainerImages(mode='current'){
  return {status:'not_assessed',reason:mode==='current'?'Container image scanning is opt-in; no image CVE assessment was performed.':'Container image comparison against HEAD is not supported; use Saved project files.',scanner:{name:'Trivy',source:'local Docker images',database:'locally cached; freshness not verified'},files_inspected:[],images:[],findings:[],skipped:[],errors:[],limitations:['Only explicitly enabled scans of locally available Docker images are supported. No remote registries, image pulls or DB updates.','Image references are extracted conservatively from saved Dockerfiles and Kubernetes-style YAML; templates, build arguments and deployment state are not resolved.','CVE matches depend on the locally cached vulnerability database and package inventory. Exposure, exploitability and fixed-version availability are not verified.']};
}
export function imageReferences(file,source){
  const found=[],stages=new Set();
  source.split(/\r?\n/).forEach((line,i)=>{
    let image;
    if(/(?:^|\/)Dockerfile(?:\.[^/]+)?$|\.dockerfile$/i.test(file)){
      if(/^\s*#/.test(line))return;
      const match=/^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+([a-z0-9_.-]+))?/i.exec(line);
      if(!match)return;
      image=match[1];
      const alias=match[2];
      if(stages.has(image.toLowerCase()))image=null;
      if(alias)stages.add(alias.toLowerCase());
    }else if(/\.ya?ml$/i.test(file)){
      if(/^\s*#/.test(line))return;
      const match=/^\s*(?:-\s*)?image\s*:\s*("[^"]+"|'[^']+'|[^\s#]+)/.exec(line);
      image=match?.[1]?.replace(/^['"]|['"]$/g,'');
    }
    if(!image)return;
    if(image==='scratch'||!IMAGE.test(image)||!(/:[^/:]+$/.test(image)||/@sha256:[a-f0-9]{64}$/i.test(image))){
      found.push({file,line:i+1,image:null,reason:'unresolved_or_mutable_reference'});
      return;
    }
    found.push({file,line:i+1,image});
  });
  return found;
}
function trustedTrivy(value,root){
  if(value!=='trivy'&&!path.isAbsolute(value))throw new Error('invalid_executable');
  const candidates=path.isAbsolute(value)?[value]:(process.env.PATH||'').split(path.delimiter).map(dir=>path.join(dir,'trivy'));
  for(const candidate of candidates){
    try{fs.accessSync(candidate,fs.constants.X_OK);const real=fs.realpathSync(candidate);if(local(root,real)||root===real)throw new Error('project_executable');return real;}
    catch(e){if(e.message==='project_executable')throw e;}
  }
  throw new Error('missing_trivy');
}
export function normalizeTrivy(raw,reference,output){
  if(!raw||typeof raw!=='object'||!Number.isSafeInteger(raw.SchemaVersion)||!Array.isArray(raw.Results))throw new Error('invalid_scanner_output');
  if(!raw.Results.length)throw new Error('no_package_inventory');
  let count=0;
  for(const result of raw.Results){
    if(result.Vulnerabilities!==undefined&&!Array.isArray(result.Vulnerabilities))throw new Error('invalid_scanner_output');
    for(const vulnerability of result.Vulnerabilities||[]){
      const id=vulnerability?.VulnerabilityID, severity=vulnerability?.Severity;
      if(!VULN.test(id||'')||!['CRITICAL','HIGH','MEDIUM','LOW','UNKNOWN'].includes(severity))throw new Error('invalid_scanner_output');
      if(!['CRITICAL','HIGH'].includes(severity))continue;
      const pkg=truncated(vulnerability.PkgName,96)||'unidentified package';
      const installed=truncated(vulnerability.InstalledVersion,96)||'unknown';
      const fixed=truncated(vulnerability.FixedVersion,96)||null;
      const line=reference.line;
      if(output.findings.length>=FINDING_LIMIT)throw new Error('finding_limit');
      output.findings.push({rule_id:id.toUpperCase(),title:id.toUpperCase()+' in '+pkg,severity:severity==='CRITICAL'?'critical':'warning',
        explanation:'Trivy reports a '+severity+' vulnerability in an installed image package ('+pkg+' '+installed+'). '+(fixed?'Fixed version listed: '+fixed+'. ':'No fixed version was listed. ')+'This is a cached-database image scan, not evidence the deployed service is exploitable.',
        location:{file:reference.file,start:{line,column:1},end:{line,column:2}},
        newly_introduced:null,runtime_verification:false,
        evidence:{kind:'container_vulnerability',scanner:'Trivy',vulnerability_id:id.toUpperCase(),image:reference.image,package:pkg,installed_version:installed,fixed_version:fixed,reported_severity:severity,source:'locally available Docker image',database_freshness:'unverified'},
        limitations:[...output.limitations,'The source location identifies the image reference, not the code responsible for the vulnerable package.']});
      count++;
    }
  }
  return count;
}
function invoke(exe,image,timeout){
  return new Promise((resolve,reject)=>{
    // No workspace scripts, registry access, image pull, DB update or telemetry.
    // This invokes a user-installed trusted Trivy binary against local Docker only.
    const args=['image','--image-src','docker','--scanners','vuln','--format','json','--quiet','--no-progress','--offline-scan','--skip-db-update','--skip-java-db-update','--skip-check-update','--skip-version-check','--disable-telemetry','--exit-code','0',image];
    const env={PATH:process.env.PATH||'/usr/bin:/bin',HOME:os.homedir(),LANG:'C',NO_COLOR:'1'};
    if(process.env.XDG_CACHE_HOME)env.XDG_CACHE_HOME=process.env.XDG_CACHE_HOME;
    execFile(exe,args,{cwd:os.tmpdir(),env,timeout,maxBuffer:8*1024*1024,windowsHide:true},(err,stdout)=>{
      if(err){reject(new Error(err.killed?'scanner_timeout':'scan_failed'));return;}
      try{resolve(JSON.parse(stdout));}catch{reject(new Error('invalid_scanner_output'));}
    });
  });
}
export async function scanContainerImages(project,{mode='current',enabled=false,trivyPath='trivy',runImage=invoke}={}){
  const output=emptyContainerImages(mode);
  if(mode!=='current'||!enabled)return output;
  let root;try{root=fs.realpathSync(project);if(!fs.statSync(root).isDirectory())throw new Error();}catch{output.reason='Project directory is unreadable.';return output;}
  let inputs;
  try{inputs=currentInputs(root,{accept:imageFile,maxFiles:100});}
  catch{output.errors.push({code:'enumeration_failed',message:'Unable to enumerate supported configuration files.'});return output;}
  if(inputs.errors.length)output.errors.push({code:'enumeration_incomplete',message:'Configuration enumeration was incomplete.'});
  const candidates=[],snapshots=new Map();
  for(const file of inputs.files){
    try{const bytes=safeRead(root,file);if(!bytes)continue;const source=text(bytes);snapshots.set(file,bytes.snapshot);output.files_inspected.push({file,snapshot:bytes.snapshot});candidates.push(...imageReferences(file,source));}
    catch{output.errors.push({code:'source_unavailable',message:'A configuration file could not be safely read.'});}
  }
  const distinct=new Map();
  for(const ref of candidates){
    if(!ref.image){output.skipped.push({file:ref.file,line:ref.line,reason:ref.reason});continue;}
    if(!distinct.has(ref.image))distinct.set(ref.image,[]);
    distinct.get(ref.image).push(ref);
  }
  if(!distinct.size){output.status=output.errors.length||output.skipped.length?'partial':'not_applicable';output.reason=output.skipped.length?'Container references were found but could not be resolved to explicitly tagged or digested images.':'No supported container references were found.';return output;}
  let exe;
  try{exe=trustedTrivy(trivyPath,root);}
  catch(e){output.reason='A trusted Trivy executable is unavailable or inside the selected project; image CVEs were not assessed.';output.errors.push({code:['missing_trivy','project_executable','invalid_executable'].includes(e.message)?e.message:'missing_trivy',message:output.reason});return output;}
  for(const [image,refs] of distinct){
    if(output.images.length>=IMAGE_LIMIT){output.skipped.push({file:refs[0].file,line:refs[0].line,reason:'image_scan_limit'});continue;}
    const record={image,status:'not_assessed',high_critical_findings:0,references:refs.map(({file,line})=>({file,line}))};
    output.images.push(record);
    const before=output.findings.length;
    try{
      const raw=await runImage(exe,image,60000);
      // Scan identical images once; retain a navigable source reference.
      record.high_critical_findings=normalizeTrivy(raw,refs[0],output);
      record.status='assessed';
      if(output.findings.length===before)record.high_critical_findings=0;
    }catch(e){
      output.findings.splice(before);
      output.errors.push({code:['scanner_timeout','invalid_scanner_output','no_package_inventory','finding_limit'].includes(e.message)?e.message:'image_scan_failed',message:'The local image or cached DB was unavailable, or Trivy returned incomplete output. No clean result was inferred.'});
    }
  }
  // A scan is not evidence if the configuration changed after reading it.
  for(const [file,snapshot] of snapshots){
    try{if(safeRead(root,file)?.snapshot!==snapshot)throw new Error();}
    catch{output.findings=[];output.images.forEach(r=>r.status='not_assessed');output.status='not_assessed';output.reason='Configuration changed during the image scan; rerun explicitly.';output.errors.push({code:'snapshot_changed',message:output.reason});return output;}
  }
  output.status=output.errors.length||output.skipped.length||output.images.some(r=>r.status!=='assessed')?'partial':'assessed';
  output.reason='High and critical CVEs matched against locally available Docker images with a cached vulnerability database. '+(output.status==='partial'?'Some images were not assessed.':'Image scan completed within this limited scope.');
  return output;
}
