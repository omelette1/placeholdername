const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {escapeHtml,detailsHtml,safeTarget,sidebar,relevantChange}=require('../src/finding-ui.cjs');const {createFindingsView}=require('../src/findings-view.cjs');const {fakeVscode}=require('./mock-vscode.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'cp-finding-ui-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file='odd <&"\' name.ts';fs.writeFileSync(path.join(root,file),'function f(req) {\nconst raw = req.headers.authorization;\nconst copied = raw;\nconsole.log(copied);\n}\n');const loc=(line,start=1,end=10)=>({file,start:{line,column:start},end:{line,column:end}});
 const finding={rule_id:'CP002',title:'Potential authorization-header logging',explanation:'Existing <explanation> & text',location:loc(4),newly_introduced:true,runtime_verification:false,limitations:['Do not infer <script>alert(1)</script> runtime results.'],evidence:{kind:'function_local_data_flow',paths:[{source:{location:loc(2,13,38)},assignments:[{kind:'declaration',variable:'raw',location:loc(2)},{kind:'declaration',variable:'copied',location:loc(3)}],logging:{location:loc(4),console_method:'log',argument_index:0},newly_introduced:true,comparison:'not_matched_in_HEAD'}]}};
 const report={repository:root,compared_revision:'synthetic-HEAD',analysis_complete:true,findings:[finding],coverage:{status:'analyzed'},files_inspected:[{file,status:'modified',coverage:{status:'analyzed',scopes:[{kind:'function',status:'analyzed',supported_steps:3,location:loc(1)}]}}],analysis_errors:[],analysis_limitations:[],skipped_files:[],untracked_files:[]};
 const fake=fakeVscode(root),records=[],reruns=[];const ui=createFindingsView(fake.vscode,{subscriptions:[]},{record:r=>records.push(r),rerun:(...args)=>reruns.push(args)});return{root,file,loc,finding,report,fake,ui,records,reruns};}
test('details safely escape unusual filenames, identifier labels and explanations with restrictive CSP',t=>{
 const f=fixture(t);f.finding.evidence.paths[0].assignments[0].variable='x</button><script>evil()</script>&"';const html=detailsHtml({id:'trusted-id',selectionToken:'trusted-token',folder:f.root,demo:true,report:f.report,stale:false},f.finding,'abc123');
 assert.match(html,/default-src 'none'/);assert.match(html,/script-src 'nonce-abc123'/);assert.ok(!html.includes('unsafe-inline'));assert.ok(!html.includes('<script>evil()'));assert.ok(html.includes('x&lt;/button&gt;&lt;script&gt;evil()&lt;/script&gt;&amp;&quot;'));assert.ok(html.includes(escapeHtml(f.file)));assert.ok(html.includes('SOURCE'));assert.ok(html.includes('ASSIGNMENT'));assert.ok(html.includes('LOGGING'));assert.ok(!html.includes('command:'));assert.ok(!html.includes('data-path='));
});
test('navigation opens and selects source, assignments and log, with labeled decorations and cleanup',async t=>{
 const f=fixture(t),id=f.ui.begin(f.root,{demo:true});f.ui.finish(id,f.report);await f.ui.select(id,0);
 for(const [step,line] of [[0,1],[1,1],[2,2],[3,3]]){assert.equal(await f.ui.navigate(id,step),true);assert.equal(f.fake.vscode.window.activeTextEditor.selection.start.line,line);assert.equal(f.fake.vscode.window.activeTextEditor.document.uri.fsPath,path.join(f.root,f.file));}
 assert.equal(f.fake.types.length,3);for(const type of f.fake.types)assert.match(type.style.after.contentText,/SOURCE|ASSIGNMENT|LOGGING/);
 assert.ok([...f.fake.editors[0].decorations.values()].some(v=>v.length));f.ui.clearSelection();assert.ok([...f.fake.editors[0].decorations.values()].every(v=>v.length===0));
 assert.equal(await f.ui.navigate(id,0),false);
});
test('selection change clears old decorations and stale webview messages cannot select old steps',async t=>{
 const f=fixture(t);const second=structuredClone(f.finding);second.location=f.loc(3);second.evidence.paths[0].logging.location=f.loc(3);f.report.findings.push(second);const id=f.ui.begin(f.root);f.ui.finish(id,f.report);await f.ui.select(id,0);await f.ui.navigate(id,0);
 const oldToken=f.ui.getState().selectionToken;await f.ui.select(id,1);assert.notEqual(f.ui.getState().selectionToken,oldToken);const before=f.records.filter(r=>r.phase==='evidence_navigated').length;
 f.fake.panels[0].messages.fire({type:'navigate',reviewId:id,selectionToken:oldToken,step:0});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.records.filter(r=>r.phase==='evidence_navigated').length,before);
});
test('unsaved edits clear diagnostics/decorations, mark details stale, and do not run analysis',async t=>{
 const f=fixture(t),id=f.ui.begin(f.root);f.ui.finish(id,f.report);await f.ui.select(id,0);await f.ui.navigate(id,3);const doc=f.fake.editors[0].document;doc.isDirty=true;f.fake.changes.fire({document:doc,contentChanges:[{text:'new'}]});
 assert.equal(f.ui.getState().stale,true);assert.equal(f.fake.diagnostics.size,0);assert.ok([...f.fake.editors[0].decorations.values()].every(v=>!v.length));assert.match(f.fake.panels[0].webview.html,/STALE/);assert.match(f.fake.panels[0].webview.html,/data-step="0" disabled/);assert.equal(f.reruns.length,0);assert.equal(await f.ui.navigate(id,0),false);
 f.fake.panels[0].messages.fire({type:'rerun',reviewId:id,selectionToken:f.ui.getState().selectionToken});assert.equal(f.reruns.length,1,'only explicit rerun action invokes callback');
});
test('filesystem changes mark stale, review replacement rejects old IDs and clears selection',async t=>{
 const f=fixture(t),id=f.ui.begin(f.root);f.ui.finish(id,f.report);await f.ui.select(id,0);await f.ui.navigate(id,3);fs.appendFileSync(path.join(f.root,f.file),'// changed\n');f.fake.watchers.at(-1).change.fire(f.fake.vscode.Uri.file(path.join(f.root,f.file)));assert.equal(f.ui.getState().stale,true);assert.equal(f.reruns.length,0);
 const next=f.ui.begin(f.root);assert.ok([...f.fake.editors[0].decorations.values()].every(v=>!v.length));f.ui.finish(next,f.report);assert.equal(await f.ui.navigate(id,0),false);assert.match(f.fake.panels[0].webview.html,/Review workspace/);assert.match(f.fake.panels[0].webview.html,/Evidence trail/);
});
test('outside paths, symlink swaps and out-of-range locations are refused',async t=>{
 const f=fixture(t);assert.throws(()=>safeTarget(f.root,{...f.loc(1),file:'../outside.ts'}));assert.throws(()=>safeTarget(f.root,{...f.loc(1),file:'/etc/passwd'}));
 const id=f.ui.begin(f.root);f.ui.finish(id,f.report);await f.ui.select(id,0);fs.unlinkSync(path.join(f.root,f.file));fs.symlinkSync('/etc/passwd',path.join(f.root,f.file));assert.equal(await f.ui.navigate(id,0),false);assert.throws(()=>safeTarget(f.root,f.loc(1)),/symbolic link/);
});
test('empty/loading/partial/error states keep findings separate from coverage and failures',t=>{
 const f=fixture(t);assert.match(sidebar()[0].label,/No review/);const id=f.ui.begin(f.root);assert.match(f.fake.flatten().find(i=>i.label==='Waiting for actual results…').label,/Waiting/);f.report.findings=[];f.report.coverage.status='partial';f.ui.finish(id,f.report);
 const roots=f.fake.trees[0].provider.getChildren();assert.ok(roots.some(i=>i.label==='Findings (0)'));assert.ok(roots.some(i=>i.label==='Coverage: partial'));assert.ok(!roots.find(i=>i.label==='Findings (0)').children.some(i=>i.label.startsWith('Coverage:')));assert.match(roots.find(i=>i.label==='Findings (0)').children[0].label,/does not establish safety/);
 const next=f.ui.begin(f.root);f.ui.fail(next,'Trusted Node unavailable');assert.ok(f.fake.flatten().some(i=>i.label==='Trusted Node unavailable'));
});
test('relevant changes include HEAD, index and code but ignore Git lock/log churn',t=>{
 const f=fixture(t),uri=p=>f.fake.vscode.Uri.file(path.join(f.root,p));assert.equal(relevantChange(f.root,uri(f.file)),true);assert.equal(relevantChange(f.root,uri('.git/HEAD')),true);assert.equal(relevantChange(f.root,uri('.git/index.lock')),false);assert.equal(relevantChange(f.root,uri('.git/logs/HEAD')),false);
});

test('webview button messages use the current selection registry, not supplied paths',async t=>{
 const f=fixture(t),id=f.ui.begin(f.root);f.ui.finish(id,f.report);await f.ui.select(id,0);const token=f.ui.getState().selectionToken;
 f.fake.panels[0].messages.fire({type:'navigate',reviewId:id,selectionToken:token,step:2,path:'/etc/passwd'});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.fake.vscode.window.activeTextEditor.document.uri.fsPath,path.join(f.root,f.file));assert.equal(f.fake.vscode.window.activeTextEditor.selection.start.line,2);
 const count=f.records.filter(r=>r.phase==='evidence_navigated').length;f.fake.panels[0].messages.fire({type:'navigate',reviewId:id,selectionToken:token,step:1000});await new Promise(resolve=>setImmediate(resolve));assert.equal(f.records.filter(r=>r.phase==='evidence_navigated').length,count);
});
test('coordinates outside the actual document are stale and cannot navigate',async t=>{
 const f=fixture(t);f.finding.evidence.paths[0].source.location=f.loc(999);const id=f.ui.begin(f.root);f.ui.finish(id,f.report);await f.ui.select(id,0);assert.equal(await f.ui.navigate(id,0),false);assert.equal(f.ui.getState().stale,true);assert.match(f.fake.warnings.at(-1)[0],/no longer matches/);
});

test('a delayed notification for a file already saved before explicit rerun does not stale the new review',t=>{
 const f=fixture(t);let id=f.ui.begin(f.root);f.ui.finish(id,f.report);fs.appendFileSync(path.join(f.root,f.file),'// saved before rerun\n');
 id=f.ui.begin(f.root);f.fake.watchers.at(-1).change.fire(f.fake.vscode.Uri.file(path.join(f.root,f.file)));f.ui.finish(id,f.report);assert.equal(f.ui.getState().stale,false);
 fs.appendFileSync(path.join(f.root,f.file),'// actually newer change\n');f.fake.watchers.at(-1).change.fire(f.fake.vscode.Uri.file(path.join(f.root,f.file)));assert.equal(f.ui.getState().stale,true);
});

test('a no-folder setup error safely ignores unrelated editor changes',t=>{
 const f=fixture(t),id=f.ui.begin(null);f.ui.fail(id,'No local workspace folder is open.');assert.doesNotThrow(()=>f.fake.changes.fire({document:{uri:f.fake.vscode.Uri.file(path.join(f.root,f.file)),isDirty:true},contentChanges:[{text:'changed'}]}));assert.equal(f.ui.getState().stale,false);assert.equal(f.reruns.length,0);
});

test('native-style separate dirty-state events invalidate results even without contentChanges',async t=>{
 const f=fixture(t),id=f.ui.begin(f.root);f.ui.finish(id,f.report);await f.ui.select(id,0);await f.ui.navigate(id,3);const document=f.fake.editors[0].document;
 f.fake.changes.fire({document,contentChanges:[{text:'edit before dirty flag'}]});assert.equal(f.ui.getState().stale,false);
 document.isDirty=true;f.fake.changes.fire({document,contentChanges:[]});assert.equal(f.ui.getState().stale,true);assert.equal(f.fake.diagnostics.size,0);assert.equal(f.reruns.length,0);
});

test('first-review delayed filesystem events are checked against actual engine input snapshots',t=>{
 const f=fixture(t);const signature=file=>{const s=fs.statSync(file,{bigint:true});return [s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.mode].join(':');};const file=path.join(f.root,f.file);f.report.files_inspected[0].snapshot=signature(file);
 let id=f.ui.begin(f.root);f.fake.watchers.at(-1).change.fire(f.fake.vscode.Uri.file(file));assert.equal(f.ui.getState().stale,false);f.ui.finish(id,f.report);assert.equal(f.ui.getState().stale,false,'late notification matches the engine snapshot');
 id=f.ui.begin(f.root);fs.appendFileSync(file,'// changed after snapshot\n');f.fake.watchers.at(-1).change.fire(f.fake.vscode.Uri.file(file));f.ui.finish(id,f.report);assert.equal(f.ui.getState().stale,true,'a real change after the read must remain stale');assert.equal(f.reruns.length,0);
});

test('saved same-length edits invalidate evidence before watcher delivery and clear highlights',async t=>{
 const f=fixture(t),id=f.ui.begin(f.root);f.ui.finish(id,f.report);await f.ui.select(id,0);await f.ui.navigate(id,3);
 const target=path.join(f.root,f.file);fs.writeFileSync(target,fs.readFileSync(target,'utf8').replaceAll('copied','public'));
 assert.equal(f.ui.getState().stale,false,'no watcher notification has been delivered');
 assert.equal(await f.ui.navigate(id,3),false);assert.equal(f.ui.getState().stale,true);
 assert.equal(f.fake.diagnostics.size,0);assert.ok([...f.fake.editors[0].decorations.values()].every(v=>!v.length));
 assert.equal(f.reruns.length,0);
});

test('selecting a finding after a saved edit never paints stale locations',async t=>{
 const f=fixture(t),id=f.ui.begin(f.root);f.ui.finish(id,f.report);
 fs.appendFileSync(path.join(f.root,f.file),'// no watcher event\n');await f.ui.select(id,0);
 assert.equal(f.ui.getState().stale,true);assert.equal(f.fake.types.length,0);assert.equal(f.fake.diagnostics.size,0);
});

test('a saved edit while opening a document is refused even when all coordinates still fit',async t=>{
 const f=fixture(t),id=f.ui.begin(f.root);f.ui.finish(id,f.report);await f.ui.select(id,0);
 const open=f.fake.vscode.workspace.openTextDocument;
 f.fake.vscode.workspace.openTextDocument=async uri=>{const doc=await open(uri);fs.appendFileSync(uri.fsPath,'// saved during open\n');return doc;};
 assert.equal(await f.ui.navigate(id,3),false);assert.equal(f.fake.editors.length,0);assert.equal(f.ui.getState().stale,true);
});

test('source changes during showTextDocument clear decorations and do not record successful navigation',async t=>{
 const f=fixture(t),id=f.ui.begin(f.root);f.ui.finish(id,f.report);await f.ui.select(id,0);
 const show=f.fake.vscode.window.showTextDocument;
 f.fake.vscode.window.showTextDocument=async(doc,opts)=>{const editor=await show(doc,opts);fs.appendFileSync(doc.uri.fsPath,'// saved during reveal\n');return editor;};
 assert.equal(await f.ui.navigate(id,3),false);assert.equal(f.ui.getState().stale,true);
 assert.ok([...f.fake.editors[0].decorations.values()].every(v=>!v.length));assert.ok(!f.records.some(r=>r.phase==='evidence_navigated'));
});

test('even reselection of the same finding cancels a pending old navigation',async t=>{
 const f=fixture(t),id=f.ui.begin(f.root);f.ui.finish(id,f.report);await f.ui.select(id,0);
 const open=f.fake.vscode.workspace.openTextDocument;
 f.fake.vscode.workspace.openTextDocument=async uri=>{const doc=await open(uri);await f.ui.select(id,0);return doc;};
 assert.equal(await f.ui.navigate(id,3),false);assert.equal(f.fake.editors.length,0);assert.equal(f.ui.getState().stale,false);
});

test('review and explicit rerun actions are available directly in the persistent sidebar',t=>{
 const f=fixture(t);
 assert.ok(f.fake.flatten().some(i=>i.command?.command==='changeproof.reviewProject'));
 assert.ok(!f.fake.flatten().some(i=>i.command?.command==='changeproof.rerunReview'));
 const id=f.ui.begin(f.root,{mode:'current'});f.ui.finish(id,f.report);
 assert.ok(f.fake.flatten().some(i=>i.command?.command==='changeproof.rerunReview'));
 assert.equal(f.reruns.length,0);
});

test('closing a details webview does not invalidate an otherwise current saved-source selection',async t=>{
 const f=fixture(t),id=f.ui.begin(f.root);f.ui.finish(id,f.report);await f.ui.select(id,0);
 assert.equal(await f.ui.navigate(id,0),true);
 f.fake.panels[0].dispose();
 assert.equal(f.ui.getState().stale,false);
 assert.equal(await f.ui.navigate(id,1),true,'a disposed details tab must not silently discard current evidence selection');
 assert.equal(f.fake.panels.length,2,'source navigation reopens a disposed details panel');
 assert.equal(f.fake.panels.at(-1).viewColumn,f.fake.vscode.ViewColumn.Two,'details remain in a separate editor column');
 assert.equal(f.fake.vscode.window.activeTextEditor.document.uri.fsPath,path.join(f.root,f.file));
});
