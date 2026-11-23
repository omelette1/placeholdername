import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {imageReferences,normalizeTrivy,emptyContainerImages,scanContainerImages} from '../src/container-vulns.mjs';

test('source extraction identifies tagged Docker and YAML image references, but not templated or mutable ones',()=>{
  assert.deepEqual(imageReferences('Dockerfile','FROM --platform=linux/amd64 nginx:1.27 AS builder\nFROM builder\nFROM scratch\nFROM ubuntu\n').map(x=>x.image),['nginx:1.27',null,null]);
  const refs=imageReferences('deployment.yaml',"image: nginx:1.27\nimage: '{{ .Values.image }}'\n# image: secret:1\nimage: redis@sha256:"+'a'.repeat(64));
  assert.equal(refs.length,3);
  assert.equal(refs[0].image,'nginx:1.27');
  assert.equal(refs[1].image,null);
  assert.ok(refs[2].image.startsWith('redis@sha256:'));
});
test('normalizeTrivy emits only high and critical CVEs without treating evidence as deployed exploit proof',()=>{
 const out=emptyContainerImages();
 const reference={file:'Dockerfile',line:2,image:'nginx:1.27'};
 const results={SchemaVersion:2,Results:[{Target:'nginx:1.27',Vulnerabilities:[
  {VulnerabilityID:'CVE-2026-123633',Severity:'CRITICAL',PkgName:'nginx',InstalledVersion:'1.27.0',FixedVersion:'1.27.1'},
  {VulnerabilityID:'CVE-2026-45678',Severity:'LOW',PkgName:'libx',InstalledVersion:'0.1'}]}]};
 assert.equal(normalizeTrivy(results,reference,out),1);
 assert.equal(out.findings.length,1);
 assert.equal(out.findings[0].location.file,'Dockerfile');
 assert.equal(out.findings[0].location.start.line,2);
 assert.equal(out.findings[0].runtime_verification,false);
 assert.equal(out.findings[0].newly_introduced,null);
 assert.equal(out.findings[0].evidence.scanner,'Trivy');
 assert.doesNotMatch(JSON.stringify(out),/confirmed exploit/i);
});
test('malformed Trivy reports are rejected instead of silently treated as clean',()=>{
 const ref={file:'Dockerfile',line:1,image:'nginx:1.27'};
 for(const bad of [{SchemaVersion:2,Results:[]},{SchemaVersion:2,Results:[{Vulnerabilities:[{VulnerabilityID:'fake',Severity:'HIGH'}]}]},{}]){
  assert.throws(()=>normalizeTrivy(bad,ref,emptyContainerImages()));
 }
});
test('opt-in local scans produce navigable CVEs and preserve explicit incomplete state',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'patch-image-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'Dockerfile'),'FROM nginx:1.27\n');
 fs.writeFileSync(path.join(dir,'pod.yaml'),'spec:\n  containers:\n    - image: redis:7.0\n');
 const calls=[];
 const report=await scanContainerImages(dir,{enabled:true,trivyPath:process.execPath,runImage:async(_exe,image)=>{
  calls.push(image);
  if(image==='redis:7.0')throw new Error('unavailable');
  return {SchemaVersion:2,Results:[{Target:image,Vulnerabilities:[{VulnerabilityID:'CVE-2026-123633',Severity:'CRITICAL',PkgName:'nginx',InstalledVersion:'1.27.0'}]}]};
 }});
 assert.deepEqual(calls,['nginx:1.27','redis:7.0']);
 assert.equal(report.status,'partial');
 assert.equal(report.images.length,2);
 assert.equal(report.files_inspected.length,2);
 assert.equal(report.findings.length,1);
 assert.equal(report.findings[0].evidence.image,'nginx:1.27');
 assert.equal(report.images[1].status,'not_assessed');
 assert.ok(report.errors.some(e=>e.code==='image_scan_failed'));
});
test('image scanning remains disabled by default and does not scan in changes mode',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'patch-image-off-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'Dockerfile'),'FROM nginx:1.27\n');
 const unused=()=>{throw Error('must not invoke');};
 assert.equal((await scanContainerImages(dir,{runImage:unused})).status,'not_assessed');
 assert.equal((await scanContainerImages(dir,{mode:'changes',enabled:true,runImage:unused})).status,'not_assessed');
});
