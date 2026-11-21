const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const vm=require('node:vm');
const {fakeVscode}=require('./mock-vscode.cjs');
const {createFindingsView}=require('../src/findings-view.cjs');
const {createEvidenceGuard,guardHtml}=require('../src/evidence-guard-ui.cjs');

test('the visible guard action runs the bundled production validator, rejects blank evidence and needs no project/backend',async t=>{
 const fake=fakeVscode(null),context={subscriptions:[],asAbsolutePath:p=>path.resolve(__dirname,'..',p)};
 t.after(()=>context.subscriptions.forEach(d=>d.dispose()));
 const ui=createFindingsView(fake.vscode,context,{record(){},rerun(){}});
 createEvidenceGuard(fake.vscode,context,ui);
 await fake.commands.get('changeproof.testEvidenceGuard')();
 const panel=ui.getPanel(),token=()=>JSON.parse(panel.webview.html.match(/token:("[a-f0-9]+")/)[1]);
 assert.match(panel.webview.html,/No backend needed|No backend|no model requests/);
 await panel.messages.listeners[0]({type:'guard_run',token:'invented'});
 assert.ok(!panel.webview.html.includes('7 / 7'));
 const previous=token();
 await panel.messages.listeners[0]({type:'guard_run',token:previous});
 assert.match(panel.webview.html,/7 \/ 7 guard checks passed/);
 assert.match(panel.webview.html,/Blank line offered as evidence/);
 assert.match(panel.webview.html,/Rejected: <code>invalid_evidence_quote/);
 assert.match(panel.webview.html,/not a hallucination-rate or security test/);
 assert.notEqual(token(),previous);
 assert.equal(fake.docs.length,0);assert.equal(fake.watchers.length,0);assert.equal(ui.getState(),undefined);
});

test('guard client sends only its fixed local action and escapes displayed labels',()=>{
 const html=guardHtml({report:{passed:1,total:1,rows:[{label:'<script>bad()</script>',observed:'<img>',passed:false}]}},'nonce','current-token');
 assert.ok(!html.includes('<script>bad()'));assert.match(html,/&lt;script&gt;/);assert.match(html,/default-src 'none'/);
 const sent=[],button={};vm.runInNewContext(html.match(/<script nonce="nonce">([\s\S]*?)<\/script>/)[1],{document:{getElementById:()=>button},acquireVsCodeApi:()=>({postMessage:m=>sent.push(m)})});
 button.onclick();assert.deepEqual(JSON.parse(JSON.stringify(sent)),[{type:'guard_run',token:'current-token'}]);
});
