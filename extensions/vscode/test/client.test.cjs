const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {execFileSync}=require('node:child_process');const {runEngine,validateReport}=require('../src/client.cjs');
const cli=path.resolve(__dirname,'../out/cli.cjs');
test('extension client invokes bundled real CLI and receives finding and location',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'changeproof-client-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',['-C',root,...args],{stdio:'ignore'});
 git('init','-q');git('config','user.email','test@example.invalid');git('config','user.name','Synthetic');fs.writeFileSync(path.join(root,'app.ts'),'const n=1;\n');git('add','.');git('-c','core.hooksPath=/dev/null','commit','-qm','baseline');
 fs.appendFileSync(path.join(root,'app.ts'),'console.log(password);\n');
 const r=await runEngine(process.execPath,cli,root);assert.equal(r.findings.length,1);assert.equal(r.findings[0].location.start.line,2);assert.equal(r.runtime_verification,false);
 fs.writeFileSync(path.join(root,'app.ts'),'const n=1;\n');assert.equal((await runEngine(process.execPath,cli,root)).findings.length,0);
});
test('structured CLI error is returned; missing executable rejects',async t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'changeproof-client-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const r=await runEngine(process.execPath,cli,root);assert.equal(r.analysis_errors[0].code,'not_git');await assert.rejects(runEngine('/no/such/node',cli,root),/Node.js was not found/);});
test('invalid schema and escaped locations rejected',()=>{
 assert.throws(()=>validateReport({schema_version:'future'},'/tmp'));
 const report={schema_version:'4.0.0',runtime_verification:false,analysis_complete:true,repository:'/tmp',analysis_errors:[],files_inspected:[],skipped_files:[],untracked_files:[],findings:[{rule_id:'CP001',explanation:'test',limitations:[],location:{file:'../outside.ts',start:{line:1,column:1},end:{line:1,column:2}}}]};assert.throws(()=>validateReport(report,'/tmp'));
});
test('bundled adapter transports CP002 paths and rejects escaped source evidence',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'changeproof-flow-client-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',['-C',root,...args],{stdio:'ignore'});
 git('init','-q');git('config','user.email','test@example.invalid');git('config','user.name','Synthetic');
 fs.writeFileSync(path.join(root,'app.ts'),'const n=1;\n');git('add','.');git('-c','core.hooksPath=/dev/null','commit','-qm','baseline');
 fs.writeFileSync(path.join(root,'app.ts'),'function review(req) { const raw=req.headers.authorization; const payload=raw; console.log(payload); }');
 const r=await runEngine(process.execPath,cli,root);assert.equal(r.schema_version,'4.0.0');assert.equal(r.findings[0].rule_id,'CP002');assert.equal(r.findings[0].evidence.paths[0].assignments.length,2);assert.equal(r.findings[0].runtime_verification,false);
 const bad=structuredClone(r);bad.findings[0].evidence.paths[0].source.location.file='../outside.ts';assert.throws(()=>validateReport(bad,root),/Invalid evidence file/);
});
test('actual CLI invocation trace retains selected arguments, exit 2 and specific errors',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'changeproof-trace-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const trace=[];const r=await runEngine(process.execPath,cli,root,entry=>trace.push(entry));
 assert.equal(r.analysis_errors[0].code,'not_git');assert.deepEqual(trace.map(e=>e.phase),['started','completed']);assert.equal(trace[1].executable,process.execPath);assert.deepEqual(trace[1].arguments,[cli,root]);assert.equal(trace[1].exit_code,2);assert.deepEqual(trace[1].returned_errors,r.analysis_errors);assert.equal(trace[1].analysis_complete,false);assert.ok(!('stdout' in trace[1]));assert.ok(!('stderr' in trace[1]));
 const failure=[];await assert.rejects(runEngine('/no/such/node',cli,root,e=>failure.push(e)));assert.equal(failure[1].exit_code,null);assert.equal(failure[1].process_error,'ENOENT');
});
