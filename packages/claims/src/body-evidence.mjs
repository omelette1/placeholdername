import ts from 'typescript';

// These are syntax observations, never a verdict about intended behavior.
export function bodyEvidence(body) {
  const result = (kind, attention, summary, detail) => ({
    kind, attention, summary, detail, behavior_verified: false,
  });
  const unwrap = value => {
    while (value && (ts.isParenthesizedExpression(value) || ts.isAsExpression(value)
      || ts.isSatisfiesExpression(value) || ts.isNonNullExpression(value))) value = value.expression;
    return value;
  };
  const literal = value => {
    value = unwrap(value);
    return value && (ts.isLiteralExpression(value)
      || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(value.kind)
      || (ts.isPrefixUnaryExpression(value) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(value.operator) && ts.isNumericLiteral(value.operand)));
  };
  let expression;
  if (ts.isBlock(body)) {
    const statements = body.statements;
    let start = 0;
    // Ignore leading directive strings and empty statements, not executable calls.
    while (start < statements.length && (ts.isEmptyStatement(statements[start])
      || (ts.isExpressionStatement(statements[start]) && ts.isStringLiteral(statements[start].expression)))) start++;
    const meaningful = statements.slice(start).filter(s => !ts.isEmptyStatement(s));
    if (!meaningful.length) return result('empty_body', true, 'Empty function body',
      'Only comments, directives or empty statements were found. This may be an intentional no-op; the declaration match does not establish the promised implementation.');
    if (meaningful.length === 1) {
      const statement = meaningful[0];
      if (ts.isReturnStatement(statement)) {
        if (!statement.expression) return result('bare_return', true, 'Returns without a value',
          'The only meaningful statement is a bare return. It may be intentional; no behavioral contract was checked.');
        expression = unwrap(statement.expression);
      } else if (ts.isThrowStatement(statement)) {
        const thrown = unwrap(statement.expression);
        if (thrown && (ts.isNewExpression(thrown) || ts.isCallExpression(thrown))
          && ts.isIdentifier(thrown.expression) && ['Error', 'TypeError'].includes(thrown.expression.text)
          && thrown.arguments?.length && ts.isStringLiteralLike(thrown.arguments[0])
          && /\bnot[ -]?implemented\b|\btodo\b|\bimplement[ -]?me\b|\bplaceholder\b/i.test(thrown.arguments[0].text)) {
          return result('placeholder_throw', true, 'Explicit placeholder-shaped throw',
            'The only meaningful statement throws an Error/TypeError-shaped call with placeholder wording. Actual bindings, runtime reachability and intended behavior are not verified.');
        }
      }
    }
  } else expression = unwrap(body);
  if (expression && literal(expression)) return result('constant_return', false, 'Returns a literal value',
    'A literal-return body was observed. Constant-return functions can be valid implementations; this is not classified as a confirmed stub or a correctness pass.');
  if (expression && ts.isIdentifier(expression) && expression.text === 'undefined') return result('undefined_return', false, 'Returns an undefined-shaped identifier',
    'The body returns the identifier undefined. Its binding and intended contract are not resolved; no correctness verdict is established.');
  return result('body_present', false, 'Body content observed; behavior unverified',
    'No selected whole-body empty/placeholder pattern matched. Incorrect code, hidden stubs, imported delegates and unsupported control flow may still be present.');
}
