import ts from 'typescript';

// Bounded syntax observations: no taint/reachability proof and no literal values
// leave this module. Only supported bindings are recognized.
const credentialNames=new Set(['apikey','api_key','secretkey','secret_key','clientsecret','client_secret','password','passwd','accesstoken','access_token','refreshtoken','refresh_token','privatetoken','private_token']);
const commandModules=new Set(['child_process','node:child_process']);
const commands=new Set(['exec','execSync']);
const unwrap=value=>{while(value&&(ts.isParenthesizedExpression(value)||ts.isAsExpression(value)||ts.isSatisfiesExpression(value)||ts.isNonNullExpression(value)))value=value.expression;return value;};
const nameOf=value=>ts.isIdentifier(value)?value.text:ts.isStringLiteral(value)?value.text:null;
function observe(file,code){
 const source=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true);
 if(source.parseDiagnostics.length)throw Error('parse');
 const found=[],moduleNames=new Set(),functions=new Set();
 const isRequire=node=>ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='require'&&node.arguments.length===1&&ts.isStringLiteral(node.arguments[0])&&commandModules.has(node.arguments[0].text);
 // Track only direct imports and immutable require bindings; never infer aliases
 // across arbitrary project code.
 for(const statement of source.statements){
  if(ts.isImportDeclaration(statement)&&commandModules.has(statement.moduleSpecifier.text)){
   const clause=statement.importClause;
   if(clause?.name)moduleNames.add(clause.name.text);
   if(clause?.namedBindings){
    if(ts.isNamespaceImport(clause.namedBindings))moduleNames.add(clause.namedBindings.name.text);
    else for(const spec of clause.namedBindings.elements)if(commands.has(spec.propertyName?.text||spec.name.text))functions.add(spec.name.text);
   }
  }
  if(ts.isVariableStatement(statement)&&(statement.declarationList.flags&ts.NodeFlags.Const)){
   for(const d of statement.declarationList.declarations){
    if(!d.initializer||!isRequire(unwrap(d.initializer)))continue;
    if(ts.isIdentifier(d.name))moduleNames.add(d.name.text);
    if(ts.isObjectBindingPattern(d.name))for(const part of d.name.elements){if(commands.has(part.propertyName?.text||nameOf(part.name))&&ts.isIdentifier(part.name))functions.add(part.name.text);}
   }
  }
 }
 const location=node=>{const a=source.getLineAndCharacterOfPosition(node.getStart(source)),b=source.getLineAndCharacterOfPosition(node.end);return {file,start:{line:a.line+1,column:a.character+1},end:{line:b.line+1,column:b.character+1}};};
 const add=(rule_id,pattern,node)=>found.push({rule_id,pattern,location:location(node)});
 const literal=node=>{node=unwrap(node);return node&&ts.isStringLiteralLike(node)?node.text:null;};
 const isCred=name=>typeof name==='string'&&credentialNames.has(name.toLowerCase());
 const isStrong=value=>typeof value==='string'&&value.length>=12&&!/^(?:example|placeholder|redacted|changeme|your_|xxxx|dummy|test)/i.test(value)&&!/^(\w)\1{11,}$/.test(value);
 function visit(node){
  if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&isCred(node.name.text)&&isStrong(literal(node.initializer)))add('CP005','credential_literal',node);
  if(ts.isPropertyAssignment(node)&&isCred(nameOf(node.name))&&isStrong(literal(node.initializer)))add('CP005','credential_property_literal',node);
  if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&isCred(ts.isIdentifier(node.left)?node.left.text:ts.isPropertyAccessExpression(node.left)?node.left.name.text:null)&&isStrong(literal(node.right)))add('CP005','credential_assignment_literal',node);
  if(ts.isCallExpression(node)&&node.arguments.length){
   const callee=unwrap(node.expression),argument=unwrap(node.arguments[0]);
   // Literal commands and strings are not assumed to be attacker controlled.
   if(!ts.isStringLiteralLike(argument)){
    if(ts.isIdentifier(callee)&&functions.has(callee.text))add('CP006','dynamic_shell_command',node);
    else if(ts.isPropertyAccessExpression(callee)&&commands.has(callee.name.text)&&((ts.isIdentifier(callee.expression)&&moduleNames.has(callee.expression.text))||isRequire(callee.expression)))add('CP006','dynamic_shell_command',node);
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(source);return found;
}
export function inspectAdditional(file,before,after,ranges){
 const old=observe(file,before),current=observe(file,after),available=new Map();
 const signature=x=>x.rule_id+':'+x.pattern;
 for(const item of old)available.set(signature(item),(available.get(signature(item))||0)+1);
 const touched=x=>ranges.some(r=>r.new_count>0&&x.location.start.line<=r.new_start+r.new_count-1&&x.location.end.line>=r.new_start);
 for(const item of current.filter(x=>!touched(x)))available.set(signature(item),Math.max(0,(available.get(signature(item))||0)-1));
 return current.filter(touched).flatMap(item=>{
  const count=available.get(signature(item))||0;if(count){available.set(signature(item),count-1);return [];}
  const secret=item.rule_id==='CP005';
  return [{rule_id:item.rule_id,title:secret?'Possible hardcoded credential':'Dynamic shell command',
    severity:'warning',explanation:secret?'A credential-shaped name is assigned a nontrivial literal. This may be a test value or false positive; inspect handling and rotate if real.':'A direct imported Node child_process shell API receives a nonliteral command. Its origin and exploitability are unverified.',
    location:item.location,newly_introduced:true,runtime_verification:false,
    evidence:{kind:'additional_syntax',pattern:item.pattern,source_values_included:false},
    limitations:['Syntax pattern only; intent, input control, runtime execution and exploitability remain unverified.','Only supported direct assignments and module imports are covered; aliases, cross-file data flow and indirect calls are unassessed.','No source literals or secret values are included in this result.']}];
 });
}
