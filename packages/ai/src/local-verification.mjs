import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import {checkRequest,checkResponse} from './validate.mjs';
import {redact} from './redact.mjs';
import {git,safeRead,text,MAX_FILE,eligible,exclusion} from '../../engine/src/io.mjs';
import {inspectDetailed} from '../../engine/src/rule.mjs';
import {lineRanges} from '../../engine/src/engine.mjs';
import {bodyEvidence} from '../../claims/src/body-evidence.mjs';

const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const covered=(loc,refs)=>refs.some(r=>r.revision==='after'&&r.file===loc.file&&r.start_line<=loc.start.line&&r.end_line>=loc.end.line);
export function verifyLocalAssessment(project,request,response){
  checkRequest(request);checkResponse(response,request);
  const root=fs.realpathSync(project),gitRoot=fs.realpathSync(git(root,['rev-parse','--show-toplevel']).toString().trimEnd());
  const prefix=path.relative(gitRoot,root);if(prefix==='..'||prefix.startsWith('..'+path.sep)||path.isAbsolute(prefix))throw Error('boundary');
  const head=()=>git(root,['rev-parse','--verify','HEAD^{commit}']).toString().trim();
  if(head()!==request.baseline)throw Error('stale_snapshot');
  const files=new Map();let totalBytes=0;
  for(const file of request.files){
    if(exclusion(file.file)||!eligible(file.file))throw Error('unsupported_path');
    const repoFile=path.relative(gitRoot,path.join(root,file.file)).split(path.sep).join('/');
    const entries=git(gitRoot,['--literal-pathspecs','ls-tree','-z',request.baseline,'--',repoFile]).toString().split('\0').filter(Boolean);
    let before='';
    if(entries.length){const [mode,type,oid]=entries[0].split('\t')[0].split(' ');if(!['100644','100755'].includes(mode)||type!=='blob'||oid!==file.before_id)throw Error('baseline_mismatch');const size=Number(git(gitRoot,['cat-file','-s',oid]).toString());if(size>MAX_FILE||!Number.isFinite(size))throw Error('size');before=text(git(gitRoot,['cat-file','blob',oid]));}
    else if(file.before_id!=='absent')throw Error('baseline_mismatch');
    const bytes=safeRead(root,file.file),after=bytes===null?'':text(bytes);
    if(file.after_id!=='sha256:'+hash(after))throw Error('stale_snapshot');
    totalBytes+=Buffer.byteLength(before)+Buffer.byteLength(after);if(totalBytes>16*MAX_FILE)throw Error('size');
    for(const chunk of file.chunks){const source=chunk.revision==='before'?before:after;const lines=source.split('\n');if(chunk.end_line>lines.length||redact(lines.slice(chunk.start_line-1,chunk.end_line).join('\n')).text!==chunk.text)throw Error('context_mismatch');}
    let analysis=null;try{analysis=inspectDetailed(file.file,before,after,lineRanges(before,after));}catch{}
    files.set(file.file,{before,after,snapshot:bytes?.snapshot??null,analysis});
  }
  const findings=response.assessment.findings.map((finding,index)=>{
    const row={index,status:'unverified',reason:'No independent supported rule establishes this AI claim. Absence of a rule match does not contradict the claim.',static_evidence:[],implementation_observations:[],runtime_verification:false};
    for(const [file,data] of files){
      if(!finding.references.some(r=>r.file===file&&r.revision==='after'))continue;
      if(finding.category==='sensitive_data_exposure')for(const observed of data.analysis?.findings||[]){
        if(observed.rule_id!=='CP002')continue;
        for(const flow of observed.evidence?.paths||[]){
          const trace=flow.trace||[];
          if(flow.newly_introduced!==true||!trace.length||!trace.every(step=>covered(step.location,finding.references)))continue;
          row.status='partial_static_support';row.reason='CP002 independently reproduced a newly introduced authorization-header-shaped flow to console within the cited current-file ranges. This supports that narrow pattern, not the full explanation, actual secret contents or runtime exploitability.';
          row.static_evidence.push({rule_id:'CP002',newly_introduced:true,trace:trace.slice(0,64).map(step=>({kind:step.kind,location:step.location,reference_index:finding.references.findIndex(r=>r.revision==='after'&&r.file===step.location.file&&r.start_line<=step.location.start.line&&r.end_line>=step.location.end.line)}))});
          if(row.static_evidence.length>=3)break;
        }
        if(row.static_evidence.length>=3)break;
      }
      const tree=ts.createSourceFile(file,data.after,ts.ScriptTarget.Latest,true);if(tree.parseDiagnostics.length)continue;
      const inspect=node=>{if(row.implementation_observations.length>=20||!node.body)return;const start=tree.getLineAndCharacterOfPosition(node.getStart(tree)),end=tree.getLineAndCharacterOfPosition(node.end),location={file,start:{line:start.line+1,column:start.character+1},end:{line:end.line+1,column:end.character+1}};if(covered(location,finding.references))row.implementation_observations.push({location,...bodyEvidence(node.body)});};
      for(const node of tree.statements){if(ts.isFunctionDeclaration(node))inspect(node);if(ts.isVariableStatement(node))for(const d of node.declarationList.declarations){const v=d.initializer;if(v&&(ts.isArrowFunction(v)||ts.isFunctionExpression(v)))inspect(v);}}
    }
    if(finding.category==='weakened_access_check')row.reason='General access-control behavior and application policy are unsupported by the independent local rules. Any body observations are syntax evidence only.';
    return row;
  });
  for(const [file,data] of files){const b=safeRead(root,file);if((b?.snapshot??null)!==data.snapshot||hash(b===null?'':text(b))!==hash(data.after))throw Error('stale_snapshot');}
  if(head()!==request.baseline)throw Error('stale_snapshot');
  return {schema_version:'1.0.0',kind:'local_ai_evidence_check',request_id:request.request_id,baseline:request.baseline,status:'completed',references_validated:true,snapshot_validated:true,findings,counts:{partial_static_support:findings.filter(f=>f.status==='partial_static_support').length,unverified:findings.filter(f=>f.status==='unverified').length},summary_verification:'unverified',runtime_verification:false,limitations:['Independent local static checks, not a second LLM vote or proof of the complete security claim.','Only submitted files are read locally; source is never executed and no additional model request is made.','CP002 support requires a new supported flow and every recorded step inside cited after-ranges.','Other vulnerability types, application policy, tests/builds and free-text summary claims remain unverified.','Empty results and absence of a static match do not establish safety or refute an AI finding.']};
}
