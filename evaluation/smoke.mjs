import {getHealth,runSyntheticSmoke} from '../packages/ai/src/connection.mjs';
try{
 const args=process.argv.slice(2);if(args.length!==3||args[0]!=='--live'||args[1]!=='--model')throw new Error('Use npm run check:ai -- --live --model MODEL. Sends one built-in synthetic request, no workspace code.');
 const url=process.env.REVIEW_API_URL||'http://127.0.0.1:4318';const health=await getHealth(url);
 if(health.provider!=='groq'||health.model!==args[2])throw new Error('Live synthetic check requires the exact configured Groq model; no mock or model fallback.');
 if(!process.env.REVIEW_ACCESS_TOKEN)throw new Error('Configure REVIEW_ACCESS_TOKEN for the development backend.');
 const controller=new AbortController();process.once('SIGINT',()=>controller.abort());const result=await runSyntheticSmoke(url,process.env.REVIEW_ACCESS_TOKEN,health,{signal:controller.signal});console.log(JSON.stringify(result,null,2));
}catch(error){console.error(JSON.stringify({status:'failed',connection_contract:'not verified',detection_accuracy:'not measured',code:error.code||'setup_error',message:['Use npm','Live synthetic','Configure REVIEW'].some(p=>error.message?.startsWith(p))?error.message:'Check backend health, access token, provider/model and schema compatibility. No retry or fallback was attempted.',timestamp:new Date().toISOString()}));process.exitCode=2;}
