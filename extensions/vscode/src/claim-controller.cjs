const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {runClaimAudit}=require('./claim-client.cjs');
const {claimHtml}=require('./claim-ui.cjs');
const {safeTarget,relevantChange}=require('./finding-ui.cjs');
function createClaimController(vscode,context,ui,{otherBusy=()=>false,onBusyChange=()=>{}}={}){
 let current,busy=false,controller,watchers=[];
 const fingerprint=file=>{try{const s=fs.lstatSync(file,{bigint:true});if(!s.isFile())return null;return [s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs,s.mode].join(':');}catch{return null;}};
 const dirty=folder=>(vscode.workspace.textDocuments||[]).some(d=>d.isDirty&&relevantChange(folder,d.uri));
 function stopWatching(){watchers.forEach(w=>w.dispose());watchers=[];}
 function update(state){if(current===state)ui.refreshAuxiliary(state.page);}
 function markStale(state){if(current!==state||!state.report)return;state.stale=true;update(state);}
 function snapshotMatches(report){
  for(const s of report.snapshots){try{if(s.snapshot!==null)safeTarget(report.repository,{file:s.file,start:{line:1,column:1},end:{line:1,column:1}});if(fingerprint(path.join(report.repository,s.file))!==s.snapshot)return false;}catch{return false;}}
  return true;
 }
 async function check(folder){
  if(busy||otherBusy())return;
  if(typeof folder!=='string'||!path.isAbsolute(folder))folder=ui.getState()?.folder;
  if(!folder)folder=(await vscode.window.showOpenDialog({title:'Choose project for assistant claim audit',canSelectFiles:false,canSelectFolders:true,canSelectMany:false}))?.[0]?.fsPath;
  if(!folder)return;
  const state={folder,response:'',report:null,running:false,stale:false,error:null};
  state.page={title:'Changeproof Claim Audit',render(nonce){state.token=crypto.randomBytes(18).toString('hex');return claimHtml(state,nonce,state.token);},onMessage:message=>handle(state,message),onClose(){if(current===state){controller?.abort();stopWatching();state.response='';state.report=null;current=undefined;}}};
  ui.showAuxiliary(state.page);current=state;
 }
 async function handle(state,message){
  if(current!==state||message?.token!==state.token)return;
  if(message.type==='claims_draft'){
   if(!state.running&&typeof message.response==='string'&&Buffer.byteLength(message.response)<=32768)state.response=message.response;
  }else if(message.type==='claims_audit'){
   if(busy||otherBusy()||typeof message.response!=='string')return;
   if(Buffer.byteLength(message.response)>32768){state.error='Paste at most 32 KiB of response text.';update(state);return;}
   state.response=message.response;state.running=true;state.error=null;state.report=null;state.stale=false;stopWatching();busy=true;onBusyChange();controller=new AbortController();update(state);
   try{
    const node=vscode.workspace.getConfiguration('changeproof').inspect('nodePath')?.globalValue||'node';if(node!=='node'&&!path.isAbsolute(node))throw new Error('Configure a trusted absolute Node path.');
    const report=await runClaimAudit(node,context.asAbsolutePath('out/claims.cjs'),state.folder,state.response,{signal:controller.signal});
    if(current!==state)return;
    if(fs.realpathSync(state.folder)!==report.repository)throw new Error('Selected project no longer matches the audit.');
    state.report=report;state.stale=report.stale||dirty(state.folder)||!snapshotMatches(report);
    const watch=new vscode.RelativePattern(state.folder,'**/*'),watcher=vscode.workspace.createFileSystemWatcher(watch);
    for(const method of ['onDidChange','onDidCreate','onDidDelete'])watcher[method](()=>markStale(state));watchers.push(watcher);
    if(report.git_repository&&report.git_repository!==state.folder){const gitWatcher=vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(report.git_repository,'.git/{HEAD,index,packed-refs,refs/**}'));for(const method of ['onDidChange','onDidCreate','onDidDelete'])gitWatcher[method](()=>markStale(state));watchers.push(gitWatcher);}
   }catch{if(current===state)state.error='Claim audit could not complete. Check the folder, trusted Node and input size. No verdict is established.';}
   finally{controller=undefined;busy=false;onBusyChange();if(current===state){state.running=false;update(state);}}
  }else if(message.type==='claims_navigate'){
   if(state.running||state.stale||!state.report||!Number.isSafeInteger(message.index)||!Number.isSafeInteger(message.evidence))return;
   const ev=state.report.claims[message.index]?.evidence[message.evidence];if(!ev?.location||ev.revision!=='saved')return;
   try{
    if(dirty(state.folder)||!snapshotMatches(state.report))throw new Error();
    const target=safeTarget(state.report.repository,ev.location),document=await vscode.workspace.openTextDocument(vscode.Uri.file(target));
    if(current!==state||state.stale||document.isDirty||!snapshotMatches(state.report))throw new Error();
    for(const p of [ev.location.start,ev.location.end])if(p.line>document.lineCount||p.column>document.lineAt(p.line-1).text.length+1)throw new Error();
    ui.getPanel()?.reveal(vscode.ViewColumn.Two,true);
    await vscode.window.showTextDocument(document,{viewColumn:vscode.ViewColumn.One,selection:new vscode.Range(ev.location.start.line-1,ev.location.start.column-1,ev.location.end.line-1,ev.location.end.column-1),preview:true});
    if(current===state&&(document.isDirty||!snapshotMatches(state.report)))markStale(state);
   }catch{markStale(state);}
  }
 }
 if(vscode.workspace.onDidChangeTextDocument)context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e=>{if(current&&(e.contentChanges.length||e.document.isDirty)&&relevantChange(current.folder,e.document.uri))markStale(current);}));
 context.subscriptions.push(vscode.commands.registerCommand('changeproof.checkClaims',check),{dispose(){controller?.abort();stopWatching();if(current)current.response='';current=undefined;}});
 return {check,isBusy:()=>busy,getState:()=>current};
}
module.exports={createClaimController};
