/** Geometric ruled-table detection. No document/rule-specific coordinates. */
export const detectRuledTable = (image: {width:number;height:number;data:ArrayLike<number>}) => {
  const {width:w,height:h,data}=image;
  const dark=(x:number,y:number)=>{const i=(y*w+x)*4;return data[i]+data[i+1]+data[i+2]<540;};
  const group=(values:number[])=>{
    const groups:number[][]=[];
    for(const n of values){const last=groups.at(-1);if(last&&n-last.at(-1)!<=5)last.push(n);else groups.push([n]);}
    return groups.map((g)=>Math.round(g.reduce((a,b)=>a+b,0)/g.length));
  };
  const rows:number[]=[];
  for(let y=0;y<h;y++){let count=0;for(let x=0;x<w;x++)if(dark(x,y))count++;if(count>w*0.45)rows.push(y);}
  const ys=group(rows);
  if(ys.length<3)return null;
  const top=ys[0],bottom=ys.at(-1)!;
  const columns:number[]=[];
  for(let x=0;x<w;x++){let count=0;for(let y=top;y<=bottom;y++){
    if(dark(x,y)||dark(Math.max(0,x-1),y)||dark(Math.min(w-1,x+1),y))count++;
  }if(count>(bottom-top)*0.60)columns.push(x);}
  const xs=group(columns);
  if(xs.length<3||xs.length>12||ys.length>35)return null;
  if(xs.some((x,i)=>i>0&&x-xs[i-1]<w*0.025))return null;
  return {xs,ys};
};

export type TableCellOcr={text:string;confidence:number;uncertainTokens:number};
export type ImageRectangle={left:number;top:number;width:number;height:number};
/** Geometric ink check prevents OCR hallucinations in empty table cells.
 * Tight bounds also remove the large white margins around printed scores. */
export const findCellInkBounds = (image:{width:number;height:number;data:ArrayLike<number>},cell:ImageRectangle):ImageRectangle|null => {
  let left=cell.left+cell.width,top=cell.top+cell.height,right=cell.left,bottom=cell.top;
  for(let y=cell.top;y<cell.top+cell.height;y++){
    const xs:number[]=[];
    for(let x=cell.left;x<cell.left+cell.width;x++){
      const i=(y*image.width+x)*4;
      if(image.data[i]+image.data[i+1]+image.data[i+2]<450)xs.push(x);
    }
    if(xs.length<Math.max(3,cell.width*.02))continue;
    left=Math.min(left,xs[0]);right=Math.max(right,xs.at(-1)!);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(right-left<3||bottom-top<3)return null;
  left=Math.max(cell.left,left-8);top=Math.max(cell.top,top-8);
  right=Math.min(cell.left+cell.width,right+9);bottom=Math.min(cell.top+cell.height,bottom+9);
  return {left,top,width:right-left,height:bottom-top};
};
export const serializeTableCells = (rows: readonly (readonly TableCellOcr[])[]) => {
  if(!rows.length)return '';
  const escape=(v:string)=>v.replace(/\|/g,'\\|').replace(/\r?\n/g,'<br>');
  // Columns are positional, not guessed headings. The first physical row
  // remains data, so continuation pages are never promoted to a header.
  const columns=rows[0].length;
  return ['<!-- table: physical row/column order; blank cell = blank in scan -->',
    `| ${Array.from({length:columns},(_,i)=>`Cột ${i+1}`).join(' | ')} |`,
    `| ${Array.from({length:columns},()=> '---').join(' | ')} |`,
    ...rows.map((row)=>`| ${row.map((c)=>escape(c.text)).join(' | ')} |`)].join('\n');
};
