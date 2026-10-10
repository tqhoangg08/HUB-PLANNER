// Local optical experiments only. Original PDF and raw output stay outside Git.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {getDocument,OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createCanvas,ImageData} from '@napi-rs/canvas';
import {createWorker} from 'tesseract.js';
import {serializeOcrLines} from '../shared/ai-document-text-quality.ts';
const arg=n=>process.argv[process.argv.indexOf(n)+1];
async function main(){
  if(!process.argv.includes('--pdf')||!process.argv.includes('--output-dir'))throw Error('ARGUMENT_REQUIRED');
  const input=resolve(arg('--pdf')),out=resolve(arg('--output-dir'));
  for(const p of [input,out]){const r=relative(process.cwd(),p);if(!r.startsWith('..')&&!isAbsolute(r))throw Error('OUTSIDE_GIT_REQUIRED');}
  mkdirSync(out,{recursive:true});
  const source=readFileSync(input),sourceHash=createHash('sha256').update(source).digest('hex');
  if(source.length>20*1024*1024||!source.subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('INVALID_PDF');
  const pdf=await getDocument({data:new Uint8Array(source),verbosity:0}).promise;
  const best=process.argv.includes('--best');
  const worker=await createWorker(best?'vie':'vie+eng',1,{cachePath:out,cacheMethod:best?'none':'write',
    ...(best?{langPath:'https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/main',gzip:false}:{}),errorHandler:()=>{}});
  try{
    if(pdf.numPages>40)throw Error('PAGE_LIMIT');
    const pageNumber=Number(arg('--page'))||3,page=await pdf.getPage(pageNumber);
    for(const scale of process.argv.includes('--region')||process.argv.includes('--single')?[3]:[3,300/72]){
      const v=page.getViewport({scale});let canvas=createCanvas(Math.ceil(v.width),Math.ceil(v.height));
      await page.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;
      if(process.argv.includes('--native')){
        const ops=await page.getOperatorList(),ids=ops.fnArray.flatMap((n,i)=>n===OPS.paintImageXObject?[ops.argsArray[i][0]]:[]);
        if(ids.length!==1)throw Error('SINGLE_SCAN_REQUIRED');
        const scan=page.objs.get(ids[0]);
        if(scan.kind!==2&&scan.kind!==3)throw Error('UNSUPPORTED_SCAN_PIXELS');
        const data=new Uint8ClampedArray(scan.width*scan.height*4),channels=scan.kind===2?3:4;
        for(let i=0;i<scan.width*scan.height;i++){data.set(scan.data.subarray(i*channels,i*channels+3),i*4);data[i*4+3]=255;}
        canvas=createCanvas(scan.width,scan.height);canvas.getContext('2d').putImageData(new ImageData(data,scan.width,scan.height),0,0);
      }
      writeFileSync(resolve(out,`render-${scale.toFixed(2)}.png`),canvas.toBuffer('image/png'));
      for(const psm of process.argv.includes('--region')?['6']:process.argv.includes('--single')?['3']:['3','6']){
        const region=process.argv.includes('--region')?arg('--region').split(',').map(Number):null;
        const rotated=process.argv.includes('--rotate')?Number(arg('--rotate')):0;
        let image=canvas;
        if(region){
          const [x,y,w,h]=region;if(!region.every(Number.isFinite)||x<0||y<0||w<=0||h<=0||x+w>1||y+h>1)throw Error('INVALID_REGION');
          image=createCanvas(Math.ceil(canvas.width*w)+40,Math.ceil(canvas.height*h)+40);
          const c=image.getContext('2d');c.fillStyle='white';c.fillRect(0,0,image.width,image.height);
          c.translate(image.width/2,image.height/2);c.rotate(rotated*Math.PI/180);
          c.drawImage(canvas,canvas.width*x,canvas.height*y,canvas.width*w,canvas.height*h,-canvas.width*w/2,-canvas.height*h/2,canvas.width*w,canvas.height*h);
        }
        const threshold=process.argv.includes('--threshold')?Number(arg('--threshold')):null;
        if(threshold!==null){
          if(threshold<1||threshold>254)throw Error('INVALID_THRESHOLD');
          const c=image.getContext('2d'),pixels=c.getImageData(0,0,image.width,image.height);
          for(let i=0;i<pixels.data.length;i+=4){const v=(pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/3<threshold?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;}
          c.putImageData(pixels,0,0);
        }
        const started=Date.now();await worker.setParameters({tessedit_pageseg_mode:psm});
        const r=await worker.recognize(image.toBuffer('image/png'));
        let result=r.data;
        if(process.argv.includes('--lines')){
          await worker.setParameters({tessedit_pageseg_mode:'7'});
          const lines=[];
          for(const line of r.data.lines){
            const b=line.bbox,w=b.x1-b.x0,h=b.y1-b.y0,crop=createCanvas(w+30,h+30),c=crop.getContext('2d');
            c.fillStyle='white';c.fillRect(0,0,crop.width,crop.height);c.drawImage(image,b.x0,b.y0,w,h,15,15,w,h);
            const reread=await worker.recognize(crop.toBuffer('image/png'));lines.push(...reread.data.lines);
          }
          result={...result,lines,text:lines.map(l=>l.text).join('\n')};
        }
        const serialized=serializeOcrLines(result.lines);
        const key=`${process.argv.includes('--lines')?'lines-':''}${process.argv.includes('--native')?'native-':''}${best?'best-':''}${threshold===null?'':'threshold-'+threshold+'-'}${region?'region-rotate-'+rotated+'-':''}scale-${scale.toFixed(2)}-psm-${psm}`;
        if(region)writeFileSync(resolve(out,`${key}.png`),image.toBuffer('image/png'));
        writeFileSync(resolve(out,`${key}.json`),JSON.stringify({sourceHash,pageNumber,parameters:{scale,psm,region,rotated,threshold,best,native:process.argv.includes('--native'),lineReread:process.argv.includes('--lines')},
          raw:{text:result.text,lines:result.lines.map(l=>({bbox:l.bbox,words:l.words.map(w=>({text:w.text,confidence:w.confidence,bbox:w.bbox}))})),confidence:r.data.confidence},serialized}));
        console.log(JSON.stringify({key,confidence:r.data.confidence,uncertainTokens:serialized.uncertainTokens,durationMs:Date.now()-started}));
      }
    }
  }finally{await worker.terminate();await pdf.destroy();}
}
main().catch(e=>{console.log(JSON.stringify({result:'BLOCKED',safeError:/^[A-Z_]+$/.test(e.message)?e.message:e.name}));process.exitCode=1;});
