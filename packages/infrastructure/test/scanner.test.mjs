import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';
import {emptyInfrastructure,scanInfrastructure,normalizeCheckov} from '../src/scanner.mjs';import {GUARD} from '../src/guard.mjs';
const root=path.resolve('samples/showcase');
test('infrastructure never invents HEAD comparison; absent tool is not assessed and creates no sample',async t=>{
 assert.equal((await scanInfrastructure(root,{mode:'changes'})).status,'not_assessed');
 const result=await scanInfrastructure(root,{checkovPath:'/no/such/checkov'});assert.equal(result.status,'not_assessed');assert.ok(result.files_inspected.length>=4);assert.equal(result.findings.length,0);assert.equal(result.errors[0].code,'missing_checkov');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cp-empty-infra-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));assert.equal((await scanInfrastructure(dir)).status,'not_applicable');assert.deepEqual(fs.readdirSync(dir),[]);
});
test('scanner JSON is normalized without values and rejects escaped paths/ranges/policies',()=>{
 const files=new Map([['Dockerfile','FROM synthetic\nCMD example\n']]);
 const raw={check_type:'dockerfile',results:{failed_checks:[{check_id:'CKV_DOCKER_3',file_path:'/Dockerfile',file_line_range:[1,2],code_block:[[1,'SECRET_NEVER_REPORT']],check_name:'SECRET_NEVER_REPORT'}],passed_checks:[],skipped_checks:[]}};
 const out=emptyInfrastructure();out.frameworks.find(f=>f.framework==='dockerfile').files=1;normalizeCheckov(raw,files,null,out);assert.equal(out.findings.length,1);assert.equal(out.findings[0].newly_introduced,null);assert.ok(!JSON.stringify(out).includes('SECRET_NEVER_REPORT'));
 for(const patch of [{file_path:'/../outside'},{file_line_range:[1,999]},{check_id:'UNKNOWN'}]){const altered=structuredClone(raw);Object.assign(altered.results.failed_checks[0],patch);assert.throws(()=>normalizeCheckov(altered,files,null,emptyInfrastructure()));}
});
test('ignore rules, exclusions and symbolic links constrain configuration snapshots',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cp-infra-boundary-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.writeFileSync(path.join(dir,'.gitignore'),'ignored.tf\n');fs.writeFileSync(path.join(dir,'ignored.tf'),'SYNTHETIC_LITERAL_NEVER_EMIT');fs.writeFileSync(path.join(dir,'.env.tf'),'SYNTHETIC_LITERAL_NEVER_EMIT');fs.symlinkSync('/etc/passwd',path.join(dir,'outside.tf'));const result=await scanInfrastructure(dir);assert.equal(result.files_inspected.length,0);assert.ok(result.skipped_files.some(s=>s.reason==='symlink'));assert.ok(!JSON.stringify(result).includes('SYNTHETIC_LITERAL_NEVER_EMIT'));
});
test('early Python guard denies network, subprocess and outside reads without executing target code',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cp-guard-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const outside=path.join(os.tmpdir(),'cp-outside-'+Date.now());fs.writeFileSync(outside,'private');t.after(()=>fs.rmSync(outside,{force:true}));fs.writeFileSync(path.join(dir,'sitecustomize.py'),GUARD);
 const script="import socket,subprocess\nfor f in [lambda: socket.socket().connect(('127.0.0.1',9)), lambda: subprocess.run(['true']), lambda: open("+JSON.stringify(outside)+")]:\n try: f()\n except PermissionError: pass\n";
 const platformRead=process.platform==='darwin'?"\nimport sys, platform\nassert platform.architecture()[0] in ('32bit','64bit')\nwith open('/System/Library/CoreServices/SystemVersion.plist','rb') as f:\n assert f.read(8)\ntry: open('/System/Library/CoreServices/ChangeproofPrivate.plist')\nexcept PermissionError: pass\nelse: raise AssertionError('Neighboring system file must stay blocked')\n":'';
 execFileSync('python3',['-c',script+platformRead],{cwd:dir,env:{PATH:process.env.PATH,PYTHONPATH:dir,PYTHONDONTWRITEBYTECODE:'1',CHANGEPROOF_SCAN_ROOT:dir,CHANGEPROOF_TOOL_ROOT:dir},stdio:'pipe'});const events=JSON.parse(fs.readFileSync(path.join(dir,'guard-events.json')));assert.ok(events.network>=1);assert.ok(events.subprocess>=1);assert.ok(events.outside_read>=1);
});
test('pinned real Checkov scans all four frameworks offline and provides navigable policy evidence',{skip:!process.env.CHANGEPROOF_TEST_CHECKOV},async()=>{
 const r=await scanInfrastructure(root,{checkovPath:process.env.CHANGEPROOF_TEST_CHECKOV});assert.equal(r.status,'assessed',JSON.stringify(r));assert.equal(r.guard.active,true);assert.equal(r.guard.network,0);assert.equal(r.guard.subprocess,0);assert.equal(r.guard.outside_read,0);assert.equal(r.guard.outside_write,0);
 for(const id of ['CKV_AWS_24','CKV_AWS_20','CKV_K8S_16','CKV_K8S_17','CKV_DOCKER_3','CKV2_GHA_1','CKV_GHA_1'])assert.ok(r.findings.some(f=>f.rule_id===id),id);
 for(const f of r.findings){assert.equal(f.runtime_verification,false);assert.equal(f.newly_introduced,null);assert.ok(fs.existsSync(path.join(root,f.location.file)));}
});

test('safe configuration controls do not produce the selected unsafe-policy findings',{skip:!process.env.CHANGEPROOF_TEST_CHECKOV},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cp-safe-infra-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.cpSync(root,dir,{recursive:true});
 for(const [name,changes] of Object.entries({'main.tf':[['0.0.0.0/0','10.0.0.0/8'],['public-read','private']],'pod.yaml':[['hostPID: true','hostPID: false'],['privileged: true','privileged: false']],'.github/workflows/demo.yml':[['permissions: write-all','permissions: read-all'],['ACTIONS_ALLOW_UNSECURE_COMMANDS: true','ACTIONS_ALLOW_UNSECURE_COMMANDS: false']]})){
  const p=path.join(dir,name);let s=fs.readFileSync(p,'utf8');for(const [a,b] of changes)s=s.replace(a,b);fs.writeFileSync(p,s);
 }
 fs.appendFileSync(path.join(dir,'Dockerfile'),'USER 1000\n');const r=await scanInfrastructure(dir,{checkovPath:process.env.CHANGEPROOF_TEST_CHECKOV});assert.equal(r.status,'assessed',JSON.stringify(r));assert.equal(r.findings.length,0);assert.ok(r.frameworks.every(f=>f.checks>0));assert.equal(r.guard.network,0);
});
