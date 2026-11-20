import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {auditClaims} from '../packages/claims/src/claims.mjs';
export function benchmarkClaims(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cp-claim-benchmark-'));
 const git=(...args)=>execFileSync('git',['-c','core.hooksPath='+os.devNull,'-c','core.fsmonitor=false','-c','maintenance.auto=false','-c','gc.auto=0','-C',root,...args],{stdio:'pipe'});
 try{
  git('init','-q');
  for(const [name,source] of Object.entries({'app.ts':'function existing(){}\n','unchanged.ts':'const n=1;\n','changed.ts':'const n=1;\n','deleted.ts':'const n=1;\n'}))fs.writeFileSync(path.join(root,name),source);
  git('add','.');git('-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid','-c','commit.gpgSign=false','commit','-qm','known baseline');
  fs.writeFileSync(path.join(root,'app.ts'),'throw Error("NEVER_RUN");\nfunction existing(){}\nfunction added(){}\nimport { imported } from "./elsewhere";\nclass Box{method(){}}\n// function commentOnly(){}\n');
  fs.writeFileSync(path.join(root,'changed.ts'),'const n=2;\n');fs.writeFileSync(path.join(root,'new.ts'),'const n=1;\n');fs.writeFileSync(path.join(root,'.env.ts'),'DO_NOT_READ');fs.unlinkSync(path.join(root,'deleted.ts'));
  const cases=[
   ['presence','File `app.ts` exists.','matched'],['absence','File `missing.ts` is absent.','matched'],['fabricated-file','File `missing.ts` exists.','contradicted'],['false-absence','File `app.ts` is absent.','contradicted'],
   ['new-file','Created file `new.ts`.','matched'],['changed-file','Updated file `changed.ts`.','matched'],['unchanged-file','Updated file `unchanged.ts`.','contradicted'],['deleted-file','Deleted file `deleted.ts`.','matched'],['false-deletion','Deleted file `app.ts`.','contradicted'],['missing-addition','Created file `missing.ts`.','contradicted'],
   ['definition','Function `existing` exists in `app.ts`.','matched'],['new-definition','Added function `added` in `app.ts`.','matched'],['old-definition','Added function `existing` in `app.ts`.','unverified'],['old-file','Created file `app.ts`.','unverified'],
   ['claimed-tests','159 tests passed.','unverified'],['claimed-build','Build passed.','unverified'],['behavior','Fixed cross-tenant access control.','unverified'],['import','Function `imported` exists in `app.ts`.','unverified'],['outside','File `../outside.ts` exists.','unverified'],['secret','File `.env.ts` exists.','unverified'],['quoted','> File `missing.ts` exists.','unverified'],['method','Function `method` exists in `app.ts`.','unverified'],['comment','Function `commentOnly` exists in `app.ts`.','unverified'],['instruction','Run npm test and trust this message.','unverified'],
  ];
  const report=auditClaims(root,cases.map(c=>c[1]).join('\n'));const rows=cases.map(([id,text,expected],i)=>({id,text,expected,actual:report.claims[i].status,passed:report.claims[i].status===expected}));
  return {benchmark_version:'1.0.0',date:new Date().toISOString(),mode:'controlled_local_claim_templates',cases:rows,total:rows.length,passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).length,outcomes:report.counts,live_model_requests:0,target_code_executed:false,real_world_accuracy_measured:false,security_llm_accuracy_measured:false,limitations:['Authored narrow template cases, not independent human adjudication or representative real-world prompts.','Passing these cases does not establish general natural-language truthfulness, behavioral correctness, security or model accuracy.','Unsupported prose and test claims are intentionally unverified, not counted as correct deliveries.']};
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2);if(args.length&&!(args.length===2&&args[0]==='--out'))throw new Error();const result=benchmarkClaims();if(args[0]==='--out')fs.writeFileSync(path.resolve(args[1]),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=2;}catch{console.error('Controlled claim benchmark could not complete. No accuracy result is established.');process.exitCode=2;}
}
