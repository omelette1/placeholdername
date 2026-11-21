const crypto=require('node:crypto');
const {escapeHtml:e}=require('./finding-ui.cjs');
function guardHtml(state,nonce,token){
 const r=state.report;
 return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none';"><style nonce="${nonce}">
 body{font:13px/1.6 var(--vscode-font-family,sans-serif);color:var(--vscode-editor-foreground,#e3eaf2);background:var(--vscode-editor-background,#141a22);max-width:900px;margin:auto;padding:28px}h1{font-size:25px;margin:8px 0}h2{font-size:17px}.muted{color:var(--vscode-descriptionForeground,#a7b2c0)}.notice{border-left:3px solid var(--vscode-editorWarning-foreground,#ddb16a);padding:12px 16px;margin:20px 0}button{font:inherit;padding:10px 16px;cursor:pointer;background:var(--vscode-button-background,#206d92);color:var(--vscode-button-foreground,#fff);border:0;border-radius:5px}button:focus-visible{outline:2px solid var(--vscode-focusBorder);outline-offset:3px}table{border-collapse:collapse;width:100%;margin:20px 0}th,td{text-align:left;border-bottom:1px solid var(--vscode-panel-border,#35404e);padding:12px 8px;overflow-wrap:anywhere}th{font-size:11px;color:var(--vscode-descriptionForeground,#a7b2c0)}.error{color:var(--vscode-errorForeground,#f29898)}code{font-size:11px}strong{font-weight:650}
 </style></head><body><p class="muted">Changeproof · Verify AI output</p><h1>Test evidence guard</h1><p>See whether the installed quote validator accepts exact text and rejects fabricated evidence. These are built-in synthetic examples.</p><button id="run">${r?'Run checks again':'Run local guard checks'}</button><p class="muted">No backend needed · no model requests · no project files read</p>
 ${state.error?'<p class="error" role="alert">The checks could not run. No protection result is established. Rebuild or reinstall the extension.</p>':''}
 ${r?`<section role="status" aria-live="polite"><h2>${r.passed} / ${r.total} guard checks passed</h2><table><thead><tr><th>Example</th><th>Validator outcome</th><th>Check</th></tr></thead><tbody>${r.rows.map(row=>`<tr><td>${e(row.label)}</td><td>${row.observed==='accepted'?'Accepted':'Rejected: <code>'+e(row.observed)+'</code>'}</td><td>${row.passed?'Passed':'FAILED'}</td></tr>`).join('')}</tbody></table></section>`:''}
 <div class="notice"><strong>This is not a hallucination-rate or security test.</strong> Real but irrelevant quotations and incorrect interpretations can still pass. A successful guard test does not mean an AI answer is correct. No saved-project snapshot checks run in this demonstration.</div>
 <h2>Check your own result</h2><p>For a Copilot completion message, use <strong>Check assistant claims…</strong> in the sidebar and paste the answer. For Changeproof AI reviews, open <strong>Open last AI evidence</strong> to inspect quote receipts and claims that remain unverified.</p>
 <script nonce="${nonce}">const v=acquireVsCodeApi();document.getElementById('run').onclick=()=>v.postMessage({type:'guard_run',token:${JSON.stringify(token)}});</script></body></html>`;
}
function createEvidenceGuard(vscode,context,ui){
 let current;
 function open(){
  const state={report:null,error:false};
  state.page={title:'Changeproof Evidence Guard',render(nonce){state.token=crypto.randomBytes(18).toString('hex');return guardHtml(state,nonce,state.token);},onMessage(message){
   if(current!==state||message?.token!==state.token||message.type!=='guard_run')return;
   try{state.report=require(context.asAbsolutePath('out/ai-client.cjs')).runEvidenceGuard();state.error=false;}
   catch{state.report=null;state.error=true;}
   ui.refreshAuxiliary(state.page);
  },onClose(){if(current===state)current=undefined;}};
  ui.showAuxiliary(state.page);current=state;
 }
 context.subscriptions.push(vscode.commands.registerCommand('changeproof.testEvidenceGuard',open));
 return {open};
}
module.exports={guardHtml,createEvidenceGuard};
