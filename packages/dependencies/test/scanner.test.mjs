import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {parseNpmLock,scanDependencies} from '../src/scanner.mjs';
const lock={name:'sample',lockfileVersion:3,packages:{'':{name:'sample',version:'1.0.0'},'node_modules/foo':{version:'1.2.3'},'node_modules/@scope/bar':{version:'2.1.0'},'node_modules/nested/node_modules/foo':{version:'1.2.3'}}};
test('npm lock inventory deduplicates installed versions and omits root',()=>{
 const rows=parseNpmLock(JSON.stringify(lock,null,2));
 assert.deepEqual(rows.map(x=>x.name+'@'+x.version).sort(),['@scope/bar@2.1.0','foo@1.2.3']);
 assert.ok(rows.every(x=>x.line>1));
 assert.throws(()=>parseNpmLock('{"lockfileVersion":1,"packages":{}}'),/unsupported_lockfile/);
});
test('disabled advisory lookup is fail-closed and makes zero requests',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'patch-deps-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,'package-lock.json'),JSON.stringify(lock));
 let called=0;const fetcher=()=>{called++;throw Error('must not call');};
 const r=await scanDependencies(root,{fetcher});
 assert.equal(r.status,'not_assessed');assert.equal(called,0);
});
test('enabled advisory lookup sends names and versions only and maps cited lockfile findings',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'patch-deps-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,'package-lock.json'),JSON.stringify(lock,null,2));
 let payload;
 const fetcher=async(url,options)=>{assert.equal(url,'https://api.osv.dev/v1/querybatch');payload=JSON.parse(options.body);return {ok:true,json:async()=>({results:payload.queries.map(q=>({vulns:q.package.name==='foo'?[{id:'GHSA-aaaa-bbbb-cccc'}]:[]}))})};};
 const r=await scanDependencies(root,{enabled:true,fetcher});
 assert.equal(r.status,'assessed');assert.equal(r.packages_checked,2);assert.equal(r.findings.length,1);
 assert.equal(r.findings[0].rule_id,'DEP001');assert.equal(r.findings[0].location.file,'package-lock.json');assert.ok(r.findings[0].location.start.line>1);
 assert.deepEqual(Object.keys(payload.queries[0]).sort(),['package','version']);
 assert.equal(r.findings[0].runtime_verification,false);assert.equal(r.findings[0].newly_introduced,null);
});
test('HTTP failures and unsupported locks never report clean assessment',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'patch-deps-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,'package-lock.json'),JSON.stringify(lock));
 const fetcher=async()=>({ok:false,status:503});
 const r=await scanDependencies(root,{enabled:true,fetcher});assert.equal(r.status,'not_assessed');assert.ok(r.errors.length);
 fs.writeFileSync(path.join(root,'package-lock.json'),'{"lockfileVersion":1}');
 const other=await scanDependencies(root,{enabled:true,fetcher:()=>{throw Error('should not run');}});
 assert.notEqual(other.status,'assessed');assert.ok(other.errors.length);
});
test('symlinked lockfiles are never read',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'patch-deps-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.symlinkSync('/etc/passwd',path.join(root,'package-lock.json'));
 const r=await scanDependencies(root,{enabled:true,fetcher:()=>{throw Error('should not run');}});
 assert.notEqual(r.status,'assessed');assert.equal(r.packages_checked,0);
});
