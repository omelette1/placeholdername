import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {inspectDetailed} from '../src/rule.mjs';
import {lineRanges,analyze} from '../src/engine.mjs';
const check=code=>inspectDetailed('app.ts','',code,lineRanges('',code));
test('fresh source after unrelated await is detected with partial coverage',()=>{
 const r=check('async function route(req){const body=await req.json();const value=req.headers.authorization;console.log(value);}');
 assert.equal(r.findings.length,1);assert.equal(r.findings[0].rule_id,'CP002');assert.equal(r.coverage[0].status,'partial');
 assert.ok(r.limitations.some(l=>l.code==='unresolved_expression'));
});
test('unknown boundaries cannot preserve old taint or invent sanitized flow',()=>{
 for (const body of ['const x=req.headers.authorization;unknown();console.log(x);', 'const x=req.headers.authorization;const y=redact(x);console.log(y);', 'const x=req.headers.authorization;const body=await req.json();console.log(x);']) {
  const r=check('async function route(req){'+body+'}');
  assert.equal(r.findings.length,0);assert.equal(r.coverage[0].status,'partial');
 }
});
test('unsupported code is visible even without a finding',()=>{
 for(const code of ['const value=req.headers.authorization;console.log(value);', 'function f({headers}){console.log(headers);}', 'const f=(req)=>req.headers.authorization;']) {
  const r=check(code);assert.equal(r.findings.length,0);assert.ok(r.coverage.some(s=>s.status==='unsupported'));assert.ok(r.limitations.length);
 }
});
test('supported straight-line function is analyzed, helpers remain unsupported',()=>{
 assert.equal(check('function f(req){const x=req.headers.authorization;console.log(x);}').coverage[0].status,'analyzed');
 const r=check('function f(req){debug(req.headers.authorization);}');assert.equal(r.coverage[0].status,'unsupported');assert.equal(r.findings.length,0);
});
test('branch return and object mutation do not resume as proven straight-line paths',()=>{
 for (const b of ['if(flag){return;} const x=req.headers.authorization;console.log(x);','req.headers.authorization="public";console.log(req.headers.authorization);'])assert.equal(check('function f(req){'+b+'}').findings.filter(f=>f.rule_id==='CP002').length,0);
});
test('report coverage includes skips and distinguishes no changes from analyzed', async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cp-coverage-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',['-C',root,...args],{stdio:'ignore'});
 git('init','-q');fs.writeFileSync(path.join(root,'app.ts'),'function f(req){}');git('add','.');git('-c','user.name=Test','-c','user.email=test@example.invalid','-c','commit.gpgSign=false','commit','-qm','baseline');
 assert.equal(analyze(root).coverage.status,'not_analyzed');
 fs.writeFileSync(path.join(root,'app.ts'),'function f(req){const x=req.headers.authorization;console.log(x);}');
 let r=analyze(root);assert.equal(r.analysis_complete,true);assert.equal(r.coverage.status,'analyzed');
 fs.writeFileSync(path.join(root,'app.ts'),'const x=req.headers.authorization;console.log(x);');
 r=analyze(root);assert.equal(r.analysis_complete,true);assert.equal(r.coverage.status,'unsupported');assert.ok(r.coverage.unsupported_scopes>0);
 fs.writeFileSync(path.join(root,'app.ts'),'async function f(req){await req.json();const x=req.headers.authorization;console.log(x);}');
 fs.writeFileSync(path.join(root,'new.ts'),'console.log(password);');
 r=analyze(root);assert.equal(r.coverage.status,'partial');assert.equal(r.coverage.partial_scopes,1);assert.equal(r.coverage.unassessed_files,1);assert.equal(r.findings.length,1);
 const {default:Ajv}=await import('ajv/dist/2020.js');const validate=new Ajv({strict:true}).compile(JSON.parse(fs.readFileSync(new URL('../../../docs/report.schema.json',import.meta.url))));assert.equal(validate(r),true,JSON.stringify(validate.errors));
});
