import ts from 'typescript';
import path from 'node:path';

// Exercise real component render trees without adding test exports or authentication
// bypasses to the production bundle. State controls only open otherwise private UI.
export function acceptancePlugin() {
  return { name: 'local-overlay-acceptance', enforce: 'pre', transform(code, id) {
    const file = id.split('?')[0].replaceAll('\\', '/');
    const relative = path.relative(process.cwd(), file).replaceAll('\\', '/');
    if (!/^(components|app\/auth|features\/scholarships)\//.test(relative) || !/\.(tsx|jsx)$/.test(file) || !code.includes('<Overlay')) return;
    const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TSX);
    const edits = [], owners = new Set(); let index = 0;
    function visit(node) {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === 'Overlay') {
        edits.push([node.tagName.end, node.tagName.end, ` data-acceptance-overlay="${relative}:${++index}"`]);
        let parent = node;
        while (parent && parent.parent !== source) parent = parent.parent;
        if (parent && ts.isVariableStatement(parent)) for (const declaration of parent.declarationList.declarations) if (ts.isIdentifier(declaration.name)) owners.add(declaration.name.text);
        if (parent && ts.isFunctionDeclaration(parent) && parent.name) owners.add(parent.name.text);
      }
      if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && /^(React\.)?useState$/.test(node.initializer.expression.getText(source))) {
        const name = node.name.elements[0]?.getText(source);
        const call = node.initializer;
        edits.push([call.expression.getStart(source), call.expression.end, '__fixtureState']);
        if (call.typeArguments?.length) edits.push([call.expression.end, call.arguments.pos - 1, '']);
        edits.push([call.arguments.pos, call.arguments.pos, `${JSON.stringify(relative)},${JSON.stringify(name)}${call.arguments.length ? ',' : ''}`]);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    for (const [start,end,replacement] of edits.sort((a,b) => b[0]-a[0] || b[1]-a[1])) code = code.slice(0,start)+replacement+code.slice(end);
    for (const owner of owners) {
      const alreadyExported = source.statements.some(statement => statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) && (statement.name?.text === owner || statement.declarationList?.declarations.some(d => d.name.getText(source) === owner)));
      if (!alreadyExported) code += `\nexport { ${owner} };`;
    }
    return `import {useFixtureState as __fixtureState} from '/tests/mobile-overlay-acceptance-control.ts';\n${code}`;
  } };
}
