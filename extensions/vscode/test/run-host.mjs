import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const [code,vsix]=process.argv.slice(2);
if(!code){console.error('Usage: node extensions/vscode/test/run-host.mjs /absolute/path/to/code [local.vsix]');process.exit(2);}
const temp=fs.mkdtempSync(path.join(process.platform==='darwin'?'/tmp':os.tmpdir(),'cp-vsc-'));
const workspace=path.join(temp,'fixture');fs.mkdirSync(workspace);
const git=(...args)=>execFileSync('git',['-c','core.fsmonitor=false','-c','core.hooksPath='+os.devNull,'-C',workspace,...args],{stdio:'ignore'});
git('init','-q');git('config','user.name','Synthetic');git('config','user.email','fixture@example.invalid');
const baseline='function review(req) {\n const raw = "public";\n const payload = raw;\n console.log(payload);\n}\n';
fs.writeFileSync(path.join(workspace,'app.ts'),baseline);git('add','.');git('-c','commit.gpgSign=false','commit','-qm','fixture baseline');
fs.writeFileSync(path.join(workspace,'app.ts'),baseline.replace('"public"','req.headers.authorization'));
const userData=path.join(temp,'user-data'),extensions=path.join(temp,'extensions');
fs.mkdirSync(path.join(userData,'User'),{recursive:true});fs.mkdirSync(extensions);
fs.writeFileSync(path.join(userData,'User/settings.json'),JSON.stringify({'telemetry.telemetryLevel':'off','update.mode':'none','extensions.autoCheckUpdates':false,'extensions.autoUpdate':false,'workbench.enableExperiments':false,'workbench.startupEditor':'none','security.workspace.trust.enabled':false}));
const extension=fileURLToPath(new URL('../',import.meta.url));
const resultPath=path.join(temp,'host-result.json');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('VSCODE_')&&!key.startsWith('ELECTRON_')&&!['NODE_OPTIONS','NODE_PATH'].includes(key)));
let developmentPath=extension;
if(vsix){
  const artifact=path.resolve(vsix);
  execFileSync(code,['--user-data-dir',userData,'--extensions-dir',extensions,'--install-extension',artifact,'--force','--do-not-sync'],{env,stdio:'inherit',timeout:60000});
  const listed=execFileSync(code,['--user-data-dir',userData,'--extensions-dir',extensions,'--list-extensions','--show-versions'],{env,encoding:'utf8',timeout:30000});
  if(!listed.includes('changeproof-local.changeproof-local@'+JSON.parse(fs.readFileSync(path.join(extension,'package.json'))).version))throw new Error('Packaged extension missing from clean profile.');
  // Only a separate test driver is a development extension. The target must load from the VSIX installation.
  developmentPath=path.join(temp,'driver');fs.mkdirSync(developmentPath);
  fs.writeFileSync(path.join(developmentPath,'package.json'),JSON.stringify({name:'changeproof-test-driver',publisher:'changeproof-tests',version:'0.0.1',engines:{vscode:'^1.85.0'},main:'main.cjs'}));
  fs.writeFileSync(path.join(developmentPath,'main.cjs'),'exports.activate = () => {};');
  env.CHANGEPROOF_EXPECT_INSTALLED=extensions;
  env.CHANGEPROOF_VSIX_SHA256=crypto.createHash('sha256').update(fs.readFileSync(artifact)).digest('hex');
}
const args=['--disable-extension=vscode.git','--wait','--new-window','--skip-welcome','--skip-release-notes','--disable-workspace-trust','--user-data-dir',userData,'--extensions-dir',extensions,`--extensionDevelopmentPath=${developmentPath}`,`--extensionTestsPath=${path.join(extension,'test/host.cjs')}`,workspace];
if(!vsix)args.unshift('--disable-extensions');
const child=spawn(code,args,{env:{...env,CHANGEPROOF_TEST_PROFILE:userData,CHANGEPROOF_TEST_NODE:process.execPath,CHANGEPROOF_HOST_RESULT:resultPath,CHANGEPROOF_TEST_BASELINE:baseline},stdio:'inherit'});
const timer=setTimeout(()=>{child.kill();},90000);
child.on('error',()=>{clearTimeout(timer);console.error('Could not launch VS Code.');process.exitCode=1;});
child.on('exit',code=>{
 clearTimeout(timer);let passed=false;
 try{const result=JSON.parse(fs.readFileSync(resultPath,'utf8'));passed=true;console.log('Verified VS Code '+(vsix?'packaged-install':'development-host')+' checks:',JSON.stringify(result));
 const root=fileURLToPath(new URL('../../../',import.meta.url));fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});fs.writeFileSync(path.join(root,`artifacts/${vsix?'packaged-install':'development-host'}-verification-0.8.0.json`),JSON.stringify(result,null,2)+'\n');
 }catch{console.error('VS Code host did not produce a passing test record.');}
 if(passed)fs.rmSync(temp,{recursive:true,force:true});else console.error('Failure logs retained at '+temp);
 process.exitCode=code===0&&passed?0:1;
});
