const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
const {createDemo,listDemoProfiles}=require('../src/demo.cjs');
const {runEngine}=require('../src/client.cjs');
const {runClaimAudit}=require('../src/claim-client.cjs');
const {fakeVscode}=require('./mock-vscode.cjs');

test('seven packaged sample profiles match authored scanner and claim outcomes without running sample code',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'patch-sample-profiles-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const expectedIndex=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../samples/profiles/index.json'),'utf8'));
 const plainRoot=path.resolve(__dirname,'../../../samples/demo-projects'),plainFolders=JSON.parse(fs.readFileSync(path.join(plainRoot,'index.json'),'utf8'));
 assert.deepEqual(listDemoProfiles().map(p=>p.id),expectedIndex.map(p=>p.id));
 const tlsBefore=process.env.NODE_TLS_REJECT_UNAUTHORIZED;
 for(const p of listDemoProfiles()){
  const sample=path.resolve(__dirname,'../../../samples/profiles',p.id),expected=JSON.parse(fs.readFileSync(path.join(sample,'expected.json'),'utf8'));
  const directory=await createDemo(root,[],()=>{},p.id);
  assert.equal(fs.readFileSync(path.join(directory,'app.ts'),'utf8'),fs.readFileSync(path.join(sample,'after.ts'),'utf8'));
  assert.equal(fs.readFileSync(path.join(directory,'claims.txt'),'utf8'),fs.readFileSync(path.join(sample,'claims.txt'),'utf8'));
  const plain=path.join(plainRoot,plainFolders[p.id]);
  assert.equal(fs.readFileSync(path.join(plain,'app.ts'),'utf8'),fs.readFileSync(path.join(sample,'after.ts'),'utf8'));
  const plainReport=await runEngine(process.execPath,path.resolve(__dirname,'../out/cli.cjs'),plain,()=>{},{mode:'current'});
  assert.equal(plainReport.analysis_complete,true,p.id+' plain folder');
  assert.deepEqual([...new Set(plainReport.findings.map(f=>f.rule_id))].sort(),expected.local_rule_ids,p.id+' plain folder');
  assert.equal(plainReport.runtime_verification,false);
  for(const mode of ['current','changes']){
   const report=await runEngine(process.execPath,path.resolve(__dirname,'../out/cli.cjs'),directory,()=>{},{mode});
   assert.equal(report.analysis_complete,true,p.id+' '+mode);
   assert.deepEqual([...new Set(report.findings.map(f=>f.rule_id))].sort(),expected.local_rule_ids,p.id+' '+mode);
   assert.equal(report.runtime_verification,false);
  }
  const audit=await runClaimAudit(process.execPath,path.resolve(__dirname,'../out/claims.cjs'),directory,fs.readFileSync(path.join(directory,'claims.txt'),'utf8'));
  assert.deepEqual(audit.counts,expected.claim_counts,p.id);
  assert.equal(audit.implementation_warnings,expected.empty_body_observations,p.id);
 }
 assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED,tlsBefore);
});

test('unknown sample IDs fail before creating storage',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'patch-sample-reject-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 await assert.rejects(createDemo(path.join(root,'uncreated'),[],()=>{},'../outside'),/Unknown built-in sample/);
 assert.deepEqual(fs.readdirSync(root),[]);
});

test('sidebar sample picker selects the generated control project and leaves the real workspace unchanged',async t=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'patch-sample-ui-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const project=path.join(base,'actual');fs.mkdirSync(project);fs.writeFileSync(path.join(project,'keep.ts'),'const keep = 1;\n');
 const fake=fakeVscode(project),context={subscriptions:[],extension:{packageJSON:{version:'test'}},globalStorageUri:{fsPath:path.join(base,'extension-storage')},logUri:{fsPath:path.join(base,'logs')},asAbsolutePath:p=>path.resolve(__dirname,'..',p)};
 t.after(()=>context.subscriptions.forEach(d=>d.dispose()));
 let choices;
 fake.vscode.window.showQuickPick=async rows=>{choices=rows;return rows.find(p=>p.profile==='safe-logging');};
 const load=Module._load;Module._load=function(id,...args){return id==='vscode'?fake.vscode:load.call(this,id,...args);};
 let extension;try{delete require.cache[require.resolve('../src/extension.cjs')];extension=require('../src/extension.cjs');}finally{Module._load=load;}
 extension.activate(context);const view=fake.resolveView('changeproof.controls');
 assert.match(view.webview.html,/Choose a sample profile/);
 await view.messages.listeners[0]({token:view.webview.html.match(/token="([a-f0-9]+)"/)[1],action:'demo'});
 assert.equal(choices.length,7);assert.match(fake.panels[0].webview.html,/No findings to display/);
 assert.match(view.webview.html,/safe-logging-/);assert.match(view.webview.html,/value="changes" selected/);
 assert.equal(fs.readFileSync(path.join(project,'keep.ts'),'utf8'),'const keep = 1;\n');assert.deepEqual(fs.readdirSync(project),['keep.ts']);
 const records=fs.readFileSync(path.join(base,'logs/reviews.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.ok(records.some(r=>r.phase==='demo_opened'&&r.sample_profile==='safe-logging'&&r.finding_rule===null));
});
