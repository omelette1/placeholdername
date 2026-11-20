import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {git,safeRead,text,exclusion,MAX_FILE,eligible} from '../../engine/src/io.mjs';
import {redact} from '../../ai/src/redact.mjs';
import {bodyEvidence} from './body-evidence.mjs';
export const CLAIM_LIMITS=Object.freeze({responseBytes:32768,claims:60,files:20,contentBytes:4*1024*1024});
const location=(file,line=1,column=1,endLine=line,endColumn=column)=>({file,start:{line,column},end:{line:endLine,column:endColumn}});
const signature=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.mode].join(':');
const fileLike=s=>/[/.]/.test(s)||['Dockerfile','Makefile','LICENSE'].includes(s);
export function parseClaims(response){
  if(typeof response!=='string'||Buffer.byteLength(response)>CLAIM_LIMITS.responseBytes)throw new Error('response_limit');
  const rows=[],redactedLines=redact(response).text.split(/\r?\n/);let code=false,omitted=0;
  for(const [index,original] of response.split(/\r?\n/).entries()){
    if(/^\s*```/.test(original)){code=!code;continue;}
    if(!original.trim()||/^\s*[-*_]{3,}\s*$/.test(original))continue;
    if(rows.length>=CLAIM_LIMITS.claims){omitted++;continue;}
    const line=original.replace(/^\s*#{1,6}\s+/,'').replace(/^\s*(?:[-*+]|\d+\.)\s+/,'').split(/(`[^`]*`)/).map(part=>part.startsWith('`')?part:part.replace(/\*\*/g,'')).join('').trim();
    const display=redactedLines[index].replace(/^\s*#{1,6}\s+/,'').replace(/^\s*(?:[-*+]|\d+\.)\s+/,'').trim();
    let claim={input_line:index+1,text:display.slice(0,400),kind:'unparsed'};
    if(code||/^>/.test(line)){claim.reason='Quoted text/code is not treated as an assistant assertion.';rows.push(claim);continue;}
    let m;
    if(m=line.match(/^File\s+`([^`]+)`\s+(exists|is present|is absent|does not exist)\.?$/i))claim={...claim,kind:/absent|not exist/i.test(m[2])?'file_absent':'file_exists',file:m[1]};
    else if(m=line.match(/^(Created|Added|Updated|Modified|Deleted|Removed)\s+(?:a\s+)?(file\s+)?`([^`]+)`\.?$/i)){
      if(m[2]||fileLike(m[3]))claim={...claim,kind:/created|added/i.test(m[1])?'file_added':/updated|modified/i.test(m[1])?'file_changed':'file_deleted',file:m[3]};
    }else if(m=line.match(/^Function\s+`([A-Za-z_$][\w$]*)`\s+exists in\s+`([^`]+)`\.?$/i))claim={...claim,kind:'function_exists',symbol:m[1],file:m[2]};
    else if(m=line.match(/^(?:Added|Created)\s+(?:a\s+)?function\s+`([A-Za-z_$][\w$]*)`\s+in\s+`([^`]+)`\.?$/i))claim={...claim,kind:'function_added',symbol:m[1],file:m[2]};
    else if(m=line.match(/^Implemented\s+(?:the\s+)?function\s+`([A-Za-z_$][\w$]*)`\s+in\s+`([^`]+)`\.?$/i))claim={...claim,kind:'function_implemented',symbol:m[1],file:m[2]};
    else if(/\b(test|tests|build|checks)\b.*\b(passed|pass|successful|succeeded|green)\b/i.test(line))claim={...claim,kind:'execution_claim',reason:'No independently captured execution evidence. Pasted success text or an agent report is not proof.'};
    rows.push(claim);
  }
  return {claims:rows,omitted_lines:omitted};
}
function declarations(file,source,name){
  if(!eligible(file))throw new Error('unsupported_language');
  const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);if(tree.parseDiagnostics.length)throw new Error('parse_error');
  const found=[];
  const add=(node,body)=>{const a=tree.getLineAndCharacterOfPosition(node.getStart(tree)),b=tree.getLineAndCharacterOfPosition(node.end);found.push({location:location(file,a.line+1,a.character+1,b.line+1,b.character+1),implementation:bodyEvidence(body)});};
  for(const node of tree.statements){
    if(ts.isFunctionDeclaration(node)&&node.name?.text===name&&node.body)add(node,node.body);
    if(ts.isVariableStatement(node))for(const d of node.declarationList.declarations){
      let init=d.initializer;while(init&&(ts.isParenthesizedExpression(init)||ts.isAsExpression(init)||ts.isSatisfiesExpression(init)))init=init.expression;
      if(ts.isIdentifier(d.name)&&d.name.text===name&&init&&(ts.isArrowFunction(init)||ts.isFunctionExpression(init)))add(d,init.body);
    }
  }
  return found;
}
export function auditClaims(project,response){
  const parsed=parseClaims(response),root=fs.realpathSync(project);if(!fs.statSync(root).isDirectory())throw new Error('invalid_project');
  let gitRoot=null,head=null;
  try{gitRoot=fs.realpathSync(git(root,['rev-parse','--show-toplevel']).toString().trimEnd());head=git(gitRoot,['rev-parse','--verify','HEAD^{commit}']).toString().trim();}catch{}
  const cache=new Map(),snapshots=new Map();let readBytes=0;
  const consume=buffer=>{readBytes+=buffer?.length||0;if(readBytes>CLAIM_LIMITS.contentBytes)throw new Error('content_budget');return buffer;};
  function current(file,record=true){
    let target=root;
    for(const part of file.split('/')){target=path.join(target,part);let s;try{s=fs.lstatSync(target,{bigint:true});}catch(e){if(e.code==='ENOENT'){if(record)snapshots.set(file,null);return {present:false};}throw e;}if(s.isSymbolicLink())throw new Error('symlink');}
    const stat=fs.lstatSync(target,{bigint:true});if(!stat.isFile())throw new Error('not_regular_file');
    const snapshot=signature(stat);if(record)snapshots.set(file,snapshot);return {present:true,snapshot,size:Number(stat.size),mode:(Number(stat.mode)&0o111)?'100755':'100644',location:location(file)};
  }
  function inspect(file){
    if(typeof file!=='string'||!file||file.length>400||path.isAbsolute(file)||file.includes('\\')||file.includes('\0')||file.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('unsafe_path');
    if(exclusion(file))throw new Error('excluded_path');
    if(cache.has(file))return cache.get(file);if(cache.size>=CLAIM_LIMITS.files)throw new Error('file_budget');
    const now=current(file);let old={known:false,present:false};
    if(head){
      try{
        const relative=path.relative(gitRoot,path.join(root,file)).split(path.sep).join('/');
        const entry=git(gitRoot,['--literal-pathspecs','ls-tree','-z',head,'--',relative]).toString().split('\0').filter(Boolean);
        if(!entry.length)old={known:true,present:false};
        else {const [mode,type,oid]=entry[0].split('\t')[0].split(' ');if(!['100644','100755'].includes(mode)||type!=='blob'||! /^[a-f0-9]{40,64}$/.test(oid))throw new Error();old={known:true,present:true,mode,oid};}
      }catch{old={known:false,present:false};}
    }
    const data={now,old};cache.set(file,data);return data;
  }
  function buffers(file,data,withHead=true){
    if(data.now.present&&data.now.bytes===undefined){if(data.now.size>MAX_FILE)throw new Error('file_too_large');if(readBytes+data.now.size>CLAIM_LIMITS.contentBytes)throw new Error('content_budget');const b=consume(safeRead(root,file));if(!b||b.snapshot!==data.now.snapshot)throw new Error('snapshot_changed');data.now.bytes=b;}
    if(withHead&&data.old.present&&data.old.bytes===undefined){const size=Number(git(gitRoot,['cat-file','-s',data.old.oid]).toString());if(size>MAX_FILE)throw new Error('file_too_large');if(readBytes+size>CLAIM_LIMITS.contentBytes)throw new Error('content_budget');data.old.bytes=consume(git(gitRoot,['cat-file','blob',data.old.oid]));}
  }
  const claims=parsed.claims.map((claim,index)=>{
    const row={...claim,index,status:'unverified',scope:'No behavioral correctness or execution claim is established.',reason:claim.reason||'Unsupported prose. Only the explicitly documented file/function assertion forms are assessed.',evidence:[]};
    if(['unparsed','execution_claim'].includes(claim.kind))return row;
    try{
      const {now,old}=inspect(claim.file),data=cache.get(claim.file);
      if(now.present)row.evidence.push({kind:'current_file',location:now.location,revision:'saved',note:'A regular saved file exists; contents are not proof of behavior.'});
      if(old.known)row.evidence.push({kind:'head_file',revision:head,present:old.present,note:old.present?'Regular file exists in the compared commit.':'No file exists at this path in the compared commit.'});
      const finish=(status,reason,scope)=>Object.assign(row,{status,reason,scope});
      if(claim.kind==='file_exists')return finish(now.present?'matched':'contradicted',now.present?'Saved regular file found.':'No saved file exists at the claimed project path.','File presence only.');
      if(claim.kind==='file_absent')return finish(now.present?'contradicted':'matched',now.present?'The saved file is still present.':'No saved file exists at this path.','File absence only; deletion history is not established.');
      if(claim.kind==='file_deleted')return now.present?finish('contradicted','The claimed deleted file is still present.','Current saved-file state.'):old.known&&old.present?finish('matched','File existed in the compared commit and is absent now.','Deletion relative to the recorded HEAD commit.'):finish('unverified','File is absent, but a usable prior file was not established.','Absence observed; deletion unverified.');
      if(!now.present)return finish('contradicted','No saved file exists at the claimed project path.','Current saved-file state only.');
      if(claim.kind==='file_added')return !old.known?finish('unverified','File exists, but there is no usable HEAD baseline to establish addition.','Presence observed; addition unverified.'):old.present?finish('unverified','File already existed in HEAD; creation/addition is not established.','Presence observed, not creation timing.'):finish('matched','File exists now and did not exist at this path in HEAD.','Addition relative to the recorded commit, not correctness.');
      if(claim.kind==='file_changed'){
        if(!old.known||!old.present)return finish('unverified','No usable prior regular file to compare.','A change is not established.');buffers(claim.file,data);
        const changed=!now.bytes.equals(old.bytes)||now.mode!==old.mode;
        return finish(changed?'matched':'contradicted',changed?'Saved bytes or executable bit differ from HEAD.':'No delivered content or executable-bit change versus HEAD.','File difference only; claimed behavior is unverified.');
      }
      buffers(claim.file,data,claim.kind==='function_added');const found=declarations(claim.file,text(now.bytes),claim.symbol);
      if(!found.length)return finish('unverified','No supported top-level definition was found. Imported, method or dynamic bindings are not resolved.','Top-level function declarations/arrow or function-expression bindings only; absence of a supported declaration is not proof of missing runtime behavior.');
      if(found.length!==1)return finish('unverified','Multiple matching definitions; binding identity is ambiguous.','Declaration identity only.');
      row.implementation=found[0].implementation;
      row.evidence.push({kind:'function_declaration',revision:'saved',location:found[0].location,note:'A definition with a body exists. '+row.implementation.summary+'. Its behavior is not checked.'});
      if(claim.kind==='function_implemented')return finish('unverified',row.implementation.attention?'A definition exists, but the body has an empty/placeholder observation. See implementation evidence.':'A definition and body exist, but no behavioral contract was verified.','Implementation syntax observations only; no behavioral correctness or test success established.');
      if(claim.kind==='function_exists')return finish('matched','A supported top-level function definition was found.','Declaration presence only; a stub can match.');
      if(!old.known)return finish('unverified','Function exists, but no HEAD baseline establishes that it was added.','Declaration observed; addition unverified.');
      const existed=old.present&&declarations(claim.file,text(old.bytes),claim.symbol).length;
      return finish(existed?'unverified':'matched',existed?'A matching definition already existed in HEAD.':'Definition exists now and was not found in the compared commit.','Definition addition only; correctness and tests are unverified.');
    }catch(error){row.reason=({unsafe_path:'Path is outside the supported project-relative path syntax.',excluded_path:'Excluded/secret/dependency path is not inspected.',symlink:'Symlink path is not inspected.',unsupported_language:'Function syntax analysis supports JS/TS only.',parse_error:'Syntax parsing failed; no function verdict is established.',file_too_large:'File exceeds the size limit.',content_budget:'Content budget reached.',file_budget:'Claimed-file budget reached.',snapshot_changed:'Saved file changed during the check.',not_regular_file:'The path is not a regular file.'})[error.message]||'Evidence could not be read safely.';return row;}
  });
  let stale=false;
  for(const [file,snapshot] of snapshots){try{if((current(file,false).snapshot??null)!==snapshot)stale=true;}catch{stale=true;}}
  if(head){try{if(git(gitRoot,['rev-parse','--verify','HEAD^{commit}']).toString().trim()!==head)stale=true;}catch{stale=true;}}
  return {schema_version:'1.1.0',kind:'assistant_claim_audit',repository:root,git_repository:gitRoot,compared_revision:head,claims,snapshots:[...snapshots].map(([file,snapshot])=>({file,snapshot})),stale,omitted_lines:parsed.omitted_lines,counts:{matched:claims.filter(c=>c.status==='matched').length,contradicted:claims.filter(c=>c.status==='contradicted').length,unverified:claims.filter(c=>c.status==='unverified').length},implementation_warnings:claims.filter(c=>c.implementation?.attention).length,runtime_verification:false,limitations:['Local audit of explicit supported assertions, not a universal hallucination detector.','Saved files only; before/after reads are not an atomic repository snapshot.','Tests, builds, security policies and general behavior are not independently executed or verified.','Selected whole-body empty/placeholder patterns are observed; intended no-ops may match and hidden stubs may be missed.','Body content and constant returns do not establish correctness; function implementation claims remain unverified.','Unsupported prose, excluded inputs and unavailable baselines remain unverified.','Pasted text is not treated as instructions, command output or execution evidence.']};
}
