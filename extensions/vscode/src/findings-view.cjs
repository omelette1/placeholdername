const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const {sidebar,detailsHtml,stepsFor,safeTarget,relevantChange} = require('./finding-ui.cjs');
const {statusRoots,statusHtml}=require('./ai-status.cjs');
const {aiHtml,aiRoots,aiSteps}=require('./ai-ui.cjs');
function createFindingsView(vscode, context, {record,rerun,aiAction=()=>{}}) {
  const events = new vscode.EventEmitter();
  let state, selected = null, panel, watcher, decorated = new Set(), decorations;
  let roots = [];
  let aiSelected=null, showingAi=false, showingStatus=false, connection={state:'not_checked'};
  let metadata=new Map();
  function metadataKey(file){try{return path.join(fs.realpathSync(path.dirname(file)),path.basename(file));}catch{return path.resolve(file);}}
  function fingerprint(file){try{const stat=fs.lstatSync(file,{bigint:true});return [stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs,stat.mode].join(':');}catch{return null;}}
  function noteFileChange(uri,dirty=false){
    if(!state||!relevantChange(state.report?.repository||state.folder,uri))return;
    if(state.ai && !['error','cancelled'].includes(state.ai.phase)){state.ai.stale=true;clearDecorations();refresh();}
    const key=metadataKey(uri.fsPath);
    // Native watchers can deliver a pre-review notification late. Compare to
    // metadata captured when this explicit review began, rather than its delivery time.
    if(!dirty&&metadata.has(key)&&metadata.get(key)===fingerprint(key))return;
    if(!dirty&&state.loading){state.pendingChanges.set(key,uri);return;}
    stale(dirty?'Editor content changed.':'File system change in reviewed repository.');
  }
  const provider = {onDidChangeTreeData:events.event,getTreeItem:item=>item,getChildren:item=>item?.children || roots,getParent:()=>null};
  const tree = vscode.window.createTreeView('changeproof.findings',{treeDataProvider:provider});
  const diagnostics = vscode.languages.createDiagnosticCollection('changeproof');
  function validatedTarget(loc,repository=state.report.repository) {
    const canonical=safeTarget(repository,loc);
    const aliasRoot=path.resolve(state.folder,path.relative(fs.realpathSync(state.folder),repository));
    if(fs.realpathSync(aliasRoot)!==fs.realpathSync(repository))throw new Error('Reviewed repository path changed. Rerun review.');
    const target=path.join(aliasRoot,loc.file);
    if(fs.realpathSync(target)!==canonical)throw new Error('Evidence target changed. Rerun review.');
    return target;
  }
  function range(loc) {return new vscode.Range(loc.start.line-1,loc.start.column-1,loc.end.line-1,loc.end.column-1);}
  function clearDecorations() {
    if (decorations) for (const editor of decorated) for (const type of Object.values(decorations)) {try {editor.setDecorations(type,[]);} catch {}}
    decorated.clear();
  }
  function clearSelection() {selected=null;aiSelected=null;showingAi=false;showingStatus=false;clearDecorations();}
  function renderPanel() {
    if (!panel) return;
    if(showingStatus)panel.webview.html=statusHtml(connection,crypto.randomBytes(18).toString('hex'));
    else if(showingAi&&state?.ai)panel.webview.html=aiHtml(state,aiSelected,crypto.randomBytes(18).toString('hex'));
    else if (state?.report && selected !== null) panel.webview.html=detailsHtml(state,state.report.findings[selected],crypto.randomBytes(18).toString('hex'));
    else panel.webview.html='<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\';"></head><body><p>Choose a finding from the current review. Previous selections have been cleared.</p></body></html>';
  }
  function refresh() {
    roots=sidebar(state).concat(aiRoots(state),statusRoots(connection));events.fire();
    tree.message=state ? `${state.demo?'Demo':state.mode==='current'?'Current files':'Changes since HEAD'} · ${state.stale?'STALE · ':''}${state.loading?'Loading':state.report?`${state.report.findings.length} potential exposure(s) · Coverage: ${state.report.coverage.status}`:state.error?'Setup / processing error':'No deterministic review yet'}` : 'Static checks only; no review yet.';
    if(state?.ai)tree.message+=' · AI: '+state.ai.phase+(state.ai.stale?' (STALE)':'');
    renderPanel();
  }
  function stale(reason) {
    if(state?.ai)state.ai.stale=true;
    if (!state || state.stale) return;
    state.stale=true;diagnostics.clear();clearDecorations();refresh();
    record({phase:'review_stale',review_id:state.id,selected_folder:state.folder,reason});
  }
  function ensureDecorations(roles) {
    if (!decorations)decorations={};
    const styles={reference:{borderWidth:'0 0 1px 0',borderStyle:'solid',borderColor:new vscode.ThemeColor('editorInfo.foreground')},source:{backgroundColor:new vscode.ThemeColor('editor.wordHighlightStrongBackground')},assignment:{borderWidth:'0 0 1px 0',borderStyle:'dashed',borderColor:new vscode.ThemeColor('editorInfo.foreground')},argument:{borderWidth:'0 0 1px 0',borderStyle:'dotted',borderColor:new vscode.ThemeColor('editorInfo.foreground')},function_call:{backgroundColor:new vscode.ThemeColor('editor.wordHighlightBackground')},parameter:{borderWidth:'0 0 1px 0',borderStyle:'dashed',borderColor:new vscode.ThemeColor('editorInfo.foreground')},logging:{borderWidth:'0 0 2px 0',borderStyle:'solid',borderColor:new vscode.ThemeColor('editorWarning.foreground')}};
    for (const role of roles) {
      if(decorations[role]||!styles[role])continue;
      decorations[role]=vscode.window.createTextEditorDecorationType({...styles[role],rangeBehavior:vscode.DecorationRangeBehavior.ClosedClosed,after:{contentText:' ['+role.toUpperCase()+']',color:new vscode.ThemeColor('editorCodeLens.foreground'),margin:'0 0 0 0.5em'}});
      context.subscriptions.push(decorations[role]);
    }
  }
  function applyDecorations() {
    clearDecorations();
    if(showingAi){if(!state?.ai?.response||state.ai.stale||aiSelected===null)return;}else if (!state?.report || state.stale || state.loading || selected===null) return;
    const steps=showingAi?aiSteps(state.ai.response.assessment.findings[aiSelected],state.ai.envelope.request).filter(s=>s.revision==='after'):stepsFor(state.report.findings[selected]);
    ensureDecorations(new Set(steps.map(step=>step.role)));
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.scheme!=='file') continue;
      for (const role of Object.keys(decorations)) {
        const matches=steps.filter(s=>s.role===role).filter(s=>{try{return fs.realpathSync(editor.document.uri.fsPath)===safeTarget(showingAi?state.folder:state.report.repository,s.location);}catch{return false;}});
        editor.setDecorations(decorations[role],matches.map(s=>({range:range(s.location),hoverMessage:role.toUpperCase()+' · recorded static evidence'})));
      }
      decorated.add(editor);
    }
  }
  async function navigate(reviewId,index) {
    try {
      if (!state || state.id!==reviewId || selected===null || state.loading || state.stale) throw new Error('This evidence is stale or belongs to a replaced review. Rerun explicitly.');
      const selectionIndex=selected;
      const step=stepsFor(state.report.findings[selected])[index];
      if (!Number.isSafeInteger(index) || !step) throw new Error('Unknown evidence step.');
      const target=validatedTarget(step.location);
      const document=await vscode.workspace.openTextDocument(vscode.Uri.file(target));
      if(state?.id!==reviewId||selected!==selectionIndex)throw new Error('Finding selection changed; select the current evidence step.');
      if (state.stale || document.isDirty) {stale('Unsaved source changes.');throw new Error('Saved source changed. Rerun explicitly before navigating.');}
      for (const pos of [step.location.start,step.location.end]) if (pos.line>document.lineCount || pos.column>document.lineAt(pos.line-1).text.length+1) {stale('Evidence range no longer matches source.');throw new Error('Evidence no longer matches this file. Rerun explicitly.');}
      validatedTarget(step.location);
      await vscode.window.showTextDocument(document,{viewColumn:vscode.ViewColumn.One,selection:range(step.location),preview:true});
      applyDecorations();
      record({phase:'evidence_navigated',review_id:reviewId,role:step.role,file:step.location.file,line:step.location.start.line});
      return true;
    } catch(error) {vscode.window.showWarningMessage('Changeproof: '+error.message);return false;}
  }
  function ensurePanel(){
    if (!panel) {
      panel=vscode.window.createWebviewPanel('changeproof.findingDetails','Changeproof Finding Details',vscode.ViewColumn.Beside,{enableScripts:true,localResourceRoots:[]});
      context.subscriptions.push(panel);
      panel.onDidDispose(()=>{panel=undefined;clearSelection();});
      panel.webview.onDidReceiveMessage(async message=>{
        if(message?.type?.startsWith('ai_')){if(message.token!==state?.ai?.token)return;if(message.type==='ai_navigate'){if(message.selectionToken!==state.ai.selectionToken)return;await navigateAi(message.token,message.step);}else await aiAction(message.type,state.ai);return;}
        if (!message || message.reviewId!==state?.id || message.selectionToken!==state?.selectionToken) return;
        if (message.type==='navigate') await navigate(message.reviewId,message.step);
        else if (message.type==='rerun') await rerun(state.folder,{demo:state.demo,mode:state.mode,selection:state.selection});
      });
    } else panel.reveal(vscode.ViewColumn.Beside,true);
  }
  async function select(reviewId,index) {
    if (!state?.report || state.id!==reviewId || !Number.isSafeInteger(index) || !state.report.findings[index]) {vscode.window.showWarningMessage('That finding belongs to an old review. Select a current finding.');return;}
    clearSelection();selected=index;state.selectionToken=crypto.randomBytes(12).toString('hex');
    ensurePanel();
    renderPanel();applyDecorations();
    record({phase:'finding_selected',review_id:state.id,selected_folder:state.folder,rule:state.report.findings[index].rule_id,index,stale:state.stale});
  }
  function aiBegin(folder){
    if(!state||state.folder!==folder){begin(folder);state.loading=false;}
    clearSelection();state.ai={phase:'collecting',token:crypto.randomBytes(12).toString('hex'),stale:false};refresh();return state.ai.token;
  }
  function aiUpdate(token,patch){if(state?.ai?.token!==token)return;Object.assign(state.ai,patch);refresh();}
  async function selectAi(token,index=null){
    if(!state?.ai||state.ai.token!==token)return;
    if(index!==null&&(!Number.isSafeInteger(index)||!state.ai.response?.assessment.findings[index]))return;
    clearSelection();showingAi=true;aiSelected=index;state.ai.selectionToken=crypto.randomBytes(12).toString('hex');ensurePanel();renderPanel();applyDecorations();
  }
  async function navigateAi(token,index){
    try{
      if(state?.ai?.token!==token||state.ai.stale||aiSelected===null||!Number.isSafeInteger(index))throw new Error('AI evidence is stale or replaced. Refresh the preview explicitly.');
      const step=aiSteps(state.ai.response.assessment.findings[aiSelected],state.ai.envelope.request)[index];
      if(!step||step.revision!=='after')throw new Error('Only current-file references can navigate.');
      const target=validatedTarget(step.location,state.ai.envelope.folder),snapshot=state.ai.envelope.snapshots.find(s=>s.file===step.location.file);
      if(!snapshot||fingerprint(target)!==snapshot.snapshot)throw new Error('Saved source changed. Refresh AI preview explicitly.');
      const document=await vscode.workspace.openTextDocument(vscode.Uri.file(target));
      if(state?.ai?.token!==token||state.ai.stale||document.isDirty)throw new Error('AI evidence changed or has unsaved edits. Rerun explicitly.');
      for(const pos of [step.location.start,step.location.end])if(pos.line>document.lineCount||pos.column>document.lineAt(pos.line-1).text.length+1)throw new Error('AI reference range no longer matches source.');
      safeTarget(state.folder,step.location);
      await vscode.window.showTextDocument(document,{viewColumn:vscode.ViewColumn.One,selection:range(step.location),preview:true});applyDecorations();return true;
    }catch{if(state?.ai)state.ai.stale=true;clearDecorations();refresh();vscode.window.showWarningMessage('Changeproof: AI reference is unavailable, stale or not a current-file reference. Refresh AI preview explicitly.');return false;}
  }
  function watch(folder) {
    watcher?.dispose();watcher=undefined;
    if (vscode.workspace.createFileSystemWatcher && folder) {
      watcher=vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder,'**/*'));
      const changed=uri=>noteFileChange(uri);
      watcher.onDidChange(changed);watcher.onDidCreate(changed);watcher.onDidDelete(changed);
    }
  }
  function begin(folder,{demo=false,selection='workspace',mode='changes'}={}) {
    const sameFolder=state?.folder===folder;
    metadata=sameFolder?new Map([...metadata.keys()].map(file=>[file,fingerprint(file)])):new Map();
    for(const document of vscode.workspace.textDocuments||[]){if(relevantChange(folder,document.uri)){const file=metadataKey(document.uri.fsPath);metadata.set(file,fingerprint(file));}}
    if(folder){for(const rel of ['.git','.git/HEAD','.git/index','.git/packed-refs','.git/refs','.git/refs/heads','.git/refs/heads/main','.git/refs/heads/master','.git/refs/heads/demo']){const file=metadataKey(path.join(folder,rel));metadata.set(file,fingerprint(file));}}
    clearSelection();diagnostics.clear();
    state={id:crypto.randomBytes(12).toString('hex'),folder,demo,selection,mode,pendingChanges:new Map(),loading:true,stale:false};watch(folder);refresh();return state.id;
  }
  function finish(id,report) {
    if (id!==state?.id) return;
    state.report=report;state.mode=report.review_mode||state.mode;state.loading=false;
    if(report.repository){
      for(const entry of [...report.files_inspected,...report.untracked_files,...report.skipped_files]){
        const file=metadataKey(path.join(report.repository,entry.file));
        const captured=entry.snapshot!==undefined?entry.snapshot:fingerprint(file);
        metadata.set(file,captured);
        if(entry.snapshot!==undefined&&fingerprint(file)!==captured)stale('File changed after the engine read its snapshot.');
      }
      for(const relative of ['.git/HEAD','.git/index','.git/packed-refs']){const file=metadataKey(path.join(report.repository,relative));if(!metadata.has(file))metadata.set(file,fingerprint(file));}
      watch(report.repository);
    }
    for(const file of state.pendingChanges.keys())if(!metadata.has(file)||metadata.get(file)!==fingerprint(file)){stale('A repository change was not included in the reviewed snapshot.');break;}
    state.pendingChanges.clear();
    const byFile=new Map();
    if (!state.stale) for (const f of report.findings) {
      try {
        const target=validatedTarget(f.location),uri=vscode.Uri.file(target);
        const diagnostic=new vscode.Diagnostic(range(f.location),f.explanation+'\nHEAD newness: '+String(f.newly_introduced)+'\nRuntime verification: '+String(f.runtime_verification)+'\n'+f.limitations.join('\n'),vscode.DiagnosticSeverity.Warning);
        diagnostic.source='Changeproof (static)';diagnostic.code=f.rule_id;
        if(f.rule_id==='CP002')diagnostic.relatedInformation=stepsFor(f).filter(s=>s.role!=='logging').map(s=>new vscode.DiagnosticRelatedInformation(new vscode.Location(vscode.Uri.file(validatedTarget(s.location)),range(s.location)),s.label));
        const entry=byFile.get(target)||{uri,values:[]};entry.values.push(diagnostic);byFile.set(target,entry);
      }catch{stale('A recorded evidence target could not be safely resolved.');break;}
    }
    if (!state.stale) for(const {uri,values} of byFile.values())diagnostics.set(uri,values);
    if ((vscode.workspace.textDocuments||[]).some(d=>d.isDirty&&relevantChange(report.repository||state.folder,d.uri)))stale('Unsaved buffers were not included in the saved-file review.');
    refresh();
    record({phase:'review_presented',review_id:state.id,selected_folder:state.folder,review_mode:state.mode,coverage:report.coverage.status,finding_count:report.findings.length,stale:state.stale});
  }
  function fail(id,error) {if(id!==state?.id)return;clearSelection();diagnostics.clear();state.loading=false;state.error=error;refresh();}
  context.subscriptions.push(tree,events,diagnostics,{dispose(){watcher?.dispose();clearDecorations();}});
  if(vscode.workspace.onDidChangeTextDocument)context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e=>{if(state && (e.contentChanges.length || e.document.isDirty))noteFileChange(e.document.uri,e.document.isDirty);}));
  if(vscode.window.onDidChangeVisibleTextEditors)context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(applyDecorations));
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(()=>{clearSelection();diagnostics.clear();watcher?.dispose();state=undefined;refresh();}));
  context.subscriptions.push(vscode.commands.registerCommand('changeproof.openFinding',select),vscode.commands.registerCommand('changeproof.openEvidenceStep',navigate),vscode.commands.registerCommand('changeproof.rerunReview',()=>state?rerun(state.folder,{demo:state.demo,mode:state.mode,selection:state.selection}):undefined));
  context.subscriptions.push(vscode.commands.registerCommand('changeproof.openAiFinding',selectAi),vscode.commands.registerCommand('changeproof.showAiSummary',()=>state?.ai?selectAi(state.ai.token):undefined),vscode.commands.registerCommand('changeproof.openAiEvidence',navigateAi));
  refresh();
  return {setAiConnection(value){connection=value;refresh();},getAiConnection:()=>connection,showAiSetup(){clearSelection();showingStatus=true;ensurePanel();renderPanel();},aiBegin,aiUpdate,selectAi,begin,finish,fail,select,navigate,stale,clearSelection,getState:()=>state,async openFirst(){if(!state?.report?.findings.length)return;await select(state.id,0);const steps=stepsFor(state.report.findings[0]);await navigate(state.id,steps.length-1);},getPanel:()=>panel};
}
module.exports={createFindingsView};
