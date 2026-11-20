const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const {execFileSync}=require('node:child_process');
const vm=require('node:vm');
const {fakeVscode}=require('./mock-vscode.cjs');
const {createScanControls,controlsHtml}=require('../src/scan-controls.cjs');
const token=view=>view.webview.html.match(/token="([a-f0-9]+)"/)[1];
function root(t){const r=fs.mkdtempSync(path.join(os.tmpdir(),'cp-scan-controls-'));t.after(()=>fs.rmSync(r,{recursive:true,force:true}));return r;}
function contextFor(t,fake,directory){
 const saved=new Map(),secrets=new Map(),context={subscriptions:[],workspaceState:{get:k=>saved.get(k),update:async(k,v)=>saved.set(k,v)},secrets:{get:async k=>secrets.get(k),store:async(k,v)=>secrets.set(k,v)},extension:{packageJSON:{version:'test'}},logUri:{fsPath:path.join(directory,'logs')},asAbsolutePath:p=>path.resolve(__dirname,'..',p)};
 t.after(()=>context.subscriptions.forEach(d=>d.dispose()));return {context,saved,secrets};
}
function fixture(t,{review,aiReview,busy=()=>false}={}){
 const directory=root(t),fake=fakeVscode(directory),{context,saved}=contextFor(t,fake,directory),scans=[],ais=[];
 const ui=createScanControls(fake.vscode,context,{review:review||((...args)=>scans.push(args)),aiReview:aiReview||(folder=>ais.push(folder)),isBusy:busy});
 const view=fake.resolveView('changeproof.controls');
 const send=(action,value)=>ui.handle({token:token(view),action,value});return{directory,fake,context,saved,ui,view,scans,ais,send};
}
function activate(fake,context){
 const load=Module._load;Module._load=function(id,...args){return id==='vscode'?fake.vscode:load.call(this,id,...args);};
 let ext;try{delete require.cache[require.resolve('../src/extension.cjs')];ext=require('../src/extension.cjs');}finally{Module._load=load;}
 ext.activate(context);
}
test('manifest contributes a dedicated activity-bar icon, Scan webview and collapsed Results outline',()=>{
 const manifest=require('../package.json'),container=manifest.contributes.viewsContainers.activitybar.find(v=>v.id==='changeproof');
 assert.ok(container);assert.equal(container.title,'Changeproof');assert.ok(fs.readFileSync(path.resolve(__dirname,'..',container.icon),'utf8').includes('<svg'));
 const views=manifest.contributes.views.changeproof;assert.ok(views.some(v=>v.id==='changeproof.controls'&&v.type==='webview'));assert.ok(views.some(v=>v.id==='changeproof.findings'&&v.visibility==='collapsed'));assert.ok(!manifest.contributes.views.explorer);
});
test('visible folder/mode/scan controls reuse a selected folder without a mode picker and persist the choice',async t=>{
 const x=fixture(t);assert.match(x.view.webview.html,/Scan project/);assert.match(x.view.webview.html,/Optional AI/);assert.equal(x.scans.length,0);
 const folder=path.join(x.directory,'chosen');fs.mkdirSync(folder);x.fake.setDialog([x.fake.vscode.Uri.file(folder)]);
 await x.send('browse');assert.equal(x.scans.length,0);assert.equal(x.ui.model().folder,folder);
 await x.send('mode','changes');await x.send('scan');assert.equal(x.scans.length,1);assert.deepEqual(x.scans[0],[folder,{mode:'changes',selection:'controls'}]);
 assert.deepEqual(x.saved.get('changeproof.scanSelection'),{folder,mode:'changes'});
 const next=createScanControls(x.fake.vscode,x.context,{review(){},aiReview(){}});assert.equal(next.model().folder,folder);assert.equal(next.model().mode,'changes');
});
test('per-render tokens, folder registry and action allowlist reject supplied paths and arbitrary commands',async t=>{
 const x=fixture(t),old=token(x.view);await x.send('mode','changes');await x.ui.handle({token:old,action:'scan'});assert.equal(x.scans.length,0);
 await x.send('folder','/etc');assert.equal(x.ui.model().folder,x.directory);assert.equal(x.scans.length,0);
 await x.send('executeCommand','workbench.action.terminal.new');assert.equal(x.fake.executedCommands.length,0);
 await x.send('profile','unbounded');assert.equal(x.fake.configurationUpdates.length,0);
 await x.send('settings');assert.deepEqual(x.fake.executedCommands.at(-1),['workbench.action.openSettings','@ext:changeproof-local.changeproof-local']);
});
test('profile changes write only the user setting and optional AI uses the selected folder without inference approval',async t=>{
 const x=fixture(t);await x.send('profile','full');assert.deepEqual(x.fake.configurationUpdates,[{key:'aiProfile',value:'full',target:x.fake.vscode.ConfigurationTarget.Global}]);assert.equal(x.ui.model().profile,'full');assert.equal(x.scans.length,0);assert.equal(x.ais.length,0);
 const folder=path.join(x.directory,'ai-project');fs.mkdirSync(folder);x.fake.setDialog([x.fake.vscode.Uri.file(folder)]);await x.send('browse');await x.send('ai');assert.deepEqual(x.ais,[folder]);assert.equal(x.ui.model().mode,'current');
 await x.send('health');assert.deepEqual(x.fake.executedCommands.at(-1),['changeproof.refreshAiStatus']);assert.ok(!x.fake.executedCommands.some(([name])=>name==='changeproof.checkAiConnection'));
});
test('busy scans disable controls and duplicate clicks cannot start concurrent work or rewrite settings',async t=>{
 let release,entered;const started=new Promise(r=>entered=r),calls=[];
 const x=fixture(t,{review:async(...args)=>{calls.push(args);entered();await new Promise(r=>release=r);}});
 const pending=x.send('scan');await started;assert.equal(x.ui.model().busy,true);assert.match(x.view.webview.html,/Working…/);
 await x.send('scan');await x.send('profile','full');assert.equal(calls.length,1);assert.equal(x.fake.configurationUpdates.length,0);release();await pending;assert.equal(x.ui.model().busy,false);
});
test('sidebar content escapes metadata, uses a nonce CSP and distinguishes local scope from AI transmission',t=>{
 const x=fixture(t),m=x.ui.model();m.folder='/project/<script>alert(1)</script>';m.folders=[{path:m.folder,label:'<img onerror="bad">'}];const html=controlsHtml(m,'nonce','token');assert.ok(!html.includes('<script>alert'));assert.ok(html.includes('&lt;script&gt;'));assert.match(html,/default-src 'none'/);assert.match(html,/script-src 'nonce-nonce'/);assert.ok(!html.includes('unsafe-inline'));assert.match(html,/no code uploads/);assert.match(html,/approve the exact payload/);assert.match(html,/100 KB/);assert.match(html,/9 KB/);
});
test('actual sidebar Scan runs bundled CLI, opens the dashboard and performs no mode picker, demo or Git initialization',async t=>{
 const directory=root(t),folder=path.join(directory,'project');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'app.ts'),'function route(req){console.log(req.headers.authorization);}\n');
 const fake=fakeVscode(folder),{context,saved}=contextFor(t,fake,directory);fake.vscode.window.showQuickPick=()=>{throw new Error('Scan button must not open a command/mode picker');};activate(fake,context);
 const view=fake.resolveView('changeproof.controls'),provider=fake.viewProviders.get('changeproof.controls');assert.ok(provider);const message={token:token(view),action:'scan'};await view.messages.listeners[0](message);
 assert.equal(fake.panels.length,1);assert.match(fake.panels[0].webview.html,/Evidence trail/);assert.match(view.webview.html,/1 finding\(s\)/);assert.ok(!fs.existsSync(path.join(folder,'.git')));assert.equal(saved.get('changeproof.scanSelection').folder,folder);
 const records=fs.readFileSync(path.join(directory,'logs/reviews.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.ok(records.some(r=>r.phase==='completed'&&r.review_mode==='current'&&r.selected_folder===folder));assert.ok(!records.some(r=>r.phase?.startsWith('demo')));
 await fake.commands.get('changeproof.openControls')();assert.deepEqual(fake.executedCommands.at(-1),['workbench.view.extension.changeproof']);
});
test('actual sidebar AI prepares the chosen folder/full profile preview without a backend call or token',async t=>{
 const directory=root(t),folder=path.join(directory,'selected');fs.mkdirSync(folder);const file=path.join(folder,'app.ts');fs.writeFileSync(file,'function route(req,res){return res.send("ok");}\n');
 const git=(...args)=>execFileSync('git',['-C',folder,...args],{stdio:'ignore'});git('init','-q');git('add','.');git('-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid','-c','commit.gpgSign=false','commit','-qm','baseline');fs.writeFileSync(file,'function route(req,res){console.log(req.headers.authorization);return res.send("ok");}\n');
 const fake=fakeVscode(directory),{context}=contextFor(t,fake,directory);activate(fake,context);const view=fake.resolveView('changeproof.controls'),send=(action,value)=>view.messages.listeners[0]({token:token(view),action,value});
 fake.setDialog([fake.vscode.Uri.file(folder)]);await send('browse');await send('profile','full');await send('ai');assert.equal(fake.panels.length,1);assert.match(fake.panels[0].webview.html,/Exact JSON request/);assert.match(fake.panels[0].webview.html,/Profile: full/);assert.ok(fake.panels[0].webview.html.includes(folder));assert.match(fake.panels[0].webview.html,/Approve and send/);assert.ok(!fs.existsSync(path.join(directory,'logs/reviews.jsonl')));assert.match(view.webview.html,/value="current" selected/);
});

test('actual sidebar client script wires buttons/dropdowns and preserves the Optional AI disclosure state',t=>{
 const x=fixture(t),html=x.view.webview.html;
 const nodes=[...html.matchAll(/<(button|select|details)\b([^>]*)>/g)].map(([,tag,raw])=>{const attributes=Object.fromEntries([...raw.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,k,v])=>[k,v]));return{tag,attributes,dataset:{action:attributes['data-action']},disabled:/\sdisabled(?:\s|$)/.test(raw),open:false};});
 const document={getElementById:id=>nodes.find(n=>n.attributes.id===id),querySelectorAll:selector=>selector==='button,select'?nodes.filter(n=>['button','select'].includes(n.tag)):nodes.filter(n=>n.dataset.action)};
 const messages=[];let state={aiOpen:true};vm.runInNewContext(html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1],{document,acquireVsCodeApi:()=>({getState:()=>state,setState:s=>state=s,postMessage:m=>messages.push(m)})});
 assert.equal(document.getElementById('ai').open,true);document.getElementById('profile').onchange({target:{value:'full'}});assert.equal(messages.at(-1).action,'profile');assert.equal(messages.at(-1).value,'full');assert.ok(nodes.filter(n=>['button','select'].includes(n.tag)).every(n=>n.disabled));
 nodes.find(n=>n.dataset.action==='scan').onclick();assert.equal(messages.at(-1).action,'scan');assert.equal(messages.at(-1).token,token(x.view));
 document.getElementById('ai').open=false;document.getElementById('ai').ontoggle();assert.equal(state.aiOpen,false);
});
