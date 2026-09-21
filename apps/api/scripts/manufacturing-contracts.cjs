// Emit runtime contracts from the scoped DTOs. stdout only: reviewed output is
// committed in src/modules/manufacturing/manufacturing-contracts.json.
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../src/modules');
const folder = path.join(root, 'manufacturing/dto');
const files = fs.readdirSync(folder).filter(f => f.endsWith('.ts')).map(f => path.join(folder, f));
files.push(path.join(root, 'service-orders/dto/after-sales-part-demand.dto.ts'));
const nodes = new Map();
for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const node of source.statements) if (ts.isClassDeclaration(node) || ts.isTypeAliasDeclaration(node)) nodes.set(node.name.text, node);
}
function members(list) {
  return { object: Object.fromEntries(list.map(p => [p.name.text, { ...schema(p.type), ...(p.questionToken ? { optional: true } : {}) }])) };
}
function schema(n) {
  if (!n) throw new Error('Missing property type');
  if (ts.isUnionTypeNode(n)) return { union: n.types.map(schema) };
  if (ts.isIndexedAccessTypeNode(n)) return schema(n.objectType).object[n.indexType.literal.text];
  if (ts.isLiteralTypeNode(n)) return { literal: n.literal.kind === ts.SyntaxKind.NullKeyword ? null : n.literal.text };
  if (ts.isArrayTypeNode(n)) return { array: schema(n.elementType) };
  if (ts.isTypeLiteralNode(n)) return members(n.members);
  if (ts.isTypeReferenceNode(n)) {
    if (n.typeName.text === 'Date') return { date: true };
    if (n.typeName.text === 'Array') return { array: schema(n.typeArguments[0]) };
    return definition(n.typeName.text);
  }
  const type = { [ts.SyntaxKind.StringKeyword]: 'string', [ts.SyntaxKind.NumberKeyword]: 'number', [ts.SyntaxKind.BooleanKeyword]: 'boolean' }[n.kind];
  if (!type) throw new Error(`Unsupported DTO type: ${ts.SyntaxKind[n.kind]}`);
  return { type };
}
function definition(name) {
  const node = nodes.get(name);
  if (!node) throw new Error(`Unresolved DTO: ${name}`);
  if (ts.isTypeAliasDeclaration(node)) return schema(node.type);
  const inherited = Object.assign({}, ...(node.heritageClauses || []).flatMap(c => c.types.map(t => definition(t.expression.text).object)));
  return { object: { ...inherited, ...members(node.members).object } };
}
const output = Object.fromEntries([...nodes.keys()].filter(n => n.endsWith('Dto')).sort().map(n => [n, definition(n)]));
process.stdout.write(JSON.stringify(output, null, 2) + '\n');
