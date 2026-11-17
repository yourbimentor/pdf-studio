(()=>{'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const uid=()=>Math.random().toString(36).slice(2,9);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const NS='http://www.w3.org/2000/svg';
const PT=96/72;
const FAM={sans:'Helvetica, Arial, "Liberation Sans", sans-serif',serif:'"Times New Roman", Times, "Liberation Serif", serif',mono:'"Courier New", Courier, "Liberation Mono", monospace'};

/*EXPORT_START*/
const BF={sans:.946,serif:.938,mono:.87};
const FONTS={sans:['Helvetica','HelveticaBold','HelveticaOblique','HelveticaBoldOblique'],serif:['TimesRoman','TimesRomanBold','TimesRomanItalic','TimesRomanBoldItalic'],mono:['Courier','CourierBold','CourierOblique','CourierBoldOblique']};
function mkMap(R,b){
  const W=b.width,H=b.height;
  const f=(vx,vy)=>R===0?[b.x+vx,b.y+H-vy]:R===90?[b.x+vy,b.y+vx]:R===180?[b.x+W-vx,b.y+vy]:[b.x+W-vy,b.y+H-vx];
  return {R,f};
}
function hexRgb(h){const {rgb}=PDFLib;const n=parseInt(h.slice(1),16);return rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255)}
function inside(c,x,y){return x>=c.x&&x<=c.x+c.w&&y>=c.y&&y<=c.y+c.h}
async function drawOcrWords(doc,pg,m,words,covers){
  const {StandardFonts,degrees}=PDFLib;
  const font=await doc.embedFont(StandardFonts.Helvetica);
  for(const w of words){
    if(covers.some(c=>inside(c,w.x+w.w/2,w.y+w.h/2))) continue;
    const t=[...w.t].filter(ch=>{try{font.encodeText(ch);return true}catch(e){return false}}).join('');
    if(!t.trim()) continue;
    let sz=Math.max(2,w.h*.9);
    const w0=font.widthOfTextAtSize(t,sz);
    if(w0>0) sz=clamp(sz*w.w/w0,1,200);
    const [ux,uy]=m_f(m_cur,w.x,w.y+w.h*.8);
    pg.drawText(t,{x:ux,y:uy,size:sz,font,opacity:0,rotate:degrees(m_cur.R)});
  }
}
let m_cur=null;
function m_f(m,x,y){return m.f(x,y)}
async function buildPdfCore(o){
  const {PDFDocument,degrees,LineCapStyle}=PDFLib;
  const src=await PDFDocument.load(o.bytes,{ignoreEncryption:true,updateMetadata:false});
  const orig=src.getPages(), blanks=new Map();
  for(const p of o.pages) if(p.blank) blanks.set(p.id,src.addPage([p.base[0],p.base[1]]));
  for(let i=src.getPageCount()-1;i>=0;i--) src.removePage(i);
  const placed=[];
  o.pages.forEach((p,i)=>{const pg=p.blank?blanks.get(p.id):orig[p.src];src.insertPage(i,pg);placed.push([p,pg])});
  const fcache=new Map(), icache=new Map();
  const getFont=async(fam,b,i)=>{const k=fam+b+i;if(!fcache.has(k))fcache.set(k,await src.embedFont(PDFLib.StandardFonts[FONTS[fam][(b?1:0)+(i?2:0)]]));return fcache.get(k)};
  const getImg=async(id)=>{if(!icache.has(id)){const im=o.images.get(id);icache.set(id,im.mime==='image/jpeg'?await src.embedJpg(im.bytes):await src.embedPng(im.bytes))}return icache.get(id)};
  for(const [p,pg] of placed){
    const R=(p.baseRot+p.rot)%360;
    pg.setRotation(degrees(R));
    const m=mkMap(R,pg.getCropBox());
    const rectBox=(a)=>{const [x1,y1]=m.f(a.x,a.y),[x2,y2]=m.f(a.x+a.w,a.y+a.h);return {x:Math.min(x1,x2),y:Math.min(y1,y2),width:Math.abs(x2-x1),height:Math.abs(y2-y1)}};
    // 1) covers of edited text
    for(const a of p.annots) if(a.t==='text'&&a.cover){
      pg.drawRectangle({...rectBox(a.cover),color:hexRgb(a.cover.color),borderWidth:0});
    }
    // 2) shapes and images
    for(const a of p.annots){
      if(a.t==='text') continue;
      const col=a.stroke?hexRgb(a.stroke):undefined;
      if(a.t==='rect'){
        pg.drawRectangle({...rectBox(a),color:a.fill?hexRgb(a.fill):undefined,opacity:a.op,borderColor:col,borderWidth:a.stroke?a.sw:0,borderOpacity:a.op});
      }else if(a.t==='ellipse'){
        const [cx,cy]=m.f(a.x+a.w/2,a.y+a.h/2), odd=R%180!==0;
        pg.drawEllipse({x:cx,y:cy,xScale:(odd?a.h:a.w)/2,yScale:(odd?a.w:a.h)/2,color:a.fill?hexRgb(a.fill):undefined,opacity:a.op,borderColor:col,borderWidth:a.stroke?a.sw:0,borderOpacity:a.op});
      }else if(a.t==='line'){
        const seg=(ax,ay,bx,by)=>{const [sx,sy]=m.f(ax,ay),[ex,ey]=m.f(bx,by);pg.drawLine({start:{x:sx,y:sy},end:{x:ex,y:ey},thickness:a.sw,color:col,opacity:a.op,lineCap:LineCapStyle.Round})};
        seg(a.x1,a.y1,a.x2,a.y2);
        if(a.arrow){const th=Math.atan2(a.y2-a.y1,a.x2-a.x1),L=Math.max(8,a.sw*4);
          for(const d of [-.45,.45]) seg(a.x2,a.y2,a.x2-L*Math.cos(th+d),a.y2-L*Math.sin(th+d));}
      }else if(a.t==='pen'){
        for(let i=1;i<a.pts.length;i++){const [sx,sy]=m.f(a.pts[i-1].x,a.pts[i-1].y),[ex,ey]=m.f(a.pts[i].x,a.pts[i].y);
          pg.drawLine({start:{x:sx,y:sy},end:{x:ex,y:ey},thickness:a.sw,color:col,opacity:a.op,lineCap:LineCapStyle.Round})}
        if(a.pts.length===1){const [sx,sy]=m.f(a.pts[0].x,a.pts[0].y);pg.drawCircle({x:sx,y:sy,size:a.sw/2,color:col,opacity:a.op,borderWidth:0})}
      }else if(a.t==='image'){
        const im=await getImg(a.imgId), [ux,uy]=m.f(a.x,a.y+a.h);
        pg.drawImage(im,{x:ux,y:uy,width:a.w,height:a.h,rotate:degrees(R),opacity:a.op});
      }
    }
    // 3) text
    for(const a of p.annots){
      if(a.t!=='text'||!a.text) continue;
      const lines=a.text.split('\n'), font=await getFont(a.font,a.bold,a.italic);
      let ok=true; for(const l of lines){try{font.encodeText(l)}catch(e){ok=false;break}}
      if(ok){
        lines.forEach((l,i)=>{ if(!l) return;
          const [ux,uy]=m.f(a.x,a.y+i*a.size*1.2+BF[a.font]*a.size);
          pg.drawText(l,{x:ux,y:uy,size:a.size,font,color:hexRgb(a.color),rotate:degrees(R)});});      }else{
        const r=await o.rasterText(a), im=await src.embedPng(r.bytes), [ux,uy]=m.f(a.x,a.y+r.h);
        pg.drawImage(im,{x:ux,y:uy,width:r.w,height:r.h,rotate:degrees(R)});
      }
    }
    // 4) invisible OCR layer
    const oc=o.searchable&&o.ocr?o.ocr(p):null;
    if(oc&&oc.rot===R){
      m_cur=m;
      await drawOcrWords(src,pg,m,oc.words,p.annots.filter(a=>a.t==='text'&&a.cover).map(a=>a.cover));
    }
  }
  return await src.save();
}
/*EXPORT_END*/

// ---------- state ----------
const S={name:'document',bytes:null,pdf:null,pdfPages:new Map(),pages:[],zoom:1,tool:'edittext',sel:null,selPid:null,cur:0,
  hist:[],hi:-1,images:new Map(),editing:null,editSel:false,drag:null,visible:new Set(),searchable:true};
const rt=new Map();
const st={color:'#111111',fill:'#ffe14d',fillOn:false,size:14,sw:2,op:1,font:'sans',bold:false,italic:false,arrow:false};
const DRAW=new Set(['pen','rect','ellipse','line','highlight','whiteout']);
const stage=$('#stage'), thumbs=$('#thumbs');
let io=null, tio=null;

const R_=id=>{let r=rt.get(id);if(!r){r={tok:0};rt.set(id,r)}return r};
const getPage=id=>S.pages.find(p=>p.id===id);
const pageEl=id=>stage.querySelector('.page[data-id="'+id+'"]');
const k=()=>PT*S.zoom;
const totalRot=p=>(p.baseRot+p.rot)%360;
const viewSize=p=>totalRot(p)%180===0?[p.base[0],p.base[1]]:[p.base[1],p.base[0]];
const findAnnot=id=>{for(const p of S.pages){const a=p.annots.find(x=>x.id===id);if(a)return {p,a}}return null};

function toast(msg,err){const t=document.createElement('div');t.className='toast'+(err?' err':'');t.textContent=msg;$('#toast').append(t);setTimeout(()=>t.remove(),err?6500:3200)}
function busy(msg,pct){const m=$('#busy');if(msg===false){m.hidden=true;return}m.hidden=false;$('#busyT').textContent=msg;$('#busyBar').style.width=(pct==null?15:Math.round(pct*100))+'%'}

// ---------- history ----------
const snap=()=>JSON.stringify(S.pages.map(p=>({id:p.id,src:p.src,blank:p.blank,rot:p.rot,base:p.base,baseRot:p.baseRot,annots:p.annots})));
const sigOf=a=>a.map(p=>p.id+':'+p.rot).join(',');
function commit(){const s=snap();if(S.hist[S.hi]===s)return;S.hist=S.hist.slice(0,S.hi+1);S.hist.push(s);if(S.hist.length>80)S.hist.shift();S.hi=S.hist.length-1;updateUI()}
function restore(i){
  if(i<0||i>=S.hist.length)return;
  const arr=JSON.parse(S.hist[i]);const changed=sigOf(arr)!==sigOf(S.pages);
  S.hi=i;S.pages=arr;S.sel=null;S.editing=null;
  S.cur=clamp(S.cur,0,S.pages.length-1);
  if(changed)rebuild();else S.pages.forEach(renderOverlay);
  updateUI();
}

// ---------- opening files ----------
const isPdf=f=>f.type==='application/pdf'||/\.pdf$/i.test(f.name);
async function imageToPage(doc,file){
  const url=URL.createObjectURL(file);
  const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('Could not read image '+file.name));i.src=url});
  let bytes,emb;
  if(file.type==='image/jpeg'){bytes=new Uint8Array(await file.arrayBuffer());emb=await doc.embedJpg(bytes)}
  else{
    const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);
    const b=await new Promise(r=>c.toBlob(r,'image/png'));emb=await doc.embedPng(new Uint8Array(await b.arrayBuffer()));
  }
  URL.revokeObjectURL(url);
  const w=595.28,h=w*img.naturalHeight/img.naturalWidth;
  doc.addPage([w,h]).drawImage(emb,{x:0,y:0,width:w,height:h});
}
async function openFiles(list){
  const files=[...list];if(!files.length)return;
  if(!window.pdfjsLib||!window.PDFLib){toast('The PDF libraries failed to load. Check your connection and reload.',true);return}
  busy('Opening');
  try{
    let bytes,name=files[0].name.replace(/\.[^.]+$/,'');
    if(files.length===1&&isPdf(files[0])) bytes=new Uint8Array(await files[0].arrayBuffer());
    else{
      const out=await PDFLib.PDFDocument.create();
      for(const f of files){
        if(isPdf(f)){const d=await PDFLib.PDFDocument.load(await f.arrayBuffer(),{ignoreEncryption:true});(await out.copyPages(d,d.getPageIndices())).forEach(pg=>out.addPage(pg))}
        else if(f.type.startsWith('image/')) await imageToPage(out,f);
      }
      if(!out.getPageCount())throw new Error('No PDF or image files found.');
      if(files.length>1)name='combined';
      bytes=await out.save();
    }
    await loadDoc(bytes,name);
  }catch(e){console.error(e);toast(e&&e.message?e.message:'Could not open that file.',true)}
  finally{busy(false)}
}
async function loadDoc(bytes,name){
  const task=pdfjsLib.getDocument({data:bytes.slice(0),isEvalSupported:false});
  let pdf;
  try{pdf=await task.promise}catch(e){
    if(e&&e.name==='PasswordException')throw new Error('This PDF is password protected. Remove the password, then open it again.');
    throw new Error('This file could not be read as a PDF.');
  }
  if(S.pdf){try{S.pdf.destroy()}catch(e){}}
  S.pdf=pdf;S.bytes=bytes;S.name=name;S.pdfPages=new Map();S.pages=[];S.images=new Map();rt.clear();S.sel=null;S.editing=null;S.cur=0;
  for(let i=1;i<=pdf.numPages;i++){
    const pg=await pdf.getPage(i);S.pdfPages.set(i-1,pg);
    const v=pg.view;
    S.pages.push({id:uid(),src:i-1,blank:false,rot:0,base:[v[2]-v[0],v[3]-v[1]],baseRot:((pg.rotate%360)+360)%360,annots:[]});
    if(i%20===0)busy('Opening',i/pdf.numPages);
  }
  S.hist=[];S.hi=-1;commit();
  const maxW=Math.max(...S.pages.map(p=>viewSize(p)[0]));
  S.zoom=clamp((stage.clientWidth-44)/(maxW*PT),.3,2.5);
  $('#empty').hidden=true;rebuild();updateUI();
  toast('Opened '+pdf.numPages+(pdf.numPages===1?' page':' pages')+'. Click any line of text to edit it.');
}

// ---------- stage and rendering ----------
function layoutPage(p){
  const el=pageEl(p.id);if(!el)return;const [vw,vh]=viewSize(p),kk=k();
  const sh=$('.sheet',el);sh.style.width=vw*kk+'px';sh.style.height=vh*kk+'px';
  const ov=$('.ov',el);ov.style.width=vw+'px';ov.style.height=vh+'px';ov.style.transform='scale('+kk+')';ov.style.setProperty('--k',kk);
}
function rebuild(){
  const top=stage.scrollTop;
  if(io)io.disconnect();S.visible.clear();
  $$('.page',stage).forEach(n=>n.remove());
  io=new IntersectionObserver(es=>{for(const e of es){const id=e.target.dataset.id;
    if(e.isIntersecting){S.visible.add(id);const p=getPage(id);if(p)renderPage(p)}
    else{S.visible.delete(id);const r=R_(id);if(r.task)try{r.task.cancel()}catch(x){}r.key=null;const cv=$('canvas',e.target);if(cv){cv.width=1;cv.height=1}}}},{root:stage,rootMargin:'700px 0px'});
  const frag=document.createDocumentFragment();
  S.pages.forEach((p,i)=>{const el=document.createElement('section');el.className='page';el.dataset.id=p.id;
    el.innerHTML='<div class="sheet"><canvas></canvas><div class="ov"></div></div><div class="pgno">Page '+(i+1)+'</div>';frag.append(el)});
  stage.append(frag);
  S.pages.forEach(p=>{layoutPage(p);renderOverlay(p);io.observe(pageEl(p.id))});
  buildThumbs();stage.scrollTop=top;
}
function relayout(){S.pages.forEach(p=>{layoutPage(p);R_(p.id).key=null});S.visible.forEach(id=>{const p=getPage(id);if(p)renderPage(p)});S.pages.forEach(renderOverlay)}
async function renderPage(p){
  const el=pageEl(p.id);if(!el)return;const r=R_(p.id),cv=$('canvas',el),[vw,vh]=viewSize(p);
  const dpr=Math.min(window.devicePixelRatio||1,2);let sc=k()*dpr;
  if(vw*sc*vh*sc>16e6)sc=Math.sqrt(16e6/(vw*vh));
  const key=sc.toFixed(3)+'|'+totalRot(p);if(r.key===key)return;r.key=key;const tok=++r.tok;
  try{
    if(p.blank){cv.width=Math.round(vw*sc);cv.height=Math.round(vh*sc);const c=cv.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,cv.width,cv.height);r.hasText=true;r.lines=[];r.linesRot=totalRot(p);refreshHits(p);return}
    const pg=S.pdfPages.get(p.src),vp=pg.getViewport({scale:sc,rotation:totalRot(p)});
    const off=document.createElement('canvas');off.width=Math.round(vp.width);off.height=Math.round(vp.height);
    const task=pg.render({canvasContext:off.getContext('2d'),viewport:vp});r.task=task;await task.promise;
    if(tok!==r.tok)return;
    cv.width=off.width;cv.height=off.height;cv.getContext('2d').drawImage(off,0,0);
    await ensureLines(p);if(tok===r.tok)refreshHits(p);
  }catch(e){r.key=null;if(!(e&&e.name==='RenderingCancelledException')){console.error(e);toast('A page failed to render.',true)}}
}
function famFrom(s){s=s||'';return /mono|courier/i.test(s)?'mono':/sans/i.test(s)?'sans':/serif|times|georgia/i.test(s)?'serif':'sans'}
async function ensureLines(p){
  const r=R_(p.id),R=totalRot(p);if(r.lines&&r.linesRot===R)return;
  const pg=S.pdfPages.get(p.src),vp=pg.getViewport({scale:1,rotation:R}),tc=await pg.getTextContent();
  const items=[];let any=false;
  for(const it of tc.items){
    if(!it.str)continue;if(it.str.trim())any=true;
    const tx=pdfjsLib.Util.transform(vp.transform,it.transform),ang=Math.atan2(tx[1],tx[0]),fh=Math.hypot(tx[2],tx[3]);
    if(Math.abs(ang)>.02||fh<2||!isFinite(fh))continue;
    const sty=tc.styles[it.fontName]||{};let nm='';
    try{if(pg.commonObjs.has(it.fontName))nm=pg.commonObjs.get(it.fontName).name||''}catch(e){}
    items.push({x:tx[4],base:tx[5],w:it.width,fh,str:it.str,font:famFrom(sty.fontFamily+' '+nm),bold:/bold|black|heavy/i.test(nm),italic:/italic|oblique/i.test(nm)});
  }
  items.sort((a,b)=>a.base-b.base||a.x-b.x);
  const rows=[];
  for(const it of items){const row=rows.find(r=>Math.abs(r.base-it.base)<Math.max(it.fh,r.fh)*.3);if(row)row.items.push(it);else rows.push({base:it.base,fh:it.fh,items:[it]})}
  const lines=[];
  for(const row of rows){
    row.items.sort((a,b)=>a.x-b.x);let cur=null;
    const flush=()=>{if(cur&&cur.text.trim()){lines.push({kind:'pdf',x:cur.x,w:cur.w,y:cur.base-cur.fh*.9,h:cur.fh*1.15,base:cur.base,size:cur.fh,text:cur.text.replace(/\s+$/,''),font:cur.font,bold:cur.bold,italic:cur.italic})}};
    for(const it of row.items){
      if(cur&&it.x-(cur.x+cur.w)<cur.fh*.9&&it.x>=cur.x-cur.fh){
        const gap=it.x-(cur.x+cur.w);if(gap>cur.fh*.15&&!/\s$/.test(cur.text)&&!/^\s/.test(it.str))cur.text+=' ';
        cur.text+=it.str;cur.w=Math.max(cur.w,it.x+it.w-cur.x);cur.fh=Math.max(cur.fh,it.fh);
      }else{flush();cur={x:it.x,w:it.w,text:it.str,fh:it.fh,base:it.base,font:it.font,bold:it.bold,italic:it.italic}}
    }
    flush();
  }
  r.lines=lines;r.linesRot=R;r.hasText=any;
}
function refreshHits(p){if(S.editing&&findAnnot(S.editing)&&findAnnot(S.editing).p.id===p.id)return;renderOverlay(p);if(getPage(p.id)===S.pages[S.cur])syncInspector()}

// ---------- overlay ----------
const svgEl=(n,at)=>{const e=document.createElementNS(NS,n);for(const q in at)e.setAttribute(q,at[q]);return e};
function addHit(g,el,a,filled){
  const h=el.cloneNode(false);h.removeAttribute('opacity');h.setAttribute('fill',filled?'transparent':'none');h.setAttribute('stroke','transparent');
  h.setAttribute('stroke-width',Math.max(a.sw||0,10));h.style.pointerEvents=filled?'all':'stroke';h.setAttribute('class','hit');g.append(h);
}
function shapeEl(a){
  const g=svgEl('g',{'data-id':a.id});let v;
  const common={opacity:a.op};
  if(a.t==='rect'){v=svgEl('rect',{x:a.x,y:a.y,width:a.w,height:a.h,fill:a.fill||'none',stroke:a.stroke||'none','stroke-width':a.sw,...common});g.append(v);addHit(g,v,a,true)}
  else if(a.t==='ellipse'){v=svgEl('ellipse',{cx:a.x+a.w/2,cy:a.y+a.h/2,rx:a.w/2,ry:a.h/2,fill:a.fill||'none',stroke:a.stroke||'none','stroke-width':a.sw,...common});g.append(v);addHit(g,v,a,true)}
  else if(a.t==='line'){
    v=svgEl('line',{x1:a.x1,y1:a.y1,x2:a.x2,y2:a.y2,stroke:a.stroke,'stroke-width':a.sw,'stroke-linecap':'round',...common});g.append(v);
    if(a.arrow){const th=Math.atan2(a.y2-a.y1,a.x2-a.x1),L=Math.max(8,a.sw*4),pts=[-.45,.45].map(d=>[a.x2-L*Math.cos(th+d),a.y2-L*Math.sin(th+d)]);
      g.append(svgEl('polyline',{points:pts[0].join(',')+' '+a.x2+','+a.y2+' '+pts[1].join(','),fill:'none',stroke:a.stroke,'stroke-width':a.sw,'stroke-linecap':'round','stroke-linejoin':'round',...common}))}
    addHit(g,v,a,false);
  }
  else if(a.t==='pen'){v=svgEl('polyline',{points:a.pts.map(q=>q.x+','+q.y).join(' '),fill:'none',stroke:a.stroke,'stroke-width':a.sw,'stroke-linecap':'round','stroke-linejoin':'round',...common});g.append(v);addHit(g,v,a,false)}
  else if(a.t==='image'){const im=S.images.get(a.imgId);v=svgEl('image',{x:a.x,y:a.y,width:a.w,height:a.h,preserveAspectRatio:'none',...common});v.setAttribute('href',im?im.url:'');g.append(v);
    const h=svgEl('rect',{x:a.x,y:a.y,width:a.w,height:a.h,fill:'transparent',class:'hit'});h.style.pointerEvents='all';g.append(h)}
  return g;
}
function textEl(a){
  const d=document.createElement('div');d.className='t';d.dataset.id=a.id;d.textContent=a.text;
  Object.assign(d.style,{left:a.x+'px',top:a.y+'px',fontSize:a.size+'px',color:a.color,fontFamily:FAM[a.font],fontWeight:a.bold?700:400,fontStyle:a.italic?'italic':'normal'});  return d;
}
function bboxOf(a,ov){
  if(a.t==='text'){const el=$('.t[data-id="'+a.id+'"]',ov);return {x:a.x,y:a.y,w:el?el.offsetWidth:20,h:el?el.offsetHeight:a.size*1.2}}
  if(a.t==='line'){return {x:Math.min(a.x1,a.x2),y:Math.min(a.y1,a.y2),w:Math.abs(a.x2-a.x1),h:Math.abs(a.y2-a.y1)}}
  if(a.t==='pen'){const xs=a.pts.map(q=>q.x),ys=a.pts.map(q=>q.y),x=Math.min(...xs),y=Math.min(...ys);return {x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y}}
  return {x:a.x,y:a.y,w:a.w,h:a.h};
}
function renderOverlay(p){
  const el=pageEl(p.id);if(!el)return;const ov=$('.ov',el),[vw,vh]=viewSize(p);
  if(S.editing){const q=$('.t.editing',ov);if(q){const f=findAnnot(q.dataset.id);if(f)f.a.text=q.innerText.replace(/ /g,' ').replace(/\n$/,'')}}
  ov.innerHTML='';
  for(const a of p.annots)if(a.t==='text'&&a.cover){const c=document.createElement('div');c.className='cover';c.dataset.id=a.id;
    Object.assign(c.style,{left:a.cover.x+'px',top:a.cover.y+'px',width:a.cover.w+'px',height:a.cover.h+'px',background:a.cover.color});ov.append(c)}
  const svg=svgEl('svg',{viewBox:'0 0 '+vw+' '+vh,width:vw,height:vh});
  for(const a of p.annots)if(a.t!=='text')svg.append(shapeEl(a));
  ov.append(svg);
  for(const a of p.annots)if(a.t==='text')ov.append(textEl(a));
  // clickable lines (pdf text and OCR text)
  const r=R_(p.id),R=totalRot(p),all=[];
  if(r.lines&&r.linesRot===R)all.push(...r.lines);
  if(r.ocr&&r.ocrRot===R)all.push(...r.ocr);
  r.all=all;
  const covers=p.annots.filter(a=>a.t==='text'&&a.cover).map(a=>a.cover);
  all.forEach((ln,i)=>{if(covers.some(c=>inside(c,ln.x+ln.w/2,ln.y+ln.h/2)))return;
    const h=document.createElement('div');h.className='hit';h.dataset.li=i;
    Object.assign(h.style,{left:(ln.x-1)+'px',top:ln.y+'px',width:(ln.w+2)+'px',height:ln.h+'px'});ov.append(h)});
  if(S.sel){const f=findAnnot(S.sel);if(f&&f.p.id===p.id)addSelection(ov,f.a)}
  if(S.editing){const f=findAnnot(S.editing);if(f&&f.p.id===p.id)startEdit(S.editing,false)}
}
function addSelection(ov,a){
  const b=bboxOf(a,ov),pad=2;
  const box=document.createElement('div');box.className='selbox';
  Object.assign(box.style,{left:b.x-pad+'px',top:b.y-pad+'px',width:b.w+pad*2+'px',height:b.h+pad*2+'px'});ov.append(box);
  const hs=10/k();
  const mk=(which,x,y)=>{const h=document.createElement('div');h.className='handle';h.dataset.which=which;h.dataset.aid=a.id;
    Object.assign(h.style,{left:x-hs/2+'px',top:y-hs/2+'px',width:hs+'px',height:hs+'px'});ov.append(h)};
  if(a.t==='rect'||a.t==='ellipse'||a.t==='image')mk('se',a.x+a.w,a.y+a.h);
  if(a.t==='line'){mk('p1',a.x1,a.y1);mk('p2',a.x2,a.y2)}
}

// ---------- selection and editing ----------
function select(id){
  const prev=S.selPid;S.sel=id;const f=id?findAnnot(id):null;S.selPid=f?f.p.id:null;
  if(f)S.cur=S.pages.indexOf(f.p);
  [prev,S.selPid].filter((v,i,a)=>v&&a.indexOf(v)===i).forEach(pid=>{const p=getPage(pid);if(p)renderOverlay(p)});
  updateUI();
}
function startEdit(id,selAll){
  const f=findAnnot(id);if(!f)return;const el=$('.t[data-id="'+id+'"]',pageEl(f.p.id));if(!el)return;
  S.editing=id;el.contentEditable='plaintext-only';if(el.contentEditable!=='plaintext-only')el.contentEditable='true';
  el.classList.add('editing');el.focus();
  const rg=document.createRange();rg.selectNodeContents(el);if(!selAll)rg.collapse(false);
  const sl=getSelection();sl.removeAllRanges();sl.addRange(rg);
}
function finishEdit(el){
  if(!el.isConnected)return;const id=el.dataset.id,f=findAnnot(id);S.editing=null;if(!f)return;
  const txt=el.innerText.replace(/ /g,' ').replace(/\n$/,''),a=f.a;
  if(a.orig!==undefined&&txt===a.orig){f.p.annots=f.p.annots.filter(x=>x!==a);S.sel=null}
  else if(!txt.trim()&&!a.cover){f.p.annots=f.p.annots.filter(x=>x!==a);S.sel=null}
  else a.text=txt;
  commit();renderOverlay(f.p);updateUI();
}
function sampleColors(p,ln){
  const cv=$('canvas',pageEl(p.id)),def={bg:'#ffffff',fg:'#000000'};if(!cv||cv.width<4)return def;
  const s=cv.width/viewSize(p)[0],x=Math.max(0,Math.floor(ln.x*s)),y=Math.max(0,Math.floor(ln.y*s));
  const w=Math.min(cv.width-x,Math.ceil(ln.w*s)),h=Math.min(cv.height-y,Math.ceil(ln.h*s));if(w<2||h<2)return def;
  let d;try{d=cv.getContext('2d').getImageData(x,y,w,h).data}catch(e){return def}
  const bins=new Map();
  for(let i=0;i<d.length;i+=4){const key=((d[i]>>4)<<8)|((d[i+1]>>4)<<4)|(d[i+2]>>4);let b=bins.get(key);if(!b){b=[0,0,0,0];bins.set(key,b)}b[0]++;b[1]+=d[i];b[2]+=d[i+1];b[3]+=d[i+2]}
  let best=null;for(const b of bins.values())if(!best||b[0]>best[0])best=b;
  const bg=[best[1]/best[0],best[2]/best[0],best[3]/best[0]];
  let mx=0;const dist=(i)=>{const a=d[i]-bg[0],b=d[i+1]-bg[1],c=d[i+2]-bg[2];return a*a+b*b+c*c};
  for(let i=0;i<d.length;i+=4)mx=Math.max(mx,dist(i));
  const hex=c=>'#'+c.map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('');
  let fg;
  if(mx<1600)fg=(bg[0]+bg[1]+bg[2])/3>140?[0,0,0]:[255,255,255];
  else{let n=0,sr=0,sg=0,sb=0;for(let i=0;i<d.length;i+=4)if(dist(i)>=mx*.75){n++;sr+=d[i];sg+=d[i+1];sb+=d[i+2]}fg=[sr/n,sg/n,sb/n]}
  return {bg:hex(bg),fg:hex(fg)};
}
function startLineEdit(p,ln){
  const {bg,fg}=sampleColors(p,ln),isOcr=ln.kind==='ocr',size=Math.round(ln.size*10)/10;
  const a={id:uid(),t:'text',text:ln.text,orig:ln.text,size,color:fg,font:ln.font,bold:ln.bold,italic:ln.italic,x:ln.x,
    y:isOcr?ln.y-size*.14:ln.base-BF[ln.font]*size,cover:{x:ln.x-1.5,y:ln.y-1,w:ln.w+3,h:ln.h+2,color:bg}};
  p.annots.push(a);S.sel=a.id;S.selPid=p.id;S.editing=a.id;S.cur=S.pages.indexOf(p);
  renderOverlay(p);startEdit(a.id,true);updateUI();
}
function addText(p,pt){
  const a={id:uid(),t:'text',text:'',size:st.size,color:st.color,font:st.font,bold:st.bold,italic:st.italic,x:pt.x,y:pt.y-st.size*.6,cover:null};
  p.annots.push(a);S.sel=a.id;S.selPid=p.id;S.editing=a.id;renderOverlay(p);startEdit(a.id,false);updateUI();
}

// ---------- pointer interaction ----------
function ptr(e,pid){const ov=$('.ov',pageEl(pid)),r=ov.getBoundingClientRect();return {x:(e.clientX-r.left)/k(),y:(e.clientY-r.top)/k()}}
stage.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  const ovEl=e.target.closest('.ov');
  if(!ovEl){if(!e.target.closest('.page')&&S.sel)select(null);return}
  const p=getPage(ovEl.closest('.page').dataset.id);if(!p)return;S.cur=S.pages.indexOf(p);
  const t=S.tool,handle=e.target.closest('.handle');
  if(handle){e.preventDefault();const f=findAnnot(handle.dataset.aid);if(f)S.drag={kind:'handle',pid:p.id,id:f.a.id,which:handle.dataset.which,orig:JSON.parse(JSON.stringify(f.a)),moved:false};return}
  const hit=e.target.closest('.hit');
  if(t==='edittext'&&hit&&hit.dataset.li!=null){e.preventDefault();const ln=R_(p.id).all[+hit.dataset.li];if(ln)startLineEdit(p,ln);return}
  const tg=e.target.closest('[data-id]');
  if(['select','edittext','text'].includes(t)&&tg&&ovEl.contains(tg)){
    const id=tg.dataset.id;if(S.editing===id)return;
    e.preventDefault();select(id);const f=findAnnot(id);
    if(f)S.drag={kind:'move',pid:p.id,id,sx:e.clientX,sy:e.clientY,orig:JSON.parse(JSON.stringify(f.a)),moved:false};return;
  }
  if(t==='text'){e.preventDefault();if(S.editing){const q=$('.t.editing');if(q)q.blur()}addText(p,ptr(e,p.id));return}
  if(DRAW.has(t)){e.preventDefault();startDraw(e,p);return}
  if(S.sel)select(null);
});
function startDraw(e,p){
  const pt=ptr(e,p.id),t=S.tool,id=uid();let a;
  if(t==='pen')a={id,t:'pen',pts:[pt],stroke:st.color,sw:st.sw||2,op:st.op};
  else if(t==='line')a={id,t:'line',x1:pt.x,y1:pt.y,x2:pt.x,y2:pt.y,stroke:st.color,sw:st.sw||2,op:st.op,arrow:st.arrow};
  else if(t==='rect'||t==='ellipse')a={id,t,x:pt.x,y:pt.y,w:0,h:0,stroke:st.color,fill:st.fillOn?st.fill:null,sw:st.sw,op:st.op};
  else if(t==='highlight')a={id,t:'rect',x:pt.x,y:pt.y,w:0,h:0,stroke:null,fill:'#ffe14d',sw:0,op:.4};
  else a={id,t:'rect',x:pt.x,y:pt.y,w:0,h:0,stroke:null,fill:'#ffffff',sw:0,op:1};
  p.annots.push(a);S.drag={kind:'draw',pid:p.id,id,sx:pt.x,sy:pt.y,tool:t};
}
let raf=0;
window.addEventListener('pointermove',e=>{
  const d=S.drag;if(!d)return;const p=getPage(d.pid),f=findAnnot(d.id);if(!p||!f)return;const a=f.a;
  if(d.kind==='move'){const dx=(e.clientX-d.sx)/k(),dy=(e.clientY-d.sy)/k();if(!d.moved&&Math.hypot(dx,dy)*k()<3)return;d.moved=true;
    const o=d.orig;if(a.t==='line'){a.x1=o.x1+dx;a.y1=o.y1+dy;a.x2=o.x2+dx;a.y2=o.y2+dy}else if(a.t==='pen')a.pts=o.pts.map(q=>({x:q.x+dx,y:q.y+dy}));else{a.x=o.x+dx;a.y=o.y+dy}}
  else if(d.kind==='handle'){const pt=ptr(e,d.pid);d.moved=true;
    if(d.which==='p1'){a.x1=pt.x;a.y1=pt.y}else if(d.which==='p2'){a.x2=pt.x;a.y2=pt.y}
    else{a.w=Math.max(4,pt.x-a.x);a.h=a.t==='image'?a.w*d.orig.h/d.orig.w:Math.max(4,pt.y-a.y)}}
  else if(d.kind==='draw'){const pt=ptr(e,d.pid);d.moved=true;
    if(a.t==='pen'){const l=a.pts[a.pts.length-1];if(Math.hypot(pt.x-l.x,pt.y-l.y)>.7)a.pts.push(pt)}
    else if(a.t==='line'){let x=pt.x,y=pt.y;if(e.shiftKey){const dx=x-a.x1,dy=y-a.y1;if(Math.abs(dx)>Math.abs(dy))y=a.y1;else x=a.x1}a.x2=x;a.y2=y}
    else{a.x=Math.min(d.sx,pt.x);a.y=Math.min(d.sy,pt.y);a.w=Math.abs(pt.x-d.sx);a.h=Math.abs(pt.y-d.sy)}}
  if(!raf)raf=requestAnimationFrame(()=>{raf=0;const q=getPage(d.pid);if(q)renderOverlay(q)});
});
window.addEventListener('pointerup',()=>{
  const d=S.drag;if(!d)return;S.drag=null;const p=getPage(d.pid),f=findAnnot(d.id);if(!p||!f)return;const a=f.a;
  if(d.kind==='draw'){
    const tiny=(a.t==='rect'||a.t==='ellipse')?(a.w<3||a.h<3):a.t==='line'?Math.hypot(a.x2-a.x1,a.y2-a.y1)<3:false;
    if(tiny||!d.moved&&a.t!=='pen'){p.annots=p.annots.filter(x=>x!==a)}
    else commit();
  }else if(d.moved)commit();
  renderOverlay(p);updateUI();
});
stage.addEventListener('dblclick',e=>{const el=e.target.closest('.t[data-id]');if(el&&!S.editing){select(el.dataset.id);S.editing=el.dataset.id;startEdit(el.dataset.id,false)}});
stage.addEventListener('focusout',e=>{if(e.target.matches&&e.target.matches('.t.editing'))finishEdit(e.target)});
stage.addEventListener('scroll',()=>{
  if(stage._s)return;stage._s=requestAnimationFrame(()=>{stage._s=0;
    const mid=stage.getBoundingClientRect().top+stage.clientHeight/2;let best=0,bd=1e9;
    S.pages.forEach((p,i)=>{const el=pageEl(p.id);if(!el)return;const r=el.getBoundingClientRect(),d=Math.abs((r.top+r.bottom)/2-mid)+(r.top<=mid&&r.bottom>=mid?-1e6:0);if(d<bd){bd=d;best=i}});
    if(best!==S.cur){S.cur=best;updateUI()}});
});
stage.addEventListener('wheel',e=>{if(e.ctrlKey){e.preventDefault();setZoom(S.zoom*(e.deltaY<0?1.1:1/1.1))}},{passive:false});

// ---------- thumbnails ----------
function buildThumbs(){
  if(tio)tio.disconnect();thumbs.innerHTML='';
  tio=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)renderThumb(e.target)}),{root:thumbs,rootMargin:'300px 0px'});
  S.pages.forEach((p,i)=>{const d=document.createElement('div');d.className='th';d.draggable=true;d.dataset.id=p.id;d.innerHTML='<canvas></canvas><span>'+(i+1)+'</span>';thumbs.append(d);tio.observe(d)});
  updateUI();
}
async function renderThumb(d){
  const p=getPage(d.dataset.id);if(!p)return;const key=totalRot(p)+'|'+p.blank;if(d.dataset.k===key)return;d.dataset.k=key;
  const cv=$('canvas',d),[vw,vh]=viewSize(p),w=120*Math.min(devicePixelRatio||1,2);
  try{
    if(p.blank){cv.width=w;cv.height=Math.round(w*vh/vw);const c=cv.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,cv.width,cv.height);return}
    const pg=S.pdfPages.get(p.src),vp=pg.getViewport({scale:w/vw,rotation:totalRot(p)});
    const off=document.createElement('canvas');off.width=Math.round(vp.width);off.height=Math.round(vp.height);
    await pg.render({canvasContext:off.getContext('2d'),viewport:vp}).promise;cv.width=off.width;cv.height=off.height;cv.getContext('2d').drawImage(off,0,0);
  }catch(e){d.dataset.k=''}
}
thumbs.addEventListener('click',e=>{const t=e.target.closest('.th');if(!t)return;const el=pageEl(t.dataset.id);if(el){stage.scrollTo({top:el.offsetTop-stage.offsetTop-12,behavior:'smooth'});S.cur=S.pages.findIndex(p=>p.id===t.dataset.id);updateUI();thumbs.classList.remove('show')}});
thumbs.addEventListener('dragstart',e=>{const t=e.target.closest('.th');if(!t)return;S.dragId=t.dataset.id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',t.dataset.id)});
thumbs.addEventListener('dragover',e=>{if(!S.dragId)return;e.preventDefault();$$('.th.over',thumbs).forEach(x=>x.classList.remove('over'));const t=e.target.closest('.th');if(t)t.classList.add('over')});
thumbs.addEventListener('dragend',()=>{S.dragId=null;$$('.th.over',thumbs).forEach(x=>x.classList.remove('over'))});
thumbs.addEventListener('drop',e=>{e.preventDefault();const t=e.target.closest('.th');if(!t||!S.dragId)return;
  const from=S.pages.findIndex(p=>p.id===S.dragId),to=S.pages.findIndex(p=>p.id===t.dataset.id);S.dragId=null;if(from<0||to<0||from===to)return;
  const [m]=S.pages.splice(from,1);S.pages.splice(to,0,m);S.cur=to;commit();rebuild()});

// ---------- page operations ----------
const curP=()=>S.pages[S.cur]||S.pages[0];
function rotate(dir){const p=curP();if(!p)return;
  if(p.annots.length){toast('Rotate a page before editing it, or delete its edits first.',true);return}
  p.rot=(p.rot+dir+360)%360;commit();rebuild()}
function movePage(d){const i=S.cur,j=i+d;if(!S.pages.length||j<0||j>=S.pages.length)return;const [m]=S.pages.splice(i,1);S.pages.splice(j,0,m);S.cur=j;commit();rebuild()}
function addPage(){const p=curP();if(!p)return;const [w,h]=viewSize(p);
  S.pages.splice(S.cur+1,0,{id:uid(),src:null,blank:true,rot:0,base:[w,h],baseRot:0,annots:[]});S.cur++;commit();rebuild();
  const el=pageEl(S.pages[S.cur].id);if(el)stage.scrollTo({top:el.offsetTop-stage.offsetTop-12})}
function delPage(){if(S.pages.length<2){toast('A document needs at least one page.',true);return}
  S.pages.splice(S.cur,1);S.cur=Math.min(S.cur,S.pages.length-1);S.sel=null;commit();rebuild()}
function setZoom(z){S.zoom=clamp(z,.25,4);relayout();updateUI()}

// ---------- images ----------
$('#imgIn').addEventListener('change',async e=>{
  const f=e.target.files[0];e.target.value='';if(!f||!S.pages.length)return;
  try{
    const url=URL.createObjectURL(f);const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('Could not read that image.'));i.src=url});
    let bytes,mime,dataUrl;
    if(f.type==='image/png'||f.type==='image/jpeg'){bytes=new Uint8Array(await f.arrayBuffer());mime=f.type;dataUrl=url}
    else{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);
      const b=await new Promise(r=>c.toBlob(r,'image/png'));bytes=new Uint8Array(await b.arrayBuffer());mime='image/png';dataUrl=URL.createObjectURL(b)}
    const imgId=uid();S.images.set(imgId,{url:dataUrl,bytes,mime});
    const p=curP(),[vw,vh]=viewSize(p);let w=img.naturalWidth*.75,h=img.naturalHeight*.75;const sc=Math.min(1,vw*.4/w,vh*.4/h);w*=sc;h*=sc;
    const a={id:uid(),t:'image',imgId,x:(vw-w)/2,y:(vh-h)/2,w,h,op:1};p.annots.push(a);commit();select(a.id);setTool('select');
    const el=pageEl(p.id);if(el)el.scrollIntoView({block:'nearest'});
  }catch(err){toast(err.message,true)}
});

// ---------- OCR ----------
let worker=null,workerLang='',ocrAbort=null;
function withTimeout(pr,ms,msg){return Promise.race([pr,new Promise((_,rej)=>setTimeout(()=>rej(new Error(msg)),ms))])}
// OCR engine files live in vendor/tesseract. English and Hindi data are bundled;
// any other language is fetched on first use from the public tessdata host.
const BUNDLED_LANGS=['eng','hin'];
const LOCAL_BASE=new URL('vendor/tesseract/',document.baseURI).href;
const REMOTE_LANGS='https://tessdata.projectnaptha.com/4.0.0_best_int';
async function getWorker(lang,log){
  if(typeof Tesseract==='undefined')throw new Error('The OCR engine could not be loaded. Check that vendor/tesseract/ is present.');
  if(worker&&workerLang===lang){S.ocrLog=log;return worker}
  if(worker){try{await worker.terminate()}catch(e){}worker=null}
  S.ocrLog=log;
  const allLocal=lang.split('+').every(c=>BUNDLED_LANGS.includes(c));
  const opts={logger:m=>S.ocrLog&&S.ocrLog(m),workerPath:LOCAL_BASE+'worker.min.js',corePath:LOCAL_BASE+'core',langPath:allLocal?LOCAL_BASE+'lang':REMOTE_LANGS,workerBlobURL:false};
  worker=await withTimeout(Tesseract.createWorker(lang,1,opts),120000,'The OCR engine did not start. If you opened index.html directly from disk, serve the folder over http instead (see README).');
  workerLang=lang;return worker;
}
async function ocrCanvas(p,enhance){
  const [vw,vh]=viewSize(p),sc=Math.min(3,4200/Math.max(vw,vh)),pg=S.pdfPages.get(p.src),vp=pg.getViewport({scale:sc,rotation:totalRot(p)});
  const cv=document.createElement('canvas');cv.width=Math.round(vp.width);cv.height=Math.round(vp.height);
  await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
  if(enhance){
    const c=cv.getContext('2d'),im=c.getImageData(0,0,cv.width,cv.height),d=im.data,hist=new Uint32Array(256);
    for(let i=0;i<d.length;i+=4){const g=(d[i]*.299+d[i+1]*.587+d[i+2]*.114)|0;d[i]=d[i+1]=d[i+2]=g;hist[g]++}
    const tot=cv.width*cv.height;let lo=0,hi=255,acc=0;
    for(let i=0;i<256;i++){acc+=hist[i];if(acc>=tot*.02){lo=i;break}}acc=0;
    for(let i=255;i>=0;i--){acc+=hist[i];if(acc>=tot*.1){hi=i;break}}
    if(hi-lo>20){const f=255/(hi-lo);for(let i=0;i<d.length;i+=4){const v=clamp((d[i]-lo)*f,0,255);d[i]=d[i+1]=d[i+2]=v}}
    c.putImageData(im,0,0);
  }
  return {cv,sc};
}
function ocrLines(data,sc){
  let ls=data.lines;if(!ls||!ls.length){ls=[];for(const b of data.blocks||[])for(const pa of b.paragraphs||[])for(const l of pa.lines||[])ls.push(l)}
  const out=[];
  for(const l of ls){
    const text=(l.text||'').replace(/\s+$/,'');if(!text.trim()||(l.confidence!=null&&l.confidence<25))continue;
    const b=l.bbox,x=b.x0/sc,y=b.y0/sc,w=(b.x1-b.x0)/sc,h=(b.y1-b.y0)/sc;if(w<2||h<3)continue;
    const words=(l.words||[]).filter(q=>q.text&&q.text.trim()).map(q=>({t:q.text,x:q.bbox.x0/sc,y:q.bbox.y0/sc,w:(q.bbox.x1-q.bbox.x0)/sc,h:(q.bbox.y1-q.bbox.y0)/sc}));
    out.push({kind:'ocr',x,y,w,h,base:y+h*.8,size:clamp(h,6,90),text,font:'sans',bold:false,italic:false,words});
  }
  return out;
}
function openOcr(){if(!S.pages.length){toast('Open a file first.',true);return}$('#ocrProg').hidden=true;$('#ocrGo').disabled=false;$('#ocrModal').hidden=false}
async function runOcr(){
  const lang0=$('#ocrLang').value,lang=lang0==='eng'?'eng':lang0+'+eng',scope=$('#ocrScope').value,enh=$('#ocrEnhance').checked;
  S.searchable=$('#ocrSearchable').checked;
  let targets=scope==='all'?S.pages.slice():scope==='scanned'?S.pages.filter(p=>!p.blank&&R_(p.id).hasText===false):[curP()];
  targets=targets.filter(p=>!p.blank);
  if(!targets.length){toast(scope==='scanned'?'No pages without a text layer were found yet. Scroll through the document first, or pick All pages.':'Nothing to recognize on this page.',true);return}
  const prog=$('#ocrProg'),bar=$('#ocrBar'),msg=$('#ocrMsg');prog.hidden=false;$('#ocrGo').disabled=true;
  let aborted=false,abortRej;const abortP=new Promise((_,rej)=>{abortRej=rej});ocrAbort=()=>{aborted=true;abortRej(new Error('cancelled'))};
  abortP.catch(()=>{});
  try{
    msg.textContent='Starting the OCR engine...';bar.style.width='4%';
    const w=await Promise.race([getWorker(lang,m=>{if(m.status&&!/recogni/.test(m.status))msg.textContent=m.status.replace(/^./,c=>c.toUpperCase())+'...'}),abortP]);
    let found=0;
    for(let i=0;i<targets.length;i++){
      const p=targets[i];msg.textContent='Reading page '+(S.pages.indexOf(p)+1)+' ('+(i+1)+' of '+targets.length+')';
      S.ocrLog=m=>{if(m.status==='recognizing text')bar.style.width=Math.round(((i+m.progress)/targets.length)*100)+'%'};
      const {cv,sc}=await ocrCanvas(p,enh);
      const {data}=await Promise.race([w.recognize(cv),abortP]);
      const r=R_(p.id);r.ocr=ocrLines(data,sc);r.ocrRot=totalRot(p);found+=r.ocr.length;renderOverlay(p);
    }
    bar.style.width='100%';
    toast(found?'Found '+found+' lines of text. Use Edit text and click any line to rewrite it.':'No text was found. Try a different language or turn on contrast boost.',!found);
    S.tool==='edittext'||setTool('edittext');$('#ocrModal').hidden=true;
  }catch(e){
    if(aborted){try{await worker.terminate()}catch(x){}worker=null;msg.textContent='Cancelled.'}
    else{console.error(e);msg.textContent=e.message||'OCR failed.';toast(e.message||'OCR failed.',true)}
  }finally{ocrAbort=null;$('#ocrGo').disabled=false;updateUI()}
}
$('#btnOcr').onclick=openOcr;$('#ocrGo').onclick=runOcr;
$('#ocrCancel').onclick=()=>{if(ocrAbort)ocrAbort();$('#ocrModal').hidden=true};

// ---------- export ----------
async function rasterText(a){
  const s=4,c=document.createElement('canvas'),x=c.getContext('2d'),lines=a.text.split('\n'),lh=a.size*1.2;
  const f=(a.italic?'italic ':'')+(a.bold?'700 ':'400 ')+(a.size*s)+'px '+FAM[a.font];x.font=f;
  const w=Math.max(4,...lines.map(l=>x.measureText(l).width/s)),h=lh*lines.length;
  c.width=Math.ceil(w*s)+4;c.height=Math.ceil(h*s)+4;x.font=f;x.fillStyle=a.color;x.textBaseline='alphabetic';
  lines.forEach((l,i)=>x.fillText(l,0,(i*lh+BF[a.font]*a.size)*s));
  const b=await new Promise(r=>c.toBlob(r,'image/png'));return {bytes:new Uint8Array(await b.arrayBuffer()),w:c.width/s,h:c.height/s};
}
function ocrFor(p){const r=rt.get(p.id);if(!r||!r.ocr||!r.ocr.length||r.ocrRot!==totalRot(p))return null;return {rot:r.ocrRot,words:r.ocr.flatMap(l=>l.words)}}
async function flatten(bytes,searchable,pages){
  const tmp=await pdfjsLib.getDocument({data:bytes.slice(0),isEvalSupported:false}).promise,out=await PDFLib.PDFDocument.create();
  for(let i=1;i<=tmp.numPages;i++){
    busy('Flattening pages',i/tmp.numPages);
    const pg=await tmp.getPage(i),v1=pg.getViewport({scale:1}),vp=pg.getViewport({scale:200/72}),cv=document.createElement('canvas');
    cv.width=Math.round(vp.width);cv.height=Math.round(vp.height);
    await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
    const b=await new Promise(r=>cv.toBlob(r,'image/jpeg',.86)),im=await out.embedJpg(new Uint8Array(await b.arrayBuffer()));
    const page=out.addPage([v1.width,v1.height]);page.drawImage(im,{x:0,y:0,width:v1.width,height:v1.height});
    const p=pages[i-1],oc=searchable&&p?ocrFor(p):null;
    if(oc){m_cur=mkMap(0,{x:0,y:0,width:v1.width,height:v1.height});await drawOcrWords(out,page,m_cur,oc.words,p.annots.filter(a=>a.t==='text'&&a.cover).map(a=>a.cover))}
  }
  await tmp.destroy();return await out.save();
}
function saveFile(bytes,filename){
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);toast('Exported '+filename);
}
function openExport(){
  if(!S.pages.length){toast('Open a file first.',true);return}
  $('#expName').value=S.name+'-edited.pdf';$('#expSearch').checked=S.searchable;$('#expFlat').checked=false;$('#exportModal').hidden=false;
}
async function doExport(){
  let name=$('#expName').value.trim()||'edited.pdf';if(!/\.pdf$/i.test(name))name+='.pdf';
  const searchable=$('#expSearch').checked,flat=$('#expFlat').checked;$('#exportModal').hidden=true;busy('Building PDF');
  try{
    const q=S.editing?$('.t.editing'):null;if(q)q.blur();
    let bytes=await buildPdfCore({bytes:S.bytes,pages:S.pages,images:S.images,searchable,ocr:ocrFor,rasterText});
    if(flat)bytes=await flatten(bytes,searchable,S.pages);
    busy(false);await saveFile(bytes,name);
  }catch(e){console.error(e);busy(false);toast('Export failed: '+(e&&e.message||e),true)}
}
$('#btnExport').onclick=openExport;$('#expCancel').onclick=()=>{$('#exportModal').hidden=true};$('#expGo').onclick=doExport;

// ---------- inspector ----------
const TOOLKIND={edittext:'text',text:'text',highlight:'rect',whiteout:'rect',rect:'rect',ellipse:'ellipse',line:'line',pen:'pen'};
const TOOLNAME={select:'Select',edittext:'Edit text',text:'Add text',highlight:'Highlight',pen:'Draw',rect:'Box',ellipse:'Ellipse',line:'Line',whiteout:'Whiteout'};
const TOOLHINT={select:'Click an object to move or style it. Drag the square handle to resize.',edittext:'Hover a line of text and click it to rewrite it. Works on scanned pages after OCR.',text:'Click anywhere on the page and type.',highlight:'Drag across text to highlight it.',pen:'Draw freehand. Good for signatures.',rect:'Drag to draw a box.',ellipse:'Drag to draw an ellipse.',line:'Drag to draw a line. Hold Shift to keep it straight.',whiteout:'Drag over anything to hide it.'};
function selAnnot(){return S.sel?(findAnnot(S.sel)||{}).a:null}
function syncInspector(){
  const a=selAnnot();let kind=a?(a.t==='rect'&&!a.stroke&&a.fill?'whiteout-ish':a.t):TOOLKIND[S.tool]||'';
  const vis=kind==='whiteout-ish'?'rect':kind;
  $('#inspTitle').textContent=a?'Selected '+({text:'text',rect:'box',ellipse:'ellipse',line:'line',pen:'drawing',image:'image'}[a.t]||'object'):TOOLNAME[S.tool];
  $('#inspHint').textContent=a?'Change its style below. Press Delete to remove it.':TOOLHINT[S.tool];
  $$('[data-for]',$('#insp')).forEach(n=>{const ks=n.dataset.for.split(' ');n.hidden=!(ks.includes(vis)||(n.tagName==='P'&&!a&&ks.includes(S.tool)))});
  const src=a||st;
  const col=a?(a.t==='text'?a.color:a.stroke):st.color;$('#pColor').value=col||'#111111';
  const fill=a?a.fill:(st.fillOn?st.fill:null);$('#pFillOn').checked=!!fill;$('#pFill').value=(a?a.fill:st.fill)||st.fill;
  $('#pFont').value=src.font||'sans';$('#pBold').checked=!!src.bold;$('#pItalic').checked=!!src.italic;
  $('#pSize').value=src.size||14;$('#oSize').textContent=Math.round(src.size||14);  $('#pWidth').value=a?a.sw||0:st.sw;$('#oWidth').textContent=a?a.sw||0:st.sw;
  {const op=Math.round((a?(a.op==null?1:a.op):st.op)*100);$('#pOp').value=op;$('#oOp').textContent=op}
  $('#pArrow').checked=!!src.arrow;$('#btnDelSel').hidden=!a;
  // page note
  const p=curP(),n=$('#pageNote');
  if(!p||p.blank){n.hidden=true;return}
  const r=R_(p.id),R=totalRot(p);
  if(r.ocr&&r.ocr.length&&r.ocrRot===R){n.hidden=false;n.className='note ok';n.textContent='OCR text is ready on this page ('+r.ocr.length+' lines). Use Edit text and click a line.'}
  else if(r.ocr&&r.ocrRot!==R){n.hidden=false;n.className='note warn';n.innerHTML='';n.append('This page was rotated after OCR. Run OCR again.');}
  else if(r.hasText===false){n.hidden=false;n.className='note warn';n.innerHTML='';const s=document.createElement('span');s.textContent='This page has no text layer, so it looks like a scan.';const b=document.createElement('button');b.className='btn primary';b.textContent='Run OCR on this page';b.onclick=()=>{$('#ocrScope').value='cur';openOcr()};n.append(s,b)}
  else n.hidden=true;
}
function applyProp(fn,final){
  const a=selAnnot();fn(st);if(a){fn(a);const f=findAnnot(a.id);renderOverlay(f.p)}
  if(final&&a)commit();syncInspector();
}
const bind=(id,ev,fn)=>$(id).addEventListener(ev,e=>fn(e));
bind('#pColor','input',e=>{const v=e.target.value;applyProp(o=>{if(o.t==='text')o.color=v;else if(o.t){o.stroke=v;if(!o.sw)o.sw=2}else st.color=v})});
bind('#pColor','change',()=>{if(selAnnot())commit()});
bind('#pFillOn','change',e=>{const on=e.target.checked,c=$('#pFill').value;applyProp(o=>{if(o.t)o.fill=on?c:null;else{st.fillOn=on;st.fill=c}},true)});
bind('#pFill','input',e=>{const c=e.target.value;$('#pFillOn').checked=true;applyProp(o=>{if(o.t)o.fill=c;else{st.fill=c;st.fillOn=true}})});
bind('#pFill','change',()=>{if(selAnnot())commit()});
bind('#pFont','change',e=>applyProp(o=>{o.font=e.target.value},true));
bind('#pBold','change',e=>applyProp(o=>{o.bold=e.target.checked},true));
bind('#pItalic','change',e=>applyProp(o=>{o.italic=e.target.checked},true));
bind('#pSize','input',e=>{const v=+e.target.value;applyProp(o=>{o.size=v})});bind('#pSize','change',()=>{if(selAnnot())commit()});
bind('#pWidth','input',e=>{const v=+e.target.value;applyProp(o=>{if(o.t==='text')return;if(o.t){o.sw=v;if(!o.stroke&&v>0&&o.t!=='pen')o.stroke=st.color}else st.sw=v})});bind('#pWidth','change',()=>{if(selAnnot())commit()});
bind('#pOp','input',e=>{const v=+e.target.value/100;applyProp(o=>{if(o.t==='text')return;o.op=v})});bind('#pOp','change',()=>{if(selAnnot())commit()});
bind('#pArrow','change',e=>applyProp(o=>{o.arrow=e.target.checked},true));
$('#btnDelSel').onclick=deleteSel;
function deleteSel(){const f=S.sel&&findAnnot(S.sel);if(!f)return;f.p.annots=f.p.annots.filter(x=>x!==f.a);S.sel=null;S.editing=null;commit();renderOverlay(f.p);updateUI()}

// ---------- chrome ----------
function setTool(t){
  if(S.editing){const q=$('.t.editing');if(q)q.blur()}
  S.tool=t;stage.classList.remove(...[...stage.classList].filter(c=>c.startsWith('tool-')||c==='draw'));stage.classList.add('tool-'+t);if(DRAW.has(t))stage.classList.add('draw');
  if(DRAW.has(t)&&S.sel)select(null);
  $$('#tools [data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===t)));updateUI();
}
function updateUI(){
  const has=S.pages.length>0;
  $('#btnUndo').disabled=S.hi<=0;$('#btnRedo').disabled=S.hi>=S.hist.length-1;
  ['btnRotL','btnRotR','btnUp','btnDown','btnAddPage','btnDelPage','btnOcr','btnExport','btnZoomIn','btnZoomOut','btnFit','btnImage'].forEach(id=>$('#'+id).disabled=!has);
  $('#zoomLbl').textContent=Math.round(S.zoom*100)+'%';
  $('#pageLbl').textContent=has?'Page '+(S.cur+1)+' / '+S.pages.length:'';
  $$('.th',thumbs).forEach((t,i)=>t.classList.toggle('cur',i===S.cur));
  $('#empty').hidden=has;syncInspector();
}
$('#btnOpen').onclick=$('#btnOpen2').onclick=()=>$('#fileIn').click();
$('#fileIn').addEventListener('change',e=>{const f=[...e.target.files];e.target.value='';openFiles(f)});
$('#btnUndo').onclick=()=>restore(S.hi-1);$('#btnRedo').onclick=()=>restore(S.hi+1);
$('#btnZoomIn').onclick=()=>setZoom(S.zoom*1.2);$('#btnZoomOut').onclick=()=>setZoom(S.zoom/1.2);
$('#btnFit').onclick=()=>{const w=Math.max(...S.pages.map(p=>viewSize(p)[0]));setZoom((stage.clientWidth-44)/(w*PT))};
$('#btnRotL').onclick=()=>rotate(-90);$('#btnRotR').onclick=()=>rotate(90);
$('#btnUp').onclick=()=>movePage(-1);$('#btnDown').onclick=()=>movePage(1);
$('#btnAddPage').onclick=addPage;$('#btnDelPage').onclick=delPage;
$('#btnThumbs').onclick=()=>thumbs.classList.toggle('show');
$('#btnImage').onclick=()=>$('#imgIn').click();
$$('#tools [data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
const KEYS={v:'select',e:'edittext',t:'text',h:'highlight',p:'pen',r:'rect',o:'ellipse',l:'line',w:'whiteout'};
window.addEventListener('keydown',e=>{
  const tg=e.target,typing=tg.isContentEditable||/^(INPUT|SELECT|TEXTAREA)$/.test(tg.tagName);
  if(e.key==='Escape'){if(S.editing){const q=$('.t.editing');if(q)q.blur()}else if(S.sel)select(null);return}
  if(typing)return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();restore(e.shiftKey?S.hi+1:S.hi-1);return}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();restore(S.hi+1);return}
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key==='Delete'||e.key==='Backspace'){if(S.sel){e.preventDefault();deleteSel()}return}
  if(e.key==='i'){$('#imgIn').click();return}
  if(KEYS[e.key.toLowerCase()])setTool(KEYS[e.key.toLowerCase()]);
});
// drag and drop files anywhere
const isFileDrag=e=>e.dataTransfer&&[...e.dataTransfer.types].includes('Files');
window.addEventListener('dragover',e=>{if(isFileDrag(e)){e.preventDefault();$('#dropzone').classList.add('over')}});
window.addEventListener('dragleave',e=>{if(!e.relatedTarget)$('#dropzone').classList.remove('over')});
window.addEventListener('drop',e=>{if(isFileDrag(e)){e.preventDefault();$('#dropzone').classList.remove('over');openFiles(e.dataTransfer.files)}});
window.addEventListener('beforeunload',e=>{if(S.hi>0){e.preventDefault();e.returnValue=''}});
let rz;window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{if(S.pages.length)relayout()},200)});

if(window.pdfjsLib){pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.min.js'}
else toast('The PDF libraries failed to load. Check your connection and reload.',true);
updateUI();
})();
