const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const newness = (value,mode) => mode==='current'?'Not applicable — current files, no baseline': value === null ? 'Unknown' : value ? 'New relative to HEAD' : 'Matched in HEAD';
function stepsFor(finding) {
  if (finding.rule_id !== 'CP002') return [{role:(finding.rule_id.startsWith('CKV')||finding.evidence?.kind==='container_vulnerability')?'configuration':finding.rule_id==='DEP001'?'dependency':finding.rule_id==='CP001'?'logging':'syntax',label:finding.evidence?.kind==='container_vulnerability'?'Trivy image-reference evidence':finding.rule_id.startsWith('CKV')?'Checkov configuration evidence':finding.rule_id==='DEP001'?'OSV advisory matched this dependency version':finding.rule_id==='CP001'?'Console logging':'Risky syntax observation',location:finding.location}];
  return finding.evidence.paths.flatMap((flow, i) => flow.trace?.length ? flow.trace.map(step=>({role:step.kind,label:step.label,location:step.location})) : [
    {role:'source',label:`Path ${i + 1}: authorization-header source`,location:flow.source.location},
    ...flow.assignments.map(a => ({role:'assignment',label:`${a.kind}: ${a.variable}`,location:a.location})),
    {role:'logging',label:`Console.${flow.logging.console_method} (argument ${flow.logging.argument_index})`,location:flow.logging.location},
  ]);
}
function safeTarget(repository, location) {
  if (!location || typeof location.file !== 'string' || !location.file || path.isAbsolute(location.file)
      || location.file.split(/[\\/]/).some(p => !p || p === '.' || p === '..' || p === '.git')) throw new Error('Invalid evidence navigation target.');
  for (const pos of [location.start, location.end]) if (!Number.isSafeInteger(pos?.line) || pos.line < 1 || !Number.isSafeInteger(pos?.column) || pos.column < 1) throw new Error('Invalid evidence coordinates.');
  if (location.end.line < location.start.line || location.end.line === location.start.line && location.end.column < location.start.column) throw new Error('Invalid evidence range.');
  const root = fs.realpathSync(repository);
  let target = root;
  for (const part of location.file.split('/')) {
    target = path.join(target, part);
    if (fs.lstatSync(target).isSymbolicLink()) throw new Error('Evidence target became a symbolic link. Rerun review.');
  }
  if (!fs.statSync(target).isFile()) throw new Error('Evidence target is not a regular file.');
  const relative = path.relative(root, fs.realpathSync(target));
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Evidence target escapes the reviewed repository.');
  return target;
}
function sidebar(state) {
  const group = (label, children) => ({label,children,collapsibleState:2});
  const actions=group('Review actions',[
    {label:'Open Review Dashboard',command:{command:'changeproof.openDashboard',title:'Open Review Dashboard'}},
    {label:'Review Project…',tooltip:'Choose Current files or Changes since HEAD. Runs local checks; does not send code to AI.',command:{command:'changeproof.reviewProject',title:'Review Project'}},
    ...(state?.folder?[{label:'Rerun reviewed folder',tooltip:'Explicitly rerun the same folder and mode.',command:{command:'changeproof.rerunReview',title:'Rerun reviewed folder'}}]:[]),
  ]);
  if (!state) return [{label:'No review yet. Run Patch: Review Project.'},actions];
  const review = group('Review', [{label:`${state.demo ? 'Synthetic demo' : state.selection === 'explicit_folder_picker' ? 'Explicit folder review' : 'Workspace review'}: ${state.folder || 'No local folder'}`},
    {label:'Mode: '+(state.mode==='current'?'Current files (no baseline)':'Changes since HEAD')},
    {label:state.stale ? 'STALE — files changed; rerun explicitly.' : state.loading ? 'Review running…' : state.error || state.report?.analysis_errors?.length ? 'Processing incomplete; see errors.' : state.report?.coverage?.status === 'partial' ? 'Processing finished with partial analysis coverage.' : !state.report ? 'No deterministic review yet; AI progress and results are separate.' : 'Processing finished; coverage is separate.'}]);
  if (state.loading) return [actions,review,group('Findings', [{label:'Waiting for actual results…'}])];
  const r = state.report;
  if (!r) return [actions,review,group(state.error?'Setup / processing errors':'Deterministic checks', [{label:state.error || 'No deterministic review in this folder yet. Run Review Project; AI results are separate.'}])];
  const findings = r.findings.flatMap((f,index) => f.rule_id.startsWith('CKV')||f.rule_id==='DEP001'||f.evidence?.kind==='container_vulnerability'?[]:[({label:`${f.rule_id} · ${f.title}`,description:`${f.location.file}:${f.location.start.line}`,tooltip:f.explanation,
    command:{command:'changeproof.openFinding',title:'Open finding details',arguments:[state.id,index]}})]);
  const findingCount=findings.length;
  if (!findings.length) findings.push({label:r.analysis_errors.length ? 'No findings produced; processing is incomplete.' : 'No potential exposures found within processed checks; this does not establish safety.'});
  const infra=r.infrastructure;
  const infrastructure=infra?group('Infrastructure: '+infra.status,[{label:infra.reason},{label:'Scanner: Checkov '+infra.scanner.version+' · current snapshot only'},...infra.frameworks.map(f=>({label:`${f.framework}: ${f.status} · ${f.checks} checks · ${f.failed} failed · ${f.skipped} suppressed`})),...r.findings.flatMap((f,index)=>f.rule_id.startsWith('CKV')?[{label:f.rule_id+' · '+f.title,description:f.location.file+':'+f.location.start.line,command:{command:'changeproof.openFinding',title:'Open configuration finding',arguments:[state.id,index]}}]:[]),...infra.errors.map(e=>({label:e.code,tooltip:e.message})),...infra.skipped_files.map(e=>({label:'Skipped: '+e.file+' · '+e.reason}))]):group('Infrastructure: not assessed',[]);
  const dependencies=r.dependencies;
  const dependencyGroup=group('Dependencies: '+(dependencies?.status||'not assessed'),[
    {label:dependencies?.reason||'No dependency assessment.'},
    {label:(dependencies?.packages_checked||0)+' package versions checked · '+(dependencies?.advisories||0)+' advisory matches'},
    ...r.findings.flatMap((f,index)=>f.rule_id==='DEP001'?[{label:f.rule_id+' · '+f.title,description:f.location.file+':'+f.location.start.line,command:{command:'changeproof.openFinding',title:'Open dependency finding',arguments:[state.id,index]}}]:[]),
    ...(dependencies?.errors||[]).map(e=>({label:e.code,tooltip:e.message})),
  ]);
  const images=r.container_images;
  const imageGroup=group('Container images: '+(images?.status||'not assessed'),[
    {label:images?.reason||'Container scanning unavailable'},
    ...(images?.images||[]).map(i=>({label:i.image+' · '+i.status+' · '+i.high_critical_findings+' high/critical CVEs'})),
    ...r.findings.flatMap((f,index)=>f.evidence?.kind==='container_vulnerability'?[{label:f.rule_id+' · '+f.title,description:f.location.file+':'+f.location.start.line,command:{command:'changeproof.openFinding',title:'Open CVE evidence',arguments:[state.id,index]}}]:[]),
    ...(images?.errors||[]).map(e=>({label:e.code,tooltip:e.message})),
    ...(images?.skipped||[]).map(e=>({label:'Skipped: '+e.file+':'+e.line+' · '+e.reason}))
  ]);
  return [actions,review,infrastructure,dependencyGroup,imageGroup,group(`Findings (${findingCount})`,findings),
    group(`Coverage: ${r.coverage.status}`, [{label:(r.coverage.scope||'CP002 bounded checks')+'; analyzed is not a security guarantee.'},
      ...r.files_inspected.map(f=>group(`${f.file}: ${f.coverage.status}`,f.coverage.scopes.map(s=>({label:`${s.kind} · line ${s.location.start.line}: ${s.status}`,tooltip:`Supported steps: ${s.supported_steps}`}))))]),
    group(`Limitations (${r.analysis_limitations.length+(r.input_limitations||[]).length})`,(r.input_limitations||[]).map(message=>({label:message})).concat(r.analysis_limitations.map(n=>({label:`${n.code} · ${n.location.file}:${n.location.start.line} (${n.revision})`,tooltip:n.message}))).concat([{label:'Static checks only. No runtime verification or proof of application-wide security.'}])),
    group(`Setup / processing errors (${r.analysis_errors.length})`,r.analysis_errors.length?r.analysis_errors.map(e=>({label:`${e.code}${e.file?' · '+e.file:''}`,tooltip:e.message})):[{label:'No processing errors. This does not establish complete coverage.'}]),
    group(`Skipped / untracked (${r.skipped_files.length + r.untracked_files.length})`,[...r.skipped_files.map(f=>({label:`Skipped: ${f.file} — ${f.reason}`})),...r.untracked_files.map(f=>({label:`Untracked: ${f.file} — ${f.review_status==='included'?'included in current review':f.reason}`}))])];
}
function detailsHtml(state, finding, nonce) {
  const e = escapeHtml, steps = stepsFor(finding), report = state.report;
  const file = report.files_inspected.find(f=>f.file===finding.location.file);
  const list = values => '<ul>' + values.map(v=>'<li>'+e(v)+'</li>').join('') + '</ul>';
  const pathDetails = finding.rule_id === 'CP002' ? finding.evidence.paths.map((p,i)=>`<p>Path ${i+1}: ${e(newness(p.newly_introduced,state.mode))} · ${e(p.comparison)}</p>`).join('') : finding.rule_id==='CP001'?'<p>CP001 is name-based syntax evidence; no authorization-header source path is established.</p>':finding.evidence.kind==='container_vulnerability'?'<p>Trivy vulnerability '+e(finding.evidence.vulnerability_id)+' · image '+e(finding.evidence.image)+' · '+e(finding.evidence.package)+'. Local image only. Database freshness unverified.</p>':finding.evidence.kind==='dependency_advisory'?'<p>OSV advisory '+e(finding.evidence.advisory_id)+' matches '+e(finding.evidence.package_name)+'@'+e(finding.evidence.installed_version)+'. Reachability unverified.</p>':finding.evidence.kind==='infrastructure_policy'?'<p>Checkov-backed policy '+e(finding.evidence.policy_id)+' · '+e(finding.evidence.framework)+' · scanner '+e(finding.evidence.scanner_version)+'. Current snapshot only; no deployed-state verification.</p>':'<p>Syntax pattern: '+e(finding.evidence.pattern)+'. No attacker-input or exploit proof.</p>';
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none';"><meta name="viewport" content="width=device-width,initial-scale=1"><style nonce="${nonce}">
body{font-family:var(--vscode-font-family);color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);padding:24px;line-height:1.6;max-width:900px}h1{font-size:23px;line-height:1.25}h2{font-size:16px;margin-top:26px}p,dd,li{overflow-wrap:anywhere}dt{font-weight:600;margin-top:8px}dd{margin-left:0;color:var(--vscode-descriptionForeground)}button{font:inherit;text-align:left;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:1px solid transparent;padding:8px 12px;cursor:pointer}button:focus{outline:2px solid var(--vscode-focusBorder)}button:disabled{opacity:.5;cursor:not-allowed}.step{display:block;width:100%;margin:7px 0}.step small{display:block}.banner{border-left:3px solid var(--vscode-editorWarning-foreground);padding:10px;background:var(--vscode-textBlockQuote-background)}.muted{color:var(--vscode-descriptionForeground)}
</style></head><body><p class="muted">${state.demo?'Synthetic demo':'Local review'} · Potential exposure</p><h1>${e(finding.title)}</h1>${state.stale?'<p class="banner" role="alert">STALE: relevant files changed. Locations and evidence are a snapshot. Rerun explicitly before navigation or highlighting.</p>':''}<p>${e(finding.explanation)}</p><dl><dt>Reviewed folder</dt><dd>${e(state.folder)}</dd><dt>Review mode</dt><dd>${state.mode==='current'?'Current files — no baseline':'Changes since HEAD'}</dd><dt>Rule</dt><dd>${e(finding.rule_id)}</dd><dt>Evidence location</dt><dd>${e(finding.location.file)}:${finding.location.start.line}:${finding.location.start.column}</dd><dt>HEAD newness</dt><dd>${e(newness(finding.newly_introduced,state.mode))}</dd><dt>Compared HEAD</dt><dd>${e(state.mode==='current'?'Not used in current-files mode':report.compared_revision)}</dd><dt>Coverage</dt><dd>${finding.evidence.kind==='infrastructure_policy'?e(report.infrastructure?.status)+' infrastructure policy coverage':e(report.coverage.status)+' CP002 coverage; '+e(file?.coverage.status || 'not_analyzed')+' for this file'}. Syntax checks have separate narrow support; no security guarantee.</dd><dt>Runtime verification</dt><dd>${e(finding.runtime_verification)} — no target code was executed.</dd></dl><h2>${finding.rule_id==='CP002'?'Source → assignments / calls → logging':'Syntax evidence'}</h2>${pathDetails}${steps.map((s,i)=>`<button class="step" data-step="${i}" ${state.stale?'disabled':''}>${e(s.role.toUpperCase())}: ${e(s.label)}<small>${e(s.location.file)}:${s.location.start.line}:${s.location.start.column}</small></button>`).join('')}${finding.rule_id==='CP001'?list(finding.evidence.sensitive_names || []):''}<h2>Coverage scopes</h2>${list((file?.coverage.scopes||[]).map(s=>`${s.kind} at line ${s.location.start.line}: ${s.status} (${s.supported_steps} supported steps)`))}<h2>Limitations</h2>${list(finding.limitations)}${list(report.analysis_limitations.filter(n=>n.location.file===finding.location.file).map(n=>`${n.revision}: ${n.code} at line ${n.location.start.line} — ${n.message}`))}<button id="rerun">Rerun this review explicitly</button><p class="muted">Static evidence only. Neither a confirmed leak nor a finding of malicious intent.</p><script nonce="${nonce}">
const vscode=acquireVsCodeApi();document.querySelectorAll('[data-step]').forEach(button=>button.addEventListener('click',()=>vscode.postMessage({type:'navigate',reviewId:${JSON.stringify(state.id)},selectionToken:${JSON.stringify(state.selectionToken)},step:Number(button.dataset.step)})));document.getElementById('rerun').addEventListener('click',()=>vscode.postMessage({type:'rerun',reviewId:${JSON.stringify(state.id)},selectionToken:${JSON.stringify(state.selectionToken)}}));
</script></body></html>`;
}
function relevantChange(repository, uri) {
  if (typeof repository!=='string' || !repository || uri.scheme !== 'file') return false;
  let target=uri.fsPath;
  let relative = path.relative(repository,target);
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)){
    try{target=fs.realpathSync(target);relative=path.relative(fs.realpathSync(repository),target);}catch{return false;}
  }
  if (relative === '..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative)) return false;
  const normalized = relative.split(path.sep).join('/');
  if (normalized.startsWith('.git/')) return !normalized.endsWith('.lock') && (['.git/HEAD','.git/index','.git/packed-refs'].includes(normalized) || normalized.startsWith('.git/refs/'));
  return true;
}
module.exports = {escapeHtml,stepsFor,safeTarget,sidebar,detailsHtml,relevantChange,newness};
