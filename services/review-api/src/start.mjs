import {createServer} from './server.mjs';
import {groqProvider,mockProvider} from './providers.mjs';
try{
 const number=(key,fallback)=>process.env[key]===undefined?fallback:Number(process.env[key]);
 const provider=process.env.REVIEW_PROVIDER==='mock'?mockProvider():groqProvider({apiKey:process.env.GROQ_API_KEY,model:process.env.GROQ_MODEL||'openai/gpt-oss-120b'});
 const port=number('PORT',4318);if(!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('PORT must be 1024–65535.');
 const app=createServer({accessToken:process.env.REVIEW_ACCESS_TOKEN,provider,concurrency:number('REVIEW_CONCURRENCY',2),requestsPerHour:number('REVIEW_REQUESTS_PER_HOUR',20),bytesPerHour:number('REVIEW_BYTES_PER_HOUR',2000000),timeoutMs:number('REVIEW_TIMEOUT_MS',45000)});
 const address=await app.listen({host:'127.0.0.1',port});console.log('Changeproof review API listening at '+address+'; provider='+provider.name+'. No request/code logging.');
 for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>{void app.close().then(()=>process.exit(0));});
}catch(error){console.error(error.message?.startsWith('REVIEW_')||error.message?.startsWith('GROQ_')||error.message?.startsWith('PORT')?error.message:'Review API could not start. Check configuration, provider and port.');process.exitCode=1;}
