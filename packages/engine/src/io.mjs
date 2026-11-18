import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
export const MAX_FILE = 1024 * 1024;
const dirs = new Set(['.git','node_modules','vendor','bower_components','.venv','venv','__pycache__','dist','build','out','coverage','.next','.nuxt','.cache','target']);
export const DEFAULT_EXCLUSIONS = [...dirs, '.env*', '*.pem', '*.key', '*.p12', '*.pfx', '.npmrc', '.netrc', 'credentials*', 'secrets*', 'id_rsa*', 'id_ed25519*'];
export function exclusion(file) {
  const parts = file.split('/');
  if (parts.some(p => dirs.has(p))) return 'excluded_directory';
  if (parts.some(p => /^\.env|\.(pem|key|p12|pfx)$/i.test(p) || /^(credentials|secrets|id_rsa|id_ed25519)/i.test(p) || ['.npmrc','.netrc'].includes(p))) return 'excluded_secret_file';
  return null;
}
export function git(root, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  Object.assign(env, {GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:os.devNull, GIT_TERMINAL_PROMPT:'0', GIT_NO_LAZY_FETCH:'1', GIT_OPTIONAL_LOCKS:'0', GIT_PAGER:'cat'});
  return execFileSync('git', ['--no-replace-objects','--no-lazy-fetch','--no-optional-locks','-c','core.fsmonitor=false','-c',`core.hooksPath=${os.devNull}`,'-c','core.untrackedCache=false', '-C',root,...args], {env, timeout:15000, maxBuffer:16*1024*1024, stdio:['ignore','pipe','pipe']});
}
export function safeRead(root, file) {
  if (file.split('/').some(p => p === '..' || p === '.' || !p) || path.isAbsolute(file)) throw new Error('unsafe_path');
  let current = root;
  for (const part of file.split('/')) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch(e) { if(e.code === 'ENOENT') return null; throw e; }
    if (stat.isSymbolicLink()) throw new Error('symlink');
  }
  const fd = fs.openSync(current, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error('not_regular_file');
    if (stat.size > MAX_FILE) throw new Error('file_too_large');
    // Bound the read even if a file grows concurrently.
    const signature=stat=>[stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs,stat.mode].join(':');
    const before=signature(fs.fstatSync(fd,{bigint:true}));
    const buffer = Buffer.alloc(MAX_FILE + 1);
    const count = fs.readSync(fd, buffer, 0, buffer.length, 0);
    if (count > MAX_FILE) throw new Error('file_too_large');
    if(before!==signature(fs.fstatSync(fd,{bigint:true})))throw new Error('file_changed_during_read');
    const result=buffer.subarray(0,count);Object.defineProperty(result,'snapshot',{value:before});return result;
  } finally { fs.closeSync(fd); }
}
export function text(buffer) {
  if (buffer.includes(0)) throw new Error('binary');
  try { return new TextDecoder('utf-8', {fatal:true}).decode(buffer); } catch { throw new Error('non_utf8'); }
}

export const eligible = file => /\.(?:[cm]?[jt]s|[jt]sx)$/i.test(file);
