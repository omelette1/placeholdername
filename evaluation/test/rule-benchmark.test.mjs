import {test} from 'node:test';
import assert from 'node:assert/strict';
import {benchmarkRules} from '../rule-benchmark.mjs';

test('authored deterministic-rule benchmark reports per-rule confusion metrics without claiming real-world accuracy',()=>{
  const report=benchmarkRules();
  assert.equal(report.total_cases,24);
  assert.equal(report.passed,24);
  assert.equal(report.failed,0);
  assert.equal(report.aggregate.accuracy,1);
  assert.equal(report.real_world_accuracy_measured,false);
  for(const rule of Object.values(report.rules)){
    assert.equal(rule.cases,6);
    assert.equal(rule.false_positive,0);
    assert.equal(rule.false_negative,0);
  }
});
