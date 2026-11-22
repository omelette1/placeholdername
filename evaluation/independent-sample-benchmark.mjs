import {inspectDetailed} from '../packages/engine/src/rule.mjs';
import {lineRanges} from '../packages/engine/src/engine.mjs';

// External labels below are published advisory classifications. The JS snippets
// are MINIMAL ADAPTATIONS of documented patterns, NOT extracted project snapshots.
// We do not treat this set as independently adjudicated real-world accuracy.
const external=[
 {id:'AUTH-CLERK-COMBINED',category:'authorization',label:'vulnerable',source:'https://github.com/advisories/GHSA-w24r-5266-9c3c',provenance:'published_advisory_adaptation',code:"async function gate(auth){await auth.protect({permission:'org:settings:delete',reverification:'strict'});}"},
 {id:'AUTH-CLERK-SEPARATE',category:'authorization',label:'safe_in_documented_context',source:'https://github.com/advisories/GHSA-w24r-5266-9c3c',provenance:'published_advisory_adaptation',code:"async function gate(auth){await auth.protect({reverification:'strict'});await auth.protect({permission:'org:settings:delete'});}"},
 {id:'AUTH-APOSTROPHE',category:'authorization',label:'vulnerable',source:'https://github.com/advisories/GHSA-6h5j-32cf-4253',provenance:'published_advisory_adaptation',code:"function publicApiCheck(req,self){if(!self.options.publicApiProjection){if(!self.canAccessApi(req)){throw Error('notfound');}}}"},
];
const authored=[
 {id:'LOG-HEADER',category:'logging',label:'vulnerable_pattern',code:'function route(req){console.log(req.headers.authorization);}'},
 {id:'LOG-SAFE-REDACTION',category:'logging',label:'safe_control',code:'function route(req){console.log("[REDACTED]");}'},
 {id:'LOG-UNRELATED',category:'logging',label:'safe_control',code:'function route(req){console.log(req.headers["x-request-id"]);}'},
 {id:'SECRET-LITERAL',category:'secret_handling',label:'vulnerable_pattern',code:'const clientSecret = "unique-research-fixture-credential-2026";'},
 {id:'SECRET-ENV',category:'secret_handling',label:'safe_control',code:'const clientSecret = process.env.CLIENT_SECRET;'},
 {id:'SECRET-PLACEHOLDER',category:'secret_handling',label:'safe_control',code:'const clientSecret = "placeholder";'},
 {id:'COMMAND-DYNAMIC',category:'command_execution',label:'vulnerable_pattern',code:'import {exec} from "node:child_process";exec(userInput);'},
 {id:'COMMAND-LITERAL',category:'command_execution',label:'safe_control',code:'import {exec} from "node:child_process";exec("echo ok");'},
];
export function benchmarkIndependentSamples(){
 const all=[...external,...authored];
 const rows=all.map(item=>{
  const result=inspectDetailed('reference.ts','',item.code,lineRanges('',item.code));
  const rules=[...new Set(result.findings.map(f=>f.rule_id))];
  const expectedRule=item.id==='LOG-HEADER'?'CP002':item.id==='SECRET-LITERAL'?'CP005':item.id==='COMMAND-DYNAMIC'?'CP006':null;
  return {id:item.id,category:item.category,label:item.label,provenance:item.provenance||'authored_control',source:item.source||null,findings:rules,
    expected_supported_rule:expectedRule,expected_supported_rule_matched:expectedRule?rules.includes(expectedRule):null,
    outcome:expectedRule?(rules.includes(expectedRule)?'matched_supported_pattern':'missed_supported_pattern'):rules.length?'potential_warning_needs_review':'no_supported_rule_match'};
 });
 const checked=rows.filter(r=>r.expected_supported_rule!==null);
 return {kind:'mixed_provenance_scenario_benchmark',real_world_accuracy_established:false,
  external_advisory_adaptations:external.length,independently_adjudicated_project_snapshots:0,authored_examples:authored.length,
  supported_rule_checks:checked.length,supported_rule_matches:checked.filter(r=>r.expected_supported_rule_matched).length,rows,
  limitations:['Published advisories independently document underlying vulnerabilities; these snippets are authored adaptations, not actual pinned project versions.',
   'Safe controls are narrowly safe only for the documented pattern; no application-wide safety conclusion follows.',
   'Authorization advisory adaptations are intentionally beyond the supported local rules and are NOT scored as true negatives.',
   'Do not calculate or advertise real-world recall/precision/false-positive rate from this benchmark.',
   'Independent real-world accuracy requires pinned vulnerable and fixed source snapshots, expert adjudication and a held-out evaluation corpus.']};
}
if(import.meta.url===new URL('file://'+process.argv[1]).href){
 const result=benchmarkIndependentSamples();console.log(JSON.stringify(result,null,2));
 if(result.supported_rule_matches!==result.supported_rule_checks)process.exitCode=2;
}
