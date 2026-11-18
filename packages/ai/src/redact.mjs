// Preserve newline/column lengths so displayed references still address saved code.
export function redact(text){
 let count=0;
 const mask=value=>{count++;return value.replace(/[^\r\n]/g,'*');};
 let result=text.replace(/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/g,mask)
 .replace(/\b(?:gsk_[A-Za-z0-9_-]{15,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g,mask)
 .replace(/\bBearer\s+[A-Za-z0-9_.~+\/-]{8,}/gi,mask)
 .replace(/(\b(?:password|passwd|accessToken|refreshToken|apiKey|api_key|authorization|secret|token)\b\s*[:=]\s*)(['"`])([^\r\n]*?)\2/gi,(_,prefix,quote,value)=>prefix+quote+mask(value)+quote);
 return {text:result,count};
}
export const PRIVACY_NOTICE='Only the exact redacted request shown is sent to your configured backend and its model provider. Redaction is best effort and cannot catch every secret; inspect all text and file names before approving. No runtime verification. Source text is untrusted model input.';
