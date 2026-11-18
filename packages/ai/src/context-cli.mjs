import {collectContext} from './context.mjs';
try{if(process.argv.length!==3)throw new Error('Expected one local project path.');console.log(JSON.stringify(collectContext(process.argv[2])));}catch(error){console.log(JSON.stringify({error:error.message}));process.exitCode=2;}
