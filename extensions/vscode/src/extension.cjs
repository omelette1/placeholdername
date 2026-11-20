const vscode = require('vscode');
const path = require('node:path');
const fs = require('node:fs');
const {runEngine} = require('./client.cjs');
const {createAiController}=require('./ai-client.cjs');
const {createDemo} = require('./demo.cjs');
const {createFindingsView} = require('./findings-view.cjs');
const {createScanControls}=require('./scan-controls.cjs');
function activate(context) {
  let running=false, demoRunning=false;
  const output=vscode.window.createOutputChannel('Changeproof Review Details');
  context.subscriptions.push(output);
  function record(data) {
    const entry={timestamp:new Date().toISOString(),session_id:vscode.env.sessionId,extension_host_pid:process.pid,extension_version:context.extension.packageJSON.version,workspace_name:vscode.workspace.name||null,workspace_file:vscode.workspace.workspaceFile?.fsPath||null,workspace_folders:(vscode.workspace.workspaceFolders||[]).map(f=>f.uri.fsPath),...data};
    const line=JSON.stringify(entry);output.appendLine(line);
    try{fs.mkdirSync(context.logUri.fsPath,{recursive:true});fs.appendFileSync(path.join(context.logUri.fsPath,'reviews.jsonl'),line+'\n',{mode:0o600});}catch{output.appendLine('Could not persist review details; this Output channel still contains them.');}
  }
  let ai,controls;
  const ui=createFindingsView(vscode,context,{record,rerun:review,aiAction:(...args)=>ai.action(...args),onChange:()=>controls?.refresh()});
  ai=createAiController(vscode,context,ui,{otherBusy:()=>running||demoRunning,onBusyChange:()=>controls?.refresh()});
  controls=createScanControls(vscode,context,{review,aiReview:folder=>ai.reviewFolder(folder),getReview:()=>ui.getState(),getConnection:()=>ui.getAiConnection(),isBusy:()=>running||demoRunning||ai.isBusy()});
  function showDetails(){output.show(true);}
  async function selectFolder(){
    const chosen=await vscode.window.showOpenDialog({title:'Select the exact folder to review',openLabel:'Review This Folder',canSelectFolders:true,canSelectFiles:false,canSelectMany:false});
    if(chosen?.[0]?.scheme==='file'){const choice=await vscode.window.showQuickPick([{label:'Current files',mode:'current'},{label:'Changes since HEAD',mode:'changes'}],{title:'Review mode',placeHolder:chosen[0].fsPath});if(choice)await review(chosen[0].fsPath,{mode:choice.mode});}
  }
  function offerDetails(message,error=false){
    const notify=error?vscode.window.showErrorMessage:vscode.window.showWarningMessage;
    void notify(message,'Show Details','Select Folder…').then(choice=>{if(choice==='Show Details')showDetails();else if(choice==='Select Folder…')void selectFolder();});
  }
  async function review(explicitFolder,{demo=false,mode='changes',selection:selectionOverride}={}) {
    if(ai?.isBusy()||running||(demoRunning&&!demo)){vscode.window.showInformationMessage('A local review is already running.');return;}
    const folders=(vscode.workspace.workspaceFolders||[]).filter(f=>f.uri.scheme==='file');
    if(!folders.length&&!explicitFolder){
      const reason='No local workspace folder is open.';const id=ui.begin(null);ui.fail(id,reason);
      record({phase:'not_invoked',selected_folder:null,reason});offerDetails('Changeproof: '+reason+' Select a folder to review.',true);return;
    }
    const folder=explicitFolder?{uri:vscode.Uri.file(explicitFolder)}:folders.length===1?folders[0]:await vscode.window.showWorkspaceFolderPick({placeHolder:'Select the local Git workspace to review'});
    if(!folder||folder.uri.scheme!=='file')return;
    const selectedFolder=folder.uri.fsPath;
    const selection=selectionOverride||(demo?'synthetic_demo':explicitFolder?'explicit_folder_picker':'workspace');
    if(!demo)controls.setSelection(selectedFolder,mode);
    const id=ui.begin(selectedFolder,{demo,selection,mode});
    const trace=data=>record({invocation_id:id,selected_folder:selectedFolder,selection,review_mode:mode,...data});
    const node=vscode.workspace.getConfiguration('changeproof').inspect('nodePath')?.globalValue||'node';
    if(node!=='node'&&!path.isAbsolute(node)){
      const reason='changeproof.nodePath must be an absolute path to trusted Node.';ui.fail(id,reason);trace({phase:'not_invoked',reason});offerDetails(`Changeproof cannot review ${selectedFolder}: ${reason}`,true);return;
    }
    running=true;
    controls.refresh();
    try{
      const checkovPath=vscode.workspace.getConfiguration('changeproof').inspect('checkovPath')?.globalValue||undefined;
      const result=await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Changeproof: '+(mode==='current'?'current files':'changes since HEAD')+' — '+selectedFolder,cancellable:false},()=>runEngine(node,context.asAbsolutePath('out/cli.cjs'),selectedFolder,trace,{mode,checkovPath}));
      ui.finish(id,result);
      if(result.analysis_errors.length){
        const reason=result.analysis_errors.map(e=>`${e.code}${e.file?' ('+e.file+')':''}: ${e.message}`).join(' ');
        offerDetails(`Changeproof review incomplete for ${selectedFolder} — ${reason}`);
      }
      return result;
    }catch(error){ui.fail(id,error.message);trace({phase:'adapter_error',reason:error.message});offerDetails(`Changeproof review failed for ${selectedFolder} — ${error.message}`,true);}
    finally{running=false;controls.refresh();}
  }
  async function reviewProject(){
    if(ai?.isBusy()||running||demoRunning){vscode.window.showInformationMessage('A local review is already running.');return;}
    const folders=(vscode.workspace.workspaceFolders||[]).filter(f=>f.uri.scheme==='file');
    let folder;
    if(folders.length===1)folder=folders[0].uri;
    else if(folders.length>1)folder=(await vscode.window.showWorkspaceFolderPick({placeHolder:'Select the project to review'}))?.uri;
    else folder=(await vscode.window.showOpenDialog({title:'Choose a project folder',openLabel:'Review Project',canSelectFolders:true,canSelectFiles:false,canSelectMany:false}))?.[0];
    if(!folder||folder.scheme!=='file')return;
    const mode=await vscode.window.showQuickPick([{label:'Current files',description:'Saved JS/TS files, including eligible untracked files. No Git or commit required.',mode:'current'},{label:'Changes since HEAD',description:'Tracked staged and unstaged changes compared with HEAD. Requires a Git baseline.',mode:'changes'}],{title:'Changeproof: Review Project',placeHolder:folder.fsPath,ignoreFocusOut:true});
    if(mode)await review(folder.fsPath,{mode:mode.mode,selection:folders.length?'workspace':'explicit_folder_picker'});
  }
  async function runDemo(){
    if(ai?.isBusy()||running||demoRunning){vscode.window.showInformationMessage('A local review is already running.');return;}
    demoRunning=true;
    try{
      const protectedFolders=(vscode.workspace.workspaceFolders||[]).filter(f=>f.uri.scheme==='file').map(f=>f.uri.fsPath);
      const directory=await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Changeproof: creating synthetic demo',cancellable:false},progress=>createDemo(path.join(context.globalStorageUri.fsPath,'demos'),protectedFolders,message=>progress.report({message})));
      const result=await review(directory,{demo:true});
      if(!result||!result.analysis_complete)return;
      if(!result.findings.some(f=>f.rule_id==='CP002')){offerDetails(`Changeproof demo reviewed ${directory}, but no CP002 finding was produced. See review details.`);return;}
      await ui.openFirst();
      record({phase:'demo_opened',selected_folder:directory,selection:'synthetic_demo',finding_rule:result.findings[0].rule_id,finding_line:result.findings[0].location.start.line,details_open:true,coverage:result.coverage.status,runtime_verification:false});
    }catch(error){record({phase:'demo_error',reason:error.message});offerDetails('Changeproof demo failed: '+error.message,true);}
    finally{demoRunning=false;}
  }
  context.subscriptions.push(vscode.commands.registerCommand('changeproof.openControls',()=>vscode.commands.executeCommand('workbench.view.extension.changeproof')),vscode.commands.registerCommand('changeproof.reviewProject',reviewProject),vscode.commands.registerCommand('changeproof.reviewLocalChanges',()=>review()),vscode.commands.registerCommand('changeproof.runDemo',runDemo),vscode.commands.registerCommand('changeproof.showReviewDetails',showDetails),vscode.commands.registerCommand('changeproof.selectFolderToReview',selectFolder));
}
module.exports={activate};
