import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export function configureLocal(directory=root){
 const server=path.join(directory,'services/review-api/.env'),evaluation=path.join(directory,'evaluation/.env');
 const read=file=>{if(fs.existsSync(file)){if(fs.lstatSync(file).isSymbolicLink()||!fs.statSync(file).isFile())throw new Error('Refusing non-regular env file.');return fs.readFileSync(file,'utf8');}return fs.readFileSync(file+'.example','utf8');};
 const get=(text,key)=>{const raw=text.match(new RegExp('^'+key+'=(.*)$','m'))?.[1]?.trim()||'';return raw.replace(/^(["'])(.*)\1$/,'$2');};
 let a=read(server),b=read(evaluation);let token=get(a,'REVIEW_ACCESS_TOKEN');
 if(token&&(token.length<32||/\s/.test(token)))throw new Error('Existing development token is invalid; no files were changed.');
 token||=crypto.randomBytes(32).toString('hex');
 const set=(text,key,value)=>new RegExp('^'+key+'=.*$','m').test(text)?text.replace(new RegExp('^'+key+'=.*$','m'),()=>key+'='+value):text.replace(/\n?$/,'\n')+key+'='+value+'\n';
 a=set(a,'REVIEW_ACCESS_TOKEN',token);b=set(b,'REVIEW_ACCESS_TOKEN',token);
 // Preserve all other configuration, including the server's existing Groq key.
 fs.writeFileSync(server,a,{mode:0o600});fs.chmodSync(server,0o600);
 fs.writeFileSync(evaluation,b,{mode:0o600});fs.chmodSync(evaluation,0o600);
 return {groq_key_present:!!get(a,'GROQ_API_KEY'),tokens_configured:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=configureLocal();console.log('Development access tokens configured; existing Groq configuration preserved. Groq key '+(result.groq_key_present?'present.':'not configured.'));}
 catch{console.error('Local configuration could not be completed safely. Existing invalid or non-regular env files are not replaced.');process.exitCode=2;}
}
