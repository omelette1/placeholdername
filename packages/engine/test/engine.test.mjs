import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {analyze,lineRanges} from '../src/engine.mjs';
import {inspect} from '../src/rule.mjs';
const git=(root,...args)=>execFileSync('git',['-c','core.fsmonitor=false','-C',root,...args],{stdio:['ignore','pipe','pipe']}).toString();
function repo(t,initial={'app.ts':'const status = 1;\n'}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'changeproof-engine-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 git(root,'init','-q');git(root,'config','user.email','fixture@example.invalid');git(root,'config','user.name','Synthetic fixture');
 for(const [file,content] of Object.entries(initial)){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),content);}
 git(root,'add','.');git(root,'-c','core.hooksPath=/dev/null','commit','-qm','fixture baseline');return root;
}
function snapshot(root){const entries=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(entry.isFile())entries.push([path.relative(root,p),fs.readFileSync(p).toString('hex')]);}}walk(root);return entries.sort();}
test('no changes produces empty findings and identifies HEAD',t=>{const root=repo(t);const r=analyze(root);assert.equal(r.analysis_complete,true);assert.equal(r.findings.length,0);assert.equal(r.compared_revision,git(root,'rev-parse','HEAD').trim());assert.equal(r.files_inspected[0].status,'unchanged');assert.equal(r.runtime_verification,false);});
for(const mode of ['staged','unstaged','mixed'])test(`${mode} changes use final working content and preserve repository`,t=>{
 const root=repo(t);
 fs.appendFileSync(path.join(root,'app.ts'),'console.log(accessToken);\n');
 if(mode!=='unstaged')git(root,'add','app.ts');
 if(mode==='mixed')fs.appendFileSync(path.join(root,'app.ts'),'console.warn(password);\n');
 const before=snapshot(root),r=analyze(root);
 assert.equal(r.findings.length,mode==='mixed'?2:1);assert.equal(r.findings[0].location.start.line,2);
 assert.deepEqual(r.files_inspected[0].changed_line_ranges,[{old_start:2,old_count:0,new_start:2,new_count:mode==='mixed'?2:1}]);
 assert.deepEqual(snapshot(root),before);
});
test('staged change undone in worktree has no net finding',t=>{const root=repo(t);fs.appendFileSync(path.join(root,'app.ts'),'console.log(password);\n');git(root,'add','.');fs.writeFileSync(path.join(root,'app.ts'),'const status = 1;\n');assert.equal(analyze(root).findings.length,0);});
test('new tracked, deleted, untracked and secret files are explicit',t=>{
 const root=repo(t,{'app.ts':'console.log(password);\n','.env':'PASSWORD=not-output','binary.ts':Buffer.from([0,1,2]),'node_modules/lib.ts':'console.log(password);\n'});
 fs.unlinkSync(path.join(root,'app.ts'));
 fs.writeFileSync(path.join(root,'new.ts'),'console.log(refreshToken);\n');git(root,'add','new.ts');
 fs.writeFileSync(path.join(root,'untracked.ts'),'console.log(password);\n');fs.writeFileSync(path.join(root,'.env.local'),'SECRET=not-output');
 const r=analyze(root);assert.equal(r.findings.length,1);assert.equal(r.files_inspected.find(f=>f.file==='app.ts').status,'deleted');
 assert.deepEqual(r.files_inspected.find(f=>f.file==='app.ts').changed_line_ranges,[{old_start:1,old_count:1,new_start:1,new_count:0}]);
 assert.ok(r.untracked_files.some(f=>f.file==='untracked.ts'&&!f.excluded));assert.ok(r.untracked_files.some(f=>f.file==='.env.local'&&f.excluded));
 assert.ok(r.skipped_files.some(f=>f.reason==='binary'));assert.ok(r.skipped_files.some(f=>f.reason==='excluded_secret_file'));assert.ok(r.skipped_files.some(f=>f.reason==='excluded_directory'));
 assert.ok(!JSON.stringify(r).includes('not-output'));
});
test('missing HEAD and non-Git return errors; untracked still listed on unborn branch',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'changeproof-unborn-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 assert.equal(analyze(root).analysis_errors[0].code,'not_git');git(root,'init','-q');fs.writeFileSync(path.join(root,'new.ts'),'console.log(password)');
 const r=analyze(root);assert.equal(r.analysis_errors[0].code,'missing_head');assert.equal(r.untracked_files.length,1);
});
test('syntax rule positives and negatives, with no literal output',()=>{
 for(const [fixture,count] of [['vulnerable.ts',5],['harmless.ts',0]]){const text=fs.readFileSync(new URL('fixtures/'+fixture,import.meta.url),'utf8');const findings=inspect(fixture,'',text,lineRanges('',text));assert.equal(findings.length,count);assert.ok(!JSON.stringify(findings).includes('not emitted'));assert.ok(!JSON.stringify(findings).includes('literal-value'));}
});
test('pre-existing logging and formatting do not become newly added findings',()=>{
 const before='console.log(password);\n';const after='console.log( password );\nconst x = 2;\n';assert.equal(inspect('app.ts',before,after,lineRanges(before,after)).length,0);
 const added=before+'console.log(password);\n';assert.equal(inspect('app.ts',before,added,lineRanges(before,added)).length,1);
});
test('multiline changed argument is detected, malformed syntax is an analysis error',t=>{
 const root=repo(t,{'app.ts':'console.log(\n  status\n);\n'});fs.writeFileSync(path.join(root,'app.ts'),'console.log(\n  authorization\n);\n');assert.equal(analyze(root).findings.length,1);
 fs.writeFileSync(path.join(root,'app.ts'),'console.log(password');const r=analyze(root);assert.equal(r.analysis_complete,false);assert.equal(r.analysis_errors[0].code,'parse_error');
});
test('symlinks, unsupported languages and oversize files are skipped',t=>{
 const root=repo(t,{'app.ts':'const n=1;','other.py':'print(1)'});fs.unlinkSync(path.join(root,'app.ts'));fs.symlinkSync('/etc/passwd',path.join(root,'app.ts'));
 fs.writeFileSync(path.join(root,'large.ts'),'x'.repeat(1024*1024+1));git(root,'add','large.ts');const r=analyze(root);
 for(const reason of ['symlink','file_too_large','unsupported_language'])assert.ok(r.skipped_files.some(f=>f.reason===reason));
});
test('no hooks, fsmonitor, textconv, or clean filters execute',t=>{
 const root=repo(t);const sentinel=path.join(root,'EXECUTED');const script=path.join(root,'trap.sh');fs.writeFileSync(script,`#!/bin/sh\ntouch '${sentinel}'\n`);fs.chmodSync(script,0o755);
 git(root,'config','core.fsmonitor',script);git(root,'config','filter.trap.clean',script);git(root,'config','diff.trap.textconv',script);git(root,'config','diff.external',script);git(root,'config','core.hooksPath',root);
 fs.writeFileSync(path.join(root,'.gitattributes'),'*.ts filter=trap diff=trap\n');fs.appendFileSync(path.join(root,'app.ts'),'\nconsole.log(password);\n');
 assert.equal(analyze(root).findings.length,1);assert.equal(fs.existsSync(sentinel),false);
});
test('paths with spaces, tabs, and shell metacharacters are safe',t=>{
 const file='source a\t$(touch SHOULD_NOT_EXIST).ts',root=repo(t,{[file]:'const n=1;\n'});fs.appendFileSync(path.join(root,file),'console.log(password);');const r=analyze(root);assert.equal(r.findings[0].location.file,file);assert.equal(fs.existsSync(path.join(root,'SHOULD_NOT_EXIST')),false);
});

test('versioned schema validates findings, missing HEAD and usage output',async t=>{
 const {default:Ajv}=await import('ajv/dist/2020.js');
 const schema=JSON.parse(fs.readFileSync(new URL('../../../docs/report.schema.json',import.meta.url),'utf8'));
 const validate=new Ajv({strict:true}).compile(schema);
 const root=repo(t);fs.appendFileSync(path.join(root,'app.ts'),'console.log(password);\n');
 const cli=new URL('../src/cli.mjs',import.meta.url);
 for(const args of [[root],[]]){
  let stdout;
  try{stdout=execFileSync(process.execPath,[cli.pathname,...args],{encoding:'utf8'});}catch(error){assert.equal(error.status,2);stdout=error.stdout;}
  const report=JSON.parse(stdout);assert.equal(validate(report),true,JSON.stringify(validate.errors));
 }
 const errors=analyze(path.join(root,'missing'));assert.equal(validate(errors),true,JSON.stringify(validate.errors));
 const unborn=path.join(root,'unborn');fs.mkdirSync(unborn);git(unborn,'init','-q');const noHead=analyze(unborn);assert.equal(noHead.analysis_errors[0].code,'missing_head');assert.equal(validate(noHead),true,JSON.stringify(validate.errors));
});

test('staged removal with leftover untracked copy is a deletion plus untracked path',t=>{
 const root=repo(t);git(root,'rm','--cached','app.ts');const r=analyze(root);
 assert.equal(r.files_inspected[0].status,'deleted');assert.ok(r.untracked_files.some(f=>f.file==='app.ts'));
});
test('JS, JSX and TSX extensions use syntax parsing',()=>{
 for(const file of ['app.js','app.jsx','app.tsx','app.mjs','app.cjs','app.cts','app.mts']){
 const after=file.endsWith('sx')?'const view=<div/>;\nconsole.log(accessToken);':'console.log(accessToken);';
 assert.equal(inspect(file,'',after,lineRanges('',after)).length,1);
 }
});
test('missing local blob is an error without invoking a promisor remote',t=>{
 const root=repo(t);const oid=git(root,'rev-parse','HEAD:app.ts').trim();
 const sentinel=path.join(root,'FETCH_EXECUTED');const script=path.join(root,'remote-trap.sh');fs.writeFileSync(script,`#!/bin/sh\ntouch '${sentinel}'\nexit 1\n`);fs.chmodSync(script,0o755);
 git(root,'config','remote.trap.url','ext::'+script);git(root,'config','remote.trap.promisor','true');git(root,'config','protocol.ext.allow','always');
 fs.unlinkSync(path.join(root,'.git/objects',oid.slice(0,2),oid.slice(2)));
 const r=analyze(root);assert.equal(r.analysis_complete,false);assert.equal(r.analysis_errors[0].code,'git_read_failed');assert.equal(fs.existsSync(sentinel),false);
});

test('changing a label string alone does not newly introduce existing sensitive logging',()=>{
 const before='console.log("old label", password);\n',after='console.log("new label", password);\n';
 assert.equal(inspect('app.ts',before,after,lineRanges(before,after)).length,0);
});
