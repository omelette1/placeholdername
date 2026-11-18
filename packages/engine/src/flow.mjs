import ts from 'typescript';

export const FLOW_LIMITATIONS = [
  'Deterministic straight-line analysis with bounded, directly resolved same-file helpers; no runtime verification.',
  'Header-shaped reads are treated as potential authorization values; receiver types and actual sensitive contents are not proven.',
  'Only direct same-file helper calls are traced (maximum depth 3). No imported helpers, closures, dynamic dispatch, returned-value propagation or general workflow understanding.',
  'Console is assumed to be the standard logger; custom implementations and runtime reachability are not verified.',
  'HEAD comparison uses function identity and source/sink signatures, not semantic equivalence or proof of exploitability.',
];
export const MAX_HELPER_DEPTH = 3;
const MAX_HELPER_CALLS = 256;
const methods = new Set(['log', 'info', 'warn', 'error', 'debug', 'trace']);
function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
  return node;
}
function property(node, name) {
  return ts.isPropertyAccessExpression(node) && node.name.text === name
    || ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) && node.argumentExpression.text.toLowerCase() === name;
}
export function consoleMethod(node) {
  return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'console'
    && methods.has(node.expression.name.text) ? node.expression.name.text : null;
}
function isFunction(node) {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node);
}
function location(source, file, node) {
  const start = source.getLineAndCharacterOfPosition(node.getStart(source));
  const end = source.getLineAndCharacterOfPosition(node.end);
  return {file, start: {line: start.line + 1, column: start.character + 1}, end: {line: end.line + 1, column: end.character + 1}};
}
const messages = {
  unsupported_parameters: 'Destructured/default/rest parameters are outside supported function-local syntax.',
  unsupported_control_flow: 'Control flow or a nested block cannot be resolved; tracked values are cleared, and this statement is not analyzed.',
  unresolved_call: 'A call could transform values or have side effects; no path is inferred through it. Tracked values are cleared; later independent reads may be analyzed.',
  unresolved_expression: 'An expression or transformation cannot be resolved; no path crosses it. Tracked values are cleared; later independent reads may be analyzed.',
  unsupported_assignment: 'Only simple identifier declarations and = assignments are supported; tracked values are cleared.',
  shadowed_console: 'A local console binding prevents assuming the standard logging sink; function flow analysis skipped.',
  helper_limit: 'The bounded same-file helper traversal limit was reached; the path is not inferred beyond it.',
  helper_recursion: 'Recursive helper calls are not traversed; no recursive path is inferred.',
  helper_partial: 'A resolved helper contains an unsupported operation. Caller values are cleared; no effects or return value are inferred.',
  helper_arguments: 'Only exact positional arguments and simple helper parameters are supported.',
  unsupported_function: 'Only non-generator functions with block bodies are supported; await/yield are not resolved.',
};

export function collectFlows(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) throw new Error('parse');
  const scopes = [];
  const paths = [], limitations = [], incompleteFunctions = new Set();
  const siblingCounts = new Map(), infos = new Map(), allFunctions = [], scopeByKey = new Map();
  const bindings = new Map(), writtenNames = new Set();
  let helperCalls = 0;
  function index(node, parent = null) {
    let owner=parent;
    if (isFunction(node)) {
      const named=node.name && (ts.isIdentifier(node.name)||ts.isStringLiteral(node.name))?node.name.text
        :ts.isVariableDeclaration(node.parent)&&ts.isIdentifier(node.parent.name)?node.parent.name.text:'<anonymous>';
      const base=(parent?.key||'file')+'/'+named, ordinal=siblingCounts.get(base)||0;
      siblingCounts.set(base,ordinal+1);
      owner={node,parent,key:base+'#'+ordinal};infos.set(node,owner);allFunctions.push(owner);bindings.set(owner.key,new Map());
    }
    ts.forEachChild(node,child=>index(child,owner));
  }
  index(source);bindings.set('file',new Map());
  function bind(owner,name,target){const map=bindings.get(owner?.key||'file');if(map.has(name)&&map.get(name)!==target)map.set(name,null);else map.set(name,target);}
  function names(pattern,callback){if(ts.isIdentifier(pattern))callback(pattern.text);else for(const item of pattern.elements||[])if(item.name)names(item.name,callback);}
  function scan(node,owner=null){
    if(isFunction(node)){
      const info=infos.get(node);
      if(ts.isFunctionDeclaration(node)&&node.name)bind(owner,node.name.text,node.parent===(owner?.node.body||source)?info:null);
      if(ts.isFunctionExpression(node)&&node.name)bind(info,node.name.text,info);
      for(const param of node.parameters)names(param.name,name=>bind(info,name,null));
      ts.forEachChild(node,child=>scan(child,info));return;
    }
    if(ts.isVariableDeclaration(node)){
      const fn=node.initializer&&infos.get(unwrap(node.initializer));
      const statement=node.parent?.parent;
      const direct=statement?.parent===(owner?.node.body||source);
      const constant=!!(node.parent.flags&ts.NodeFlags.Const);
      names(node.name,name=>bind(owner,name,fn&&direct&&constant?fn:null));
    }
    if(ts.isClassDeclaration(node)&&node.name)bind(owner,node.name.text,null);
    if(ts.isImportClause(node)&&node.name)bind(owner,node.name.text,null);
    if(ts.isImportSpecifier(node)||ts.isNamespaceImport(node))bind(owner,node.name.text,null);
    if(ts.isBinaryExpression(node)&&node.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&node.operatorToken.kind<=ts.SyntaxKind.LastAssignment&&ts.isIdentifier(node.left))writtenNames.add(node.left.text);
    if((ts.isPrefixUnaryExpression(node)||ts.isPostfixUnaryExpression(node))&&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(node.operator)&&ts.isIdentifier(node.operand))writtenNames.add(node.operand.text);
    ts.forEachChild(node,child=>scan(child,owner));
  }
  scan(source);
  function resolveHelper(info,name){
    if(writtenNames.has(name))return null;
    for(let owner=info;owner;owner=owner.parent){const map=bindings.get(owner.key);if(map.has(name))return map.get(name);}
    return bindings.get('file').get(name)||null;
  }
  function analyzeFunction(fn, parentKey, incoming=null, stack=[]) {
    const info=infos.get(fn),key=info.key;
    if(!stack.length)stack=[key];
    let scope=scopeByKey.get(key);
    if(!scope){scope={kind:'function',location:location(source,file,fn),status:'analyzed',supported_steps:0};scopeByKey.set(key,scope);scopes.push(scope);}
    const localNames=new Set(fn.parameters.filter(p=>ts.isIdentifier(p.name)).map(p=>p.name.text));
    function locals(node){if(isFunction(node))return;if(ts.isVariableDeclaration(node))names(node.name,name=>localNames.add(name));ts.forEachChild(node,locals);}
    if(fn.body)ts.forEachChild(fn.body,locals);
    const env = new Map();
    const roots = new Map();
    let stopped = false;
    let terminalBoundary = false;
    function note(code, node) {
      limitations.push({rule_id: 'CP002', code, location: location(source, file, node), message: messages[code]});
      incompleteFunctions.add(key);
      for(const flow of incoming||[])if(flow?.origin)incompleteFunctions.add(flow.origin);
      stopped = true;
      if (['unsupported_control_flow','unsupported_assignment','shadowed_console'].includes(code)) terminalBoundary = true;
      env.clear();
      scope.status = scope.supported_steps ? 'partial' : 'unsupported';
    }
    const expressionSink=fn.body&&!ts.isBlock(fn.body)&&ts.isCallExpression(unwrap(fn.body))&&consoleMethod(unwrap(fn.body));
    if (!fn.body || (!ts.isBlock(fn.body)&&!expressionSink) || fn.asteriskToken) {
      note('unsupported_function', fn);
    } else if (fn.parameters.some(p => !ts.isIdentifier(p.name) || p.initializer || p.dotDotDotToken)) {
      note('unsupported_parameters', fn);
    } else {
      fn.parameters.forEach((p, i) => roots.set(p.name.text, {index: i, headers: p.name.text === 'headers'}));
      let shadowsConsole = roots.has('console');
      function findBinding(node) {
        if (isFunction(node)) {if (node.name && ts.isIdentifier(node.name) && node.name.text === 'console') shadowsConsole = true;return;}
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'console') shadowsConsole = true;
        ts.forEachChild(node, findBinding);
      }
      ts.forEachChild(fn.body, findBinding);
      if (shadowsConsole) note('shadowed_console', fn);
      if(incoming){roots.clear();fn.parameters.forEach((p,i)=>{if(incoming[i])env.set(p.name.text,incoming[i]);});}
    }
    function headerReceiver(node) {
      node = unwrap(node);
      if (ts.isIdentifier(node) && roots.get(node.text)?.headers) return 'parameter:' + roots.get(node.text).index + ':headers';
      if (property(node, 'headers')) {
        const receiver = unwrap(node.expression);
        if (ts.isIdentifier(receiver) && roots.has(receiver.text)) return 'parameter:' + roots.get(receiver.text).index + ':headers';
      }
      return null;
    }
    function value(node) {
      node = unwrap(node);
      if (!node) return {flow: null};
      let receiver = null;
      if (property(node, 'authorization')) receiver = headerReceiver(node.expression);
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'get'
          && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text.toLowerCase() === 'authorization') {
        receiver = headerReceiver(node.expression.expression);
      }
      if (receiver) {const loc=location(source,file,node);return {flow:{source:{kind:'authorization_header_read',location:loc},assignments:[],signature:receiver+':authorization',origin:key,route:[],trace:[{kind:'source',location:loc,label:'Authorization-header source'}]}};}
      if (ts.isIdentifier(node)) {if(!localNames.has(node.text)&&!['undefined','NaN','Infinity'].includes(node.text))return {flow:null,unresolved:'unresolved_expression'};return {flow:env.get(node.text)||null};}
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isNumericLiteral(node)
          || [ts.SyntaxKind.NullKeyword, ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(node.kind)) return {flow: null};
      // Do not follow calls, templates, binary expressions, object aliases, or computed values.
      return {flow: null, unresolved: ts.isCallExpression(node) ? 'unresolved_call' : 'unresolved_expression'};
    }
    function assign(name, expression, node, declaration) {
      if (!ts.isIdentifier(name)||!localNames.has(name.text)) {note('unsupported_assignment', node); return;}
      if (name.text === 'console') {note('shadowed_console', node); return;}
      const result = value(expression);
      if (result.unresolved) {
        roots.delete(name.text);
        note(result.unresolved, expression);
        return;
      }
      // Assignment replaces the previous binding's value; copies retain their original source.
      if (result.flow) {
        if(result.flow.trace.length>=64){note('helper_limit',node);return;}
        const step={kind:declaration?'declaration':'assignment',variable:name.text,location:location(source,file,node)};
        env.set(name.text,{...result.flow,assignments:[...result.flow.assignments,step],trace:[...result.flow.trace,{kind:'assignment',variable:name.text,label:step.kind+': '+name.text,location:step.location}]});
      }
      else env.delete(name.text);
      roots.delete(name.text);
    }
    function sink(call) {
      const method = consoleMethod(call);
      const resolved = call.arguments.map(value);
      if (resolved.some(v => v.unresolved)) {
        // Argument evaluation may mutate bindings before logging; do not invent a partial complete path.
        note(resolved.find(v => v.unresolved).unresolved, call); return;
      }
      if(!method){
        const helper=ts.isIdentifier(call.expression)&&resolveHelper(info,call.expression.text);
        if(!helper){note('unresolved_call',call);return;}
        if(stack.includes(helper.key)){note('helper_recursion',call);return;}
        if(stack.length>MAX_HELPER_DEPTH||++helperCalls>MAX_HELPER_CALLS){note('helper_limit',call);return;}
        if(call.arguments.length!==helper.node.parameters.length||helper.node.parameters.some(p=>!ts.isIdentifier(p.name)||p.initializer||p.dotDotDotToken)||call.arguments.some(ts.isSpreadElement)){note('helper_arguments',call);return;}
        if(resolved.some(arg=>arg.flow&&arg.flow.trace.length+3>=64)){note('helper_limit',call);return;}
        const passed=resolved.map((arg,i)=>arg.flow?{...arg.flow,route:[...arg.flow.route,helper.key],trace:[...arg.flow.trace,
          {kind:'argument',argument_index:i,label:'Argument '+(i+1),location:location(source,file,call.arguments[i])},
          {kind:'function_call',function_name:call.expression.text,label:'Call '+call.expression.text,location:location(source,file,call)},
          {kind:'parameter',variable:helper.node.parameters[i].name.text,label:'Parameter '+helper.node.parameters[i].name.text,location:location(source,file,helper.node.parameters[i])}]}:null);
        analyzeFunction(helper.node,key,passed,[...stack,helper.key]);
        if(incompleteFunctions.has(helper.key))note('helper_partial',call);
        return;
      }
      resolved.forEach((result, argument) => {
        if (!result.flow) return;
        if(result.flow.trace.length>=64){note('helper_limit',call);return;}
        if(paths.length>=256){note('helper_limit',call);return;}
        paths.push({functionKey: result.flow.origin, signature: result.flow.origin + '|' + result.flow.signature + '|' + result.flow.route.join('>') + '|' + method + '|' + argument,
          source: result.flow.source, assignments: result.flow.assignments,
          trace:[...result.flow.trace,{kind:'logging',label:'Console.'+method,location:location(source,file,call)}],logging: {console_method: method, argument_index: argument, location: location(source, file, call)}});
      });
    }
    if(expressionSink&&!stopped){sink(unwrap(fn.body));if(!stopped)scope.supported_steps++;}
    if (!stopped&&!expressionSink) for (const statement of fn.body.statements) {
      // An unknown statement invalidates tracked values. Later fresh reads may
      // start new paths, but no evidence crosses this boundary.
      stopped = false;
      const noteCount = limitations.length;
      if (ts.isFunctionDeclaration(statement) || ts.isEmptyStatement(statement)) continue;
      if (ts.isVariableStatement(statement)) {
        for (const decl of statement.declarationList.declarations) {
          if(decl.initializer&&isFunction(unwrap(decl.initializer)))continue;
          // A var redeclaration without an initializer does not overwrite its value or a parameter.
          if (!decl.initializer && !(statement.declarationList.flags & ts.NodeFlags.BlockScoped) && ts.isIdentifier(decl.name)) continue;
          assign(decl.name, decl.initializer, decl, true);
          if (stopped) break;
        }
      } else if (ts.isExpressionStatement(statement)) {
        const expr = unwrap(statement.expression);
        if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) assign(expr.left, expr.right, expr, false);
        else if (ts.isCallExpression(expr)) sink(expr);
        else if (!ts.isStringLiteral(expr)) note('unresolved_expression', expr);
      } else if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) {
        if (statement.expression) {
          const expr = unwrap(statement.expression);
          if (ts.isCallExpression(expr)) sink(expr);
          else if (value(expr).unresolved) note(value(expr).unresolved, expr);
        }
        break;
      } else note('unsupported_control_flow', statement);
      if (limitations.length === noteCount) scope.supported_steps++;
      if (terminalBoundary) break;
    }
    if (incompleteFunctions.has(key)) scope.status = scope.supported_steps ? 'partial' : 'unsupported';
  }
  for(const info of allFunctions){
    if(allFunctions.length>200){limitations.push({rule_id:'CP002',code:'helper_limit',location:location(source,file,info.node),message:'More than 200 functions in a file are outside this bounded analysis.'});scopes.push({kind:'function',location:location(source,file,info.node),status:'unsupported',supported_steps:0});incompleteFunctions.add(info.key);continue;}
    analyzeFunction(info.node,info.parent?.key||'file');
  }
  // Top-level executable statements are not function-local analysis. Do not
  // silently present them as covered. Imports/types/function definitions alone
  // do not require a top-level flow walk.
  for (const statement of source.statements) {
    const definitionsOnly = ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement)
      || ts.isExportDeclaration(statement) || ts.isInterfaceDeclaration(statement)
      || ts.isTypeAliasDeclaration(statement) || ts.isFunctionDeclaration(statement)
      || ts.isEmptyStatement(statement)
      || (ts.isVariableStatement(statement) && statement.declarationList.declarations.every(d => d.initializer && isFunction(unwrap(d.initializer))));
    if (definitionsOnly) continue;
    scopes.push({kind: 'top_level', location: location(source, file, statement), status: 'unsupported', supported_steps: 0});
    limitations.push({rule_id: 'CP002', code: 'unsupported_top_level', location: location(source, file, statement), message: 'Executable code outside functions (including class initialization) is not covered by CP002.'});
  }
  return {paths, limitations, incompleteFunctions, scopes};
}
function overlaps(location, ranges) {
  return ranges.some(r => r.new_count > 0 && location.start.line <= r.new_start + r.new_count - 1 && location.end.line >= r.new_start);
}
export function inspectFlows(file, before, after, ranges) {
  const old = collectFlows(file, before), current = collectFlows(file, after);
  const available = new Map();
  for (const p of old.paths) available.set(p.signature, (available.get(p.signature) || 0) + 1);
  const touched = p => p.trace.map(step=>step.location).some(loc => overlaps(loc, ranges));
  // Match untouched copies first so a duplicate added sink cannot consume an existing path.
  const ordered = [...current.paths.filter(p => !touched(p)), ...current.paths.filter(touched)];
  const groups = new Map();
  for (const p of ordered) {
    const count = available.get(p.signature) || 0;
    if (count) available.set(p.signature, count - 1);
    const possibleRelocation = old.paths.some(previous => previous.functionKey !== p.functionKey
      && previous.signature.slice(previous.functionKey.length) === p.signature.slice(p.functionKey.length)
      && !current.paths.some(other => other.signature === previous.signature));
    const newlyIntroduced = count ? false : old.incompleteFunctions.has(p.functionKey) || possibleRelocation ? null : true;
    if (!touched(p) && newlyIntroduced === false) continue;
    const loc = p.logging.location;
    const key = `${loc.start.line}:${loc.start.column}`;
    const group = groups.get(key) || {location: loc, paths: []};
    group.paths.push({source: p.source, assignments: p.assignments, logging: p.logging, trace:p.trace,
      newly_introduced: newlyIntroduced,
      comparison: newlyIntroduced === null ? (possibleRelocation ? 'unknown_function_identity' : 'unknown_baseline_limitations') : newlyIntroduced ? 'not_matched_in_HEAD' : 'matched_in_HEAD'});
    groups.set(key, group);
  }
  const findings = [...groups.values()].map(group => ({rule_id: 'CP002', title: 'Potential authorization-header logging', severity: 'warning',
    explanation: 'An authorization-header-shaped read reaches a direct console call through supported assignments and directly resolved same-file helper calls. This is a potential exposure, not a verified runtime leak.',
    location: group.location, newly_introduced: group.paths.some(p => p.newly_introduced === true) ? true : group.paths.some(p => p.newly_introduced === null) ? null : false,
    runtime_verification: false, evidence: {kind: 'bounded_same_file_data_flow', paths: group.paths, source_values_included: false},
    limitations: [...FLOW_LIMITATIONS, ...(group.paths.some(p => p.newly_introduced === null) ? ['HEAD comparison is inconclusive because baseline syntax is unsupported or a matching path may have moved/changed function identity; whether this path is new is unknown.'] : [])]}));
  return {findings, coverage: current.scopes, limitations: current.limitations.map(note => ({...note, revision: 'working_tree'}))
    .concat(old.limitations.map(note => ({...note, revision: 'HEAD'})))};
}
