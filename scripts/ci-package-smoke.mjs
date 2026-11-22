import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const root=path.resolve(process.cwd());
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'patch-ci-smoke-'));
try{
 fs.writeFileSync(path.join(dir,'app.ts'),'import { exec } from "node:child_process";\nconst clientSecret = "not-a-placeholder-long-secret";\nexec(command);\n');
 fs.writeFileSync(path.join(dir,'package-lock.json'),JSON.stringify({name:'smoke',lockfileVersion:3,packages:{'':{name:'smoke',version:'1.0.0'},'node_modules/a':{version:'1.0.0'}}}));
 const output=execFileSync(process.execPath,[path.join(root,'extensions/vscode/out/cli.cjs'),dir,'--mode','current'],{encoding:'utf8',timeout:20000});
 const report=JSON.parse(output);
 assert.equal(report.schema_version,'5.0.0');
 assert.equal(report.dependencies.status,'not_assessed');
 assert.equal(report.dependencies.online_lookup,false);
 assert.ok(report.findings.some(f=>f.rule_id==='CP005'));
 assert.ok(report.findings.some(f=>f.rule_id==='CP006'));
 assert.ok(report.findings.every(f=>f.runtime_verification===false));
 assert.ok(!output.includes('not-a-placeholder-long-secret'));
 console.log('Packaged CLI local smoke passed. No advisory requests or project scripts executed.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
