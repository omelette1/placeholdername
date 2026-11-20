import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadCases,fixtureProvenance} from './harness.mjs';

// Internal tests of our committed, reviewed synthetic fixtures ONLY. This is
// never imported by the scanner/extension and accepts no target-project path.
// node:vm is not an OS security sandbox for arbitrary or model-generated code.
export function verifyFixtures(){
  const commit=fixtureProvenance(),fixtures=loadCases(),rows=[];
  let invocations=0;
  const secret='synthetic-private-marker',body='synthetic-document-body';
  function invoke(source,expression,inputs={}){
    const logs=[];
    const context=vm.createContext({...structuredClone(inputs),console:{log:(...args)=>logs.push(args)},res:{json:value=>JSON.parse(JSON.stringify(value))}},{codeGeneration:{strings:false,wasm:false}});
    invocations++;
    try{return{allowed:true,value:new vm.Script(source+'\n'+expression,{filename:'owned-synthetic-fixture.js'}).runInContext(context,{timeout:100}),logs};}
    catch(error){if(error.message==='denied')return{allowed:false,logs};throw new Error('Unexpected synthetic fixture execution error.');}
  }
  const logged=run=>run.logs.some(args=>args.includes(secret));
  const hasPrivate=run=>run.allowed&&JSON.stringify(run.value).includes(secret);
  for(const fixture of fixtures){
    const id=fixture.metadata.id,observe=source=>{
      if(['R01-header-logging','S01-safe-redaction'].includes(id))return {credential_logged:logged(invoke(source,'handle(req)',{req:{headers:{authorization:secret}}}))};
      if(['R02-private-response','S04-public-field'].includes(id)){
        const run=invoke(source,'publicProfile(record,res)',{record:{displayName:'Public name',description:'Public description',privateSecret:secret}});
        return{private_field_disclosed:hasPrivate(run),public_name_preserved:run.value?.displayName==='Public name'};
      }
      if(['R03-owner-check','S02-equivalent-owner','S03-helper-protection'].includes(id)){
        const expression=id==='S03-helper-protection'?'route(req,doc,res)':'readDocument(req,doc)';
        const doc={ownerId:'alice',body};
        const denied=invoke(source,expression,{req:{user:{id:'bob'}},doc}),owner=invoke(source,expression,{req:{user:{id:'alice'}},doc});
        return {nonowner_allowed:denied.allowed,owner_allowed:owner.allowed,nonowner_receives_body:denied.allowed&&(denied.value===body||denied.value?.body===body)};
      }
      if(id==='R04-tenant-check'){
        const record={tenantId:'tenant-a',body};
        const cross=invoke(source,'tenantRecord(req,record)',{req:{user:{id:'bob'},tenantId:'tenant-b'},record});
        const own=invoke(source,'tenantRecord(req,record)',{req:{user:{id:'alice'},tenantId:'tenant-a'},record});
        return{other_tenant_allowed:cross.allowed,own_tenant_allowed:own.allowed,other_tenant_receives_body:cross.allowed&&cross.value===body};
      }
      return null;
    };
    const before=observe(fixture.before),after=observe(fixture.after);
    if(before===null){rows.push({id,status:'not_executed',reason:'No complete authored classification/policy contract. No invented runtime verdict.'});continue;}
    let confirmed=false;
    if(id==='R01-header-logging')confirmed=!before.credential_logged&&after.credential_logged;
    if(id==='R02-private-response')confirmed=!before.private_field_disclosed&&after.private_field_disclosed;
    if(id==='R03-owner-check')confirmed=!before.nonowner_allowed&&after.nonowner_receives_body&&before.owner_allowed&&after.owner_allowed;
    if(id==='R04-tenant-check')confirmed=!before.other_tenant_allowed&&after.other_tenant_receives_body&&before.own_tenant_allowed&&after.own_tenant_allowed;
    if(id==='S01-safe-redaction')confirmed=!before.credential_logged&&!after.credential_logged;
    if(['S02-equivalent-owner','S03-helper-protection'].includes(id))confirmed=!before.nonowner_allowed&&!after.nonowner_allowed&&before.owner_allowed&&after.owner_allowed;
    if(id==='S04-public-field')confirmed=!before.private_field_disclosed&&!after.private_field_disclosed&&before.public_name_preserved&&after.public_name_preserved;
    rows.push({id,status:confirmed?'fixture_contract_confirmed':'fixture_contract_failed',authored_expectation:fixture.metadata.expected_outcome,before,after});
  }
  return {report_version:'1.0.0',date:new Date().toISOString(),fixture_commit:commit,fixture_set_sha256:crypto.createHash('sha256').update(JSON.stringify(fixtures)).digest('hex'),fixture_cases:fixtures.length,executed_fixture_cases:rows.filter(r=>r.status!=='not_executed').length,controlled_function_invocations:invocations,failed_contracts:rows.filter(r=>r.status==='fixture_contract_failed').length,cases:rows,real_project_runtime_verification:false,limitations:['Only our committed synthetic fixtures were executed, never an uploaded/selected project or model-generated code.','These tests confirm fixture behavior under explicit stubbed identity, response and logging contracts; they do not verify a deployed application.','No inferred classification is assigned to the four insufficient-context fixtures.','This checks test-set expectations, not correctness of each LLM security claim or real-world accuracy.','node:vm is an execution convenience for these reviewed fixtures, not an isolation guarantee for untrusted code.']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);if(args.length&&!(args.length===2&&args[0]==='--out'))throw new Error();
    const report=verifyFixtures(),json=JSON.stringify(report,null,2)+'\n';
    if(args[0]==='--out')fs.writeFileSync(path.resolve(args[1]),json,{flag:'wx',mode:0o600});
    console.log(json);if(report.failed_contracts)process.exitCode=2;
  }catch{console.error('Synthetic fixture verification failed. Only committed unchanged built-in fixtures and a new output path are accepted.');process.exitCode=2;}
}
