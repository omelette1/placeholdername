import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runEvidenceGuard} from '../src/evidence-guard.mjs';
import {requestFixture,assessmentFixture} from './fixtures.mjs';
import {checkResponse} from '../src/validate.mjs';

test('built-in guard demonstrates accepted exact text and six rejected evidence variants without inference',()=>{
 const report=runEvidenceGuard();
 assert.equal(report.passed,7);assert.equal(report.total,7);
 assert.equal(report.model_requests,0);assert.equal(report.workspace_files_read,0);assert.equal(report.accuracy_measured,false);
 assert.equal(report.rows.find(r=>r.id==='exact').observed,'accepted');
 assert.ok(report.rows.filter(r=>r.id!=='exact').every(r=>r.observed!=='accepted'));
});

test('whitespace-only evidence fails even when its exact bytes are present and referenced',()=>{
 const request=requestFixture(),chunk=request.files[0].chunks[1];
 chunk.text='   ';
 const assessment=assessmentFixture(request);
 assessment.findings[0].evidence_quotes.push({file:request.files[0].file,revision:'after',revision_id:chunk.revision_id,start_line:1,end_line:1,quote:'   '});
 const response={schema_version:request.schema_version,request_id:request.request_id,baseline:request.baseline,provider:'mock',model:'synthetic',runtime_verification:false,assessment};
 assert.throws(()=>checkResponse(response,request),/invalid_evidence_quote/);
});
