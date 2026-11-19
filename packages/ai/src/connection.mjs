import crypto from 'node:crypto';
import {AI_VERSION} from './contract.mjs';
import {backendUrl,boundedJson,postReview,ReviewError} from './transport.mjs';
import {checkRequest,checkResponse} from './validate.mjs';
export async function getHealth(url,{signal,fetchImpl=fetch}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 try{
  const response=await fetchImpl(backendUrl(url)+'/health',{signal:controller.signal,redirect:'error',cache:'no-store'});
  if(!response.ok)throw new Error();const value=await boundedJson(response,4096);
  if(value.status!=='ok'||value.contract_version!==AI_VERSION||!['groq','mock'].includes(value.provider)||typeof value.model!=='string'||!/^[a-zA-Z0-9_.\/-]{1,150}$/.test(value.model)||typeof value.instance_id!=='string'||!/^[a-f0-9]{32}$/.test(value.instance_id))throw new Error();
  return {provider:value.provider,model:value.model,instance_id:value.instance_id||null};
 }catch{throw new ReviewError(signal?.aborted?'cancelled':'backend_unavailable',signal?.aborted?'AI connection check cancelled.':'Backend unavailable or incompatible. Start the review API and check the user-level backend URL.');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
export function syntheticSmokeRequest(){
 const before='function route(req) {\n // Synthetic policy: authorization headers contain credentials and must never be logged.\n console.log("request received");\n return "ok";\n}';
 const after=before.replace('console.log("request received")','console.log(req.headers.authorization)');
 const before_id=digest(before),after_id='sha256:'+digest(after);
 return checkRequest({schema_version:AI_VERSION,request_id:crypto.randomBytes(16).toString('hex'),baseline:digest('changeproof-built-in-smoke-v1'),files:[{file:'synthetic-smoke.ts',before_id,after_id,chunks:[{revision:'before',revision_id:before_id,start_line:1,end_line:5,text:before},{revision:'after',revision_id:after_id,start_line:1,end_line:5,text:after}]}],omissions:['Built-in synthetic example only. No workspace code, paths or project metadata are included.'],privacy_notice:'Explicit synthetic connection/contract check. Provider charges may apply. This is not a measurement of detection accuracy.'});
}
export function smokeSignal(assessment){
 return assessment.findings.some(f=>f.category==='sensitive_data_exposure'&&['before','after'].every(rev=>f.references.some(r=>r.revision===rev&&r.file==='synthetic-smoke.ts'&&r.start_line<=3&&r.end_line>=3)))?'expected_category_and_ranges_observed':assessment.status==='insufficient_context'?'insufficient_context':'expected_signal_not_observed';
}
export async function runSyntheticSmoke(url,token,health,{signal,fetchImpl=fetch}={}){
 const request=syntheticSmokeRequest();const response=await postReview(url,token,request,{signal,fetchImpl});checkResponse(response,request);
 if(response.provider!==health.provider||response.model!==health.model)throw new ReviewError('provider_changed','Backend provider/model changed during the check. Refresh status and check again. No fallback was accepted.');
 const after=await getHealth(url,{signal,fetchImpl});
 if(after.provider!==health.provider||after.model!==health.model||after.instance_id!==health.instance_id)throw new ReviewError('provider_changed','Backend restarted or changed during the check. Refresh status and check again.');
 return {provider:response.provider,model:response.model,instance_id:health.instance_id,timestamp:new Date().toISOString(),status:'passed',contract_valid:true,reference_validation:true,detection_proxy:smokeSignal(response.assessment),accuracy:'not_measured',runtime_verification:false};
}
