import fs from 'node:fs';
import path from 'node:path';
import {diffLines} from 'diff';
import {inspectDetailed} from './rule.mjs';
import {MAX_FILE,git,safeRead,text,exclusion,DEFAULT_EXCLUSIONS,eligible} from './io.mjs';
import {currentInputs} from './current-files.mjs';
export {exclusion,DEFAULT_EXCLUSIONS} from './io.mjs';
export function lineRanges(before, after) {
  const changes = diffLines(before, after, {timeout:1000});
  if (!changes) throw new Error('diff_limit');
  let oldLine=1, newLine=1;
  const ranges=[];
  for (let i=0;i<changes.length;i++) {
    const c=changes[i];
    if (!c.added && !c.removed) {oldLine+=c.count;newLine+=c.count;continue;}
    const range={old_start:oldLine,old_count:0,new_start:newLine,new_count:0};
    while(i<changes.length && (changes[i].added || changes[i].removed)) {
      const item=changes[i];
      if(item.removed){range.old_count+=item.count;oldLine+=item.count;}
      else{range.new_count+=item.count;newLine+=item.count;}
      i++;
    }
    i--;ranges.push(range);
  }
  return ranges;
}
export function emptyReport() {
  return {schema_version:'4.0.0', tool:{name:'changeproof',version:'0.9.0'}, repository:null, git_repository:null, review_mode:'changes', input_limitations:[], compared_revision:null, comparison:'HEAD_to_tracked_working_tree', runtime_verification:false, analysis_complete:false, coverage:{status:'not_analyzed', scope:'CP002 on changed tracked JS/TS files only', analyzed_scopes:0, partial_scopes:0, unsupported_scopes:0, unassessed_files:0}, files_inspected:[], untracked_files:[], skipped_files:[], findings:[], analysis_errors:[], analysis_limitations:[], default_exclusions:DEFAULT_EXCLUSIONS, limitations:['Initial local static-analysis prototype; no AI reasoning or general access-control analysis.', 'Only saved working-tree content is read; untracked and ignored files are not analyzed.', 'Git-ignored untracked files are excluded by Git. Concurrent edits are not an atomic snapshot.', 'Names and file paths are metadata; literal source values and source snippets are omitted.']};
}
function analyzeChanges(repository) {
  const report=emptyReport();
  function error(code,file=null){report.analysis_errors.push({code,file,message:({not_git:'The path is not a readable Git working tree.',missing_head:'HEAD is missing or unreadable; commit an initial baseline before reviewing.',git_unavailable:'Git is unavailable or does not support the required --no-lazy-fetch safety option.',git_read_failed:'Git metadata or an object could not be read. No project command was executed.',parse_error:'Syntax parsing failed; no findings were produced for this file.'})[code] || 'The file could not be safely analyzed.'});}
  let root,gitRoot;
  try {
    root=fs.realpathSync(repository);
  } catch {error('not_git');return report;}
  try {git(root,['--version']);}catch{error('git_unavailable');return report;}
  try {
    gitRoot=fs.realpathSync(git(root,['rev-parse','--show-toplevel']).toString().replace(/\n$/, ''));
    report.git_repository=gitRoot;
    if(git(gitRoot,['rev-parse','--is-bare-repository']).toString().trim() === 'true') throw new Error();
    report.repository=root;
  } catch {error('not_git');return report;}
  let indexed, tree;
  const prefix=path.relative(gitRoot,root).split(path.sep).join('/');
  const projectFile=file=>!prefix?file:file.startsWith(prefix+'/')?file.slice(prefix.length+1):null;
  try {
    const untracked=git(gitRoot,['ls-files','--others','--exclude-standard','-z']).toString().split('\0').filter(Boolean);
    report.untracked_files=untracked.map(projectFile).filter(Boolean).map(file=>({file,excluded:!!exclusion(file),reason:exclusion(file)||'untracked_not_analyzed'}));
    indexed=git(gitRoot,['ls-files','--stage','-z']).toString().split('\0').filter(Boolean);
  } catch {error('git_read_failed');return report;}
  try {report.compared_revision=git(gitRoot,['rev-parse','--verify','HEAD^{commit}']).toString().trim();}
  catch{error('missing_head');return report;}
  try {tree=git(gitRoot,['ls-tree','-r','-z',report.compared_revision]).toString().split('\0').filter(Boolean);}
  catch{error('git_read_failed');return report;}
  const head=new Map(tree.map(entry=>{const tab=entry.indexOf('\t');const [mode,type,oid]=entry.slice(0,tab).split(' ');return [entry.slice(tab+1),{mode,type,oid}];}));
  const index=new Map();
  for(const entry of indexed){const tab=entry.indexOf('\t');const [mode,,stage]=entry.slice(0,tab).split(' ');const file=entry.slice(tab+1);const prior=index.get(file);index.set(file,{mode,conflict:stage!=='0'||prior?.conflict});}
  for(const file of [...new Set([...head.keys(),...index.keys()])].sort()) {
    const old=head.get(file), next=index.get(file);
    const relative=projectFile(file);if(!relative)continue;
    const skip=reason=>report.skipped_files.push({file:relative,reason});
    const excluded=exclusion(relative);
    if(excluded){skip(excluded);continue;}
    if(next?.conflict){skip('merge_conflict');error('merge_conflict',file);continue;}
    if([old?.mode,next?.mode].some(mode=>mode==='120000')){skip('symlink');continue;}
    if([old?.mode,next?.mode].some(mode=>mode==='160000')){skip('submodule');continue;}
    let beforeBuffer,afterBuffer;
    try {
      if(old && Number(git(gitRoot,['cat-file','-s',old.oid]).toString())>MAX_FILE){skip('file_too_large');continue;}
      beforeBuffer=old?git(gitRoot,['cat-file','blob',old.oid]):Buffer.alloc(0);
      afterBuffer=next?safeRead(root,relative):null;
    }catch(e){const reason=['symlink','file_too_large','unsafe_path','not_regular_file'].includes(e.message)?e.message:'read_failed';skip(reason);if(reason==='read_failed')error('git_read_failed',relative);continue;}
    if(!old && afterBuffer===null)continue;
    let before,after;
    try{before=text(beforeBuffer);after=afterBuffer===null?'':text(afterBuffer);}
    catch(e){skip(e.message);continue;}
    if(!/\.(?:[cm]?[jt]s|[jt]sx)$/i.test(file)){skip('unsupported_language');continue;}
    const status=afterBuffer===null?'deleted':!old?'added':before===after?'unchanged':'modified';
    let ranges;
    try{ranges=lineRanges(before,after);}catch{skip('diff_limit');error('diff_limit',relative);continue;}
    const record={file:relative,status,snapshot:afterBuffer?.snapshot??null,changed_line_ranges:ranges, coverage:{status:'not_analyzed', scopes:[]}};report.files_inspected.push(record);
    if(status==='unchanged'||status==='deleted')continue;
    try{const result=inspectDetailed(relative,before,after,ranges);record.coverage={status: result.coverage.some(s=>s.status!=='analyzed') ? (result.coverage.some(s=>s.status==='analyzed'||s.status==='partial')?'partial':'unsupported') : 'analyzed', scopes:result.coverage};report.findings.push(...result.findings);report.analysis_limitations.push(...result.limitations);}
    catch{skip('parse_error');error('parse_error',relative);}
  }
  const scopes=report.files_inspected.flatMap(f=>f.coverage.scopes);
  const changed=report.files_inspected.filter(f=>['added','modified'].includes(f.status));
  const counts=report.coverage;
  counts.analyzed_scopes=scopes.filter(s=>s.status==='analyzed').length;
  counts.partial_scopes=scopes.filter(s=>s.status==='partial').length;
  counts.unsupported_scopes=scopes.filter(s=>s.status==='unsupported').length;
  counts.unassessed_files=report.skipped_files.length+report.untracked_files.length;
  counts.status=counts.partial_scopes||counts.unsupported_scopes||counts.unassessed_files||report.analysis_errors.length
    ? (counts.analyzed_scopes||counts.partial_scopes||changed.some(f=>f.coverage.status==='analyzed')?'partial':'unsupported')
    : changed.length?'analyzed':'not_analyzed';
  report.analysis_complete=report.analysis_errors.length===0;
  return report;
}

function analyzeCurrent(project) {
  const report=emptyReport();report.review_mode='current';report.comparison='current_files';
  report.coverage.scope='CP002 on eligible saved JS/TS files in the selected project; exclusions are listed separately';
  report.limitations=['Current files have no compared baseline; finding and path newness is not applicable.', 'Saved files only. No target code, configuration plugins or dependencies are executed.', 'Relative/imported helpers, dynamic dispatch and returned-value propagation are not resolved.', 'Source names/paths are metadata; literal values and source snippets are omitted. Reads are not an atomic snapshot.'];
  let root;
  try{root=fs.realpathSync(project);if(!fs.statSync(root).isDirectory())throw new Error();report.repository=root;}catch{report.analysis_errors.push({code:'invalid_project',file:null,message:'The selected path is not a readable project directory.'});return report;}
  const inputs=currentInputs(root);report.git_repository=inputs.gitRoot;report.input_limitations=inputs.limitations;report.untracked_files=inputs.untracked;report.skipped_files=inputs.skipped;report.analysis_errors=inputs.errors;
  for(const file of inputs.files){
    let after,snapshot;
    try{const bytes=safeRead(root,file);if(bytes===null)throw new Error('file_disappeared');after=text(bytes);snapshot=bytes.snapshot;}catch(e){report.skipped_files.push({file,reason:['binary','non_utf8','file_too_large','symlink','file_disappeared'].includes(e.message)?e.message:'read_failed'});if(!['binary','non_utf8','file_too_large','symlink'].includes(e.message))report.analysis_errors.push({code:'read_failed',file,message:'The file could not be safely read.'});continue;}
    const record={file,status:'current',snapshot,changed_line_ranges:[],coverage:{status:'not_analyzed',scopes:[]}};report.files_inspected.push(record);
    try{
      const result=inspectDetailed(file,'',after,lineRanges('',after));
      record.coverage={status:result.coverage.some(s=>s.status!=='analyzed')?(result.coverage.some(s=>s.status==='analyzed'||s.status==='partial')?'partial':'unsupported'):'analyzed',scopes:result.coverage};
      for(const finding of result.findings){
        finding.newly_introduced=null;
        if(finding.rule_id==='CP001')finding.explanation='A direct console call receives an argument whose name suggests sensitive data. Current-files mode has no baseline; this is not a confirmed leak.';
        if(finding.evidence.paths)for(const flow of finding.evidence.paths){flow.newly_introduced=null;flow.comparison='not_applicable_current_files';}
        finding.limitations=[...finding.limitations.filter(l=>!l.startsWith('HEAD comparison')), 'Current-files review: no baseline comparison; newness is not applicable.'];
      }
      report.findings.push(...result.findings);report.analysis_limitations.push(...result.limitations.filter(n=>n.revision!=='HEAD').map(n=>({...n,revision:'current_files'})));
    }catch{report.skipped_files.push({file,reason:'parse_error'});report.analysis_errors.push({code:'parse_error',file,message:'Syntax parsing failed; the file was not analyzed.'});}
  }
  for(const file of report.untracked_files)file.review_status=report.files_inspected.some(f=>f.file===file.file&&f.coverage.status!=='not_analyzed')?'included':'skipped';
  const scopes=report.files_inspected.flatMap(f=>f.coverage.scopes),c=report.coverage;
  c.analyzed_scopes=scopes.filter(s=>s.status==='analyzed').length;c.partial_scopes=scopes.filter(s=>s.status==='partial').length;c.unsupported_scopes=scopes.filter(s=>s.status==='unsupported').length;
  c.unassessed_files=report.skipped_files.filter(f=>!['excluded_directory','excluded_secret_file','gitignored'].includes(f.reason)).length;
  c.status=c.partial_scopes||c.unsupported_scopes||c.unassessed_files||report.analysis_errors.length?(c.analyzed_scopes||c.partial_scopes||report.files_inspected.some(f=>f.coverage.status==='analyzed')?'partial':'unsupported'):report.files_inspected.length?'analyzed':'not_analyzed';
  report.analysis_complete=report.analysis_errors.length===0;return report;
}
export function analyze(project,{mode='changes'}={}) {
  if(mode==='current')return analyzeCurrent(project);
  if(mode==='changes')return analyzeChanges(project);
  const report=emptyReport();report.analysis_errors.push({code:'invalid_mode',file:null,message:'Review mode must be current or changes.'});return report;
}
