import {SYSTEM_PROMPT} from './prompt.mjs';
import {assessmentSchema} from './contract.mjs';
export const PROFILES=Object.freeze({
 full:Object.freeze({name:'full',files:8,chunks:32,chunkLines:120,contextBytes:100000,completionTokens:6000,findings:12,approximateTotalBudget:null}),
 demo:Object.freeze({name:'demo',files:3,chunks:8,chunkLines:80,contextBytes:9000,completionTokens:3000,findings:3,approximateTotalBudget:7500}),
});
export function profileFor(name='full'){if(!Object.hasOwn(PROFILES,name))throw new Error('invalid_profile');return PROFILES[name];}
export function estimateTokens(request,name='full'){
 const profile=profileFor(name);
 const contents=JSON.stringify({messages:[{role:'system',content:SYSTEM_PROMPT+(name==='demo'?' Demo profile: output at most 3 findings and use concise prose.':'')},{role:'user',content:JSON.stringify(request)}],response_format:{type:'json_schema',json_schema:{name:'changeproof_assessment',strict:true,schema:assessmentSchema}}});
 // A conservative heuristic for planning, NOT a provider tokenizer or quota guarantee.
 const input=Math.ceil(Buffer.byteLength(contents)/3);
 return {input_estimate:input,completion_budget:profile.completionTokens,total_estimate:input+profile.completionTokens,method:'UTF-8 bytes / 3, including messages and response schema; approximate only'};
}
export function validateProfileRequest(request,name='full'){
 const p=profileFor(name);if(name==='full')return;
 const chunks=request.files.flatMap(f=>f.chunks),bytes=chunks.reduce((sum,c)=>sum+Buffer.byteLength(c.text),0);
 if(request.files.length>p.files||chunks.length>p.chunks||bytes>p.contextBytes||chunks.some(c=>c.end_line-c.start_line+1>p.chunkLines)||estimateTokens(request,name).total_estimate>p.approximateTotalBudget)throw new Error('profile_limit');
}
