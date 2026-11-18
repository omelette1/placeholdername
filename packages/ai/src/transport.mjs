import {LIMITS} from './contract.mjs';
export function backendUrl(value){
 let url;try{url=new URL(value);}catch{throw new Error('Configure a valid user-level Changeproof AI backend URL.');}
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&!local)throw new Error('AI backend must be an HTTPS origin, or HTTP on loopback for development.');
 return url.origin;
}
export async function boundedJson(response,maxBytes){
 const reader=response.body?.getReader();if(!reader)throw new Error('empty_response');
 let size=0;const parts=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw new Error('response_limit');parts.push(Buffer.from(value));}}catch(error){await reader.cancel().catch(()=>{});throw error;}
 return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export async function postReview(url,token,request,{signal,fetchImpl=fetch}={}){
 if(typeof token!=='string'||!token||/[\r\n]/.test(token))throw new Error('Set a development access token in Changeproof SecretStorage.');
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),LIMITS.timeoutMs+5000);
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 try{
  const response=await fetchImpl(backendUrl(url)+'/v1/reviews',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(request),redirect:'error',signal:controller.signal});
  if(!response.ok){const known={401:'Authentication failed. Set the backend access token again.',429:'Review quota or provider rate limit reached. Try later.',503:'Review service or provider is unavailable.',504:'Review provider timed out.',502:'Provider output was malformed or had ungrounded references.',413:'Review request exceeds the service limit.'};throw new Error(known[response.status]||'Review service rejected the request (HTTP '+response.status+').');}
  return await boundedJson(response,LIMITS.outputBytes);
 }catch(error){if(controller.signal.aborted)throw new Error(signal?.aborted?'AI review cancelled.':'AI review timed out.');if(error instanceof TypeError)throw new Error('AI review service could not be reached. Check the user-level backend URL.');throw error;}
 finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
