/** Offline static inventory. Does not import application code or contact D1. */
import ts from 'typescript';
import { readdir, readFile, writeFile } from 'node:fs/promises';
const entries=[];
async function visitDirectory(dir) {
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const file=dir+'/'+entry.name;
    if(entry.isDirectory()) {await visitDirectory(file);continue;}
    if(!/\.[cm]?[jt]s$/.test(file))continue;
    const source=ts.createSourceFile(file,await readFile(file,'utf8'),ts.ScriptTarget.Latest,true);
    function visit(node) {
      if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&['prepare','batch'].includes(node.expression.name.text)) {
        entries.push({file,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,
          method:node.expression.name.text,receiver:node.expression.expression.getText(source),
          argument:node.arguments[0]?.getText(source)||''});
      }
      ts.forEachChild(node,visit);
    }visit(source);
  }
}
for(const dir of ['cloudflare/worker/src','cloudflare/auth-production-worker/src'])await visitDirectory(dir);
const output={scope:'all prepare/batch call sites in Public and Auth Worker source; dynamic SQL is preserved as source expression, not executed. Eight .exec call sites were inspected and excluded because they are RegExp calls, not D1.',
  counts:{prepare:entries.filter(x=>x.method==='prepare').length,batch:entries.filter(x=>x.method==='batch').length,files:new Set(entries.map(x=>x.file)).size},entries};
await writeFile('docs/benchmarks/d1-query-inventory.json',JSON.stringify(output,null,2)+'\n');
console.log(output.counts);
