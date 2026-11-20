import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {verifyFixtures} from '../verify-fixtures.mjs';

test('owned fixture contracts confirm disclosure/access changes, preserve safe controls and leave unknown cases unverified',()=>{
  const result=verifyFixtures();
  assert.equal(result.executed_fixture_cases,8);assert.equal(result.controlled_function_invocations,24);assert.equal(result.failed_contracts,0);assert.equal(result.real_project_runtime_verification,false);
  const owner=result.cases.find(c=>c.id==='R03-owner-check');assert.equal(owner.before.nonowner_allowed,false);assert.equal(owner.after.nonowner_receives_body,true);
  const tenant=result.cases.find(c=>c.id==='R04-tenant-check');assert.equal(tenant.before.other_tenant_allowed,false);assert.equal(tenant.after.other_tenant_receives_body,true);
  assert.equal(result.cases.filter(c=>c.status==='not_executed').length,4);assert.ok(result.cases.filter(c=>c.authored_expectation==='safe').every(c=>c.status==='fixture_contract_confirmed'));
});
test('fixture verifier refuses target-project inputs instead of executing arbitrary code',()=>{
  const result=spawnSync(process.execPath,[new URL('../verify-fixtures.mjs',import.meta.url).pathname,'--project','/untrusted/target'],{encoding:'utf8'});
  assert.equal(result.status,2);assert.equal(result.stdout,'');assert.match(result.stderr,/Only committed unchanged built-in fixtures/);
});
