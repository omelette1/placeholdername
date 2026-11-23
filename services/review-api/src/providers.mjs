import {assessmentSchema,LIMITS} from '../../../packages/ai/src/contract.mjs';
import {boundedJson} from '../../../packages/ai/src/transport.mjs';
import {SYSTEM_PROMPT} from '../../../packages/ai/src/prompt.mjs';
export {SYSTEM_PROMPT} from '../../../packages/ai/src/prompt.mjs';
import {profileFor,validateProfileRequest} from '../../../packages/ai/src/profiles.mjs';
const safeUsage=value=>{
 if(!value||typeof value!=='object')return null;
 const usage={};
 for(const [key,source] of [['prompt_tokens',value.prompt_tokens],['completion_tokens',value.completion_tokens],['total_tokens',value.total_tokens],['reasoning_tokens',value.completion_tokens_details?.reasoning_tokens]])if(Number.isSafeInteger(source)&&source>=0)usage[key]=source;
 return Object.keys(usage).length?usage:null;
};
export class ProviderError extends Error{constructor(code,status=503,{usage=null,category=code}={}){super(code);this.code=code;this.status=status;this.usage=usage;this.category=category;}}
export function groqProvider({apiKey,model='openai/gpt-oss-120b',fetchImpl=fetch}={}){
 if(!apiKey)throw new Error('GROQ_API_KEY is required for the Groq provider.');
 if(!/^[a-zA-Z0-9_./-]{1,150}$/.test(model)||/compound/i.test(model))throw new Error('Use a text-only Groq chat model, not Compound/tool models.');
 return {name:'groq',model,async review(request,{signal,profile='full',onUsage=()=>{}}){
  const settings=profileFor(profile);validateProfileRequest(request,profile);
  let response;
  try{response=await fetchImpl('https://api.groq.com/openai/v1/chat/completions',{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+apiKey},body:JSON.stringify({model,messages:[{role:'system',content:SYSTEM_PROMPT+(profile==='demo'?' Demo profile: output at most 3 findings and use concise prose.':'')},{role:'user',content:JSON.stringify(request)}],temperature:0,max_completion_tokens:settings.completionTokens,stream:false,response_format:{type:'json_schema',json_schema:{name:'changeproof_assessment',strict:true,schema:assessmentSchema}}})});}
  catch{throw new ProviderError('provider_unavailable');}
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw new ProviderError(response.status===429?'provider_quota':[401,403].includes(response.status)?'provider_auth':response.status===400?'provider_configuration':'provider_unavailable',response.status===429?429:503);}
  let data;
  try{data=await boundedJson(response,LIMITS.outputBytes*2);}
  catch(error){
   const category=error.message==='response_limit'?'provider_response_size_limit':error instanceof SyntaxError?'invalid_json':'provider_response_invalid';
   throw new ProviderError(category,502,{category});
  }
  const usage=safeUsage(data?.usage);onUsage(usage);
  const choice=data?.choices?.[0],message=choice?.message;
  if(choice?.finish_reason==='length')throw new ProviderError('completion_truncated',502,{usage});
  if(choice?.finish_reason!=='stop')throw new ProviderError(choice?.finish_reason==='content_filter'?'completion_filtered':'incomplete_completion',502,{usage});
  if(typeof message?.content!=='string'||!message.content.trim())throw new ProviderError('missing_content',502,{usage});
  if(message.tool_calls)throw new ProviderError('unexpected_tool_call',502,{usage});
  try{return JSON.parse(message.content);}
  catch{throw new ProviderError('invalid_json',502,{usage});}
 }};
}
// Explicit test/development provider. A caller-supplied deterministic fixture is not AI inference.
export function mockProvider(assessment){return {name:'mock',model:'synthetic-test-fixture',async review(request,{signal}){if(signal.aborted)throw new ProviderError('cancelled');return typeof assessment==='function'?assessment(request):structuredClone(assessment??{status:'insufficient_context',summary:'Mock provider only; no model inference occurred.',findings:[],limitations:['Synthetic mock response.'],context_requests:['Configure Groq to obtain a real assessment.']});}};}
