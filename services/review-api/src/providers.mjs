import {assessmentSchema,LIMITS} from '../../../packages/ai/src/contract.mjs';
import {boundedJson} from '../../../packages/ai/src/transport.mjs';
import {SYSTEM_PROMPT} from '../../../packages/ai/src/prompt.mjs';
export {SYSTEM_PROMPT} from '../../../packages/ai/src/prompt.mjs';
import {profileFor,validateProfileRequest} from '../../../packages/ai/src/profiles.mjs';
export class ProviderError extends Error{constructor(code,status=503){super(code);this.code=code;this.status=status;}}
export function groqProvider({apiKey,model='openai/gpt-oss-120b',fetchImpl=fetch}={}){
 if(!apiKey)throw new Error('GROQ_API_KEY is required for the Groq provider.');
 if(!/^[a-zA-Z0-9_./-]{1,150}$/.test(model)||/compound/i.test(model))throw new Error('Use a text-only Groq chat model, not Compound/tool models.');
 return {name:'groq',model,async review(request,{signal,profile='full'}){
  const settings=profileFor(profile);validateProfileRequest(request,profile);
  let response;
  try{response=await fetchImpl('https://api.groq.com/openai/v1/chat/completions',{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+apiKey},body:JSON.stringify({model,messages:[{role:'system',content:SYSTEM_PROMPT+(profile==='demo'?' Demo profile: output at most 3 findings and use concise prose.':'')},{role:'user',content:JSON.stringify(request)}],temperature:0,max_completion_tokens:settings.completionTokens,stream:false,response_format:{type:'json_schema',json_schema:{name:'changeproof_assessment',strict:true,schema:assessmentSchema}}})});}
  catch{throw new ProviderError('provider_unavailable');}
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw new ProviderError(response.status===429?'provider_quota':[401,403].includes(response.status)?'provider_auth':response.status===400?'provider_configuration':'provider_unavailable',response.status===429?429:503);}
  try{const data=await boundedJson(response,LIMITS.outputBytes*2);if(data.choices?.[0]?.finish_reason!=='stop'||typeof data.choices[0].message?.content!=='string'||data.choices[0].message.tool_calls)throw new Error();return JSON.parse(data.choices[0].message.content);}catch{throw new ProviderError('invalid_model_output',502);}
 }};
}
// Explicit test/development provider. A caller-supplied deterministic fixture is not AI inference.
export function mockProvider(assessment){return {name:'mock',model:'synthetic-test-fixture',async review(request,{signal}){if(signal.aborted)throw new ProviderError('cancelled');return typeof assessment==='function'?assessment(request):structuredClone(assessment??{status:'insufficient_context',summary:'Mock provider only; no model inference occurred.',findings:[],limitations:['Synthetic mock response.'],context_requests:['Configure Groq to obtain a real assessment.']});}};}
