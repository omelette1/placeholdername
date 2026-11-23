import Fastify from 'fastify';
import crypto from 'node:crypto';
import {AI_VERSION,LIMITS} from '../../../packages/ai/src/contract.mjs';
import {checkRequest,checkAssessment} from '../../../packages/ai/src/validate.mjs';
import {redact} from '../../../packages/ai/src/redact.mjs';
import {ProviderError} from './providers.mjs';
import {profileFor,validateProfileRequest} from '../../../packages/ai/src/profiles.mjs';
const digest=value=>crypto.createHash('sha256').update(value).digest();
const safeUsage=value=>{
 if(!value||typeof value!=='object')return null;
 const usage={};
 for(const key of ['prompt_tokens','completion_tokens','total_tokens','reasoning_tokens'])if(Number.isSafeInteger(value[key])&&value[key]>=0)usage[key]=value[key];
 return Object.keys(usage).length?usage:null;
};
export function createServer({accessToken,provider,onProviderDiagnostic=()=>{},concurrency=2,requestsPerHour=20,bytesPerHour=2000000,timeoutMs=LIMITS.timeoutMs}={}){
 if(typeof accessToken!=='string'||accessToken.length<32||/[\s]/.test(accessToken))throw new Error('REVIEW_ACCESS_TOKEN must contain at least 32 non-whitespace characters.');
 if(!provider||!['groq','mock'].includes(provider.name))throw new Error('A review provider is required.');
 for(const [key,value,min,max] of [['concurrency',concurrency,1,8],['requestsPerHour',requestsPerHour,1,1000],['bytesPerHour',bytesPerHour,1000,100000000],['timeoutMs',timeoutMs,10,60000]])if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error('Invalid '+key);
 // Inference can legitimately remain silent until the provider deadline. An
 // earlier socket idle timeout would drop the response before our 504 handler.
 const app=Fastify({logger:false,bodyLimit:LIMITS.requestBytes,requestTimeout:15000,connectionTimeout:Math.max(20000,timeoutMs+5000),keepAliveTimeout:5000,maxRequestsPerSocket:50,trustProxy:false});
 let active=0,used=0,bytes=0,windowStart=Date.now();
 const instance_id=crypto.randomBytes(16).toString('hex');
 app.setErrorHandler((error,_request,reply)=>reply.code(error.statusCode===413?413:400).send({error:error.statusCode===413?'request_too_large':'invalid_request'}));
 app.get('/health',async()=>({status:'ok',contract_version:AI_VERSION,provider:provider.name,model:provider.model,instance_id}));
 app.addHook('onRequest',async(request,reply)=>{
  if(request.url==='/health'&&request.method==='GET')return;
  const supplied=request.headers.authorization;
  if(typeof supplied!=='string'||supplied.length>1024||!crypto.timingSafeEqual(digest(supplied),digest('Bearer '+accessToken)))return reply.code(401).send({error:'unauthorized'});
  if(request.method!=='POST'||request.url!=='/v1/reviews')return;
  if(Date.now()-windowStart>=3600000){windowStart=Date.now();used=0;bytes=0;}
  if(used>=requestsPerHour||bytes>=bytesPerHour)return reply.header('Retry-After',String(Math.max(1,Math.ceil((windowStart+3600000-Date.now())/1000)))).code(429).send({error:'usage_quota'});
  if(active>=concurrency)return reply.header('Retry-After','5').code(429).send({error:'concurrency_limit'});
 });
 app.post('/v1/reviews',async(request,reply)=>{
  let profile;try{profile=request.headers['x-changeproof-profile']||'full';profileFor(profile);checkRequest(request.body);validateProfileRequest(request.body,profile);}catch{return reply.code(400).send({error:'invalid_request'});}
  const size=Buffer.byteLength(JSON.stringify(request.body));
  // Recheck atomically after asynchronous body parsing.
  if(active>=concurrency)return reply.code(429).send({error:'concurrency_limit'});
  if(used>=requestsPerHour||bytes+size>bytesPerHour)return reply.code(429).send({error:'usage_quota'});
  active++;used++;bytes+=size;
  const controller=new AbortController();let timer;let timedOut=false;
  const disconnected=()=>{if(!reply.raw.writableEnded)controller.abort();};
  request.raw.on('aborted',disconnected);reply.raw.on('close',disconnected);
  const aborted=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new ProviderError(timedOut?'provider_timeout':'cancelled',timedOut?504:499)),{once:true}));
  timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
  let usage=null;
  try{
   const raw=await Promise.race([provider.review(request.body,{signal:controller.signal,profile,onUsage:value=>{usage=safeUsage(value);}}),aborted]);
   checkAssessment(raw,request.body);if(raw.findings.length>profileFor(profile).findings)throw new ProviderError('schema_mismatch',502);
   // Redact provider prose too, then revalidate identity/ranges (never silently repair references).
   const clean=value=>typeof value==='string'?redact(value).text:Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,clean(v)])):value;
   const assessment=clean(raw);checkAssessment(assessment,request.body);
   onProviderDiagnostic({category:'assessment_validated',usage});
   return {schema_version:AI_VERSION,request_id:request.body.request_id,baseline:request.body.baseline,provider:provider.name,model:provider.model,runtime_verification:false,assessment};
  }catch(error){
   const status=error instanceof ProviderError?error.status:502;
   const category=error instanceof ProviderError?error.category:['invalid_reference','missing_comparison_references'].includes(error.message)?'invalid_reference':['invalid_evidence_quote','missing_current_quote','missing_comparison_quote'].includes(error.message)?'invalid_evidence_quote':['invalid_patch_identity','invalid_patch_shape','invalid_patch_reference','invalid_patch_source_mismatch','invalid_patch_overlap'].includes(error.message)?error.message:error.message==='output_size_limit'?'output_size_limit':error.message==='schema_mismatch'?'schema_mismatch':'provider_internal_failure';
   onProviderDiagnostic({category,usage:safeUsage(error instanceof ProviderError?error.usage??usage:usage)});
   return reply.code(status).send({error:category});
  }
  finally{clearTimeout(timer);controller.abort();active--;request.raw.off('aborted',disconnected);reply.raw.off('close',disconnected);}
 });
 return app;
}
