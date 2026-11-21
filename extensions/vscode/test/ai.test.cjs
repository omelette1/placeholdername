const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {execFileSync}=require('node:child_process');
const {fakeVscode}=require('./mock-vscode.cjs');const {createFindingsView}=require('../src/findings-view.cjs');const {createAiController}=require('../src/ai-client.cjs');const {aiHtml}=require('../src/ai-ui.cjs');
async function setup(t,{provider,withGit=true,baselineCode,updatedCode,rerun}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cp-ai-extension-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'app.ts');const baseline=baselineCode||'function route(req,res){\n if(req.doc.owner!==req.user.id)throw Error("denied");\n return res.send("ok");\n}\n';fs.writeFileSync(file,baseline);
 if(withGit){const git=(...args)=>execFileSync('git',['-C',root,...args],{stdio:'ignore'});git('init','-q');git('add','.');git('-c','user.name=Synthetic','-c','user.email=test@example.invalid','-c','commit.gpgSign=false','commit','-qm','baseline');}
 fs.writeFileSync(file,updatedCode??baseline.replace(' if(req.doc.owner!==req.user.id)throw Error("denied");',' // check removed'));
 const {createServer}=await import('../../../services/review-api/src/server.mjs');const {mockProvider}=await import('../../../services/review-api/src/providers.mjs');const {assessmentFixture}=await import('../../../packages/ai/test/fixtures.mjs');let calls=0;
 const a=createServer({accessToken:'synthetic-development-token-1234567890',provider:provider||mockProvider(request=>{calls++;return assessmentFixture(request);})});t.after(()=>a.close());const url=await a.listen({host:'127.0.0.1',port:0});
 const fake=fakeVscode(root);fake.vscode.workspace.getConfiguration=()=>({inspect:key=>key==='nodePath'?{globalValue:process.execPath}:{globalValue:url,workspaceValue:'https://malicious.invalid'}});
 const secrets=new Map([['changeproof.aiDevelopmentAccessToken','synthetic-development-token-1234567890']]);const records=[];
 const context={subscriptions:[],secrets:{get:async k=>secrets.get(k),store:async(k,v)=>secrets.set(k,v)},asAbsolutePath:p=>path.resolve(__dirname,'..',p)};let ai;
 const ui=createFindingsView(fake.vscode,context,{record:x=>records.push(x),rerun:()=>{},aiAction:(...args)=>ai.action(...args)});ai=createAiController(fake.vscode,context,ui,{rerun});t.after(()=>context.subscriptions.forEach(d=>d.dispose()));
 return {root,file,fake,context,ui,ai,records,calls:()=>calls,url,secrets};
}
async function waitFor(fn){for(let i=0;i<200;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('UI operation did not complete');}
test('UI rechecks saved evidence without another model request and invalidates edited snapshots',async t=>{
 const x=await setup(t);await x.ai.reviewFolder(x.root);const ai=x.ui.getState().ai;
 await x.ai.action('ai_approve',ai);assert.equal(x.calls(),1);
 assert.match(x.ui.getPanel().webview.html,/AI evidence status/);
 assert.match(x.ui.getPanel().webview.html,/Recheck saved evidence/);
 await x.ui.getPanel().messages.listeners[0]({type:'ai_recheck',token:ai.token});
 assert.equal(ai.verification.status,'completed');assert.equal(x.calls(),1);
 fs.appendFileSync(x.file,'// changed after review\n');
 await x.ui.getPanel().messages.listeners[0]({type:'ai_recheck',token:ai.token});
 assert.equal(ai.stale,true);assert.equal(ai.verification.status,'stale');assert.equal(x.calls(),1);
 assert.match(x.ui.getPanel().webview.html,/STALE/);
});
test('fabricated provider evidence is visibly rejected and discarded, with no patch to apply',async t=>{
 const {mockProvider}=await import('../../../services/review-api/src/providers.mjs');
 const {assessmentFixture}=await import('../../../packages/ai/test/fixtures.mjs');
 const x=await setup(t,{provider:mockProvider(request=>{const a=assessmentFixture(request);a.findings[0].evidence_quotes[0].quote='invented source';return a;})});
 await x.ai.reviewFolder(x.root);const ai=x.ui.getState().ai;await x.ai.action('ai_approve',ai);
 assert.equal(ai.phase,'error');assert.equal(ai.errorCode,'invalid_evidence_quote');assert.equal(ai.response,undefined);
 assert.match(x.ui.getPanel().webview.html,/REJECTED — AI evidence failed validation/);
 assert.ok(!x.ui.getPanel().webview.html.includes('data-ai-patch'));
});
test('the app automatically cross-checks its model response once, exposes static support and navigates from its summary',async t=>{
 const {mockProvider}=await import('../../../services/review-api/src/providers.mjs');const {assessmentFixture}=await import('../../../packages/ai/test/fixtures.mjs');let requests=0;
 const x=await setup(t,{baselineCode:'function route(req){\n const value="synthetic";\n console.log(value);\n}\n',updatedCode:'function route(req){\n const value=req.headers.authorization;\n console.log(value);\n}\n',provider:mockProvider(req=>{requests++;return assessmentFixture(req,'sensitive_data_exposure');})});
 await x.ai.reviewFolder(x.root);assert.equal(requests,0);const ai=x.ui.getState().ai;await x.ai.action('ai_approve',ai);assert.equal(requests,1);assert.equal(ai.verification.status,'completed');assert.equal(ai.verification.findings[0].status,'partial_static_support');assert.match(x.fake.panels[0].webview.html,/Partial static support/);
 await x.fake.panels[0].messages.listeners[0]({type:'ai_select',token:ai.token,index:0});assert.match(x.fake.panels[0].webview.html,/Open cited evidence/);assert.equal(await x.fake.commands.get('changeproof.openAiEvidence')(ai.token,1),true);assert.equal(x.fake.panels.length,1);
 fs.appendFileSync(x.file,'// stale');assert.equal(await x.fake.commands.get('changeproof.openAiEvidence')(ai.token,1),false);assert.match(x.fake.panels[0].webview.html,/Automatic local evidence checks — STALE/);assert.equal(requests,1);
});
test('unavailable independent checker preserves the AI response without inventing local support',async t=>{
 const x=await setup(t);const original=x.context.asAbsolutePath;x.context.asAbsolutePath=p=>p==='out/ai-verify.cjs'?path.join(x.root,'nonexistent-checker.cjs'):original(p);
 await x.ai.reviewFolder(x.root);const ai=x.ui.getState().ai;await x.ai.action('ai_approve',ai);assert.equal(ai.phase,'completed');assert.equal(ai.verification.status,'unavailable');assert.ok(ai.response);assert.match(x.fake.panels[0].webview.html,/No corroboration is established/);assert.equal(x.calls(),1);
});
test('proposed edits are previewed, applied only on click, saved, then the deterministic engine reruns',async t=>{
 const {mockProvider}=await import('../../../services/review-api/src/providers.mjs');const {assessmentFixture}=await import('../../../packages/ai/test/fixtures.mjs');let rerun,report;
 const provider=mockProvider(request=>{const assessment=assessmentFixture(request);const chunk=request.files[0].chunks.find(c=>c.revision==='after'),index=chunk.text.split('\n').findIndex(line=>line.includes('check removed'));assessment.findings[0].suggested_edits=[{file:'app.ts',revision_id:chunk.revision_id,start_line:chunk.start_line+index,end_line:chunk.start_line+index,expected:chunk.text.split('\n')[index],replacement:' if(req.doc.owner!==req.user.id) throw Error("denied");'}];return assessment;});
 const x=await setup(t,{provider,rerun:async(folder,options)=>{rerun={folder,options};const {runEngine}=require('../src/client.cjs');report=await runEngine(process.execPath,x.context.asAbsolutePath('out/cli.cjs'),folder,()=>{},{mode:options.mode});}});
 await x.ai.reviewFolder(x.root);const ai=x.ui.getState().ai;await x.ai.action('ai_approve',ai);assert.equal(ai.verification.findings[0].patch.status,'ready');await x.ui.selectAi(ai.token,0);assert.match(x.fake.panels[0].webview.html,/Apply this patch and rerun local checks/);assert.ok(!fs.readFileSync(x.file,'utf8').includes('req.doc.owner'));
 await x.fake.panels[0].messages.listeners[0]({type:'ai_apply_patch',token:ai.token,index:0});
 assert.equal(fs.readFileSync(x.file,'utf8').includes('if(req.doc.owner!==req.user.id)'),true);assert.equal(rerun.folder,x.root);assert.equal(rerun.options.mode,'changes');assert.equal(report.findings.some(f=>f.rule_id==='CP002'),false);
});
test('patch application refuses a changed saved snapshot and leaves the concurrent edit intact',async t=>{
 const {mockProvider}=await import('../../../services/review-api/src/providers.mjs');const {assessmentFixture}=await import('../../../packages/ai/test/fixtures.mjs');let reruns=0;
 const provider=mockProvider(request=>{const assessment=assessmentFixture(request),chunk=request.files[0].chunks.find(c=>c.revision==='after'),index=chunk.text.split('\n').findIndex(line=>line.includes('check removed'));assessment.findings[0].suggested_edits=[{file:'app.ts',revision_id:chunk.revision_id,start_line:chunk.start_line+index,end_line:chunk.start_line+index,expected:chunk.text.split('\n')[index],replacement:' if(req.doc.owner!==req.user.id) throw Error("denied");'}];return assessment;});
 const x=await setup(t,{provider,rerun:async()=>{reruns++;}});await x.ai.reviewFolder(x.root);const ai=x.ui.getState().ai;await x.ai.action('ai_approve',ai);assert.equal(ai.verification.findings[0].patch.status,'ready');fs.appendFileSync(x.file,'// concurrent edit\n');const current=fs.readFileSync(x.file,'utf8');
 await x.fake.panels[0].messages.listeners[0]({type:'ai_apply_patch',token:ai.token,index:0});assert.equal(fs.readFileSync(x.file,'utf8'),current);assert.equal(reruns,0);assert.match(x.fake.warnings.at(-1)[0],/saved project changed/);
});
test('a save failure reports that the patch is unsaved and skips local checks',async t=>{
 const {mockProvider}=await import('../../../services/review-api/src/providers.mjs');const {assessmentFixture}=await import('../../../packages/ai/test/fixtures.mjs');let reruns=0;
 const provider=mockProvider(request=>{const assessment=assessmentFixture(request),chunk=request.files[0].chunks.find(c=>c.revision==='after'),index=chunk.text.split('\n').findIndex(line=>line.includes('check removed'));assessment.findings[0].suggested_edits=[{file:'app.ts',revision_id:chunk.revision_id,start_line:chunk.start_line+index,end_line:chunk.start_line+index,expected:chunk.text.split('\n')[index],replacement:' if(req.doc.owner!==req.user.id) throw Error("denied");'}];return assessment;});
 const x=await setup(t,{provider,rerun:async()=>{reruns++;}});await x.ai.reviewFolder(x.root);const ai=x.ui.getState().ai;await x.ai.action('ai_approve',ai);assert.equal(ai.phase,'completed');assert.equal(ai.stale,false);assert.equal(ai.verification.findings[0].patch.status,'ready');assert.equal(x.ai.isBusy(),false);const document=await x.fake.vscode.workspace.openTextDocument(x.fake.vscode.Uri.file(fs.realpathSync(x.file)));document.save=async()=>false;
 const currentAi=x.ui.getState().ai;assert.equal(currentAi.phase,'completed');assert.equal(currentAi.stale,false);assert.equal(currentAi.verification.findings[0].patch.status,'ready');await x.ai.action('ai_apply_patch',currentAi,{index:0});
 assert.ok(document.text.includes('if(req.doc.owner!==req.user.id)'));assert.ok(!fs.readFileSync(x.file,'utf8').includes('if(req.doc.owner!==req.user.id)'));assert.equal(reruns,0);assert.match(x.fake.warnings.at(-1)[0],/applied the patch in the editor, but could not save it/);
});
test('complete mocked-editor / real-HTTP mock-provider flow: exact preview, explicit approval, reusable panel, references and no code logs',async t=>{
 const x=await setup(t);await x.fake.commands.get('changeproof.aiReviewChanges')();assert.equal(x.calls(),0);let state=x.ui.getState();assert.equal(state.ai.phase,'preview');assert.ok(!x.fake.trees[0].message.includes('Setup / processing error'));const html=x.fake.panels[0].webview.html;assert.match(html,/Exact JSON request/);assert.ok(html.includes(x.url));assert.ok(!html.includes('malicious.invalid'));assert.ok(!html.includes('synthetic-development-token-1234567890'));assert.equal(x.fake.panels.length,1);
 const approved=JSON.stringify(state.ai.envelope.request);x.fake.panels[0].messages.fire({type:'ai_approve',token:state.ai.token});await waitFor(()=>x.ui.getState().ai.phase==='completed');assert.equal(x.calls(),1);state=x.ui.getState();assert.equal(JSON.stringify(state.ai.envelope.request),approved);assert.equal(state.ai.response.provider,'mock');assert.equal(state.ai.stale,false);assert.equal(state.ai.verification.status,'completed');assert.equal(state.ai.verification.findings[0].status,'unverified');assert.match(x.fake.panels[0].webview.html,/Automatic local evidence checks/);
 await x.fake.commands.get('changeproof.openAiFinding')(state.ai.token,0);assert.equal(x.fake.panels.length,1);assert.match(x.fake.panels[0].webview.html,/AI assessment — not runtime verified/);assert.match(x.fake.panels[0].webview.html,/MOCK PROVIDER/);assert.match(x.fake.panels[0].webview.html,/HEAD reference only/);
 assert.equal(await x.fake.commands.get('changeproof.openAiEvidence')(state.ai.token,1),true);assert.equal(x.fake.editors[0].document.uri.fsPath,x.file);assert.equal(x.fake.editors[0].selection.start.line,0);assert.ok(x.fake.types.some(t=>t.style.after.contentText===' [REFERENCE]'));
 const oldSelection=x.ui.getState().ai.selectionToken;await x.ui.selectAi(state.ai.token,0);assert.notEqual(oldSelection,x.ui.getState().ai.selectionToken);const warningCount=x.fake.warnings.length;x.fake.panels[0].messages.fire({type:'ai_navigate',token:state.ai.token,selectionToken:oldSelection,step:0});await new Promise(resolve=>setTimeout(resolve,10));assert.equal(x.fake.warnings.length,warningCount,'replaced selection messages ignored');
 const code=fs.readFileSync(x.file,'utf8');assert.ok(!JSON.stringify(x.records).includes('req.doc'));assert.ok(!JSON.stringify(x.records).includes('synthetic-development-token'));assert.equal(fs.readFileSync(x.file,'utf8'),code);assert.ok(x.fake.flatten().some(i=>i.label.includes('separate from deterministic')));
});
test('edited approved context is never silently substituted or sent; stale results disable navigation',async t=>{
 const x=await setup(t);
 await x.fake.commands.get('changeproof.aiReviewChanges')();let ai=x.ui.getState().ai;fs.appendFileSync(x.file,'// relevant edit\n');await x.ai.action('ai_approve',ai);assert.equal(x.calls(),0);assert.match(x.ui.getState().ai.error,/refreshed preview/);
 await x.fake.commands.get('changeproof.aiReviewChanges')();ai=x.ui.getState().ai;await x.ai.action('ai_approve',ai);assert.equal(x.calls(),1);await x.ui.selectAi(ai.token,0);const doc=await x.fake.vscode.workspace.openTextDocument(x.fake.vscode.Uri.file(x.file));doc.isDirty=true;x.fake.changes.fire({document:doc,contentChanges:[{}]});assert.equal(x.ui.getState().ai.stale,true);assert.match(x.fake.panels[0].webview.html,/STALE/);assert.equal(await x.fake.commands.get('changeproof.openAiEvidence')(ai.token,1),false);
});
test('cancel, missing baseline, missing credential, empty response and provider failures are explicit',async t=>{
 const x=await setup(t);await x.fake.commands.get('changeproof.aiReviewChanges')();await x.ai.action('ai_cancel',x.ui.getState().ai);assert.equal(x.ui.getState().ai.phase,'cancelled');assert.equal(x.calls(),0);
 await x.fake.commands.get('changeproof.aiReviewChanges')();x.secrets.clear();await x.ai.action('ai_approve',x.ui.getState().ai);assert.match(x.ui.getState().ai.error,/Access Token/);assert.equal(x.calls(),0);
 const noGit=await setup(t,{withGit:false});await noGit.fake.commands.get('changeproof.aiReviewChanges')();assert.match(noGit.ui.getState().ai.error,/HEAD baseline/);
 const {mockProvider}=await import('../../../services/review-api/src/providers.mjs');const empty=await setup(t,{provider:mockProvider({status:'insufficient_context',summary:'Policy absent.',findings:[],limitations:['Caller context absent.'],context_requests:['Provide caller authorization contract.']})});await empty.fake.commands.get('changeproof.aiReviewChanges')();await empty.ai.action('ai_approve',empty.ui.getState().ai);assert.equal(empty.ui.getState().ai.phase,'completed');assert.ok(empty.fake.flatten().some(i=>i.label.includes('does not establish safety')));assert.match(empty.fake.panels[0].webview.html,/Provide caller authorization/);
 const bad=await setup(t,{provider:mockProvider({not:'an assessment'})});await bad.fake.commands.get('changeproof.aiReviewChanges')();await bad.ai.action('ai_approve',bad.ui.getState().ai);assert.match(bad.ui.getState().ai.error,/malformed|ungrounded/);
});
test('AI details and exact payload preview escape unusual filenames, identifiers and model prose under CSP',async()=>{
 const {requestFixture,assessmentFixture}=await import('../../../packages/ai/test/fixtures.mjs');const request=requestFixture();request.files[0].file='weird<script>&".ts';const assessment=assessmentFixture(request);assessment.findings[0].title='<script>alert("x")</script>';const state={folder:'/project/<img>',ai:{phase:'preview',token:'safe',url:'https://example.invalid',envelope:{request,redactions:0}}};let html=aiHtml(state,null,'nonce');assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('weird<script>'));assert.match(html,/default-src 'none'/);state.ai.phase='completed';state.ai.response={provider:'mock',model:'mock',assessment};html=aiHtml(state,0,'nonce');assert.ok(!html.includes('<script>alert'));assert.ok(html.includes('&lt;script&gt;alert'));
});
test('changes during an in-flight assessment mark returned results stale without auto-review',async t=>{
 let entered,release;const started=new Promise(resolve=>entered=resolve);const provider={name:'mock',model:'delayed-fixture',review:async request=>{entered();await new Promise(resolve=>release=resolve);const {assessmentFixture}=await import('../../../packages/ai/test/fixtures.mjs');return assessmentFixture(request);}};const x=await setup(t,{provider});await x.fake.commands.get('changeproof.aiReviewChanges')();const pending=x.ai.action('ai_approve',x.ui.getState().ai);await started;fs.appendFileSync(x.file,'// changed while pending\n');release();await pending;assert.equal(x.ui.getState().ai.phase,'completed');assert.equal(x.ui.getState().ai.stale,true);
});

test('AI evidence rechecks saved snapshots after asynchronous document opening',async t=>{
 const x=await setup(t);await x.fake.commands.get('changeproof.aiReviewChanges')();const ai=x.ui.getState().ai;
 await x.ai.action('ai_approve',ai);await x.ui.selectAi(ai.token,0);
 const open=x.fake.vscode.workspace.openTextDocument;
 x.fake.vscode.workspace.openTextDocument=async uri=>{const doc=await open(uri);fs.appendFileSync(uri.fsPath,'// edit without a watcher event\n');return doc;};
 assert.equal(await x.fake.commands.get('changeproof.openAiEvidence')(ai.token,1),false);
 assert.equal(x.ui.getState().ai.stale,true);assert.equal(x.fake.editors.length,0);assert.equal(x.calls(),1);
});

test('AI reselection during navigation does not invalidate the newly selected assessment',async t=>{
 const x=await setup(t);await x.fake.commands.get('changeproof.aiReviewChanges')();const ai=x.ui.getState().ai;
 await x.ai.action('ai_approve',ai);await x.ui.selectAi(ai.token,0);
 const open=x.fake.vscode.workspace.openTextDocument;
 x.fake.vscode.workspace.openTextDocument=async uri=>{const doc=await open(uri);await x.ui.selectAi(ai.token,0);return doc;};
 assert.equal(await x.fake.commands.get('changeproof.openAiEvidence')(ai.token,1),false);
 assert.equal(x.ui.getState().ai.stale,false);assert.equal(x.fake.editors.length,0);
});
