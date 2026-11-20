import {auditClaims,CLAIM_LIMITS} from './claims.mjs';
async function main(){
let bytes=0;const chunks=[];
try{
  if(process.argv.length!==3)throw new Error();
  for await(const part of process.stdin){bytes+=part.length;if(bytes>CLAIM_LIMITS.responseBytes)throw new Error();chunks.push(part);}
  const input=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
  console.log(JSON.stringify(auditClaims(process.argv[2],input)));
}catch{console.log(JSON.stringify({schema_version:'1.0.0',kind:'claim_audit_error',error:'Claim audit could not complete. Choose a readable folder and paste at most 32 KiB of response text.'}));process.exitCode=2;}
}
void main();
