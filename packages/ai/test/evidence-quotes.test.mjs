import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import Ajv from 'ajv';
import {collectContext} from '../src/context.mjs';
import {checkResponse} from '../src/validate.mjs';
import {verifyLocalAssessment} from '../src/local-verification.mjs';
import {assessmentFixture,requestFixture} from './fixtures.mjs';

function project(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cp-evidence-quote-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'app.ts');
  const git=(...args)=>execFileSync('git',['-C',root,...args],{stdio:'pipe'});
  fs.writeFileSync(file,'function route(req){\n return "safe";\n}\n');
  git('init','-q');
  git('add','.');
  git('-c','user.name=Synthetic','-c','user.email=test@example.invalid','-c','commit.gpgSign=false','commit','-qm','baseline');
  fs.writeFileSync(file,'function route(req){\n console.log(req.headers.authorization);\n}\n');
  const request=collectContext(root).request;
  const response={schema_version:'1.2.0',request_id:request.request_id,baseline:request.baseline,provider:'mock',model:'synthetic',runtime_verification:false,assessment:assessmentFixture(request,'sensitive_data_exposure')};
  return {root,request,response};
}

test('local verifier issues exact-source quote receipts without promoting the AI interpretation',t=>{
  const x=project(t),result=verifyLocalAssessment(x.root,x.request,x.response),quotes=result.findings[0].evidence_quotes;
  assert.equal(quotes.length,2);
  assert.deepEqual(new Set(quotes.map(q=>q.revision)),new Set(['before','after']));
  assert.ok(quotes.every(q=>q.status==='exact_match'));
  assert.ok(quotes.every(q=>q.scope.includes('does not verify')));
  assert.equal(result.findings[0].status,'partial_static_support');
});

test('forged, out-of-context and omitted comparison quotes fail closed',t=>{
  const x=project(t),forged=structuredClone(x.response);
  forged.assessment.findings[0].evidence_quotes[0].quote='This text was never submitted.';
  assert.throws(()=>checkResponse(forged,x.request),/invalid_evidence_quote/);

  const outside=structuredClone(x.response);
  outside.assessment.findings[0].evidence_quotes[0].start_line+=100;
  outside.assessment.findings[0].evidence_quotes[0].end_line+=100;
  assert.throws(()=>checkResponse(outside,x.request),/invalid_evidence_quote/);

  const missingBefore=structuredClone(x.response);
  missingBefore.assessment.findings[0].evidence_quotes=missingBefore.assessment.findings[0].evidence_quotes.filter(q=>q.revision==='after');
  assert.throws(()=>checkResponse(missingBefore,x.request),/missing_comparison_quote/);
});

test('an absent before-file permits a current quote but never fabricates a before quote',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cp-evidence-new-file-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  execFileSync('git',['-C',root,'init','-q']);
  execFileSync('git',['-C',root,'-c','user.name=Synthetic','-c','user.email=test@example.invalid','-c','commit.gpgSign=false','commit','--allow-empty','-qm','baseline']);
  fs.writeFileSync(path.join(root,'app.ts'),'function route(req){ return req.input; }\n');
  execFileSync('git',['-C',root,'add','app.ts']);
  const request=collectContext(root).request;
  assert.equal(request.files[0].before_id,'absent');
  request.files[0].chunks.unshift({revision:'before',revision_id:'absent',start_line:1,end_line:1,text:''});
  const response={schema_version:'1.2.0',request_id:request.request_id,baseline:request.baseline,provider:'mock',model:'synthetic',runtime_verification:false,assessment:assessmentFixture(request)};
  const finding=response.assessment.findings[0];
  finding.evidence_quotes=finding.evidence_quotes.filter(q=>q.revision==='after');
  assert.doesNotThrow(()=>checkResponse(response,request));
});

test('published JSON schemas accept the contract 1.2 quote-receipt fixtures',()=>{
  const ajv=new Ajv({strict:true});
  const requestSchema=JSON.parse(fs.readFileSync(new URL('../../../docs/ai-request-v1.schema.json',import.meta.url)));
  const responseSchema=JSON.parse(fs.readFileSync(new URL('../../../docs/ai-response-v1.schema.json',import.meta.url)));
  const request=requestFixture(),assessment=assessmentFixture(request);
  const response={schema_version:'1.2.0',request_id:request.request_id,baseline:request.baseline,provider:'mock',model:'synthetic',runtime_verification:false,assessment};
  assert.equal(ajv.compile(requestSchema)(request),true);
  assert.equal(ajv.compile(responseSchema)(response),true);
});
