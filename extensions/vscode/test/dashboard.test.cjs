const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fakeVscode}=require('./mock-vscode.cjs');
const {createFindingsView}=require('../src/findings-view.cjs');
const {dashboardHtml}=require('../src/dashboard.cjs');
const vm=require('node:vm');
async function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cp-dashboard-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,'app.ts'),'eval(input);\n');
 const {analyze}=await import('../../../packages/engine/src/engine.mjs');const report=analyze(root,{mode:'current'});
 const fake=fakeVscode(root),reruns=[],context={subscriptions:[]},ui=createFindingsView(fake.vscode,context,{record(){},rerun:(...args)=>reruns.push(args)});
 t.after(()=>context.subscriptions.forEach(d=>d.dispose()));return{root,report,fake,ui,reruns};
}
const token=panel=>panel.webview.html.match(/dashboardToken="([a-f0-9]+)"/)[1];
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('finishing a review automatically opens one dashboard with summary, list and first finding evidence',async t=>{
 const x=await fixture(t),id=x.ui.begin(x.root,{mode:'current'});assert.equal(x.fake.panels.length,0);x.ui.finish(id,x.report);
 assert.equal(x.fake.panels.length,1);assert.equal(x.fake.panels[0].title,'Patch Review');assert.equal(x.fake.panels[0].viewColumn,x.fake.vscode.ViewColumn.Two,'review opens beside source rather than moving its tab on first navigation');
 const html=x.fake.panels[0].webview.html;for(const text of ['Code findings','Configuration','CP002 coverage','Infrastructure','Evidence trail','Potential dynamic code execution','Open evidence'])assert.ok(html.includes(text));
 assert.match(html,/data-finding="0"/);assert.match(html,/data-step="0"/);assert.equal(x.fake.editors.length,0,'auto-open does not open target code');
 assert.equal(x.reruns.length,0);await x.fake.commands.get('changeproof.openDashboard')();assert.equal(x.fake.panels.length,1);await x.ui.navigate(id,0);assert.equal(x.fake.panels[0].viewColumn,x.fake.vscode.ViewColumn.Two);
});

test('dashboard selection and actions use review-scoped tokens, a registry and an action allowlist',async t=>{
 const x=await fixture(t),id=x.ui.begin(x.root,{mode:'current'});x.ui.finish(id,x.report);const p=x.fake.panels[0],message={reviewId:id,dashboardToken:token(p)};
 p.messages.fire({...message,type:'dashboard_select',index:0,path:'/etc/passwd'});await tick();assert.equal(x.fake.editors.length,0);
 const next={reviewId:id,dashboardToken:token(p)};
 p.messages.fire({...message,type:'dashboard_action',action:'rerun'});await tick();assert.equal(x.reruns.length,0,'old rendered dashboard token is rejected');
 p.messages.fire({...next,type:'dashboard_action',action:'executeAnything'});await tick();assert.equal(x.reruns.length,0);
 p.messages.fire({...next,type:'dashboard_action',action:'rerun'});await tick();assert.equal(x.reruns.length,1);assert.equal(x.reruns[0][0],x.root);assert.equal(x.reruns[0][1].mode,'current');
});

test('empty, partial, missing-tool, error and stale states remain visible rather than claiming safety',async t=>{
 const x=await fixture(t);x.report.findings=[];x.report.coverage.status='partial';x.report.infrastructure.reason='Checkov missing';
 let id=x.ui.begin(x.root,{mode:'current'});x.ui.finish(id,x.report);let html=x.fake.panels[0].webview.html;
 for(const text of ['No findings to display','Partial code coverage','Checkov missing','not assessed','not proof of safety'])assert.ok(html.includes(text),text);
 id=x.ui.begin(x.root);x.ui.fail(id,'Trusted Node is unavailable');assert.match(x.fake.panels[0].webview.html,/Trusted Node is unavailable/);assert.equal(x.fake.panels.length,1);
 x.ui.finish(id,{...x.report,findings:[{rule_id:'CP004',title:'Example',explanation:'Syntax only',location:{file:'app.ts',start:{line:1,column:1},end:{line:1,column:12}},newly_introduced:null,runtime_verification:false,evidence:{kind:'risky_syntax',pattern:'direct_eval'},limitations:[]}]});
 x.ui.stale('edited');html=x.fake.panels[0].webview.html;assert.match(html,/STALE/);assert.match(html,/data-step="0" disabled/);assert.equal(x.reruns.length,0);
});

test('dashboard escapes project paths, finding fields and filter attributes; CSP permits no external resources',async t=>{
 const x=await fixture(t);x.report.findings[0].title='<script>bad()</script>"';x.report.findings[0].location.file='odd" onclick="bad.ts';
 const html=dashboardHtml({id:'id',folder:'/project/<img>',mode:'current',report:x.report,selectionToken:'selection'},0,'nonce','token');
 assert.ok(!html.includes('<script>bad()'));assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));assert.ok(!html.includes('file="odd" onclick='));assert.match(html,/default-src 'none'/);assert.match(html,/script-src 'nonce-nonce'/);assert.ok(!html.includes('unsafe-inline'));assert.ok(!html.includes('command:'));
});

function client(html,saved){
 const decode=s=>s.replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
 const nodes=[...html.matchAll(/<(button|input|p)\b([^>]*)>/g)].map(([,tag,raw])=>{
   const attributes=Object.fromEntries([...raw.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,k,v])=>[k,decode(v)]));
   const classes=new Set((attributes.class||'').split(' '));
   return {tag,attributes,dataset:Object.fromEntries(Object.entries(attributes).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5),v])),hidden:/\shidden(?:\s|$)/.test(raw),value:'',classList:{toggle(c,on){on?classes.add(c):classes.delete(c);}},setAttribute(k,v){attributes[k]=v;}};
 });
 const document={querySelectorAll(selector){const key=selector.slice(6,-1);return nodes.filter(n=>key in n.dataset);},getElementById(id){return nodes.find(n=>n.attributes.id===id);}};
 const messages=[];let stored=saved;
 vm.runInNewContext(html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1],{document,acquireVsCodeApi:()=>({postMessage:m=>messages.push(m),getState:()=>stored,setState:s=>{stored=s;}})});
 return{nodes,messages,document,stored:()=>stored,visible:()=>nodes.filter(n=>'finding' in n.dataset&&!n.hidden)};
}

test('actual dashboard client script filters/searches findings and emits bounded selection/evidence/action messages',async t=>{
 const x=await fixture(t);const config=structuredClone(x.report.findings[0]);config.rule_id='CKV_DOCKER_3';config.title='Container user declaration';config.location.file='Dockerfile';x.report.findings.push(config);
 const state={id:'review',selectionToken:'selection',folder:x.root,mode:'current',report:x.report};const html=dashboardHtml(state,0,'nonce','dashboard');const c=client(html);
 assert.equal(c.visible().length,2);const button=(key,value)=>c.nodes.find(n=>n.dataset[key]===value);
 button('filter','config').onclick();assert.equal(c.visible().length,1);assert.equal(c.visible()[0].dataset.category,'config');
 const search=c.document.getElementById('search');search.value='missing';search.oninput();assert.equal(c.visible().length,0);assert.equal(c.document.getElementById('no-match').hidden,false);
 search.value='Docker';search.oninput();c.visible()[0].onclick();assert.deepEqual(JSON.parse(JSON.stringify(c.messages.at(-1))),{type:'dashboard_select',reviewId:'review',dashboardToken:'dashboard',selectionToken:'selection',index:1});
 button('step','0').onclick();assert.equal(c.messages.at(-1).type,'navigate');assert.equal(c.messages.at(-1).step,0);button('action','rerun').onclick();assert.equal(c.messages.at(-1).action,'rerun');
 const reloaded=client(html,c.stored());assert.equal(reloaded.visible().length,1);assert.equal(reloaded.document.getElementById('search').value,'Docker');
 const next=client(dashboardHtml({...state,id:'new-review'},0,'nonce','dashboard'),c.stored());assert.equal(next.visible().length,2);assert.equal(next.document.getElementById('search').value,'');
});
