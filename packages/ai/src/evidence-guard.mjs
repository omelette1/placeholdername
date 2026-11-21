import {AI_VERSION} from './contract.mjs';
import {checkRequest,checkResponse} from './validate.mjs';

// These authored strings are data for the production validator, never executed.
// No workspace files, credentials, provider or network are involved.
export function runEvidenceGuard(){
 const file='synthetic.ts',before_id='b'.repeat(40),after_id='sha256:'+'c'.repeat(64);
 const chunks=[{revision:'before',revision_id:before_id,start_line:1,end_line:3,text:'function route(req) {\n\n return "safe"; }'},
  {revision:'after',revision_id:after_id,start_line:1,end_line:3,text:'function route(req) {\n\n console.log(req.headers.authorization); }'}];
 const request={schema_version:AI_VERSION,request_id:'a'.repeat(32),baseline:'d'.repeat(40),files:[{file,before_id,after_id,chunks}],omissions:[],privacy_notice:'Built-in synthetic validator demonstration. No project code.'};
 checkRequest(request);
 const references=chunks.map(({text,...c})=>({file,...c}));
 const quotes=chunks.map(c=>({file,revision:c.revision,revision_id:c.revision_id,start_line:3,end_line:3,quote:c.text.split('\n')[2]}));
 const response={schema_version:AI_VERSION,request_id:request.request_id,baseline:request.baseline,provider:'mock',model:'built-in-validator-data',runtime_verification:false,
  assessment:{status:'assessed',summary:'Synthetic validator demonstration; no model inference.',findings:[{category:'sensitive_data_exposure',title:'Synthetic example',explanation:'Authored test data.',potential_impact:'Unverified',reasoning:'Authored test data.',assumptions:[],missing_context:[],suggested_verification:[],suggested_correction:'Unverified',suggested_edits:[],references,evidence_quotes:quotes}],limitations:['Quotation existence does not establish interpretation.'],context_requests:[]}};
 const cases=[
  {id:'exact',label:'Exact before / after quotations',expected:'accepted',change:()=>{}},
  {id:'fabricated',label:'Invented source quotation',expected:'invalid_evidence_quote',change:f=>{f.evidence_quotes[1].quote='This line does not exist.';}},
  {id:'blank',label:'Blank line offered as evidence',expected:'invalid_evidence_quote',change:f=>{f.evidence_quotes[1]={...f.evidence_quotes[1],start_line:2,end_line:2,quote:''};}},
  {id:'outside',label:'Quotation outside submitted lines',expected:'invalid_evidence_quote',change:f=>{f.evidence_quotes[1].start_line=f.evidence_quotes[1].end_line=99;}},
  {id:'revision',label:'Quotation from the wrong revision',expected:'invalid_evidence_quote',change:f=>{f.evidence_quotes[1].revision_id='sha256:'+'e'.repeat(64);}},
  {id:'missing_before',label:'Missing baseline quotation',expected:'missing_comparison_quote',change:f=>{f.evidence_quotes=f.evidence_quotes.filter(q=>q.revision==='after');}},
  {id:'missing_after',label:'Missing current quotation',expected:'missing_current_quote',change:f=>{f.evidence_quotes=f.evidence_quotes.filter(q=>q.revision==='before');}}
 ];
 const rows=cases.map(c=>{
  const value=structuredClone(response);c.change(value.assessment.findings[0]);
  let observed='accepted';try{checkResponse(value,request);}catch(error){observed=error.message;}
  return {id:c.id,label:c.label,expected:c.expected,observed,passed:observed===c.expected};
 });
 return {kind:'evidence_guard_self_test',rows,passed:rows.filter(r=>r.passed).length,total:rows.length,model_requests:0,workspace_files_read:0,accuracy_measured:false};
}
