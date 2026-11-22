const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {escapeHtml:e}=require('./finding-ui.cjs');
const MODES=new Set(['current','changes']);
function controlsHtml(model,nonce,token){
  const disabled=model.busy?'disabled':'';
  const modeHelp=model.mode==='current'?'Scans eligible saved JavaScript/TypeScript and supported configuration, including new files. No Git commit needed.':'Compares saved, tracked JavaScript/TypeScript changes with the last Git commit (HEAD). New untracked files and configuration changes are not analyzed in this mode.';
  const review=model.review;
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none';"><style nonce="${nonce}">
  *{box-sizing:border-box}body{margin:0;padding:15px 12px;background:var(--vscode-sideBar-background,#181e26);color:var(--vscode-foreground,#e5ecf3);font-family:var(--vscode-font-family,sans-serif);font-size:12px;line-height:1.5}h1{font-size:17px;letter-spacing:-.3px;margin:0}h2{font-size:12px;margin:0}p{margin:5px 0 12px}.intro,.help,.path{color:var(--vscode-descriptionForeground,#a9b5c3);font-size:11px}.eyebrow{color:var(--vscode-textLink-foreground,#7ec5e5);font-size:9px;font-weight:650;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:5px}button,select{font:inherit;width:100%;border:1px solid var(--vscode-input-border,var(--vscode-panel-border,#3c4653));border-radius:5px;padding:7px 8px;color:var(--vscode-foreground,#e5ecf3);background:var(--vscode-input-background,#202833)}button{cursor:pointer}button:disabled,select:disabled{opacity:.5;cursor:not-allowed}button:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--vscode-focusBorder,#7ec5e5);outline-offset:2px}label{display:block;font-weight:550;font-size:11px;margin:14px 0 6px}.primary{margin-top:13px;padding:11px;background:var(--vscode-button-background,#206e93);color:var(--vscode-button-foreground,#fff);border-color:transparent;font-weight:600;font-size:13px}.secondary{margin-top:7px;background:var(--vscode-button-secondaryBackground,#303b49);color:var(--vscode-button-secondaryForeground,#fff)}.path{overflow-wrap:anywhere;margin:6px 0 8px;font-family:var(--vscode-editor-font-family,monospace);font-size:10px}.row{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.row button{font-size:11px;min-width:0}.section{border-top:1px solid var(--vscode-panel-border,#343e4b);margin-top:18px;padding-top:13px}.status{padding:10px;border:1px solid var(--vscode-panel-border,#343e4b);border-radius:6px;margin-top:12px}.status p{margin:4px 0 0}.status strong{font-size:11px}.warning{color:var(--vscode-editorWarning-foreground,#dfb76b)}details summary{cursor:pointer;font-weight:600;font-size:12px}details .help{margin-top:9px}#error{color:var(--vscode-errorForeground,#ff9999);overflow-wrap:anywhere}.foot{margin-top:13px;font-size:10px;color:var(--vscode-descriptionForeground,#a9b5c3)}.scope{display:inline-block;font-size:9px;padding:2px 5px;border:1px solid var(--vscode-panel-border,#343e4b);border-radius:4px;margin-top:3px}
  </style></head><body><div class="eyebrow">Patch</div><h1>Review AI-written code</h1><p class="intro">Look for potential sensitive-data exposure and risky code patterns. Check what the assistant claims against what it delivered.</p>
  <label for="folder">1. Choose your project</label><select id="folder" ${disabled} aria-label="Project folder"><option value="">Choose a project…</option>${model.folders.map((folder,i)=>`<option value="${i}" ${folder.path===model.folder?'selected':''}>${e(folder.label)}</option>`).join('')}</select><p class="path">${e(model.folder||'No project selected')}</p><button data-action="browse" ${disabled}>Choose folder…</button>
  <label for="mode">2. Choose scan scope</label><select id="mode" ${disabled}><option value="current" ${model.mode==='current'?'selected':''}>Saved project files · start here</option><option value="changes" ${model.mode==='changes'?'selected':''}>Changes since last commit</option></select><p class="help">${e(modeHelp)}</p>
  <label for="images">3. Optional container CVE scan</label><select id="images" ${disabled} aria-label="Container image vulnerability scan"><option value="disabled" ${!model.scanImages?'selected':''}>Off · configuration checks only</option><option value="enabled" ${model.scanImages?'selected':''}>On · scan locally cached Docker images</option></select><p class="help">Saved project files only. Requires trusted Trivy, locally available images and a cached vulnerability database. No image downloads during the scan. Missing coverage is reported, not considered safe.</p>
   <button class="primary" data-action="scan" ${model.busy||!model.folder?'disabled':''}>${model.busy?'Working…':'Scan project'}</button><p class="foot">Local checks · no code uploads · saved files only. Save your edits before scanning.</p>
  <details><summary>Try a sample project</summary><p class="help">Choose an authored example with expected findings and a sample assistant answer. Patch creates a separate sample folder and leaves your project files unchanged.</p><button data-action="demo" ${disabled}>Choose a sample profile…</button></details><div class="row"><button data-action="results">View scan results</button><button data-action="settings">Settings</button></div>
  <section class="section" aria-label="Verify AI output"><h2>Check an assistant answer</h2><p class="help">Paste an AI completion message. Check supported file and function claims against your saved project.</p><button class="secondary" data-action="claims" ${model.busy||!model.folder?'disabled':''}>Check an assistant answer…</button><p class="help">Local only · no AI backend needed. Check assistant claims about files and functions; test success and behavior remain unverified.</p><details><summary>Try the evidence checks</summary><p class="help">See how invented source quotations are rejected using built-in examples. No project code or model calls.</p><button data-action="guard" ${disabled}>Test evidence guard</button></details><button data-action="evidence" ${model.busy||!model.review?.ai?'disabled':''}>Open last AI evidence</button><p class="help">${e(model.review?.ai?.stale?'Saved inputs changed. Previous evidence is stale.':model.review?.ai?.verification?.status==='completed'?'Quote receipts available. AI interpretations remain unverified.':model.review?.ai?.phase==='error'?'AI review failed or was rejected. Open the result for details.':'An AI review adds its quote receipts here.')}</p></section>
  <div class="status" role="status" aria-live="polite"><strong>${e(review?.stale?'STALE — save and scan again':review?.loading?'Scanning saved files…':review?.error?'Scan could not finish':review?.report?'Last review':'Ready to scan')}</strong><p class="help">${e(review?.error|| (review?.report?`${review.report.findings.length} finding(s) · Header-flow coverage: ${review.report.coverage.status} (CP002)`:'Results and code evidence open in the editor.'))}</p>${review?.folder?'<p class="path">'+e(review.folder)+'</p>':''}</div>
  ${model.error?'<p id="error" role="alert">'+e(model.error)+'</p>':''}
  <details class="section" id="ai"><summary>Review code with AI</summary><p class="help">Optional AI review of saved, tracked JS/TS changes since your last Git commit (HEAD). You choose whether to send the previewed code.</p>
  <h2>1. Check the connection</h2><p class="help">${e(model.connection.state==='reachable'?'Review service reachable · '+model.connection.health.provider+' · '+model.connection.health.model:model.connection.state==='checking'?'Checking connection…':model.connection.state==='unavailable'?'Review service unavailable. Open Setup instructions to connect it.':'Connection not checked yet. Start with Check connection.')}</p><div class="row"><button data-action="health" ${disabled}>Check connection</button><button data-action="setup" ${disabled}>Setup instructions</button></div><p class="help">Checks service availability only. No code is sent and no model is called.</p>
  <h2>2. Preview your code</h2><label for="profile">AI context size</label><select id="profile" ${disabled}><option value="demo" ${model.profile==='demo'?'selected':''}>Small · up to 9 KB of code</option><option value="full" ${model.profile==='full'?'selected':''}>Larger · up to 100 KB of code</option></select><p class="help">Leave Small selected to start. Before + after context combined; this is not a whole-application review.</p><button class="secondary" data-action="ai" ${model.busy||!model.folder?'disabled':''}>Preview code for AI review…</button><p class="help">You inspect and approve the exact payload before sending it. Opening the preview does not send code.</p>
  <h2>3. Inspect evidence</h2><p class="help">After you approve the review, quotation and saved-snapshot checks run automatically. Open last AI evidence above to see what matched and what remains unverified. AI findings can still be wrong.</p>
  <details><summary>Access token settings</summary><button class="secondary" data-action="token" ${disabled}>Set backend access token…</button><p class="help">Only needed when setting up or changing the backend token. The Groq key stays on the backend.</p></details><p class="help">Scan project and Check an assistant answer work locally without AI setup.</p></details>
  <script nonce="${nonce}">
  const v=acquireVsCodeApi(),token=${JSON.stringify(token)};const saved=v.getState()||{};document.getElementById('ai').open=saved.aiOpen===true;document.getElementById('ai').ontoggle=()=>v.setState({aiOpen:document.getElementById('ai').open});
  function send(action,value){document.querySelectorAll('button,select').forEach(n=>n.disabled=true);v.postMessage({token,action,value});}
  document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>send(b.dataset.action));for(const action of ['folder','mode','profile','images'])document.getElementById(action).onchange=event=>send(action,event.target.value);
  </script></body></html>`;
}
function createScanControls(vscode,context,{review,aiReview,getReview=()=>null,getConnection=()=>({state:'not_checked'}),isBusy=()=>false}){
  const saved=context.workspaceState?.get('changeproof.scanSelection');
  let folder=typeof saved?.folder==='string'&&path.isAbsolute(saved.folder)?saved.folder:null;
  let mode=MODES.has(saved?.mode)?saved.mode:'current',view,token,working=false,error=null;
  const listeners=[];
  const workspaceFolders=()=> (vscode.workspace.workspaceFolders||[]).filter(f=>f.uri.scheme==='file');
  if(!folder&&workspaceFolders().length===1)folder=workspaceFolders()[0].uri.fsPath;
  const busy=()=>working||isBusy();
  async function persist(){await context.workspaceState?.update('changeproof.scanSelection',{folder,mode});}
  function model(){
    const folders=workspaceFolders().map(f=>({path:f.uri.fsPath,label:f.name||path.basename(f.uri.fsPath)}));
    if(folder&&!folders.some(f=>f.path===folder))folders.unshift({path:folder,label:path.basename(folder)+' (selected folder)'});
    const config=vscode.workspace.getConfiguration('changeproof');
    const configured=config.inspect('aiProfile')?.globalValue;
    const scanImages=config.inspect('scanContainerImages')?.globalValue===true;
    return {folder,folders,mode,scanImages,profile:configured==='full'?'full':'demo',busy:busy(),error,review:getReview(),connection:getConnection()};
  }
  function refresh(){
    if(view){token=crypto.randomBytes(18).toString('hex');view.webview.html=controlsHtml(model(),crypto.randomBytes(18).toString('hex'),token);}
  }
  async function handle(message){
    if(!message||message.token!==token||typeof message.action!=='string'||busy())return;
    const action=message.action;
    const allowed=['scan','browse','folder','mode','profile','images','results','settings','ai','health','setup','token','claims','guard','evidence','demo'];
    if(!allowed.includes(action))return;
    // Resolve only registered folder indices; never accept a webview-supplied path.
    const folders=model().folders;
    working=true;error=null;refresh();
    try{
      if(action==='browse'){
        const picked=await vscode.window.showOpenDialog({title:'Choose the project to scan',openLabel:'Use this folder',canSelectFolders:true,canSelectFiles:false,canSelectMany:false});
        if(picked?.[0]?.scheme==='file'){const candidate=picked[0].fsPath;if(!fs.statSync(candidate).isDirectory())throw new Error();folder=candidate;await persist();}
      }else if(action==='folder'){
        if(message.value==='')folder=null;
        else {if(typeof message.value!=='string'||!/^\d+$/.test(message.value)||!folders[Number(message.value)])throw new Error();folder=folders[Number(message.value)].path;}
        await persist();
      }else if(action==='mode'){
        if(!MODES.has(message.value))throw new Error();mode=message.value;await persist();
      }else if(action==='images'){
        if(!['enabled','disabled'].includes(message.value))throw new Error();
        await vscode.workspace.getConfiguration('changeproof').update('scanContainerImages',message.value==='enabled',vscode.ConfigurationTarget.Global);
      }else if(action==='profile'){
        if(!['demo','full'].includes(message.value))throw new Error();
        await vscode.workspace.getConfiguration('changeproof').update('aiProfile',message.value,vscode.ConfigurationTarget.Global);
      }else if(action==='scan'){
        if(!folder||!fs.statSync(folder).isDirectory())throw new Error();await persist();await review(folder,{mode,selection:'controls'});
      }else if(action==='claims'){if(!folder)throw new Error();await vscode.commands.executeCommand('changeproof.checkClaims',folder);}
      else if(action==='demo')await vscode.commands.executeCommand('changeproof.runDemo');
      else if(action==='guard')await vscode.commands.executeCommand('changeproof.testEvidenceGuard');
      else if(action==='evidence')await vscode.commands.executeCommand('changeproof.showAiSummary');
      else if(action==='results')await vscode.commands.executeCommand('changeproof.openDashboard');
      else if(action==='settings')await vscode.commands.executeCommand('workbench.action.openSettings','@ext:changeproof-local.changeproof-local');
      else if(action==='ai'){
        if(!folder||!fs.statSync(folder).isDirectory())throw new Error();await aiReview(folder);
      }else if(action==='health')await vscode.commands.executeCommand('changeproof.refreshAiStatus');
      else if(action==='setup')await vscode.commands.executeCommand('changeproof.showAiSetup');
      else if(action==='token')await vscode.commands.executeCommand('changeproof.setAiAccessToken');
    }catch{error='This action could not finish. Check the selected folder or open Settings / AI setup.';}
    finally{working=false;refresh();}
  }
  const provider={resolveWebviewView(resolved){
    view=resolved;view.webview.options={enableScripts:true,localResourceRoots:[]};
    listeners.push(view.webview.onDidReceiveMessage(handle));
    if(view.onDidDispose)listeners.push(view.onDidDispose(()=>{if(view===resolved)view=undefined;}));
    refresh();
  }};
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('changeproof.controls',provider));
  if(vscode.workspace.onDidChangeWorkspaceFolders)context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(refresh));
  if(vscode.workspace.onDidChangeConfiguration)context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e=>{if(e.affectsConfiguration('changeproof'))refresh();}));
  context.subscriptions.push({dispose(){listeners.forEach(d=>d.dispose());view=undefined;}});
  return {refresh,model,provider,handle,setSelection(selected,selectedMode){if(typeof selected==='string'&&path.isAbsolute(selected)&&MODES.has(selectedMode)){folder=selected;mode=selectedMode;void persist().catch(()=>{});refresh();}}};
}
module.exports={createScanControls,controlsHtml};
