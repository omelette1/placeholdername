import ts from 'typescript';
import {inspectFlows} from './flow.mjs';
import {inspectRiskySyntax} from './risky-syntax.mjs';
import {inspectAdditional} from './additional-rules.mjs';
export const RULE_ID = 'CP001';
export const LIMITATIONS = ['Names alone cannot establish sensitive data flow or a confirmed leak.', 'Only direct console calls and direct named arguments are inspected; aliases, nested objects, computed calls and general access control are not analyzed.', 'The global console binding is assumed; shadowed bindings can produce false positives.', 'Static analysis only; no runtime verification occurred.'];
const sensitive = new Set(['accesstoken', 'refreshtoken', 'password', 'authorization']);
const methods = new Set(['log', 'info', 'warn', 'error', 'debug', 'trace']);
function unwrap(node) {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) node = node.expression;
  return node;
}
function sensitiveName(node) {
  node = unwrap(node);
  const name = ts.isIdentifier(node) ? node.text : ts.isPropertyAccessExpression(node) ? node.name.text : '';
  return sensitive.has(name.toLowerCase()) ? name.toLowerCase() : null;
}
function calls(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length) throw new Error('parse');
  const found = [];
  const printer = ts.createPrinter({removeComments: true});
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'console'
      && methods.has(node.expression.name.text)) {
      const names = [...new Set(node.arguments.map(sensitiveName).filter(Boolean))];
      if (names.length) {
        const start = source.getLineAndCharacterOfPosition(node.getStart(source));
        const end = source.getLineAndCharacterOfPosition(node.end);
        found.push({start: {line: start.line + 1, column: start.character + 1}, end: {line: end.line + 1, column: end.character + 1}, names, method: node.expression.name.text, fingerprint: node.expression.name.text + ':' + node.arguments.filter(arg => sensitiveName(arg)).map(arg => printer.printNode(ts.EmitHint.Expression, unwrap(arg), source)).join('|')});
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}
function inspectNames(file, before, after, ranges) {
  const old = calls(file, before), current = calls(file, after);
  const overlaps = c => ranges.some(r => r.new_count > 0 && c.start.line <= r.new_start + r.new_count - 1 && c.end.line >= r.new_start);
  const available = new Map();
  for (const c of old) available.set(c.fingerprint, (available.get(c.fingerprint) || 0) + 1);
  // Reserve old matches for untouched calls before evaluating changed candidates.
  for (const c of current.filter(c => !overlaps(c))) available.set(c.fingerprint, Math.max(0, (available.get(c.fingerprint) || 0) - 1));
  const findings = [];
  for (const call of current.filter(overlaps)) {
    const count = available.get(call.fingerprint) || 0;
    if (count) { available.set(call.fingerprint, count - 1); continue; }
    findings.push({rule_id: RULE_ID, title: 'Potential sensitive logging', severity: 'warning', explanation: 'A newly added or changed direct console call receives an argument whose name suggests sensitive data. This is not a confirmed leak.', location: {file, start: call.start, end: call.end}, evidence: {kind: 'syntax', console_method: call.method, sensitive_names: call.names, source_values_included: false}, limitations: LIMITATIONS, newly_introduced: true, runtime_verification: false});
  }
  return findings;
}

// Preserve CP001 as the fallback when no resolved authorization path covers the sink.
export function inspectDetailed(file, before, after, ranges) {
  const named = inspectNames(file, before, after, ranges);
  const flow = inspectFlows(file, before, after, ranges);
  const at = f => `${f.location.start.line}:${f.location.start.column}`;
  const bySink = new Map(flow.findings.map(f => [at(f), f]));
  const remaining = named.filter(f => {
    const resolved = bySink.get(at(f));
    if (!resolved) return true;
    resolved.evidence.related_rules = ['CP001'];
    resolved.evidence.sensitive_names = f.evidence.sensitive_names;
    return false;
  });
  return {findings: [...remaining, ...flow.findings, ...inspectRiskySyntax(file,before,after,ranges), ...inspectAdditional(file,before,after,ranges)].sort((a, b) => a.location.start.line - b.location.start.line || a.location.start.column - b.location.start.column), limitations: flow.limitations, coverage: flow.coverage};
}
export function inspect(file, before, after, ranges) {
  return inspectDetailed(file, before, after, ranges).findings;
}
