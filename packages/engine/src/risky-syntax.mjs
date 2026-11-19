import ts from 'typescript';
const unwrap=node=>{while(node&&(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isNonNullExpression(node)||ts.isTypeAssertionExpression(node)||ts.isSatisfiesExpression(node)))node=node.expression;return node;};
const prop=(node,key)=>ts.isPropertyAccessExpression(node)&&node.name.text===key||ts.isElementAccessExpression(node)&&ts.isStringLiteral(node.argumentExpression)&&node.argumentExpression.text===key;
function observations(file,text){
 const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);if(source.parseDiagnostics.length)throw new Error('parse');
 const host={getSourceFile:name=>name===file?source:undefined,getDefaultLibFileName:()=>'',writeFile(){},getCurrentDirectory:()=>'',getDirectories:()=>[],fileExists:name=>name===file,readFile:name=>name===file?text:undefined,getCanonicalFileName:name=>name,useCaseSensitiveFileNames:()=>true,getNewLine:()=> '\n'};
 const checker=ts.createProgram([file],{noResolve:true,noLib:true,allowJs:true},host).getTypeChecker(),found=[];
 const mutated=new Set();
 function writes(node){if(ts.isBinaryExpression(node)&&node.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&node.operatorToken.kind<=ts.SyntaxKind.LastAssignment){let target=unwrap(node.left);while(ts.isPropertyAccessExpression(target)||ts.isElementAccessExpression(target))target=unwrap(target.expression);if(ts.isIdentifier(target)&&!prop(unwrap(node.left),'NODE_TLS_REJECT_UNAUTHORIZED'))mutated.add(target.text);}ts.forEachChild(node,writes);}
 writes(source);
 const global=node=>ts.isIdentifier(node)&&!mutated.has(node.text)&&!checker.getSymbolAtLocation(node)?.declarations?.length;
 const loc=node=>{const a=source.getLineAndCharacterOfPosition(node.getStart(source)),b=source.getLineAndCharacterOfPosition(node.end);return {file,start:{line:a.line+1,column:a.character+1},end:{line:b.line+1,column:b.character+1}};};
 const add=(rule_id,pattern,node)=>found.push({rule_id,pattern,location:loc(node)});
 function httpsBinding(node){
  if(!ts.isIdentifier(node)||mutated.has(node.text))return false;
  const ds=checker.getSymbolAtLocation(node)?.declarations;if(ds?.length!==1)return false;
  const d=ds[0];
  if(ts.isNamespaceImport(d)||ts.isImportClause(d)){const imp=ts.isNamespaceImport(d)?d.parent.parent:d.parent;return ts.isImportDeclaration(imp)&&['https','node:https'].includes(imp.moduleSpecifier.text);}
  if(ts.isVariableDeclaration(d)&&d.initializer&&ts.isCallExpression(d.initializer)&&global(d.initializer.expression)&&d.initializer.expression.text==='require'&&d.initializer.arguments.length===1&&ts.isStringLiteral(d.initializer.arguments[0]))return ['https','node:https'].includes(d.initializer.arguments[0].text);
  return false;
 }
 function visit(node){
  if(ts.isCallExpression(node)&&ts.isIdentifier(unwrap(node.expression))&&global(unwrap(node.expression))&&unwrap(node.expression).text==='eval'&&!node.questionDotToken)add('CP004','direct_eval',node);
  if((ts.isCallExpression(node)||ts.isNewExpression(node))&&ts.isIdentifier(unwrap(node.expression))&&global(unwrap(node.expression))&&unwrap(node.expression).text==='Function')add('CP004','function_constructor',node);
  if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&ts.isStringLiteral(unwrap(node.right))&&unwrap(node.right).text==='0'){
   const left=unwrap(node.left);if(prop(left,'NODE_TLS_REJECT_UNAUTHORIZED')&&prop(left.expression,'env')&&global(left.expression.expression)&&left.expression.expression.text==='process')add('CP003','node_tls_environment_disabled',node);
  }
  if((ts.isCallExpression(node)||ts.isNewExpression(node))&&ts.isPropertyAccessExpression(node.expression)&&httpsBinding(node.expression.expression)&&['Agent','request','get'].includes(node.expression.name.text)){
   for(const arg of node.arguments||[]){const obj=unwrap(arg);if(!ts.isObjectLiteralExpression(obj))continue;
    // Spread/computed properties can replace options, so only fully explicit objects qualify.
    if(obj.properties.some(p=>!ts.isPropertyAssignment(p)||!ts.isIdentifier(p.name)&&!ts.isStringLiteral(p.name)))continue;
    const options=obj.properties.filter(p=>p.name.text==='rejectUnauthorized');const last=options.at(-1);
    if(last&&unwrap(last.initializer).kind===ts.SyntaxKind.FalseKeyword)add('CP003','https_certificate_verification_disabled',last);
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(source);return found;
}
export function inspectRiskySyntax(file,before,after,ranges){
 const old=observations(file,before),current=observations(file,after),available=new Map();
 const signature=f=>f.rule_id+':'+f.pattern;
 for(const f of old)available.set(signature(f),(available.get(signature(f))||0)+1);
 const touched=f=>ranges.some(r=>r.new_count>0&&f.location.start.line<=r.new_start+r.new_count-1&&f.location.end.line>=r.new_start);
 for(const f of current.filter(f=>!touched(f)))available.set(signature(f),Math.max(0,(available.get(signature(f))||0)-1));
 return current.filter(touched).flatMap(f=>{
  const count=available.get(signature(f))||0;if(count){available.set(signature(f),count-1);return [];}
  const tls=f.rule_id==='CP003';return [{rule_id:f.rule_id,title:tls?'TLS verification explicitly disabled':'Potential dynamic code execution',severity:'warning',location:f.location,newly_introduced:true,runtime_verification:false,explanation:tls?'Supported syntax explicitly disables TLS certificate verification. Confirm the intended environment and remove the bypass where peer authentication is required.':'A direct built-in eval or Function constructor appears in this code. Review the input and necessity; attacker-controlled input and exploitability have not been established.',evidence:{kind:'risky_syntax',pattern:f.pattern,source_values_included:false},limitations:['Syntax observation only; no target execution, input taint proof or confirmed exploit.','Only direct built-in dynamic evaluation and explicit Node HTTPS options/environment assignments are recognized. Aliases, computed options, reassigned imports and runtime configuration are not resolved.','HEAD matching compares pattern counts rather than semantic program behavior; current-files mode has no baseline.']}];
 });
}
