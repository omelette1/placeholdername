import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
await build({entryPoints:[root+'packages/engine/src/cli.mjs'],outfile:root+'extensions/vscode/out/cli.cjs',bundle:true,platform:'node',format:'cjs',target:'node20',logLevel:'info'});
