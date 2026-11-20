import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {git} from '../packages/engine/src/io.mjs';
import {collectContext} from '../packages/ai/src/context.mjs';
import {checkRequest,checkResponse} from '../packages/ai/src/validate.mjs';
import {getHealth} from '../packages/ai/src/connection.mjs';
import {postReview,ReviewError} from '../packages/ai/src/transport.mjs';
export const FIXTURES=fileURLToPath(new URL('./fixtures/',import.meta.url));
export function loadCases(){return fs.readdirSync(FIXTURES,{withFileTypes:true}).filter(e=>e.isDirectory()&&/^[RSU]\d{2}-[a-z-]+$/.test(e.name)).map(e=>e.name).sort().map(id=>{const dir=path.join(FIXTURES,id),metadata=JSON.parse(fs.readFileSync(path.join(dir,'expected.json'),'utf8'));return {metadata,before:fs.readFileSync(path.join(dir,'before.ts'),'utf8'),after:fs.readFileSync(path.join(dir,'after.ts'),'utf8')};});}
export function collectFixture(fixture){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'changeproof-evaluation-'));
 // Never invoke target configuration/hooks or execute the fixture source. Only our fixed Git commands.
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_')&&!['NODE_OPTIONS','NODE_PATH','GROQ_API_KEY','REVIEW_ACCESS_TOKEN'].includes(key)));
 Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull,GIT_TERMINAL_PROMPT:'0'});
 const git=(...args)=>execFileSync('git',['-c','core.hooksPath='+os.devNull,'-c','core.fsmonitor=false','-c','maintenance.auto=false','-c','gc.auto=0','-C',dir,...args],{env,stdio:['ignore','pipe','pipe'],timeout:15000});
 try{
  git('init','-q');fs.writeFileSync(path.join(dir,'app.ts'),fixture.before);git('add','app.ts');git('-c','user.name=Changeproof synthetic evaluation','-c','user.email=synthetic@example.invalid','-c','commit.gpgSign=false','commit','-qm','synthetic baseline');fs.writeFileSync(path.join(dir,'app.ts'),fixture.after);
  const request=collectContext(dir).request;checkRequest(request);return request;
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
export function classifyFailure(error){return ['invalid_reference','missing_comparison_references'].includes(error.code||error.message)?'invalid_references':error.status===429||['throttled','provider_quota'].includes(error.code)?'provider_throttled':(error.code||error.message)==='invalid_response'||(error.code||error.message)==='invalid_model_output'?'schema_failure':'request_or_provider_failure';}
export function scoreAssessment(metadata,assessment){
 const withinRelevant=f=>['before','after'].every(revision=>f.references.some(r=>r.revision===revision&&r.file===metadata.relevant_evidence.file&&r.start_line<=metadata.relevant_evidence[revision][1]&&r.end_line>=metadata.relevant_evidence[revision][0]));
 const outcome=metadata.expected_outcome;
 const detected=outcome==='regression'&&assessment.findings.some(f=>f.category===metadata.expected_category&&withinRelevant(f));
 const uncertainty=assessment.status==='insufficient_context'&&assessment.context_requests.some(s=>s.trim())&&assessment.findings.length===0;
 return {outcome:outcome==='regression'?(detected?'expected_regression_detected':'expected_regression_missed'):outcome==='safe'?(assessment.findings.length?'finding_on_safe_control':'no_finding_on_safe_control'):(uncertainty?'appropriate_uncertainty_proxy':'uncertainty_requires_judgment'),finding_count:assessment.findings.length,uncertainty_acknowledged:assessment.status==='insufficient_context'||assessment.context_requests.some(s=>s.trim())||assessment.findings.some(f=>f.missing_context.some(s=>s.trim())),human_judgment_required:metadata.ambiguity_review.human_judgment_required||assessment.findings.length>0,scoring_proxy_only:true};
}
export function fixtureProvenance(){
 const root=fileURLToPath(new URL('../',import.meta.url));
 const status=git(root,['status','--porcelain','--untracked-files=all','--','evaluation/fixtures']).toString();
 const tracked=git(root,['ls-files','-z','--','evaluation/fixtures']).toString().split('\0').filter(Boolean);
 if(status||tracked.length!==36)throw new Error('Live evaluation requires all 12 synthetic fixtures and metadata committed and unchanged.');
 return git(root,['rev-parse','--verify','HEAD^{commit}']).toString().trim();
}
export async function evaluate({url,token,maxRequests,expectedModel,signal,caseIds,send=postReview,healthCheck=getHealth,live=false,provenance=fixtureProvenance}={}){
 if(!live)throw new Error('Explicit --live is required to send evaluation requests.');
 if(!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>12)throw new Error('--max-requests must be 1–12.');
 if(!token||token.length<32)throw new Error('Configure REVIEW_ACCESS_TOKEN for the development backend.');
 if(!expectedModel||!/^[a-zA-Z0-9_.\/-]{1,150}$/.test(expectedModel))throw new Error('Set an explicit --model matching backend GROQ_MODEL.');
 const allFixtures=loadCases();
 if(caseIds!==undefined&&(!Array.isArray(caseIds)||!caseIds.length||caseIds.length>12||new Set(caseIds).size!==caseIds.length||caseIds.some(id=>typeof id!=='string'||!allFixtures.some(f=>f.metadata.id===id))))throw new Error('Explicit case IDs must be unique built-in fixture IDs.');
 const fixture_commit=provenance();
 const health=await healthCheck(url,{signal});
 if(health.provider!=='groq'||health.model!==expectedModel)throw new Error('Live evaluation requires the exact configured Groq model. Mock/other-model fallback is forbidden.');
 const fixtures=caseIds?caseIds.map(id=>allFixtures.find(f=>f.metadata.id===id)):allFixtures;const rows=[];let attempts=0,stopped=null;
 for(const fixture of fixtures){
  if(attempts>=maxRequests){stopped='maximum_request_count';break;}
  if(signal?.aborted){stopped='cancelled';break;}
  const metadata=fixture.metadata;
  // Refuse an evaluation label that has no explicit authored ambiguity review.
  if(!metadata.ambiguity_review?.notes||!metadata.assumptions?.length)throw new Error('Fixture ambiguity review missing.');
  let request;try{request=collectFixture(fixture);}catch{rows.push({id:metadata.id,expected:metadata.expected_outcome,status:'collector_failure',human_judgment_required:true});continue;}
  attempts++;
  try{
   const response=await send(url,token,request,{signal});checkResponse(response,request);
   if(response.provider!=='groq'||response.model!==expectedModel)throw new ReviewError('provider_changed','Provider/model changed; evaluation stopped.');
   rows.push({id:metadata.id,expected:metadata.expected_outcome,status:'valid_response',...scoreAssessment(metadata,response.assessment)});
  }catch(error){const kind=classifyFailure(error);rows.push({id:metadata.id,expected:metadata.expected_outcome,status:kind,human_judgment_required:true});if(kind==='provider_throttled'||error.code==='provider_changed'||signal?.aborted){stopped=kind==='provider_throttled'?'provider_throttled':signal?.aborted?'cancelled':'provider_changed';break;}}
 }
 const counts={request_or_provider_failures:0,schema_failures:0,invalid_references:0,provider_throttles:0,collector_failures:0,expected_regressions_detected:0,expected_regressions_missed:0,safe_control_cases_with_findings:0,findings_on_safe_controls:0,safe_controls_without_findings:0,appropriate_uncertainty_proxies:0,uncertainty_requires_judgment:0,cases_requiring_human_judgment:0};
 for(const row of rows){const key=({request_or_provider_failure:'request_or_provider_failures',schema_failure:'schema_failures',invalid_references:'invalid_references',provider_throttled:'provider_throttles',collector_failure:'collector_failures'})[row.status]||({expected_regression_detected:'expected_regressions_detected',expected_regression_missed:'expected_regressions_missed',finding_on_safe_control:'safe_control_cases_with_findings',no_finding_on_safe_control:'safe_controls_without_findings',appropriate_uncertainty_proxy:'appropriate_uncertainty_proxies',uncertainty_requires_judgment:'uncertainty_requires_judgment'})[row.outcome];if(key)counts[key]++;if(row.outcome==='finding_on_safe_control')counts.findings_on_safe_controls+=row.finding_count;if(row.human_judgment_required)counts.cases_requiring_human_judgment++;}
 const confusion={true_positive:counts.expected_regressions_detected,false_negative:counts.expected_regressions_missed,false_positive:counts.safe_control_cases_with_findings,true_negative:counts.safe_controls_without_findings};
 const scored=Object.values(confusion).reduce((sum,value)=>sum+value,0),ratio=(numerator,denominator)=>denominator?Number((numerator/denominator).toFixed(4)):null;
 const eligibleBinary=fixtures.filter(f=>['regression','safe'].includes(f.metadata.expected_outcome)).length;
 const metrics={kind:'authored_fixture_scoring_proxy',confusion,scored_cases:scored,eligible_binary_cases:eligibleBinary,unscored_binary_cases:eligibleBinary-scored,coverage:ratio(scored,eligibleBinary),accuracy:ratio(confusion.true_positive+confusion.true_negative,scored),precision:ratio(confusion.true_positive,confusion.true_positive+confusion.false_positive),recall:ratio(confusion.true_positive,confusion.true_positive+confusion.false_negative),specificity:ratio(confusion.true_negative,confusion.true_negative+confusion.false_positive),real_world_accuracy_measured:false};
 const fixture_hash=crypto.createHash('sha256').update(JSON.stringify(allFixtures)).digest('hex');
 return {report_version:'1.1.0',evaluation_date:new Date().toISOString(),mode:'live',provider:health.provider,model:health.model,fixture_set_sha256:fixture_hash,fixture_commit,max_requests:maxRequests,selected_case_ids:fixtures.map(f=>f.metadata.id),requests_attempted:attempts,cases_total:allFixtures.length,cases_not_attempted:allFixtures.length-rows.length,stop_reason:stopped,counts,metrics,cases:rows,limitations:['Metrics apply only to valid responses on the selected authored fixtures; failed, throttled, unattempted and insufficient-context cases do not enter the binary denominators.','Regression classification uses expected category plus overlapping reference ranges, not adjudicated correctness, security or reasoning quality.','Expected answers and ambiguity notes are authored, not independently human-adjudicated, and excluded from model input.','Coverage and confusion counts must be reported with every metric; the fixture set is synthetic and not representative of production prompts.','No source, prompts, model prose, responses or credentials are persisted.']};
}
