import {test} from 'node:test';import assert from 'node:assert/strict';
import {inspectDetailed} from '../src/rule.mjs';import {lineRanges,analyze} from '../src/engine.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const review=(after,before='')=>inspectDetailed('app.ts',before,after,lineRanges(before,after)).findings.filter(f=>['CP003','CP004'].includes(f.rule_id));
test('CP003 detects explicit process/HTTPS TLS disablement with precise evidence and no snippets',()=>{
 for(const code of ["process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';","import https from 'node:https';new https.Agent({rejectUnauthorized:false});","import * as transport from 'https';transport.get('https://example.invalid',{rejectUnauthorized:false});","const https=require('https'); https.request({rejectUnauthorized:false});"]){const f=review(code);assert.equal(f.length,1,code);assert.equal(f[0].rule_id,'CP003');assert.equal(f[0].runtime_verification,false);assert.equal(f[0].evidence.source_values_included,false);assert.ok(!JSON.stringify(f).includes('https://example.invalid'));}
});
test('CP003 ignores shadowed/unrelated/mutated bindings, spreads, safe overrides and comments',()=>{
 for(const code of ["function f(process){process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';}","const https={Agent(){}};new https.Agent({rejectUnauthorized:false});","import https from 'node:https';https=mock;new https.Agent({rejectUnauthorized:false});","import https from 'https';new https.Agent({rejectUnauthorized:false,rejectUnauthorized:true});","import https from 'https';new https.Agent({rejectUnauthorized:false,...options});","// process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';\nconst text='eval(input)';","import https from 'https';new https.Agent({rejectUnauthorized:true});"]){assert.equal(review(code).length,0,code);}
});
test('CP004 detects direct eval/Function but does not claim tainted input or follow aliases',()=>{
 for(const code of ['eval(input);','new Function(input);','Function(input);']){const f=review(code);assert.equal(f.length,1);assert.equal(f[0].rule_id,'CP004');assert.match(f[0].explanation,/not been established/);}
 for(const code of ['function f(eval){eval(input);}','const Function=custom;new Function(input);','const execute=eval;execute(input);','obj.eval(input);','const text="eval(input)";','eval=custom;eval(input);'])assert.equal(review(code).length,0,code);
});
test('new patterns are compared against HEAD; current-files newness remains null',t=>{
 assert.equal(review('eval(input);\n// harmless\n','eval(input);\n').length,0);assert.equal(review('eval(input);\neval(other);\n','eval(input);\n').length,1);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cp-risky-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.writeFileSync(path.join(dir,'app.ts'),"process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';eval(input);");const r=analyze(dir,{mode:'current'});assert.deepEqual(r.findings.map(f=>f.rule_id),['CP003','CP004']);assert.ok(r.findings.every(f=>f.newly_introduced===null));
});
