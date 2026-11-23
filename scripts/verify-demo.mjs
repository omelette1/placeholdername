import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const base=path.join(root,'samples/demo-projects');
const cli=path.join(root,'extensions/vscode/out/cli.cjs');
const expected=[
  ['header-leak',['CP002']],
  ['password-log',['CP001']],
  ['safe-logging',[]],
  ['tls-bypass',['CP003']],
  ['dynamic-eval',['CP004']],
  ['empty-function',[]],
  ['ownership-change',[]],
];
assert.ok(fs.existsSync(cli),'Build the bundled extension first: npm run build:extension');
const folders=JSON.parse(fs.readFileSync(path.join(base,'index.json'),'utf8'));
const results=[];
for(const [id,rules] of expected){
  const folder=path.join(base,folders[id]);
  assert.ok(fs.existsSync(folder),'Missing demo sample '+id);
  const stdout=execFileSync(process.execPath,[cli,folder,'--mode','current'],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
  const report=JSON.parse(stdout);
  const actual=report.findings.map(f=>f.rule_id).sort();
  assert.equal(report.review_mode,'current',id+' mode');
  assert.equal(report.analysis_complete,true,id+' must produce a complete code analysis');
  assert.equal(report.analysis_errors.length,0,id+' analysis errors');
  assert.deepEqual(actual,rules.slice().sort(),id+' rule mismatch');
  assert.equal(report.dependencies.online_lookup,false,id+' must not make OSV requests');
  assert.equal(report.dependencies.status,'not_assessed',id+' advisory lookup must remain opt-in');
  assert.equal(report.container_images.status,'not_assessed',id+' Trivy must remain opt-in');
  for(const f of report.findings){
    assert.equal(f.runtime_verification,false,id+' must not claim runtime verification');
    assert.ok(f.location.file==='app.ts',id+' must navigate to saved source');
    assert.ok(f.location.start.line>=1,id+' source location must be valid');
  }
  results.push({profile:id,expected_rules:rules,observed_rules:actual,code_coverage:report.coverage.status,dependencies:report.dependencies.status,containers:report.container_images.status});
  console.log('PASS '+id+': '+(actual.join(', ')||'no supported local findings')+'; code coverage '+report.coverage.status);
}
console.log('All '+results.length+' authored demo profiles matched expected deterministic behavior. No online advisories or container scans requested.');
console.log('These are synthetic examples, not measurements of real-world vulnerability accuracy.');
