const {execFile}=require('node:child_process');
const path=require('node:path');
function validateClaimReport(r){
 if(r?.schema_version!=='1.0.0'||r.kind!=='assistant_claim_audit'||typeof r.repository!=='string'||!path.isAbsolute(r.repository)||r.runtime_verification!==false||typeof r.stale!=='boolean'||!Array.isArray(r.claims)||r.claims.length>60||!Array.isArray(r.snapshots)||r.snapshots.length>20||!Array.isArray(r.limitations)||!Number.isSafeInteger(r.omitted_lines)||r.omitted_lines<0)throw new Error('Invalid claim report.');
 const validFile=file=>typeof file==='string'&&!path.isAbsolute(file)&&!file.includes('\\')&&!file.split('/').some(p=>!p||p==='.'||p==='..');
 for(const row of r.claims){if(!['matched','contradicted','unverified'].includes(row.status)||!Number.isSafeInteger(row.index)||!Number.isSafeInteger(row.input_line)||row.input_line<1||!['text','reason','scope'].every(k=>typeof row[k]==='string')||!Array.isArray(row.evidence))throw new Error('Invalid claim.');for(const ev of row.evidence){if(ev.location){const loc=ev.location;if(!validFile(loc.file))throw new Error('Invalid evidence.');for(const p of [loc.start,loc.end])if(!Number.isSafeInteger(p?.line)||p.line<1||!Number.isSafeInteger(p?.column)||p.column<1)throw new Error('Invalid evidence.');}}}
 for(const s of r.snapshots)if(!validFile(s.file)||!(s.snapshot===null||typeof s.snapshot==='string'))throw new Error('Invalid snapshot.');
 for(const key of ['matched','contradicted','unverified'])if(r.counts?.[key]!==r.claims.filter(c=>c.status===key).length)throw new Error('Invalid counts.');
 return r;
}
function runClaimAudit(node,cli,folder,response,{signal}={}){
 return new Promise((resolve,reject)=>{
  if(typeof response!=='string'||Buffer.byteLength(response)>32768)return reject(new Error('Paste at most 32 KiB of response text.'));
  const env={...process.env};for(const key of ['NODE_OPTIONS','NODE_PATH','GROQ_API_KEY','REVIEW_ACCESS_TOKEN'])delete env[key];
  const child=execFile(node,[cli,folder],{cwd:path.dirname(cli),env,signal,windowsHide:true,timeout:60000,maxBuffer:2*1024*1024},(error,stdout)=>{
   try{if(error)throw new Error();const report=validateClaimReport(JSON.parse(stdout));resolve(report);}catch{reject(new Error('Local claim audit failed or returned an incompatible report. No result is established.'));}
  });
  child.stdin.on('error',()=>{});child.stdin.end(response);
 });
}
module.exports={runClaimAudit,validateClaimReport};
