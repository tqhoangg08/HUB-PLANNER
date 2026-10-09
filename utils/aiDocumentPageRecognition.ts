import type { Worker } from 'tesseract.js';
import { serializeOcrLines,confirmedNumericConfidence } from '../shared/ai-document-text-quality.ts';
import { detectRuledTable, serializeTableCells,findCellInkBounds,type ImageRectangle } from '../shared/ai-document-table-layout.ts';

/** Same OCR engine/contract for browser and the local real-PDF harness. */
export const recognizeDocumentPage = async (worker: Worker, canvas: {
  width:number;height:number;
  getContext(type:'2d'): {getImageData(x:number,y:number,w:number,h:number):{width:number;height:number;data:ArrayLike<number>}} | null;
}, image: Parameters<Worker['recognize']>[0],cropImage:(bounds:ImageRectangle,scale?:number)=>Parameters<Worker['recognize']>[0]) => {
  const result=await worker.recognize(image);
  const context=canvas.getContext('2d');
  const pixels=context?.getImageData(0,0,canvas.width,canvas.height);
  const grid=pixels ? detectRuledTable(pixels) : null;
  const full=serializeOcrLines(result.data.lines);
  if(!grid)return {...full,confidence:result.data.confidence,tableCells:0};
  const {xs,ys}=grid;
  const outside=result.data.lines.filter((line)=>line.bbox.y1<ys[0]||line.bbox.y0>ys.at(-1)!);
  const before=serializeOcrLines(outside.filter((l)=>l.bbox.y1<ys[0]));
  const after=serializeOcrLines(outside.filter((l)=>l.bbox.y0>ys.at(-1)!));
  const rows=[];
  let uncertainTokens=before.uncertainTokens+after.uncertainTokens,tableCells=0;
  try{
    // Uniform text blocks *within each observed cell*, not across columns.
    await worker.setParameters({tessedit_pageseg_mode:'6' as import('tesseract.js').PSM});
    for(let r=0;r<ys.length-1;r++){
      const row=[];
      for(let c=0;c<xs.length-1;c++){
        const rectangle={left:xs[c]+6,top:ys[r]+6,width:xs[c+1]-xs[c]-12,height:ys[r+1]-ys[r]-12};
        if(rectangle.width<10||rectangle.height<10)throw Error('INVALID_TABLE_CELL');
        const ink=findCellInkBounds(pixels!,rectangle);
        if(!ink){row.push({text:'',confidence:100,uncertainTokens:0});tableCells++;continue;}
        const cell=await worker.recognize(cropImage(ink));
        for(const word of cell.data.words){
          if(word.confidence>=85||!/^\+?\d+(?:[-–—]\d+)?$/.test(word.text))continue;
          const b=word.bbox;
          const numeric={left:Math.max(ink.left,ink.left+b.x0-8),top:Math.max(ink.top,ink.top+b.y0-8),
            width:Math.min(ink.width-b.x0+8,b.x1-b.x0+16),height:Math.min(ink.height-b.y0+8,b.y1-b.y0+16)};
          try{
            await worker.setParameters({tessedit_pageseg_mode:'7' as import('tesseract.js').PSM,tessedit_char_whitelist:'0123456789-–—+'});
            const reread=await worker.recognize(cropImage(numeric,2));
            word.confidence=confirmedNumericConfidence(word,{text:reread.data.text.trim(),confidence:reread.data.confidence});
            // Tesseract lines may hold copies rather than references to words.
            for(const line of cell.data.lines)for(const item of line.words)
              if(item.bbox.x0===b.x0&&item.bbox.y0===b.y0&&item.text===word.text)item.confidence=word.confidence;
          }finally{await worker.setParameters({tessedit_pageseg_mode:'6' as import('tesseract.js').PSM,tessedit_char_whitelist:''});}
        }
        const serialized=serializeOcrLines(cell.data.lines);
        row.push({...serialized,confidence:cell.data.confidence});
        uncertainTokens+=serialized.uncertainTokens;tableCells++;
      }
      rows.push(row);
    }
  }finally{await worker.setParameters({tessedit_pageseg_mode:'3' as import('tesseract.js').PSM,tessedit_char_whitelist:''});}
  return {text:[before.text,serializeTableCells(rows),after.text].filter(Boolean).join('\n\n'),
    uncertainTokens,confidence:result.data.confidence,tableCells};
};
