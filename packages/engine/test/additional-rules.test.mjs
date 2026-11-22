import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectAdditional} from '../src/additional-rules.mjs';
const inspect=code=>inspectAdditional('app.ts','',code,[{new_start:1,new_count:code.split('\n').length}]);
test('strong hardcoded credentials produce metadata-only warnings',()=>{
 const rows=inspect('const clientSecret = "super-long-real-like-secret";');
 assert.equal(rows.length,1);assert.equal(rows[0].rule_id,'CP005');
 assert.ok(!JSON.stringify(rows).includes('super-long-real-like-secret'));
});
test('placeholder credentials and safe code are not flagged',()=>{
 assert.equal(inspect('const password = "placeholder";').length,0);
 assert.equal(inspect('const password = process.env.PASSWORD;').length,0);
 assert.equal(inspect('const clientSecret = "test-not-real-long";').length,0);
});
test('dynamic child_process shell commands are flagged without assuming injection',()=>{
 assert.equal(inspect('import { exec } from "node:child_process"; exec(userInput);')[0].rule_id,'CP006');
 assert.equal(inspect('const cp = require("child_process"); cp.execSync(command);')[0].rule_id,'CP006');
 assert.equal(inspect('import { exec } from "node:child_process"; exec("echo okay");').length,0);
 assert.equal(inspect('function exec(x) { return x; } exec(userInput);').length,0);
});
test('baseline-matched observations are not new findings',()=>{
 const source='const password = "secret-long-for-fixture";';
 assert.equal(inspectAdditional('app.ts',source,source,[{new_start:1,new_count:1}]).length,0);
});
