import fs from 'node:fs';
import path from 'node:path';
import {evaluate,loadCases,collectFixture} from './harness.mjs';
const args=process.argv.slice(2);
function options(args){const result={};for(let i=0;i<args.length;i++){const key=args[i];if(['--live','--validate'].includes(key))result[key.slice(2)]=true;else if(['--url','--model','--max-requests','--out'].includes(key)&&args[i+1]&&!args[i+1].startsWith('--'))result[key.slice(2)]=args[++i];else throw new Error('Unknown or missing evaluation option.');}if(result.live&&result.validate)throw new Error('Choose --validate or --live.');return result;}
try{
 const opts=options(args);
 if(opts.validate){const cases=loadCases();for(const fixture of cases)collectFixture(fixture);console.log(JSON.stringify({mode:'fixture_validation',cases:cases.length,requests_sent:0,live_inference:'not run',detection_accuracy:'not measured'}));}
 else {
  if(!opts.live)throw new Error('Use --validate for local fixture checks, or --live --max-requests N --model MODEL to explicitly request inference.');
  const controller=new AbortController();process.once('SIGINT',()=>controller.abort());
  const report=await evaluate({live:true,url:opts.url||process.env.REVIEW_API_URL||'http://127.0.0.1:4318',token:process.env.REVIEW_ACCESS_TOKEN,expectedModel:opts.model,maxRequests:Number(opts['max-requests']),signal:controller.signal});
  const json=JSON.stringify(report,null,2)+'\n';if(opts.out){const out=path.resolve(opts.out);if(fs.existsSync(out))throw new Error('Report output already exists; choose a new filename.');fs.writeFileSync(out,json,{flag:'wx',mode:0o600});}console.log(json);
  if(report.cases.some(c=>c.status!=='valid_response'))process.exitCode=2;
 }
}catch(error){console.error(['Explicit','--max-requests','Configure','Set an explicit','Live evaluation','Use --validate','Unknown','Choose','Report output'].some(p=>error.message?.startsWith(p))?error.message:'Evaluation failed before a report was available. Check backend health, configuration and request limits. No credentials or model text were logged.');process.exitCode=2;}
