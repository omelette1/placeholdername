import {build} from 'esbuild';
await build({entryPoints:[new URL('../services/review-api/src/start.mjs',import.meta.url).pathname],outfile:new URL('../services/review-api/dist/server.mjs',import.meta.url).pathname,bundle:true,packages:'external',platform:'node',format:'esm',target:'node22',logLevel:'info'});
