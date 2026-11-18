#!/usr/bin/env node
import {analyze,emptyReport} from './engine.mjs';
const args=process.argv.slice(2);
const usage='Usage: changeproof <project-path> [--mode current|changes]';
if(args.length===1&&['--help','-h'].includes(args[0]))console.log(usage+'\nDefault: changes since HEAD. Current mode needs no Git or baseline. JSON on stdout; exit 0 means processing completed, not security. Exit 2 means processing/usage errors.');
else {
 let mode='changes',project,valid=true;
 for(let i=0;i<args.length;i++){if(args[i]==='--mode'){if(!args[i+1]||!['current','changes'].includes(args[i+1])){valid=false;break;}mode=args[++i];}else if(args[i].startsWith('--')||project!==undefined){valid=false;break;}else project=args[i];}
 if(!valid||!project){console.log(JSON.stringify({...emptyReport(),analysis_errors:[{code:'usage',file:null,message:usage}]}));process.exitCode=2;}
 else try{const result=analyze(project,{mode});console.log(JSON.stringify(result,null,2));process.exitCode=result.analysis_errors.length?2:0;}catch{console.log(JSON.stringify({...emptyReport(),analysis_errors:[{code:'internal_error',file:null,message:'Analysis failed; no source values were emitted.'}]}));process.exitCode=2;}
}
