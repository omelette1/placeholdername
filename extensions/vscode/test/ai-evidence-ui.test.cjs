const {test}=require('node:test');
const assert=require('node:assert/strict');
const {aiHtml}=require('../src/ai-ui.cjs');

test('AI finding details show exact quote receipts while explicitly leaving interpretations unverified',async()=>{
 const {requestFixture,assessmentFixture}=await import('../../../packages/ai/test/fixtures.mjs');
 const request=requestFixture(),assessment=assessmentFixture(request),finding=assessment.findings[0];
 const evidence_quotes=finding.evidence_quotes.map(quote=>({...quote,status:'exact_match',scope:'Exact submitted source text matched the verified snapshot. This does not verify the interpretation or security claim.',reference_index:finding.references.findIndex(reference=>reference.file===quote.file&&reference.revision===quote.revision)}));
 const state={folder:'/synthetic/project',ai:{phase:'completed',token:'synthetic-token',selectionToken:'synthetic-selection',stale:false,envelope:{request},response:{provider:'mock',model:'synthetic-model',assessment},verification:{status:'completed',counts:{partial_static_support:0,unverified:1},findings:[{index:0,status:'unverified',reason:'No independent supported rule establishes this claim.',static_evidence:[],implementation_observations:[],evidence_quotes,patch:null}]}}};
 const html=aiHtml(state,0,'synthetic-nonce');
 assert.match(html,/Verbatim evidence receipts/);
 assert.match(html,/This proves only that the quoted text exists/);
 assert.match(html,/AI interpretation remains unverified/);
 assert.match(html,/Open quoted source/);
 assert.ok(html.includes('function route(req,res)'));
});
