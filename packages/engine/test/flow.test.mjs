import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {inspectDetailed} from '../src/rule.mjs';
import {analyze, lineRanges} from '../src/engine.mjs';
const review=(after,before='')=>inspectDetailed('app.ts',before,after,lineRanges(before,after));
const fn=body=>`function review(req) {\n${body}\n}\n`;
const flows=result=>result.findings.filter(f=>f.rule_id==='CP002');

test('source, declaration, assignment, alias, sink, comparison and runtime evidence',()=>{
 const result=review(fn('const raw = req.headers.authorization;\nlet payload;\npayload = raw;\nconst debugValue = payload;\nconsole.log(debugValue);'));
 assert.equal(result.findings.length,1);const f=result.findings[0];assert.equal(f.rule_id,'CP002');assert.equal(f.newly_introduced,true);assert.equal(f.runtime_verification,false);
 const p=f.evidence.paths[0];assert.equal(p.source.location.start.line,2);assert.deepEqual(p.assignments.map(a=>[a.variable,a.location.start.line]),[['raw',2],['payload',4],['debugValue',5]]);assert.equal(p.logging.location.start.line,6);assert.equal(p.comparison,'not_matched_in_HEAD');
});
test('direct dot, bracket and Headers.get reads, including direct console arguments',()=>{
 for(const read of ['req.headers.authorization','req.headers["authorization"]','req["headers"]["Authorization"]','req.headers.get("authorization")']){
  const r=review(fn(`console.warn(${read});`));assert.equal(r.findings.length,1);assert.equal(r.findings[0].rule_id,'CP002');assert.equal(r.findings[0].evidence.paths[0].assignments.length,0);
 }
 const r=review('function review(headers) { const value = headers.get("Authorization"); console.log(value); }');assert.equal(flows(r).length,1);
});
test('supported JavaScript/TypeScript function forms and wrappers',()=>{
 for(const code of ['async function review(req) { const raw = req.headers.authorization; console.log(raw); }','const review = (req) => { const raw = req.headers.authorization; console.log(raw); };','const review = function(req) { console.log(req.headers.authorization); };','class C { review(req: Request) { const raw = (req.headers.authorization as string)!; console.log(raw); } }'])assert.equal(flows(review(code)).length,1);
});
test('reassignment kills original value; an earlier alias retains its copied value',()=>{
 assert.equal(flows(review(fn('let raw = req.headers.authorization;\nraw = "public";\nconsole.log(raw);'))).length,0);
 const r=review(fn('let raw = req.headers.authorization;\nconst copied = raw;\nraw = "public";\nconsole.log(copied);'));assert.equal(flows(r).length,1);
 assert.deepEqual(flows(r)[0].evidence.paths[0].assignments.map(a=>a.variable),['raw','copied']);
});
test('safe headers, comments, strings and unrelated values do not produce flow findings',()=>{
 for(const body of ['const raw = req.headers.accept;\nconsole.log(raw);','// const raw = req.headers.authorization;\nconst raw = "req.headers.authorization";\nconsole.log(raw);','const raw = "safe";\nconsole.log(raw);','const raw = req.headers.authorization;\nconsole.log("static message");'])assert.equal(flows(review(fn(body))).length,0);
});
test('new source assignment is detected even when logging line is unchanged',()=>{
 const old=fn('const raw = "public";\nconst payload = raw;\nconsole.log(payload);');
 const next=old.replace('"public"','req.headers.authorization');const r=review(next,old);
 assert.equal(flows(r).length,1);assert.equal(flows(r)[0].newly_introduced,true);assert.equal(flows(r)[0].location.start.line,4);
});
test('unrelated safe change yields no finding; formatting, aliases and labels are not new paths',()=>{
 const old=fn('const raw = req.headers.authorization;\nconsole.log("old", raw);\nconst counter = 1;');
 assert.equal(flows(review(old.replace('counter = 1','counter = 2'),old)).length,0);
 for(const next of [old.replace('"old"','"new"'),old.replace('console.log','const copied = raw;\nconsole.log').replace('"old", raw','"old", copied'),old.replace('const raw =','const raw   =')]){
  const r=flows(review(next,old));assert.equal(r.length,1);assert.equal(r[0].newly_introduced,false);
 }
 assert.equal(flows(review(old.replace('req.headers.authorization','"safe"'),old)).length,0);
});
test('duplicate newly added sink cannot consume original HEAD match',()=>{
 const old=fn('const raw = req.headers.authorization;\nconsole.log(raw);');
 const r=flows(review(old.replace('console.log(raw);','console.log(raw);\nconsole.log(raw);'),old));assert.equal(r.filter(f=>f.newly_introduced).length,1);
});
test('unresolved calls and transformations produce limitations, not invented paths',()=>{
 for(const body of ['const raw = req.headers.authorization;\nconst display = redact(raw);\nconsole.log(display);','const raw = req.headers.authorization;\nconsole.log(String(raw));','const raw = req.headers.authorization;\nconst display = `masked ${raw}`;\nconsole.log(display);','const raw = req.headers.authorization;\nunknown();\nconsole.log(raw);']){
  const r=review(fn(body));assert.equal(flows(r).length,0);assert.ok(r.limitations.some(n=>['unresolved_call','unresolved_expression'].includes(n.code)&&n.revision==='working_tree'));
 }
});
test('branches, destructuring, object mutation and await explicitly stop flow tracking',()=>{
 for(const code of [fn('let raw = req.headers.authorization;\nif (flag) raw = "safe";\nconsole.log(raw);'),fn('const {authorization: raw} = req.headers;\nconsole.log(raw);'),fn('req.headers.authorization = "safe";\nconsole.log(req.headers.authorization);'),'async function review(req) { const raw = await req.headers.authorization; console.log(raw); }']){
  const r=review(code);assert.equal(flows(r).length,0);assert.ok(r.limitations.length);
 }
});
test('no cross-function, captured-variable, top-level, return or unreachable path inference',()=>{
 for(const code of ['function source(req) { const raw = req.headers.authorization; } function sink(){ console.log(raw); }',fn('const raw = req.headers.authorization;\nfunction inner(){ console.log(raw); }'),'const raw = req.headers.authorization;\nconsole.log(raw);',fn('return;\nconst raw = req.headers.authorization;\nconsole.log(raw);')])assert.equal(flows(review(code)).length,0);
});
test('local console shadowing prevents resolved flow claim',()=>{
 for(const code of ['function review(req, console) { console.log(req.headers.authorization); }',fn('function console() {}\nconst raw = req.headers.authorization;\nconsole.log(raw);')]){
  const r=review(code);assert.equal(flows(r).length,0);assert.ok(r.limitations.some(n=>n.code==='shadowed_console'));
 }
});
test('unknown baseline gives unknown newness, not an invented new path',()=>{
 const old=fn('const raw = req.headers.authorization;\nif (flag) {}\nconsole.log(raw);');
 const next=old.replace('if (flag) {}','const counter = 1;');const r=flows(review(next,old));assert.equal(r.length,1);assert.equal(r[0].newly_introduced,null);assert.equal(r[0].evidence.paths[0].comparison,'unknown_baseline_limitations');
});
test('CP001 preserved and deduplicated when CP002 resolves the same sink',()=>{
 const result=review(fn('const authorization = req.headers.authorization;\nconsole.log(authorization);\nconsole.warn(password);'));
 assert.deepEqual(result.findings.map(f=>f.rule_id),['CP002','CP001']);assert.deepEqual(result.findings[0].evidence.related_rules,['CP001']);
});
test('real Git comparison and schema include paths and unresolved limitation notes, without literals',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'changeproof-flow-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',['-C',root,...args],{stdio:'ignore'});
 git('init','-q');git('config','user.email','test@example.invalid');git('config','user.name','Synthetic');
 const before=fn('const raw = "SYNTHETIC_LITERAL_NOT_FOR_OUTPUT";\nconst payload = raw;\nconsole.log(payload);');fs.writeFileSync(path.join(root,'app.ts'),before);git('add','.');git('-c','core.hooksPath=/dev/null','commit','-qm','baseline');
 const after=before.replace('"SYNTHETIC_LITERAL_NOT_FOR_OUTPUT"','req.headers.authorization')+'\nfunction unresolved(req){ const raw=req.headers.authorization; const masked=redact(raw); console.log(masked); }';
 fs.writeFileSync(path.join(root,'app.ts'),after);git('add','.');
 const r=analyze(root);assert.equal(r.findings.length,1);assert.equal(r.findings[0].rule_id,'CP002');assert.equal(r.findings[0].newly_introduced,true);assert.ok(r.analysis_limitations.some(n=>n.code==='unresolved_call'));assert.ok(!JSON.stringify(r).includes('SYNTHETIC_LITERAL_NOT_FOR_OUTPUT'));
 const {default:Ajv}=await import('ajv/dist/2020.js');const validate=new Ajv({strict:true}).compile(JSON.parse(fs.readFileSync(new URL('../../../docs/report.schema.json',import.meta.url))));assert.equal(validate(r),true,JSON.stringify(validate.errors));
});

test('function rename is an uncertain identity match rather than a newly invented exposure',()=>{
 const old=fn('const raw = req.headers.authorization;\nconsole.log(raw);');
 const r=flows(review(old.replace('review(req)','renamed(req)'),old));assert.equal(r.length,1);assert.equal(r[0].newly_introduced,null);assert.equal(r[0].evidence.paths[0].comparison,'unknown_function_identity');
});

test('deleting a safe reassignment introduces a path without adding a logging line',()=>{
 const old=fn('let raw = req.headers.authorization;\nraw = "public";\nconsole.log(raw);');
 const next=old.replace('raw = "public";\n','');const r=flows(review(next,old));assert.equal(r.length,1);assert.equal(r[0].newly_introduced,true);assert.equal(r[0].evidence.paths[0].assignments.length,1);
});

test('var redeclarations without initializers preserve prior flow and parameter bindings',()=>{
 const r=flows(review(fn('var req;\nvar raw = req.headers.authorization;\nvar raw;\nconsole.log(raw);')));assert.equal(r.length,1);assert.equal(r[0].evidence.paths[0].assignments.length,1);
});
