const {execFile}=require('node:child_process');
const path=require('node:path');
function collect(node,cli,folder,signal){return new Promise((resolve,reject)=>{
 const env={...process.env};for(const key of Object.keys(env))if(['NODE_OPTIONS','NODE_PATH','GROQ_API_KEY','REVIEW_ACCESS_TOKEN'].includes(key))delete env[key];
 execFile(node,[cli,folder],{cwd:path.dirname(cli),env,signal,windowsHide:true,timeout:60000,maxBuffer:2*1024*1024},(error,stdout)=>{
  let value;try{value=JSON.parse(stdout);}catch{}
  if(signal?.aborted)return reject(new Error('AI review cancelled.'));
  if(error||!value?.request)return reject(new Error(value?.error||'Could not safely collect AI context. Check Git baseline and trusted Node configuration.'));
  resolve(value);
 });
});}
function sameSnapshot(a,b){return a.folder===b.folder&&a.request.baseline===b.request.baseline&&a.changed_paths_hash===b.changed_paths_hash&&a.index_hash===b.index_hash&&JSON.stringify(a.snapshots)===JSON.stringify(b.snapshots)&&JSON.stringify(a.request.files)===JSON.stringify(b.request.files)&&JSON.stringify(a.request.omissions)===JSON.stringify(b.request.omissions);}
function createAiController(vscode,context,ui,{otherBusy=()=>false}={}){
 let busy=false,controller,lastSmoke=null,statusGeneration=0;
 const shared=()=>require(context.asAbsolutePath('out/ai-client.cjs'));
 const secretKey='changeproof.aiDevelopmentAccessToken';
 async function setToken(){const token=await vscode.window.showInputBox({title:'Changeproof development backend access token',prompt:'Must match server REVIEW_ACCESS_TOKEN. Stored in VS Code SecretStorage; never sent to Groq.',password:true,ignoreFocusOut:true,validateInput:value=>value.length<32||/\s/.test(value)?'Use at least 32 non-whitespace characters.':null});if(token!==undefined){if(token.length<32||/\s/.test(token))return;await context.secrets.store(secretKey,token);}}
 function nodePath(){const value=vscode.workspace.getConfiguration('changeproof').inspect('nodePath')?.globalValue||'node';if(value!=='node'&&!path.isAbsolute(value))throw new Error('changeproof.nodePath must be an absolute trusted Node executable.');return value;}
 function dirty(folder){return (vscode.workspace.textDocuments||[]).some(d=>d.isDirty&&d.uri.scheme==='file'&&(()=>{const rel=path.relative(folder,d.uri.fsPath);return rel!== '..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);})());}
 async function progress(title,work){controller=new AbortController();return vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title,cancellable:true},async(_progress,token)=>{const cancel=token?.onCancellationRequested(()=>controller?.abort());try{return await work(controller.signal);}finally{cancel?.dispose();controller=undefined;}});}
 function configuredUrl(){return shared().backendUrl(vscode.workspace.getConfiguration('changeproof').inspect('aiBackendUrl')?.globalValue||'http://127.0.0.1:4318');}
 function matchingSmoke(url,health){return lastSmoke?.url===url&&lastSmoke.provider===health.provider&&lastSmoke.model===health.model&&lastSmoke.instance_id===health.instance_id?lastSmoke:null;}
 async function refreshStatus(){
  const generation=++statusGeneration;let url;ui.setAiConnection({state:'checking'});
  try{url=configuredUrl();const health=await shared().getHealth(url);const value={state:'reachable',url,health,checked_at:new Date().toISOString(),smoke:matchingSmoke(url,health)};if(generation!==statusGeneration)return null;ui.setAiConnection(value);return value;}
  catch{if(generation!==statusGeneration)return null;ui.setAiConnection({state:'unavailable',url,error:'Start the review API, check its user-level URL and compatible health contract.',checked_at:new Date().toISOString()});return null;}
 }
 async function checkConnection(){
  if(busy||otherBusy())return;busy=true;
  try{
   const status=await refreshStatus();if(!status)return;
   const answer=await vscode.window.showInformationMessage('Send one small built-in synthetic before/after example to '+status.url+' and its '+status.health.provider+' provider? No workspace code or project metadata is included. Provider usage may apply. A valid response checks connection/schema compatibility, not detection accuracy.',{modal:true},'Send synthetic check');
   if(answer!=='Send synthetic check'||configuredUrl()!==status.url)return;
   ui.setAiConnection({...status,checking_smoke:true});
   try{
    const access=await context.secrets.get(secretKey);if(!access)throw new Error('missing_development_token');
    const smoke=await progress('Changeproof: synthetic AI connection check (no workspace code)',signal=>shared().runSyntheticSmoke(status.url,access,status.health,{signal}));
    lastSmoke={...smoke,url:status.url};ui.setAiConnection({...status,smoke:lastSmoke,checking_smoke:false});
   }catch(error){
    const known={invalid_reference:'Invalid provider code references.',missing_comparison_references:'Provider omitted before/after references.',invalid_model_output:'Provider output failed schema validation.',invalid_response:'Provider response failed schema or request identity validation.',provider_auth:'Groq authentication failed. Check the server-side key.',provider_configuration:'Provider rejected the configured model/schema.',unauthorized:'Backend access token rejected. Set AI Review Access Token.',provider_quota:'Provider throttled or quota exhausted. No retry attempted.',throttled:'Backend/provider quota exhausted. No retry attempted.',provider_timeout:'Provider timed out.',provider_unavailable:'Provider unavailable.',provider_changed:'Backend provider/model changed during the check; refresh status.',missing_development_token:'Set AI Review Access Token. Do not enter the Groq key.'};
    const code=error.code||error.message;lastSmoke={url:status.url,provider:status.health.provider,model:status.health.model,instance_id:status.health.instance_id,status:'failed',timestamp:new Date().toISOString(),contract_valid:false,error:known[code]||'Synthetic connection check failed or was cancelled; no valid inference result.'};ui.setAiConnection({...status,smoke:lastSmoke,checking_smoke:false});
   }
  }finally{busy=false;}
 }
 async function review(){
  if(busy||otherBusy())return;
  let folder=ui.getState()?.demo?null:ui.getState()?.folder;
  if(!folder){const folders=(vscode.workspace.workspaceFolders||[]).filter(f=>f.uri.scheme==='file');if(folders.length===1)folder=folders[0].uri.fsPath;else if(folders.length>1)folder=(await vscode.window.showWorkspaceFolderPick({placeHolder:'Choose project for AI review'}))?.uri.fsPath;else folder=(await vscode.window.showOpenDialog({title:'Choose project for AI changes review',canSelectFolders:true,canSelectFiles:false,canSelectMany:false}))?.[0]?.fsPath;}
  if(!folder)return;
  const token=ui.aiBegin(folder);busy=true;
  try{
   const url=shared().backendUrl(vscode.workspace.getConfiguration('changeproof').inspect('aiBackendUrl')?.globalValue||'http://127.0.0.1:4318');
   const envelope=await progress('Changeproof: preparing local AI transmission preview',signal=>collect(nodePath(),context.asAbsolutePath('out/ai-context.cjs'),folder,signal));
   if(!envelope.request.files.length){ui.aiUpdate(token,{phase:'empty',error:'No eligible saved tracked JS/TS changes against HEAD. Nothing was sent.'});await ui.selectAi(token);return;}
   shared().checkRequest(envelope.request);ui.aiUpdate(token,{phase:'preview',envelope,url});await ui.selectAi(token);
  }catch{ui.aiUpdate(token,{phase:'error',error:'AI preview could not be collected. A readable Git HEAD baseline and trusted Node are required; check excluded, oversized or unsupported input. Local Current files review still works without Git. Nothing was sent.'});await ui.selectAi(token);}
  finally{busy=false;}
 }
 async function action(type,ai){
  if(type==='ai_cancel'){controller?.abort();ui.aiUpdate(ai.token,{phase:'cancelled',envelope:undefined});return;}
  if(type!=='ai_approve'||busy||otherBusy()||ai.phase!=='preview')return;
  busy=true;
  try{
   const access=await context.secrets.get(secretKey);if(!access)throw new Error('Set AI Review Access Token using the Changeproof command. No source was sent.');
   const node=nodePath();const folder=ui.getState().folder;
   ui.aiUpdate(ai.token,{phase:'checking'});
   await progress('Changeproof: checking approved snapshot and requesting AI assessment',async signal=>{
    const refreshed=await collect(node,context.asAbsolutePath('out/ai-context.cjs'),folder,signal);
    if(dirty(folder)||!sameSnapshot(ai.envelope,refreshed)||ui.getState()?.ai?.token!==ai.token||signal.aborted)throw new Error('Project or saved inputs changed. Run AI Review Changes again and approve a refreshed preview. Nothing was sent.');
    // The exact approved object is serialized; refreshed content is never substituted.
    ui.aiUpdate(ai.token,{phase:'sending',stale:false});
    const response=await shared().postReview(ai.url,access,ai.envelope.request,{signal});
    shared().checkResponse(response,ai.envelope.request);
    const after=await collect(node,context.asAbsolutePath('out/ai-context.cjs'),folder,signal);
    const stale=dirty(folder)||!sameSnapshot(ai.envelope,after)||ui.getState()?.ai?.stale===true;
    ui.aiUpdate(ai.token,{phase:'completed',response,stale});
   });
   await ui.selectAi(ai.token);
  }catch(error){const safeMessages=['Set AI Review Access Token','Project or saved inputs changed','Authentication failed','Review quota','Review service','Review provider','Provider output','Review request','AI review cancelled','AI review timed out','AI review service'];const message=safeMessages.some(p=>error.message.startsWith(p))?error.message:'AI review failed validation or could not complete. No valid assessment is available.';ui.aiUpdate(ai.token,{phase:'error',error:message,response:undefined});await ui.selectAi(ai.token);}
  finally{busy=false;}
 }
 if(vscode.workspace.onDidChangeConfiguration)context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event=>{if(event.affectsConfiguration('changeproof.aiBackendUrl')){statusGeneration++;lastSmoke=null;controller?.abort();ui.setAiConnection({state:'not_checked'});}}));
 context.subscriptions.push(vscode.commands.registerCommand('changeproof.refreshAiStatus',refreshStatus),vscode.commands.registerCommand('changeproof.checkAiConnection',checkConnection),vscode.commands.registerCommand('changeproof.showAiSetup',()=>ui.showAiSetup()),vscode.commands.registerCommand('changeproof.aiReviewChanges',review),vscode.commands.registerCommand('changeproof.setAiAccessToken',setToken),{dispose(){controller?.abort();}});
 return {action,refreshStatus,checkConnection,isBusy:()=>busy};
}
module.exports={createAiController,collect,sameSnapshot};
