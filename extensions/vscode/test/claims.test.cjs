const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const {fakeVscode}=require('./mock-vscode.cjs');const {createFindingsView}=require('../src/findings-view.cjs');const {createClaimController}=require('../src/claim-controller.cjs');const {runClaimAudit,validateClaimReport}=require('../src/claim-client.cjs');const {claimHtml}=require('../src/claim-ui.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'cp-claim-ui-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.writeFileSync(path.join(root,'app.ts'),'function visible(){}\n');const fake=fakeVscode(root),context={subscriptions:[],asAbsolutePath:p=>path.resolve(__dirname,'..',p)},records=[];const ui=createFindingsView(fake.vscode,context,{record:r=>records.push(r),rerun(){}});const claims=createClaimController(fake.vscode,context,ui);t.after(()=>context.subscriptions.forEach(d=>d.dispose()));return{root,fake,context,ui,claims,records};}
const token=x=>x.ui.getPanel().webview.html.match(/token="([a-f0-9]+)"/)[1];
const send=(x,type,extra={})=>x.ui.getPanel().messages.listeners[0]({type,token:token(x),...extra});
test('pasted response flows through real bundled local auditor into the reused panel; test claims stay unverified',async t=>{
 const x=fixture(t);await x.claims.check(x.root);assert.equal(x.fake.panels.length,1);assert.match(x.ui.getPanel().webview.html,/Check assistant claims/);
 await send(x,'claims_audit',{response:'Function `visible` exists in `app.ts`.\nFile `missing.ts` exists.\n159 tests passed.'});
 const state=x.claims.getState();assert.deepEqual(state.report.counts,{matched:1,contradicted:1,unverified:1});assert.match(x.ui.getPanel().webview.html,/No independently captured execution evidence/);assert.equal(x.fake.panels.length,1);assert.ok(!JSON.stringify(x.records).includes('159 tests'));
 await send(x,'claims_navigate',{index:0,evidence:1});assert.equal(x.fake.editors[0].document.uri.fsPath,fs.realpathSync(path.join(x.root,'app.ts')));assert.equal(x.fake.editors[0].selection.start.line,0);assert.equal(x.ui.getPanel().viewColumn,x.fake.vscode.ViewColumn.Two);
});
test('saved same-length edits invalidate claim evidence before any watcher notification',async t=>{
 const x=fixture(t);await x.claims.check(x.root);await send(x,'claims_audit',{response:'Function `visible` exists in `app.ts`.'});fs.writeFileSync(path.join(x.root,'app.ts'),'function changed(){}\n');await send(x,'claims_navigate',{index:0,evidence:1});assert.equal(x.claims.getState().stale,true);assert.equal(x.fake.editors.length,0);assert.match(x.ui.getPanel().webview.html,/STALE/);
});
test('dirty buffers and filesystem events mark claim reports stale without automatic reruns',async t=>{
 const x=fixture(t);await x.claims.check(x.root);const doc=await x.fake.vscode.workspace.openTextDocument(x.fake.vscode.Uri.file(path.join(x.root,'app.ts')));doc.isDirty=true;
 await send(x,'claims_audit',{response:'Function `visible` exists in `app.ts`.'});assert.equal(x.claims.getState().stale,true);assert.match(x.ui.getPanel().webview.html,/data-claim="0" data-evidence="1" disabled/);
});
test('closing/replacing the claim page clears pasted text; stale tokens and message paths cannot navigate',async t=>{
 const x=fixture(t);await x.claims.check(x.root);const old=token(x);await send(x,'claims_audit',{response:'File `app.ts` exists.'});
 await x.ui.getPanel().messages.listeners[0]({type:'claims_navigate',token:old,index:0,evidence:0,path:'/etc/passwd'});assert.equal(x.fake.editors.length,0);
 const previous=x.claims.getState();await x.fake.commands.get('changeproof.openDashboard')();assert.equal(x.claims.getState(),undefined);assert.equal(previous.response,'');assert.equal(previous.report,null);assert.equal(x.fake.panels.length,1);assert.equal(x.ui.getPanel().title,'Patch Review');
});
test('claim UI escapes assistant prose and file metadata; report validator rejects hostile counts/paths',async t=>{
 const x=fixture(t);const report=await runClaimAudit(process.execPath,x.context.asAbsolutePath('out/claims.cjs'),x.root,'File `app.ts` exists.\n<script>bad()</script>');
 const html=claimHtml({folder:x.root,response:'</textarea><script>bad()</script>',report},'nonce','token');assert.ok(!html.includes('</textarea><script>bad()'));assert.ok(html.includes('&lt;script&gt;'));assert.match(html,/default-src 'none'/);
 const bad=structuredClone(report);bad.claims[0].evidence[0].location.file='../outside';assert.throws(()=>validateClaimReport(bad));const badCounts=structuredClone(report);badCounts.counts.matched=99;assert.throws(()=>validateClaimReport(badCounts));
});
test('sidebar claim action opens the audit for the selected project without running a scan or model request',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cp-claims-activation-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const fake=fakeVscode(root),context={subscriptions:[],extension:{packageJSON:{version:'test'}},logUri:{fsPath:path.join(root,'logs')},asAbsolutePath:p=>path.resolve(__dirname,'..',p)};t.after(()=>context.subscriptions.forEach(d=>d.dispose()));
 const load=Module._load;Module._load=function(id,...args){return id==='vscode'?fake.vscode:load.call(this,id,...args);};let ext;try{delete require.cache[require.resolve('../src/extension.cjs')];ext=require('../src/extension.cjs');}finally{Module._load=load;}ext.activate(context);
 const view=fake.resolveView('changeproof.controls');assert.match(view.webview.html,/Check assistant claims/);await view.messages.listeners[0]({token:view.webview.html.match(/token="([a-f0-9]+)"/)[1],action:'claims'});assert.equal(fake.panels.length,1);assert.ok(fake.panels[0].webview.html.includes(root));assert.ok(!fs.existsSync(path.join(root,'logs/reviews.jsonl')));
});
test('pasted drafts stay in memory across unrelated review status updates and are cleared when closed',async t=>{
 const x=fixture(t);await x.claims.check(x.root);await send(x,'claims_draft',{response:'My in-progress pasted response'});const before=x.ui.getPanel().webview.html;x.ui.setAiConnection({state:'not_checked'});assert.equal(x.ui.getPanel().webview.html,before);assert.equal(x.claims.getState().response,'My in-progress pasted response');const state=x.claims.getState();x.ui.getPanel().dispose();assert.equal(state.response,'');assert.equal(x.claims.getState(),undefined);
});
test('rendered webview wires draft, audit and evidence buttons to fixed messages, never code execution',()=>{
 const vm=require('node:vm'),sent=[],input={value:'File `app.ts` exists.'},audit={},evidence={dataset:{claim:'2',evidence:'1'}};
 const html=claimHtml({folder:'/project',response:''},'nonce','registered-token');
 const script=html.match(/<script nonce="nonce">([\s\S]*?)<\/script>/)[1];
 vm.runInNewContext(script,{acquireVsCodeApi:()=>({postMessage:m=>sent.push(m)}),document:{getElementById:id=>id==='response'?input:audit,querySelectorAll:()=>[evidence]}});
 input.oninput();audit.onclick();evidence.onclick();
 assert.deepEqual(JSON.parse(JSON.stringify(sent)),[{type:'claims_draft',token:'registered-token',response:input.value},{type:'claims_audit',token:'registered-token',response:input.value},{type:'claims_navigate',token:'registered-token',index:2,evidence:1}]);
});
test('body evidence warns on empty definitions while implementation and test claims stay unverified',async t=>{
 const x=fixture(t);await x.claims.check(x.root);
 await send(x,'claims_audit',{response:'Function `visible` exists in `app.ts`.\nImplemented function `visible` in `app.ts`.\nAll tests passed.'});
 const r=x.claims.getState().report;assert.deepEqual(r.counts,{matched:1,contradicted:0,unverified:2});assert.equal(r.implementation_warnings,2);assert.equal(r.claims[0].implementation.kind,'empty_body');
 const html=x.ui.getPanel().webview.html;assert.match(html,/Presence matches are not behavior passes/);assert.match(html,/Implementation evidence: Empty function body/);assert.match(html,/Behavior verified: false/);
 await send(x,'claims_navigate',{index:1,evidence:0});assert.equal(x.fake.editors[0].document.uri.fsPath,fs.realpathSync(path.join(x.root,'app.ts')));
});
test('claim view explains unsupported source input and rejects invented implementation verification',async t=>{
 const x=fixture(t);await x.claims.check(x.root);await send(x,'claims_audit',{response:'function visible() {\nreturn 1;\n}'});assert.match(x.ui.getPanel().webview.html,/No supported file\/function assertion was found/);assert.match(x.ui.getPanel().webview.html,/What can be checked/);
 const r=await runClaimAudit(process.execPath,x.context.asAbsolutePath('out/claims.cjs'),x.root,'Function `visible` exists in `app.ts`.');r.claims[0].implementation.behavior_verified=true;assert.throws(()=>validateClaimReport(r));
});
