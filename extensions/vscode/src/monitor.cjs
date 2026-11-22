const fs=require('node:fs');
const path=require('node:path');
const INTERVAL_MS=30*60*1000;
const DEBOUNCE_MS=2500;
const supported=file=>/(?:\.(?:[cm]?[jt]s|[jt]sx|tf|tf\.json|ya?ml|dockerfile|json)|(^|\/)Dockerfile(?:\.[^/]*)?$)/i.test(file);
const ignored=file=>file.split(/[\\/]/).some(part=>['.git','node_modules','dist','build','out','.venv','vendor'].includes(part));
function createBackgroundMonitor(vscode,context,{scan,canScan=()=>true}={}){
 let watcherDisposables=[],pending,interval,active=false,running=false;
 const config=name=>vscode.workspace.getConfiguration('changeproof').inspect(name)?.globalValue===true;
 const diagnostics=vscode.languages?.createDiagnosticCollection?.('Patch Monitor');
 const status=vscode.window.createStatusBarItem?.(vscode.StatusBarAlignment?.Left||1,80);
 const signatures=new Map();
 function clearTimers(){if(pending)clearTimeout(pending);if(interval)clearInterval(interval);pending=interval=undefined;}
 function targets(){return (vscode.workspace.workspaceFolders||[]).filter(x=>x.uri.scheme==='file').map(x=>x.uri.fsPath);}
 function mark(text,tooltip){if(!status)return;status.text=text;status.tooltip=tooltip;status.command='changeproof.reviewProject';status.show();}
 function isInside(root,file){const rel=path.relative(root,file);return rel!==''&&rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);}
 function safeLocation(root,loc){
  if(!loc||typeof loc.file!=='string'||path.isAbsolute(loc.file)||loc.file.split(/[\\/]/).some(p=>!p||p==='.'||p==='..'))return null;
  const target=path.join(root,loc.file);
  try{if(!isInside(fs.realpathSync(root),fs.realpathSync(target)))return null;const lines=fs.readFileSync(target,'utf8').split('\n');const a=loc.start,b=loc.end;if(!a||!b||a.line<1||b.line<a.line||b.line>lines.length||a.column<1||b.column<1||a.column>lines[a.line-1].length+1||b.column>lines[b.line-1].length+1)return null;return target;}catch{return null;}
 }
 function schedule(delay=DEBOUNCE_MS){if(!active)return;if(pending)clearTimeout(pending);pending=setTimeout(()=>{pending=undefined;void run();},delay);pending.unref?.();}
 async function run(){
  if(!active||running)return;
  if(!canScan()){schedule(10000);return;}
  running=true;mark('$(sync~spin) Patch: monitoring','Checking saved project files. No project code is executed.');
  const grouped=[],nextSignatures=new Map();let total=0,incomplete=false;
  try{
   for(const folder of targets()){
    if(!active)break;
    let report;
    try{report=await scan(folder);}catch{incomplete=true;continue;}
    if(!report?.analysis_complete||report.coverage?.status==='partial'||report.coverage?.status==='unsupported'||report.infrastructure?.status==='partial'||report.infrastructure?.status==='not_assessed'||report.dependencies?.status==='partial'||(config('dependencyAdvisoriesEnabled')&&report.dependencies?.status==='not_assessed'))incomplete=true;
    const byFile=new Map();
    for(const finding of report.findings||[]){
     const target=safeLocation(folder,finding.location);
     if(!target)continue;
     const evidence=finding.evidence||{};
     const key=folder+'|'+finding.rule_id+'|'+finding.location.file+'|'+finding.location.start.line+'|'+(evidence.advisory_id||evidence.pattern||'');
     nextSignatures.set(key,true);total++;
     if(!diagnostics)continue;
     const a=finding.location.start,b=finding.location.end;
     const range=new vscode.Range(a.line-1,a.column-1,b.line-1,b.column-1);
     const diagnostic=new vscode.Diagnostic(range,finding.explanation+'\nPotential issue; not a verified exploit. '+finding.limitations.join(' '),vscode.DiagnosticSeverity.Warning);
     diagnostic.code=finding.rule_id;diagnostic.source='Patch Monitor';
     const list=byFile.get(target)||[];list.push(diagnostic);byFile.set(target,list);
    }
    for(const [target,list] of byFile)grouped.push([vscode.Uri.file(target),list]);
   }
   if(!active)return;
   diagnostics?.clear();
   for(const [uri,list] of grouped)diagnostics?.set(uri,list);
   const newCount=[...nextSignatures.keys()].filter(key=>!signatures.has(key)&&key.includes('|DEP001|')).length;
   signatures.clear();for(const key of nextSignatures.keys())signatures.set(key,true);
   mark('$(shield) Patch: '+total+' potential issue'+(total===1?'':'s')+(incomplete?' (partial)':''),'Background scan of saved files. Click for a manual review. '+(incomplete?'One or more checks were incomplete.':'') );
   if(newCount&&vscode.window.showWarningMessage){
    void vscode.window.showWarningMessage('Patch Monitor found '+newCount+' new dependency advisory match'+(newCount===1?'':'es')+'. Review applicability before updating.', 'Review project').then(choice=>{if(choice==='Review project')void vscode.commands.executeCommand('changeproof.reviewProject');});
   }
  }finally{running=false;}
 }
 function refresh(){
  active=config('backgroundMonitorEnabled');
  clearTimers();for(const disposable of watcherDisposables)disposable.dispose();watcherDisposables=[];
  if(!active){diagnostics?.clear();status?.hide();signatures.clear();return;}
  mark('$(shield) Patch: monitoring','Saved-file monitoring is enabled. Advisory lookups require separate opt-in.');
  for(const folder of targets()){
   if(!vscode.workspace.createFileSystemWatcher)continue;
   const w=vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder,'**/*'));
   const trigger=uri=>{const relative=path.relative(folder,uri.fsPath);if(!ignored(relative)&&supported(relative))schedule();};
   for(const method of ['onDidChange','onDidCreate','onDidDelete'])w[method]?.(trigger);
   watcherDisposables.push(w);
  }
  interval=setInterval(()=>schedule(0),INTERVAL_MS);interval.unref?.();schedule(2000);
 }
 if(vscode.workspace.onDidChangeConfiguration)context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e=>{if(e.affectsConfiguration('changeproof.backgroundMonitorEnabled')||e.affectsConfiguration('changeproof.dependencyAdvisoriesEnabled'))refresh();}));
 if(vscode.workspace.onDidChangeWorkspaceFolders)context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(refresh));
 if(vscode.workspace.onDidSaveTextDocument)context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc=>{if(active&&doc.uri.scheme==='file'&&supported(doc.uri.fsPath)&&!ignored(doc.uri.fsPath))schedule();}));
 context.subscriptions.push({dispose(){active=false;clearTimers();for(const w of watcherDisposables)w.dispose();status?.dispose();diagnostics?.dispose();}});
 refresh();
 return {refresh,scanNow:run,isEnabled:()=>active};
}
module.exports={createBackgroundMonitor};
