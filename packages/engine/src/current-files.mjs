import fs from 'node:fs';
import path from 'node:path';
import ignore from 'ignore';
import {git,exclusion,safeRead,text,eligible} from './io.mjs';
const MAX_FILES=2000, MAX_ENTRIES=100000;
export function currentInputs(root,{accept=eligible,maxFiles=MAX_FILES}={}) {
  const result={files:[],untracked:[],skipped:[],errors:[],limitations:[],gitRoot:null};
  const skip=(file,reason)=>result.skipped.push({file,reason});
  const error=(file,code)=>result.errors.push({code,file,message:'Current-files enumeration could not be completed within its safety boundaries.'});
  let entries=0,limited=false;
  function admit(file) {
    if(++entries>MAX_ENTRIES || result.files.length>=maxFiles){if(!limited){error(null,'project_file_limit');limited=true;}return;}
    const excluded=exclusion(file);if(excluded){skip(file,excluded);return;}
    const absolute=path.join(root,file);
    let stat;try{stat=fs.lstatSync(absolute);}catch(e){if(e.code==='ENOENT'){skip(file,'missing_current_file');return;}skip(file,'read_failed');error(file,'read_failed');return;}
    if(stat.isSymbolicLink()){skip(file,'symlink');return;}
    if(stat.isDirectory()){skip(file,'nested_repository');return;}
    if(stat.isFile()&&accept(file))result.files.push(file);
  }
  // Git is optional here; neither HEAD nor a commit is required for ls-files.
  try{result.gitRoot=fs.realpathSync(git(root,['rev-parse','--show-toplevel']).toString().replace(/\n$/,''));}catch{}
  if(result.gitRoot){
    try{
      const prefix=path.relative(result.gitRoot,root).split(path.sep).join('/');
      const relative=file=>!prefix?file:file.startsWith(prefix+'/')?file.slice(prefix.length+1):null;
      const tracked=git(result.gitRoot,['ls-files','--cached','-z']).toString().split('\0').filter(Boolean).map(relative).filter(Boolean);
      const untracked=git(result.gitRoot,['ls-files','--others','--exclude-standard','-z']).toString().split('\0').filter(Boolean).map(relative).filter(Boolean);
      result.untracked=untracked.map(file=>({file,excluded:!!exclusion(file),reason:exclusion(file)||'included_current_files',review_status:'not_analyzed'}));
      for(const file of [...new Set([...tracked,...untracked])].sort()){if(limited)break;admit(file);}
    }catch{error(null,'git_enumeration_failed');}
    return result;
  }
  result.limitations.push('No usable Git worktree detected. Eligible saved files are reviewed with nested .gitignore rules; Git tracking status and .git/info/exclude are unavailable.');
  function ignored(file,isDirectory,rules){let ignored=false;for(const {base,matcher} of rules){const local=base?file.slice(base.length+1):file;const match=matcher.test(local+(isDirectory?'/':''));if(match.ignored)ignored=true;else if(match.unignored)ignored=false;}return ignored;}
  function walk(directory,rules=[]){
    if(limited)return;
    const relDir=path.relative(root,directory).split(path.sep).join('/');
    if(relDir&&fs.existsSync(path.join(directory,'.git'))){skip(relDir,'nested_repository');return;}
    const ignoreFile=relDir?relDir+'/.gitignore':'.gitignore';
    if(fs.existsSync(path.join(directory,'.gitignore'))){
      try{const bytes=safeRead(root,ignoreFile);const patterns=text(bytes).split('\n');if(patterns.length>4096)throw new Error();rules=[...rules,{base:relDir,matcher:ignore().add(patterns)}];}
      catch{skip(ignoreFile,'ignore_rules_unreadable');error(ignoreFile,'ignore_rules_unreadable');return;}
    }
    let children;try{children=fs.readdirSync(directory,{withFileTypes:true});}catch{error(relDir||null,'directory_unreadable');return;}
    for(const child of children.sort((a,b)=>a.name.localeCompare(b.name))){
      if(limited)break;
      const file=relDir?relDir+'/'+child.name:child.name;
      if(++entries>MAX_ENTRIES){error(null,'project_entry_limit');limited=true;break;}
      const excluded=exclusion(file);if(excluded){skip(file,excluded);continue;}
      if(child.isSymbolicLink()){skip(file,'symlink');continue;}
      if(ignored(file,child.isDirectory(),rules)){skip(file,'gitignored');continue;}
      if(child.isDirectory())walk(path.join(directory,child.name),rules);
      else if(child.isFile()&&accept(file))admit(file);
    }
  }
  walk(root);return result;
}
