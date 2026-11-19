// All production outbound paths use fetch. Fail accidental external inference in ordinary npm test.
const original=globalThis.fetch;
globalThis.fetch=(input,...args)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('External fetch is forbidden in npm test; use explicit synthetic --live evaluation outside tests.');
 return original(input,...args);
};
