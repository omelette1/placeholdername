// Independent from deterministic engine schema 5.0.0.
export const AI_VERSION='1.2.0';
export const LIMITS=Object.freeze({requestBytes:160000,outputBytes:48000,files:8,chunks:32,chunkLines:120,contextBytes:100000,findings:12,timeoutMs:45000});
const str=(max=2000)=>({type:'string',maxLength:max});
const array=(items,max=12)=>({type:'array',items,maxItems:max});
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const referenceSchema=object({file:str(400),revision:{enum:['before','after']},revision_id:str(100),start_line:{type:'integer',minimum:1},end_line:{type:'integer',minimum:1}});
const editSchema=object({file:str(400),revision_id:str(100),start_line:{type:'integer',minimum:1},end_line:{type:'integer',minimum:1},expected:str(6000),replacement:str(6000)});
const quoteSchema=object({file:str(400),revision:{enum:['before','after']},revision_id:str(100),start_line:{type:'integer',minimum:1},end_line:{type:'integer',minimum:1},quote:str(1000)});
export const assessmentSchema=object({status:{enum:['assessed','insufficient_context']},summary:str(),findings:array(object({category:{enum:['sensitive_data_exposure','weakened_access_check']},title:str(200),explanation:str(),potential_impact:str(),reasoning:str(),assumptions:array(str(600)),missing_context:array(str(600)),suggested_verification:array(str(600)),suggested_correction:str(),suggested_edits:array(editSchema,4),references:{...array(referenceSchema,12),minItems:1},evidence_quotes:{...array(quoteSchema,2),minItems:1}}),LIMITS.findings),limitations:array(str(600),30),context_requests:array(str(600))});
export const requestSchema=object({schema_version:{const:AI_VERSION},request_id:{type:'string',pattern:'^[a-f0-9]{32}$'},baseline:{type:'string',pattern:'^[a-f0-9]{40,64}$'},files:{type:'array',maxItems:LIMITS.files,minItems:1,items:object({file:str(400),before_id:str(100),after_id:str(100),chunks:{type:'array',maxItems:LIMITS.chunks,minItems:1,items:object({revision:{enum:['before','after']},revision_id:str(100),start_line:{type:'integer',minimum:1},end_line:{type:'integer',minimum:1},text:str(24000)})}})},omissions:array(str(600),100),privacy_notice:str(1000)});
export const responseSchema=object({schema_version:{const:AI_VERSION},request_id:str(32),baseline:str(64),provider:{enum:['groq','mock']},model:str(200),runtime_verification:{const:false},assessment:assessmentSchema});
export function validFile(file){return typeof file==='string'&&file.length<=400&&!file.includes('\\')&&!file.startsWith('/')&&!file.includes('\0')&&!file.split('/').some(p=>!p||p==='.'||p==='..'||p==='.git')&&!/^[A-Za-z]:/.test(file);}
export function validateContext(request){
 const files=new Set();let bytes=0,chunks=0;
 for(const f of request.files){
  if(!validFile(f.file)||files.has(f.file)||!/^([a-f0-9]{40,64}|absent)$/.test(f.before_id)||!/^sha256:[a-f0-9]{64}$/.test(f.after_id))throw new Error('invalid_context');files.add(f.file);
  for(const c of f.chunks){
   const lines=c.text.split('\n').length;
   if(c.end_line<c.start_line||c.end_line-c.start_line+1!==lines||lines>LIMITS.chunkLines||c.revision_id!==(c.revision==='before'?f.before_id:f.after_id))throw new Error('invalid_context');
   bytes+=Buffer.byteLength(c.text);chunks++;
  }
 }
 if(bytes>LIMITS.contextBytes||chunks>LIMITS.chunks)throw new Error('context_limit');
}
export function validateReferences(assessment,request){
 for(const finding of assessment.findings){
  const revisions=new Set();
  for(const r of finding.references){
   const f=request.files.find(f=>f.file===r.file);
   if(!f||!validFile(r.file)||r.end_line<r.start_line||r.revision_id!==(r.revision==='before'?f.before_id:f.after_id)||!f.chunks.some(c=>c.revision===r.revision&&c.revision_id===r.revision_id&&r.start_line>=c.start_line&&r.end_line<=c.end_line))throw new Error('invalid_reference');
   revisions.add(r.revision);
  }
  // A behavioral regression needs evidence in both versions. Otherwise request context.
  if(!revisions.has('before')||!revisions.has('after'))throw new Error('missing_comparison_references');
  const edits=finding.suggested_edits,ordered=[...edits].sort((a,b)=>a.file.localeCompare(b.file)||a.start_line-b.start_line);
  if(ordered.length&&ordered.some(edit=>edit.file!==ordered[0].file))throw new Error('invalid_patch');
  for(let i=0;i<ordered.length;i++){
   const edit=ordered[i],file=request.files.find(f=>f.file===edit.file);
   if(!file||!validFile(edit.file)||edit.revision_id!==file.after_id||edit.end_line<edit.start_line||edit.expected.split('\n').length!==edit.end_line-edit.start_line+1||(!edit.expected&&!edit.replacement)||edit.expected===edit.replacement||/\r/.test(edit.expected+edit.replacement))throw new Error('invalid_patch');
   const chunk=file.chunks.find(c=>c.revision==='after'&&c.revision_id===edit.revision_id&&edit.start_line>=c.start_line&&edit.end_line<=c.end_line);
   if(!chunk||!finding.references.some(r=>r.revision==='after'&&r.file===edit.file&&r.start_line<=edit.start_line&&r.end_line>=edit.end_line))throw new Error('invalid_patch');
   const actual=chunk.text.split('\n').slice(edit.start_line-chunk.start_line,edit.end_line-chunk.start_line+1).map(line=>line.replace(/\r$/,'')).join('\n');
   if(actual!==edit.expected)throw new Error('invalid_patch');
   const previous=ordered[i-1];
   if(previous&&previous.file===edit.file&&previous.end_line>=edit.start_line)throw new Error('invalid_patch');
  }
  const quoteRevisions=new Set();
  for(const quote of finding.evidence_quotes){
   const file=request.files.find(f=>f.file===quote.file),revisionId=quote.revision==='before'?file?.before_id:file?.after_id;
   if(!file||!validFile(quote.file)||quote.revision_id!==revisionId||quote.end_line<quote.start_line||quote.quote.split('\n').length!==quote.end_line-quote.start_line+1||!finding.references.some(r=>r.file===quote.file&&r.revision===quote.revision&&r.revision_id===quote.revision_id&&r.start_line<=quote.start_line&&r.end_line>=quote.end_line))throw new Error('invalid_evidence_quote');
   const chunk=file.chunks.find(c=>c.revision===quote.revision&&c.revision_id===quote.revision_id&&quote.start_line>=c.start_line&&quote.end_line<=c.end_line);
   if(!chunk)throw new Error('invalid_evidence_quote');
   const actual=chunk.text.split('\n').slice(quote.start_line-chunk.start_line,quote.end_line-chunk.start_line+1).map(line=>line.replace(/\r$/,'')).join('\n');
   if(!quote.quote.trim()||actual!==quote.quote)throw new Error('invalid_evidence_quote');
   quoteRevisions.add(quote.revision);
  }
  if(!quoteRevisions.has('after'))throw new Error('missing_current_quote');
  const hasBeforeText=finding.references.some(r=>r.revision==='before'&&request.files.find(f=>f.file===r.file)?.chunks.some(c=>c.revision==='before'&&c.revision_id===r.revision_id&&c.text.trim()));
  if(hasBeforeText&&!quoteRevisions.has('before'))throw new Error('missing_comparison_quote');
 }
}
