import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {auditClaims} from '../src/claims.mjs';

function check(t, source, response='Function `f` exists in `app.ts`.') {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cp-body-evidence-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'app.ts'),source);
  return auditClaims(root,response);
}

test('empty/comment/directive-only function bodies carry warnings independently of a presence match',t=>{
  for(const source of ['function f() {}','function f(){/* TODO */}','function f(){"use strict";;;}', 'const f=()=>{};']){
    const r=check(t,source);assert.equal(r.claims[0].status,'matched');assert.equal(r.claims[0].implementation.kind,'empty_body');assert.equal(r.implementation_warnings,1);assert.equal(r.claims[0].implementation.behavior_verified,false);
  }
});
test('whole-body placeholder throws are flagged without treating arbitrary throws or comments as stubs',t=>{
  const placeholder=check(t,'function f(){throw new Error("Not implemented yet");}');assert.equal(placeholder.claims[0].implementation.kind,'placeholder_throw');
  for(const source of ['function f(){throw new Error("Permission denied");}','function f(x){if(!x) throw new Error("Not implemented"); return x;}','function f(){/* Not implemented */return getValue();}']){
    const r=check(t,source);assert.equal(r.claims[0].implementation.kind,'body_present');assert.equal(r.implementation_warnings,0);assert.equal(r.claims[0].implementation.behavior_verified,false);
  }
});
test('bare returns and constant returns are distinguished; legitimate constants are not confirmed stubs',t=>{
  assert.equal(check(t,'function f(){return;}').claims[0].implementation.kind,'bare_return');
  for(const source of ['const f=()=>true;','function f(){return null;}','const f=()=> (-1 as number);','const f=()=>`constant`;']){
    const r=check(t,source);assert.equal(r.claims[0].implementation.kind,'constant_return');assert.equal(r.claims[0].implementation.attention,false);assert.equal(r.implementation_warnings,0);assert.match(r.claims[0].implementation.detail,/can be valid/);
  }
});
test('implementation assertions never become matched solely because a body has content',t=>{
  for(const source of ['function f(){}','function f(x){return x+1;}','function f(){throw Error("TODO");}']){
    const r=check(t,source,'Implemented function `f` in `app.ts`.');assert.equal(r.claims[0].kind,'function_implemented');assert.equal(r.claims[0].status,'unverified');assert.equal(r.claims[0].implementation.behavior_verified,false);
  }
});
test('syntax observations do not execute target code or echo source literals and can miss hidden stubs',t=>{
  const source='throw Error("NEVER_RUN"); function f(){throw new Error("TODO SYNTHETIC_SENSITIVE_TEXT");}';
  const r=check(t,source);assert.equal(r.claims[0].implementation.kind,'placeholder_throw');assert.ok(!JSON.stringify(r).includes('SYNTHETIC_SENSITIVE_TEXT'));assert.ok(!JSON.stringify(r).includes('NEVER_RUN'));
  const hidden=check(t,'function f(){return importedStub();}');assert.equal(hidden.claims[0].implementation.kind,'body_present');assert.equal(hidden.claims[0].implementation.behavior_verified,false);
});
test('parse errors, duplicate definitions and unsupported bindings never fabricate body evidence',t=>{
  for(const source of ['function f( {','function f(){} function f(){}','import {f} from "./external";']){
    const r=check(t,source);assert.equal(r.claims[0].status,'unverified');assert.equal(r.claims[0].implementation,undefined);assert.equal(r.implementation_warnings,0);
  }
});
