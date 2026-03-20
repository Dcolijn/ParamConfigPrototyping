import type { ConfigurationData, EvaluatedValue, EvaluationResult, Vec3 } from './types';

type TokenType = 'number' | 'boolean' | 'identifier' | 'string' | 'operator' | 'paren' | 'comma' | 'question' | 'colon' | 'eof';
type Token = { type: TokenType; value: string };
type RefCall = { kind: 'ref'; id: string; attr: string | null };

type AstNode =
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'string'; value: string }
  | { kind: 'identifier'; name: string }
  | RefCall
  | { kind: 'unary'; operator: string; argument: AstNode }
  | { kind: 'binary'; operator: string; left: AstNode; right: AstNode }
  | { kind: 'call'; callee: string; args: AstNode[] }
  | { kind: 'ternary'; test: AstNode; consequent: AstNode; alternate: AstNode };

const REF_PATTERN = /\$[A-Za-z0-9_-]+(?:\.[A-Za-z_][A-Za-z0-9_]*)?/g;

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toBool = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  return Boolean(value);
};

const vec3 = (x: unknown, y: unknown, z: unknown): Vec3 => [toNumber(x), toNumber(y), toNumber(z)];
const isVec3 = (value: unknown): value is Vec3 => Array.isArray(value) && value.length >= 3;

// We replace references like "$height.min" first so the parser can treat it as a safe function call.
// In gewone taal: we maken "$..." eerst netjes en voorspelbaar, zodat er later niets "stiekem" uitgevoerd kan worden.
const replaceRefs = (expression: string): string =>
  expression.replace(REF_PATTERN, (token) => {
    if (token.includes('.')) {
      const lastDot = token.lastIndexOf('.');
      return `__ref__("${token.slice(0, lastDot)}", "${token.slice(lastDot + 1)}")`;
    }
    return `__ref__("${token}", null)`;
  });

// We rewrite ternary a ? b : c to a function-like ternary(a,b,c) shape.
// In gewone taal: zo hoeven we geen "eval" te gebruiken, en kan onze eigen parser het veilig uitlezen.
const convertTernaryToCall = (expression: string): string => {
  const expr = expression.trim();
  const stack: string[] = [];

  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i];
    if (ch === '(') stack.push(ch);
    else if (ch === ')' && stack.length > 0) stack.pop();
    else if (ch === '?' && stack.length === 0) {
      let nested = 0;
      let depth = 0;
      for (let j = i + 1; j < expr.length; j += 1) {
        const inner = expr[j];
        if (inner === '(') depth += 1;
        else if (inner === ')') depth -= 1;
        else if (inner === '?' && depth === 0) nested += 1;
        else if (inner === ':' && depth === 0) {
          if (nested === 0) {
            const left = expr.slice(0, i).trim();
            const middle = expr.slice(i + 1, j).trim();
            const right = expr.slice(j + 1).trim();
            return `ternary(${left}, ${middle}, ${right})`;
          }
          nested -= 1;
        }
      }
    }
  }

  return expr;
};

const tokenize = (expression: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;

  const push = (type: TokenType, value: string) => tokens.push({ type, value });
  const twoCharOps = new Set(['<=', '>=', '==', '!=', '&&', '||']);

  while (i < expression.length) {
    const ch = expression[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < expression.length && /[0-9.]/.test(expression[i])) i += 1;
      push('number', expression.slice(start, i));
      continue;
    }

    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < expression.length && /[A-Za-z0-9_$.-]/.test(expression[i])) i += 1;
      const value = expression.slice(start, i);
      if (value === 'true' || value === 'false') push('boolean', value);
      else push('identifier', value);
      continue;
    }

    if (ch === '"') {
      // We zitten op het begin van een tekst ("..."), dus sla de eerste quote over.
      i += 1;
      let value = '';

      while (i < expression.length) {
        const current = expression[i];

        // Escape-sequenties die we bewust ondersteunen:
        // \"  -> voegt een echte " toe in de tekst
        // \\  -> voegt een echte \ toe in de tekst
        if (current === '\\' && i + 1 < expression.length) {
          const next = expression[i + 1];
          if (next === '"' || next === '\\') {
            value += next;
            i += 2;
            continue;
          }
        }

        // Eindquote gevonden: string-token klaar.
        if (current === '"') {
          i += 1;
          push('string', value);
          break;
        }

        value += current;
        i += 1;
      }

      if (i > expression.length || expression[i - 1] !== '"') {
        throw new Error('Unterminated string literal');
      }

      continue;
    }

    if (ch === '(' || ch === ')') {
      push('paren', ch);
      i += 1;
      continue;
    }
    if (ch === ',') {
      push('comma', ch);
      i += 1;
      continue;
    }
    if (ch === '?') {
      push('question', ch);
      i += 1;
      continue;
    }
    if (ch === ':') {
      push('colon', ch);
      i += 1;
      continue;
    }

    const two = expression.slice(i, i + 2);
    if (twoCharOps.has(two)) {
      push('operator', two);
      i += 2;
      continue;
    }

    if ('+-*/%!<>'.includes(ch)) {
      push('operator', ch);
      i += 1;
      continue;
    }

    throw new Error(`Unsupported token: ${ch}`);
  }

  push('eof', '');
  return tokens;
};

class Parser {
  private readonly tokens: Token[];
  private index = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parseExpression(): AstNode {
    return this.parseTernary();
  }

  private current(): Token {
    return this.tokens[this.index];
  }

  private consume(type?: TokenType, value?: string): Token {
    const token = this.current();
    if (type && token.type !== type) throw new Error(`Expected ${type} but received ${token.type}`);
    if (value && token.value !== value) throw new Error(`Expected ${value} but received ${token.value}`);
    this.index += 1;
    return token;
  }

  private match(type: TokenType, value?: string): boolean {
    const token = this.current();
    if (token.type !== type) return false;
    if (value && token.value !== value) return false;
    this.index += 1;
    return true;
  }

  private parseTernary(): AstNode {
    const test = this.parseOr();
    if (this.match('question')) {
      const consequent = this.parseExpression();
      this.consume('colon');
      const alternate = this.parseExpression();
      return { kind: 'ternary', test, consequent, alternate };
    }
    return test;
  }

  private parseOr(): AstNode {
    let node = this.parseAnd();
    while (this.match('operator', '||')) node = { kind: 'binary', operator: '||', left: node, right: this.parseAnd() };
    return node;
  }

  private parseAnd(): AstNode {
    let node = this.parseEquality();
    while (this.match('operator', '&&')) node = { kind: 'binary', operator: '&&', left: node, right: this.parseEquality() };
    return node;
  }

  private parseEquality(): AstNode {
    let node = this.parseCompare();
    while (this.current().type === 'operator' && ['==', '!='].includes(this.current().value)) {
      const operator = this.consume('operator').value;
      node = { kind: 'binary', operator, left: node, right: this.parseCompare() };
    }
    return node;
  }

  private parseCompare(): AstNode {
    let node = this.parseTerm();
    while (this.current().type === 'operator' && ['<', '>', '<=', '>='].includes(this.current().value)) {
      const operator = this.consume('operator').value;
      node = { kind: 'binary', operator, left: node, right: this.parseTerm() };
    }
    return node;
  }

  private parseTerm(): AstNode {
    let node = this.parseFactor();
    while (this.current().type === 'operator' && ['+', '-'].includes(this.current().value)) {
      const operator = this.consume('operator').value;
      node = { kind: 'binary', operator, left: node, right: this.parseFactor() };
    }
    return node;
  }

  private parseFactor(): AstNode {
    let node = this.parseUnary();
    while (this.current().type === 'operator' && ['*', '/', '%'].includes(this.current().value)) {
      const operator = this.consume('operator').value;
      node = { kind: 'binary', operator, left: node, right: this.parseUnary() };
    }
    return node;
  }

  private parseUnary(): AstNode {
    if (this.current().type === 'operator' && ['!', '+', '-'].includes(this.current().value)) {
      const operator = this.consume('operator').value;
      return { kind: 'unary', operator, argument: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): AstNode {
    if (this.match('paren', '(')) {
      const node = this.parseExpression();
      this.consume('paren', ')');
      return node;
    }

    if (this.current().type === 'number') {
      return { kind: 'number', value: Number(this.consume('number').value) };
    }

    if (this.current().type === 'boolean') {
      return { kind: 'boolean', value: this.consume('boolean').value === 'true' };
    }

    if (this.current().type === 'string') {
      return { kind: 'string', value: this.consume('string').value };
    }

    if (this.current().type === 'identifier') {
      const name = this.consume('identifier').value;
      if (this.match('paren', '(')) {
        const args: AstNode[] = [];
        if (!this.match('paren', ')')) {
          do args.push(this.parseExpression()); while (this.match('comma'));
          this.consume('paren', ')');
        }
        return { kind: 'call', callee: name, args };
      }
      return { kind: 'identifier', name };
    }

    throw new Error(`Unexpected token: ${this.current().type}`);
  }
}

const serializeValue = (value: EvaluatedValue): EvaluatedValue => (isVec3(value) ? [Number(value[0]), Number(value[1]), Number(value[2])] : value);

const compileAst = (expression: string): AstNode => {
  const ternaryConverted = convertTernaryToCall(expression);
  const refsConverted = replaceRefs(ternaryConverted);
  const parser = new Parser(tokenize(refsConverted));
  return parser.parseExpression();
};

export const evaluateConfiguration = (configData: ConfigurationData, inputValues: Record<string, unknown>): EvaluationResult => {
  const inputMeta = Object.fromEntries(
    configData.input.map((input) => [input.id, { default: input.default, min: input.min, max: input.max, type: input.type }]),
  );
  const expressionMap = Object.fromEntries(configData.expressions.filter((expr) => expr.id).map((expr) => [expr.id, expr]));
  const expressionCache: Record<string, EvaluatedValue> = {};

  const expressionAstCache = new Map<string, AstNode>();

  const resolveRef = (refId: string, attr: string | null): unknown => {
    if (attr && ['min', 'max', 'default'].includes(attr)) {
      return inputMeta[refId]?.[attr as 'min' | 'max' | 'default'];
    }

    if (Object.hasOwn(inputValues, refId)) return inputValues[refId];
    if (Object.hasOwn(expressionCache, refId)) return expressionCache[refId];
    if (Object.hasOwn(expressionMap, refId)) return evaluateExpression(refId);
    if (Object.hasOwn(inputMeta, refId)) return inputMeta[refId]?.default;
    return 0;
  };

  const callHelper = (name: string, args: unknown[]): unknown => {
    switch (name) {
      case '__ref__':
        return resolveRef(String(args[0] ?? ''), (args[1] ?? null) as string | null);
      case 'min':
        return Math.min(toNumber(args[0]), toNumber(args[1]));
      case 'max':
        return Math.max(toNumber(args[0]), toNumber(args[1]));
      case 'abs':
        return Math.abs(toNumber(args[0]));
      case 'round':
        return Math.round(toNumber(args[0]));
      case 'pow':
        return Math.pow(toNumber(args[0]), toNumber(args[1]));
      case 'vec3':
        return vec3(args[0], args[1], args[2]);
      case 'ternary':
        return toBool(args[0]) ? args[1] : args[2];
      default:
        throw new Error(`Unsupported function ${name}`);
    }
  };

  const evalAst = (node: AstNode): unknown => {
    switch (node.kind) {
      case 'number':
      case 'boolean':
      case 'string':
        return node.value;
      case 'identifier':
        return resolveRef(node.name, null);
      case 'ref':
        return resolveRef(node.id, node.attr);
      case 'unary': {
        const value = evalAst(node.argument);
        if (node.operator === '!') return !toBool(value);
        if (node.operator === '-') return -toNumber(value);
        return toNumber(value);
      }
      case 'binary': {
        const left = evalAst(node.left);
        const right = evalAst(node.right);
        switch (node.operator) {
          case '+':
            return toNumber(left) + toNumber(right);
          case '-':
            return toNumber(left) - toNumber(right);
          case '*':
            return toNumber(left) * toNumber(right);
          case '/':
            return toNumber(left) / toNumber(right);
          case '%':
            return toNumber(left) % toNumber(right);
          case '==':
            return left === right;
          case '!=':
            return left !== right;
          case '<':
            return toNumber(left) < toNumber(right);
          case '>':
            return toNumber(left) > toNumber(right);
          case '<=':
            return toNumber(left) <= toNumber(right);
          case '>=':
            return toNumber(left) >= toNumber(right);
          case '&&':
            return toBool(left) && toBool(right);
          case '||':
            return toBool(left) || toBool(right);
          default:
            throw new Error(`Unsupported operator ${node.operator}`);
        }
      }
      case 'call':
        return callHelper(node.callee, node.args.map(evalAst));
      case 'ternary':
        return toBool(evalAst(node.test)) ? evalAst(node.consequent) : evalAst(node.alternate);
      default:
        throw new Error('Unknown AST node');
    }
  };

  const evaluateExpressionText = (expressionText: string): unknown => {
    if (!expressionAstCache.has(expressionText)) expressionAstCache.set(expressionText, compileAst(expressionText));
    return evalAst(expressionAstCache.get(expressionText)!);
  };

  const evaluateExpression = (expressionId: string): EvaluatedValue => {
    // Cache in gewone taal: als een berekening al gedaan is, hergebruiken we het antwoord.
    // Dat voorkomt dubbel werk en maakt het sneller bij veel verwijzingen naar dezelfde expressie.
    if (Object.hasOwn(expressionCache, expressionId)) return expressionCache[expressionId];
    const expressionData = expressionMap[expressionId];
    if (!expressionData) return resolveRef(expressionId, null) as EvaluatedValue;
    const value = evaluateExpressionText(expressionData.expression) as EvaluatedValue;
    expressionCache[expressionId] = value;
    return value;
  };

  Object.keys(expressionMap).forEach((expressionId) => evaluateExpression(expressionId));

  const shapekeys: Record<string, EvaluatedValue> = {};
  for (const output of configData.output.shapekeys) {
    try {
      shapekeys[output.id] = evaluateExpressionText(output.conversion) as EvaluatedValue;
    } catch {
      shapekeys[output.id] = resolveRef(output.input, null) as EvaluatedValue;
    }
  }

  const attachmentPoints: Record<string, { location: Vec3; rotation: Vec3 }> = {};
  for (const output of configData.output.attachmentpoints) {
    attachmentPoints[output.id] = {
      location: (evaluateExpressionText(output.inputLocation) as Vec3) ?? vec3(0, 0, 0),
      rotation: (evaluateExpressionText(output.inputRotation) as Vec3) ?? vec3(0, 0, 0),
    };
  }

  const valuesOutput: Record<string, EvaluatedValue> = {};
  for (const output of configData.output.values) {
    valuesOutput[output.id] = resolveRef(output.input, null) as EvaluatedValue;
  }

  return {
    expressions: Object.fromEntries(Object.entries(expressionCache).map(([key, value]) => [key, serializeValue(value)])),
    outputs: {
      shapekeys: Object.fromEntries(Object.entries(shapekeys).map(([key, value]) => [key, serializeValue(value)])),
      attachment_points: Object.fromEntries(
        Object.entries(attachmentPoints).map(([key, value]) => [
          key,
          {
            location: vec3(value.location[0], value.location[1], value.location[2]),
            rotation: vec3(value.rotation[0], value.rotation[1], value.rotation[2]),
          },
        ]),
      ),
      values: Object.fromEntries(Object.entries(valuesOutput).map(([key, value]) => [key, serializeValue(value)])),
    },
  };
};
