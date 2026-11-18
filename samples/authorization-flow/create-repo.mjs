import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
// This authors only a new synthetic fixture, never an existing project.
const root=fs.mkdtempSync(path.join(os.tmpdir(),'changeproof-authorization-sample-'));
const git=(...args)=>execFileSync('git',['-c','core.fsmonitor=false','-c','core.hooksPath='+os.devNull,'-C',root,...args],{stdio:'ignore'});
git('init','-q');git('config','user.name','Changeproof synthetic sample');git('config','user.email','sample@example.invalid');
fs.copyFileSync(new URL('./baseline.ts',import.meta.url),path.join(root,'app.ts'));git('add','app.ts');git('-c','commit.gpgSign=false','commit','-qm','synthetic safe baseline');
fs.copyFileSync(new URL('./changed.ts',import.meta.url),path.join(root,'app.ts'));
console.log(root);
