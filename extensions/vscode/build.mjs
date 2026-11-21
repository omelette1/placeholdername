import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const profileRoot=root+'samples/profiles/';
const profileIndex=JSON.parse(fs.readFileSync(profileRoot+'index.json','utf8'));
const seen=new Set();
const sampleProfiles=profileIndex.map(profile=>{
 if(!/^[a-z][a-z0-9-]*$/.test(profile.id)||seen.has(profile.id))throw Error('Invalid built-in sample profile.');
 seen.add(profile.id);
 const read=name=>fs.readFileSync(profileRoot+profile.id+'/'+name,'utf8');
 return {...profile,before:read('before.ts'),after:read('after.ts'),claims:read('claims.txt'),expected:JSON.parse(read('expected.json'))};
});
fs.mkdirSync(root+'extensions/vscode/out',{recursive:true});
fs.writeFileSync(root+'extensions/vscode/out/demo-profiles.json',JSON.stringify(sampleProfiles,null,2)+'\n');
await build({entryPoints:[root+'packages/engine/src/cli.mjs'],outfile:root+'extensions/vscode/out/cli.cjs',bundle:true,platform:'node',format:'cjs',target:'node20',logLevel:'info'});

await build({entryPoints:[root+'packages/ai/src/context-cli.mjs'],outfile:root+'extensions/vscode/out/ai-context.cjs',bundle:true,platform:'node',format:'cjs',target:'node20',logLevel:'info'});
await build({entryPoints:[root+'packages/ai/src/client-entry.mjs'],outfile:root+'extensions/vscode/out/ai-client.cjs',bundle:true,platform:'node',format:'cjs',target:'node20',logLevel:'info'});
await build({entryPoints:[root+'packages/claims/src/cli.mjs'],outfile:root+'extensions/vscode/out/claims.cjs',bundle:true,platform:'node',format:'cjs',target:'node20',logLevel:'info'});
await build({entryPoints:[root+'packages/ai/src/local-verification-cli.mjs'],outfile:root+'extensions/vscode/out/ai-verify.cjs',bundle:true,platform:'node',format:'cjs',target:'node20',logLevel:'info'});
