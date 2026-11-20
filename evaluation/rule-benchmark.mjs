import {fileURLToPath} from 'node:url';
import {inspectDetailed} from '../packages/engine/src/rule.mjs';
import {lineRanges} from '../packages/engine/src/engine.mjs';

const cases=[
  {id:'CP001-01',rule:'CP001',positive:true,code:'console.log(password);'},
  {id:'CP001-02',rule:'CP001',positive:true,code:'console.warn(user.authorization);'},
  {id:'CP001-03',rule:'CP001',positive:true,code:'console.error(accessToken);'},
  {id:'CP001-04',rule:'CP001',positive:false,code:'const password = 1;'},
  {id:'CP001-05',rule:'CP001',positive:false,code:'const sample = "console.log(password)";'},
  {id:'CP001-06',rule:'CP001',positive:false,code:'console.log(userName);'},
  {id:'CP002-01',rule:'CP002',positive:true,code:'function route(req){console.log(req.headers.authorization);}'},
  {id:'CP002-02',rule:'CP002',positive:true,code:'function route(req){const token=req.headers.authorization;console.warn(token);}'},
  {id:'CP002-03',rule:'CP002',positive:true,code:'function logHeader(value){console.log(value);} function route(req){logHeader(req.headers.authorization);}'},
  {id:'CP002-04',rule:'CP002',positive:false,code:'function route(req){console.log(req.headers["x-request-id"]);}'},
  {id:'CP002-05',rule:'CP002',positive:false,code:'function route(req){const token=req.headers.authorization;const safe=redact(token);console.log(safe);}'},
  {id:'CP002-06',rule:'CP002',positive:false,code:'const token=req.headers.authorization;console.log(token);'},
  {id:'CP003-01',rule:'CP003',positive:true,code:'process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";'},
  {id:'CP003-02',rule:'CP003',positive:true,code:'import https from "node:https"; https.request({rejectUnauthorized:false});'},
  {id:'CP003-03',rule:'CP003',positive:true,code:'const https = require("https"); new https.Agent({rejectUnauthorized:false});'},
  {id:'CP003-04',rule:'CP003',positive:false,code:'process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1";'},
  {id:'CP003-05',rule:'CP003',positive:false,code:'const options = {rejectUnauthorized:false};'},
  {id:'CP003-06',rule:'CP003',positive:false,code:'import https from "https"; https.request({rejectUnauthorized:true});'},
  {id:'CP004-01',rule:'CP004',positive:true,code:'eval(input);'},
  {id:'CP004-02',rule:'CP004',positive:true,code:'new Function(input);'},
  {id:'CP004-03',rule:'CP004',positive:true,code:'Function("return 1")();'},
  {id:'CP004-04',rule:'CP004',positive:false,code:'function route(eval){return eval(input);}'},
  {id:'CP004-05',rule:'CP004',positive:false,code:'const sample = "eval(input)";'},
  {id:'CP004-06',rule:'CP004',positive:false,code:'const result = 1 + 2;'},
];

const ratio=(n,d)=>d?Number((n/d).toFixed(4)):null;
export function benchmarkRules(){
  const rows=cases.map(item=>{
    const result=inspectDetailed('fixture.ts','',item.code,lineRanges('',item.code));
    const detected=result.findings.some(f=>f.rule_id===item.rule);
    return {id:item.id,rule:item.rule,expected:item.positive?'finding':'no_finding',actual:detected?'finding':'no_finding',passed:detected===item.positive};
  });
  const rules={};
  for(const rule of ['CP001','CP002','CP003','CP004']){
    const selected=cases.filter(item=>item.rule===rule),observed=rows.filter(item=>item.rule===rule);
    const tp=selected.filter(item=>item.positive&&observed.find(row=>row.id===item.id).actual==='finding').length;
    const fn=selected.filter(item=>item.positive&&observed.find(row=>row.id===item.id).actual==='no_finding').length;
    const fp=selected.filter(item=>!item.positive&&observed.find(row=>row.id===item.id).actual==='finding').length;
    const tn=selected.filter(item=>!item.positive&&observed.find(row=>row.id===item.id).actual==='no_finding').length;
    rules[rule]={true_positive:tp,false_negative:fn,false_positive:fp,true_negative:tn,cases:selected.length,accuracy:ratio(tp+tn,selected.length),precision:ratio(tp,tp+fp),recall:ratio(tp,tp+fn),specificity:ratio(tn,tn+fp)};
  }
  const tp=Object.values(rules).reduce((sum,r)=>sum+r.true_positive,0),tn=Object.values(rules).reduce((sum,r)=>sum+r.true_negative,0),fp=Object.values(rules).reduce((sum,r)=>sum+r.false_positive,0),fn=Object.values(rules).reduce((sum,r)=>sum+r.false_negative,0);
  return {benchmark_version:'1.0.0',kind:'controlled_synthetic_rule_fixture_scores',total_cases:rows.length,passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).length,aggregate:{true_positive:tp,false_negative:fn,false_positive:fp,true_negative:tn,cases:rows.length,accuracy:ratio(tp+tn,rows.length),precision:ratio(tp,tp+fp),recall:ratio(tp,tp+fn),specificity:ratio(tn,tn+fp)},rules,cases:rows,real_world_accuracy_measured:false,limitations:['These are 24 authored, narrow synthetic syntax examples, not independent human adjudication or representative code.','Scores measure the current deterministic rules only; they do not measure the LLM, end-to-end finding accuracy, or patch correctness.','A passing benchmark is a regression signal, not proof of security or absence of false positives in real projects.']};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const report=benchmarkRules();
  console.log(JSON.stringify(report,null,2));
  if(report.failed)process.exitCode=2;
}
