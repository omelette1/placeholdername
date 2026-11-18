const {execFile}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
function validateReport(report,folder){
  if(report?.schema_version!=='4.0.0'||report.runtime_verification!==false||typeof report.analysis_complete!=='boolean'||!Array.isArray(report.findings)||!Array.isArray(report.analysis_errors)||!Array.isArray(report.files_inspected)||!Array.isArray(report.skipped_files)||!Array.isArray(report.untracked_files)||!Array.isArray(report.analysis_limitations)) throw new Error('Invalid engine report.');
  if(!['current','changes'].includes(report.review_mode)||!Array.isArray(report.input_limitations))throw new Error('Invalid review mode.');
  if(report.review_mode==='current'&&report.compared_revision!==null)throw new Error('Current-files review cannot have a baseline.');
  if (!['analyzed','partial','unsupported','not_analyzed'].includes(report.coverage?.status)) throw new Error('Invalid coverage status.');
  for (const f of report.files_inspected) {
    if (!['analyzed','partial','unsupported','not_analyzed'].includes(f.coverage?.status) || !Array.isArray(f.coverage?.scopes)) throw new Error('Invalid file coverage.');
    for (const scope of f.coverage.scopes) {
      if (!['analyzed','partial','unsupported'].includes(scope.status)) throw new Error('Invalid scope coverage.');
      validLocation(scope.location);
    }
  }
  if(report.repository!==null && (typeof report.repository!=='string'||!path.isAbsolute(report.repository)))throw new Error('Invalid repository path.');
  if(report.repository){const relative=path.relative(report.repository,fs.realpathSync(folder));if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Engine repository does not contain the selected folder.');}
  function validLocation(loc){
    if(typeof loc?.file!=='string'||path.isAbsolute(loc.file)||loc.file.split(/[\\/]/).some(p=>p==='..'||!p))throw new Error('Invalid evidence file.');
    for(const pos of [loc.start,loc.end])if(!Number.isSafeInteger(pos?.line)||pos.line<1||!Number.isSafeInteger(pos?.column)||pos.column<1)throw new Error('Invalid evidence location.');
  }
  for(const note of report.analysis_limitations)validLocation(note.location);
  for(const f of report.findings){
    const file=f.location?.file;
    if(typeof file!=='string'||path.isAbsolute(file)||file.split(/[\\/]/).some(p=>p==='..'||!p)||typeof f.explanation!=='string'||!['CP001','CP002'].includes(f.rule_id)||!Array.isArray(f.limitations))throw new Error('Invalid finding.');
    for(const pos of [f.location.start,f.location.end])if(!Number.isSafeInteger(pos?.line)||pos.line<1||!Number.isSafeInteger(pos?.column)||pos.column<1)throw new Error('Invalid finding location.');
    if(report.review_mode==='current'&&f.newly_introduced!==null)throw new Error('Current-files newness must be not applicable.');
    if(f.runtime_verification!==false||![true,false,null].includes(f.newly_introduced))throw new Error('Invalid finding verification status.');
    if(f.rule_id==='CP002'){
      if(f.evidence?.kind!=='bounded_same_file_data_flow'||!Array.isArray(f.evidence.paths)||!f.evidence.paths.length)throw new Error('Invalid flow evidence.');
      for(const p of f.evidence.paths){
        if(p.trace){if(!Array.isArray(p.trace)||!p.trace.length||p.trace.length>64)throw new Error('Invalid trace.');for(const step of p.trace){if(!['source','assignment','argument','function_call','parameter','logging'].includes(step.kind)||typeof step.label!=='string')throw new Error('Invalid trace step.');validLocation(step.location);}}
        validLocation(p.source?.location);validLocation(p.logging?.location);
        if(!Array.isArray(p.assignments)||![true,false,null].includes(p.newly_introduced))throw new Error('Invalid flow path.');
        for(const assignment of p.assignments){validLocation(assignment.location);if(typeof assignment.variable!=='string')throw new Error('Invalid assignment.');}
      }
    }
    if(!report.repository)throw new Error('Finding without repository.');
  }
  return report;
}
function runEngine(node,cli,folder,onExecution=()=>{},{mode='changes'}={}){
  return new Promise((resolve,reject)=>{
    const env={...process.env};
    delete env.NODE_OPTIONS;delete env.NODE_PATH;
    const invocation={executable:node,arguments:[cli,folder,...(mode==='current'?['--mode','current']:[])],review_mode:mode,cwd:path.dirname(cli)};
    const emit=record=>{try{onExecution({...invocation,...record});}catch{/* Observability must not change analysis results. */}};
    emit({phase:'started',exit_code:null});
    execFile(node,invocation.arguments,{cwd:invocation.cwd,env,windowsHide:true,timeout:60000,maxBuffer:16*1024*1024},(error,stdout)=>{
      let parsed;
      try{parsed=JSON.parse(stdout);}catch{/* Never log raw stdout/stderr or source text. */}
      const returnedErrors=Array.isArray(parsed?.analysis_errors)?parsed.analysis_errors.map(e=>({code:e.code,file:e.file,message:e.message})):[];
      emit({phase:'completed',exit_code:error?(Number.isInteger(error.code)?error.code:null):0,process_error:typeof error?.code==='string'?error.code:null,signal:error?.signal||null,returned_errors:returnedErrors,analysis_complete:parsed?.analysis_complete??null});
      if(error && error.code!==2)return reject(new Error(error.code==='ENOENT'?'Node.js was not found. Install Node 20.19+ or set the machine-scoped changeproof.nodePath.':'Local engine failed or timed out. No clean result is available.'));
      try{const report=validateReport(parsed,folder);if(error?.code===2&&!report.analysis_errors.length)throw new Error('Engine exit/report mismatch.');resolve(report);}catch{reject(new Error('The local engine returned an invalid or incompatible report.'));}
    });
  });
}
module.exports={runEngine,validateReport};
