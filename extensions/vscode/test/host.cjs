const vscode=require('vscode');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
async function run(){
 const folder=vscode.workspace.workspaceFolders?.[0];assert.ok(folder);
 const extension=vscode.extensions.getExtension('changeproof-local.changeproof-local');assert.ok(extension);
 if(process.env.CHANGEPROOF_EXPECT_INSTALLED){const relative=path.relative(fs.realpathSync(process.env.CHANGEPROOF_EXPECT_INSTALLED),fs.realpathSync(extension.extensionPath));assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));}
 assert.equal(extension.packageJSON.version,require('../package.json').version);
 const pickedModes=[];
 // Capture real native objects; factory calls are still forwarded to VS Code.
 const targetVscode=require('node:module').createRequire(path.join(extension.extensionPath,'src/extension.cjs'))('vscode');
 let panel,provider,receiveMessage;const decorationStyles=[];
 const createPanel=targetVscode.window.createWebviewPanel,createTree=targetVscode.window.createTreeView,createDecoration=targetVscode.window.createTextEditorDecorationType;
 targetVscode.window.createWebviewPanel=(...args)=>{panel=createPanel(...args);const listen=panel.webview.onDidReceiveMessage;panel.webview.onDidReceiveMessage=(handler,...rest)=>{receiveMessage=handler;return listen.call(panel.webview,handler,...rest);};return panel;};
 targetVscode.window.createTreeView=(id,options)=>{provider=options.treeDataProvider;return createTree(id,options);};
 targetVscode.window.createTextEditorDecorationType=style=>{decorationStyles.push(style);return createDecoration(style);};
 await extension.activate();await vscode.workspace.getConfiguration('changeproof').update('nodePath',process.env.CHANGEPROOF_TEST_NODE,vscode.ConfigurationTarget.Global);
 const records=()=>{const values=[];function walk(dir){if(!fs.existsSync(dir))return;for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else if(item.name==='reviews.jsonl')values.push(...fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse));}}walk(path.join(process.env.CHANGEPROOF_TEST_PROFILE,'logs'));return values;};
 async function waitFor(predicate,message){for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error(message);}
 const latest=phase=>records().filter(r=>r.phase===phase).at(-1);
 const file=path.join(folder.uri.fsPath,'app.ts'),uri=vscode.Uri.file(file);
 const diagnostics=()=>vscode.languages.getDiagnostics().flatMap(([uri,items])=>items.filter(d=>d.source==='Patch (static)').map(d=>({uri,d})));
 await vscode.commands.executeCommand('changeproof.reviewLocalChanges');assert.equal(diagnostics().length,1);assert.equal(diagnostics()[0].d.code,'CP002');assert.equal(diagnostics()[0].d.range.start.line,3);
 const review=latest('review_presented');assert.equal(review.coverage,'analyzed');
 const groups=provider.getChildren();assert.ok(groups.some(g=>g.label==='Findings (1)'));assert.ok(groups.some(g=>g.label==='Coverage: analyzed'));assert.ok(!groups.find(g=>g.label==='Findings (1)').children.some(c=>c.label.startsWith('Coverage:')));
 const findingItem=groups.find(g=>g.label==='Findings (1)').children[0];assert.equal(findingItem.command.command,'changeproof.openFinding');
 await vscode.commands.executeCommand(findingItem.command.command,...findingItem.command.arguments);assert.ok(panel,'clicking native sidebar command opened a real webview');assert.match(panel.webview.html,/default-src 'none'/);assert.match(panel.webview.html,/Coverage/);
 const navigationWarnings=[];const previousWarning=targetVscode.window.showWarningMessage;
 targetVscode.window.showWarningMessage=(...args)=>{navigationWarnings.push(String(args[0]));return previousWarning(...args);};
 for(const [step,line] of [[0,1],[1,1],[2,2],[3,3]]){assert.equal(await vscode.commands.executeCommand('changeproof.openEvidenceStep',review.review_id,step),true,'Evidence navigation step '+step+' failed: '+(navigationWarnings.at(-1)||'no warning captured')+'; stale records: '+JSON.stringify(records().filter(r=>r.phase==='review_stale').slice(-3)));assert.equal(vscode.window.activeTextEditor.selection.start.line,line);assert.equal(vscode.window.activeTextEditor.document.uri.fsPath,file);}
 assert.deepEqual(decorationStyles.map(s=>s.after.contentText).sort(),[' [ASSIGNMENT]',' [LOGGING]',' [SOURCE]']);
 const nativeEditEvents=[];targetVscode.workspace.onDidChangeTextDocument(e=>nativeEditEvents.push({file:e.document.uri.fsPath,dirty:e.document.isDirty,changes:e.contentChanges.length,version:e.document.version}));
 const editor=vscode.window.activeTextEditor;const applied=await editor.edit(edit=>edit.insert(new vscode.Position(editor.document.lineCount-1,0),'// edited by isolated host test\n'));assert.equal(applied,true,'native edit must apply');
 await waitFor(()=>/STALE/.test(panel.webview.html),'Native editor change did not mark review stale: '+JSON.stringify({events:nativeEditEvents,dirty:editor.document.isDirty}));assert.equal(diagnostics().length,0);assert.equal(await vscode.commands.executeCommand('changeproof.openEvidenceStep',review.review_id,0),false);
 await editor.document.save();await new Promise(resolve=>setTimeout(resolve,200));
 await vscode.commands.executeCommand('changeproof.rerunReview');assert.equal(diagnostics().length,1);assert.match(panel.webview.html,/Evidence trail/);assert.notEqual(latest('review_presented').review_id,review.review_id,'rerun must issue a new evidence revision');
 assert.equal(await vscode.commands.executeCommand('changeproof.openEvidenceStep',review.review_id,0),false,'old review ID rejected');
 const baseline=process.env.CHANGEPROOF_TEST_BASELINE;fs.writeFileSync(file,baseline);await new Promise(resolve=>setTimeout(resolve,150));await vscode.commands.executeCommand('changeproof.reviewLocalChanges');assert.equal(diagnostics().length,0);assert.ok(provider.getChildren().some(g=>g.label==='Findings (0)'));
 fs.writeFileSync(file,baseline+'\nconsole.warn(password);\n');await vscode.commands.executeCommand('changeproof.reviewLocalChanges');assert.equal(diagnostics()[0].d.code,'CP001');
 fs.writeFileSync(file,'console.log(password');await vscode.commands.executeCommand('changeproof.reviewLocalChanges');assert.equal(diagnostics().length,0);assert.ok(provider.getChildren().some(g=>g.label==='Setup / processing errors (1)'));
 function snapshot(root){const rows=[];function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else if(item.isFile())rows.push([path.relative(root,file),crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);}}walk(root);return rows.sort();}
 const before=snapshot(folder.uri.fsPath),workspaceBefore=vscode.workspace.workspaceFolders.map(f=>f.uri.toString());
 await vscode.commands.executeCommand('changeproof.runDemo','header-leak');
 const demo=latest('demo_opened'),presented=latest('review_presented');assert.ok(demo);assert.equal(demo.coverage,'analyzed');assert.equal(diagnostics().length,1);assert.equal(diagnostics()[0].d.code,'CP002');assert.equal(vscode.window.activeTextEditor.selection.start.line,4);assert.equal(vscode.window.activeTextEditor.document.uri.fsPath,path.join(demo.selected_folder,'app.ts'));
 assert.match(panel.webview.html,/Synthetic demo/);assert.match(panel.webview.html,/Source → assignments \/ calls → logging/);assert.ok(panel.webview.html.includes('declaration: raw'));assert.ok(panel.webview.html.includes('declaration: payload'));assert.match(panel.webview.html,/CP002/);assert.match(panel.webview.html,/Runtime verification/);assert.match(panel.webview.html,/analyzed/);
 assert.ok(provider.getChildren().find(g=>g.label==='Review').children.some(i=>i.label.startsWith('Synthetic demo:')));
 assert.deepEqual(snapshot(folder.uri.fsPath),before);assert.deepEqual(vscode.workspace.workspaceFolders.map(f=>f.uri.toString()),workspaceBefore);
 const completed=records().filter(r=>r.phase==='completed'&&r.selection==='synthetic_demo').at(-1);assert.equal(completed.arguments[1],demo.selected_folder);assert.equal(completed.exit_code,0);
 // Exercise the public Review Project command on existing files with no Git baseline.
 const savedQuickPick=targetVscode.window.showQuickPick;
 targetVscode.window.showQuickPick=async items=>{pickedModes.push('current');return items.find(item=>item.mode==='current');};
 const plainProject=path.join(path.dirname(folder.uri.fsPath),'plain-project');fs.mkdirSync(plainProject);
 const plainFile=path.join(plainProject,'app.ts');
 const projectCode='function output(value){ const copied=value; console.log(copied); }\nfunction route(req){ const raw=req.headers.authorization; output(raw); }\n';
 fs.writeFileSync(plainFile,projectCode);
 const originalPicker=targetVscode.window.showWorkspaceFolderPick;
 targetVscode.window.showWorkspaceFolderPick=async()=>({uri:vscode.Uri.file(plainProject),name:'Plain real project'});
 const originalFolders=vscode.workspace.workspaceFolders.length;
 assert.equal(vscode.workspace.updateWorkspaceFolders(originalFolders,0,{uri:vscode.Uri.file(plainProject),name:'Plain real project'}),true);
 await waitFor(()=>vscode.workspace.workspaceFolders.some(f=>f.uri.fsPath===plainProject),'additional non-Git workspace was not registered');
 await new Promise(resolve=>setTimeout(resolve,200));
 const plainBefore=snapshot(plainProject),demoCount=records().filter(r=>r.phase==='demo_opened').length;
 const reusedPanel=panel;
 try{
   await vscode.commands.executeCommand('changeproof.reviewProject');
   const current=latest('review_presented');assert.equal(current.review_mode,'current');assert.equal(diagnostics().length,1);assert.ok(!fs.existsSync(path.join(plainProject,'.git')),'current mode did not initialize Git');
   const item=provider.getChildren().find(g=>g.label==='Findings (1)').children[0];await vscode.commands.executeCommand(item.command.command,...item.command.arguments);assert.equal(panel,reusedPanel,'details panel reused across projects and modes');
   assert.match(panel.webview.html,/Current files — no baseline/);assert.match(panel.webview.html,/Not applicable — current files/);assert.match(panel.webview.html,/Call output/);assert.match(panel.webview.html,/Parameter value/);
   const presentedBefore=latest('review_presented').review_id;
   for(const [step,line] of [[0,1],[1,1],[2,1],[3,1],[4,0],[5,0],[6,0]]){assert.equal(await vscode.commands.executeCommand('changeproof.openEvidenceStep',presentedBefore,step),true);assert.equal(vscode.window.activeTextEditor.document.uri.fsPath,plainFile);assert.equal(vscode.window.activeTextEditor.selection.start.line,line);}
   await vscode.commands.executeCommand('changeproof.rerunReview');assert.equal(latest('review_presented').review_mode,'current');assert.equal(pickedModes.length,1,'rerun retains mode without another prompt');
   assert.deepEqual(snapshot(plainProject),plainBefore,'normal review made no project changes');assert.equal(records().filter(r=>r.phase==='demo_opened').length,demoCount,'normal review created no demo');
 }finally{targetVscode.window.showQuickPick=savedQuickPick;targetVscode.window.showWorkspaceFolderPick=originalPicker;/* Keep the second test folder until this isolated window closes: removal restarts its extension host. */}
 // Installed AI command, real loopback Fastify service, synthetic mock provider only.
 await new Promise(resolve=>setTimeout(resolve,100));
 targetVscode.window.showWorkspaceFolderPick=async()=>folder;
 fs.writeFileSync(file,baseline.replace('"public"','req.headers.authorization'));
 await vscode.commands.executeCommand('changeproof.reviewLocalChanges');
 const {pathToFileURL}=require('node:url');
 const {createServer}=await import(pathToFileURL(path.resolve(__dirname,'../../../services/review-api/src/server.mjs')).href);
 const {mockProvider}=await import(pathToFileURL(path.resolve(__dirname,'../../../services/review-api/src/providers.mjs')).href);
 const {assessmentFixture}=await import(pathToFileURL(path.resolve(__dirname,'../../../packages/ai/test/fixtures.mjs')).href);
 let aiCalls=0;
 const mockService=createServer({accessToken:'synthetic-native-host-token-1234567890',provider:mockProvider(request=>{aiCalls++;return assessmentFixture(request,'sensitive_data_exposure');})});
 const mockUrl=await mockService.listen({host:'127.0.0.1',port:0});
 const savedInput=targetVscode.window.showInputBox;
 try{
   targetVscode.window.showInputBox=async()=> 'synthetic-native-host-token-1234567890';
   await vscode.workspace.getConfiguration('changeproof').update('aiBackendUrl',mockUrl,vscode.ConfigurationTarget.Global);
   await vscode.commands.executeCommand('changeproof.setAiAccessToken');
   const panelBeforeAI=panel;
   await vscode.commands.executeCommand('changeproof.aiReviewChanges');
   assert.equal(aiCalls,0,'preview must not send');assert.equal(panel,panelBeforeAI,'AI reuses existing details panel');
   assert.match(panel.webview.html,/Exact JSON request body/);assert.match(panel.webview.html,/Approve and send/);
   const aiToken=panel.webview.html.match(/token:"([a-f0-9]+)"/)[1];
   await receiveMessage({type:'ai_approve',token:aiToken});
   assert.equal(aiCalls,1);assert.match(panel.webview.html,/AI assessment — not runtime verified/);
   const roots=provider.getChildren();const aiGroup=roots.find(g=>g.label==='AI review — separate from deterministic checks');assert.ok(aiGroup);
   const aiItem=aiGroup.children.find(g=>g.label==='AI assessments (1)').children[0];
   await vscode.commands.executeCommand(aiItem.command.command,...aiItem.command.arguments);
   assert.match(panel.webview.html,/MOCK PROVIDER/);assert.match(panel.webview.html,/HEAD reference only/);
   assert.equal(await vscode.commands.executeCommand('changeproof.openAiEvidence',aiToken,1),true);assert.equal(vscode.window.activeTextEditor.document.uri.fsPath,file);
   await vscode.commands.executeCommand('changeproof.refreshAiStatus');
   assert.ok(provider.getChildren().find(g=>g.label==='AI connection status').children.some(r=>r.label.includes('mock provider selected')));
   const savedInfo=targetVscode.window.showInformationMessage;
   try{targetVscode.window.showInformationMessage=async()=> 'Send synthetic check';await vscode.commands.executeCommand('changeproof.checkAiConnection');}finally{targetVscode.window.showInformationMessage=savedInfo;}
   assert.equal(aiCalls,2,'one explicit synthetic request beyond workspace review');
   assert.ok(provider.getChildren().find(g=>g.label==='AI connection status').children.some(r=>r.label.includes('Mock synthetic contract check passed')));
   await vscode.commands.executeCommand('changeproof.showAiSetup');assert.equal(panel,panelBeforeAI);assert.match(panel.webview.html,/connection, response schema/);

 }finally{targetVscode.window.showInputBox=savedInput;targetVscode.window.showWorkspaceFolderPick=originalPicker;await mockService.close();}
 const result={mode:process.env.CHANGEPROOF_EXPECT_INSTALLED?'packaged_install':'development_host',vscode:vscode.version,extension_version:extension.packageJSON.version,vsix_sha256:process.env.CHANGEPROOF_VSIX_SHA256||null,visual_observation:false,demo_verification:{selected_folder:demo.selected_folder,exit_code:completed.exit_code,coverage:presented.coverage,details_webview_created:true,workspace_unchanged:true},checks:['installed activation and real CLI','native sidebar groups and finding command','native details webview creation and CSP','native source/assignment/log navigation and selections','decoration API creation and text labels','native unsaved-edit stale event and diagnostic clearing','explicit rerun and old-ID rejection','empty/CP001/parse-error states','one-command Run Demo with details and source selection','actual workspace and Git bytes unchanged','Review Project current files without Git or baseline','same-file helper argument/call/parameter navigation','current-files newness not applicable and mode-preserving rerun','installed AI command exact preview with zero pre-approval transmissions','native SecretStorage and real HTTP mock backend assessment','AI and deterministic sidebar separation, reusable panel, current reference navigation','native health-only status and explicitly confirmed synthetic mock contract check','existing details panel reused for AI setup guide'],limitations:['No manual visual, mouse-click, screen-reader or webview-paint observation. Webview button message wiring is covered by mocked tests; native tests call the same registered navigation handler. Cursor untested.']};
 fs.writeFileSync(process.env.CHANGEPROOF_HOST_RESULT,JSON.stringify(result));
}
module.exports={run:async()=>{try{await run();}catch(error){fs.writeFileSync(process.env.CHANGEPROOF_HOST_RESULT+'.failure.json',JSON.stringify({name:error.name,message:error.message.slice(0,500)}));throw error;}}};
