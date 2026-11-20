const {execFile}=require('node:child_process');const path=require('node:path');
function verifyAiResponse(node,cli,folder,request,response,signal){return new Promise((resolve,reject)=>{
 const env={...process.env};for(const key of ['NODE_OPTIONS','NODE_PATH','GROQ_API_KEY','REVIEW_ACCESS_TOKEN'])delete env[key];
 const child=execFile(node,[cli,folder],{cwd:path.dirname(cli),env,signal,timeout:60000,maxBuffer:2*1024*1024,windowsHide:true},(error,stdout)=>{
  try{if(error)throw Error();const value=JSON.parse(stdout);if(value.kind!=='local_ai_evidence_check'||value.schema_version!=='1.0.0'||value.status!=='completed'||value.request_id!==request.request_id||value.baseline!==request.baseline||value.runtime_verification!==false||value.snapshot_validated!==true||value.references_validated!==true||value.summary_verification!=='unverified'||!Array.isArray(value.findings)||value.findings.length!==response.assessment.findings.length)throw Error();for(const [index,row]of value.findings.entries()){
   if(row.index!==index||row.runtime_verification!==false||!['partial_static_support','unverified'].includes(row.status)||typeof row.reason!=='string'||!Array.isArray(row.static_evidence)||row.static_evidence.length>24||!Array.isArray(row.implementation_observations)||row.implementation_observations.length>20)throw Error();
   const valid=loc=>loc&&response.assessment.findings[index].references.some(r=>r.revision==='after'&&r.file===loc.file&&r.start_line<=loc.start?.line&&r.end_line>=loc.end?.line)&&[loc.start,loc.end].every(p=>Number.isSafeInteger(p?.line)&&p.line>0&&Number.isSafeInteger(p?.column)&&p.column>0);
   for(const ev of row.static_evidence){if(ev.rule_id!=='CP002'||ev.newly_introduced!==true||!Array.isArray(ev.trace)||!ev.trace.length||ev.trace.length>64)throw Error();for(const step of ev.trace){const ref=response.assessment.findings[index].references[step.reference_index];if(!valid(step.location)||!Number.isSafeInteger(step.reference_index)||ref?.revision!=='after'||ref.file!==step.location.file||ref.start_line>step.location.start.line||ref.end_line<step.location.end.line||typeof step.kind!=='string')throw Error();}}
   for(const o of row.implementation_observations)if(!valid(o.location)||o.behavior_verified!==false||typeof o.summary!=='string'||typeof o.detail!=='string')throw Error();
   if(row.status==='partial_static_support'&&!row.static_evidence.length)throw Error();
  }for(const key of ['partial_static_support','unverified'])if(value.counts?.[key]!==value.findings.filter(f=>f.status===key).length)throw Error();resolve(value);}catch{reject(Error('Local evidence unavailable; no corroboration established.'));}
 });child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({request,response}));
});}
module.exports={verifyAiResponse};
