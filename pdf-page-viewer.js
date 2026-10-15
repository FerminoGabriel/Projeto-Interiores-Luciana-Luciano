// Single-sheet overlay. PDF.js renders only the visible region at the current zoom.
export function createPageViewer({pages,loadDocument,printPage,onOpen,onClose}){
 const dialog=document.createElement('dialog');dialog.id='sheet-viewer';dialog.setAttribute('aria-label','Prancha ampliada');
 dialog.innerHTML=`<div class="sheet-toolbar"><button data-action="close" aria-label="Fechar prancha e voltar à lista">Fechar ×</button><div class="sheet-pagination"><button data-action="previous" aria-label="Prancha anterior">‹</button><span class="sheet-number" aria-live="polite"></span><button data-action="next" aria-label="Próxima prancha">›</button></div><div class="sheet-zoom"><button data-action="out" aria-label="Diminuir zoom">−</button><button data-action="fit" aria-label="Ajustar prancha à tela">100%</button><button data-action="in" aria-label="Aumentar zoom">+</button></div><button data-action="print" aria-label="Imprimir esta prancha">Imprimir</button></div><div class="sheet-stage" tabindex="0" aria-label="Use dois dedos para ampliar e arraste para deslocar a prancha"><img class="sheet-preview" alt="" draggable="false"><p class="sheet-status" role="status"></p></div><p class="sheet-help">Dois dedos para ampliar · Arraste para explorar · Toque duplo para zoom</p>`;
 document.body.append(dialog);
 const find=s=>dialog.querySelector(s),stage=find('.sheet-stage'),preview=find('.sheet-preview'),status=find('.sheet-status'),points=new Map();
 let number=1,z=1,x=0,y=0,w=0,h=0,fitW=0,fitH=0,gesture=null,lastTap=null,task=null,tile=null,timer=0,version=0,origin=null,tap=null,restore=null;
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 function bounds(){x=w*z<=stage.clientWidth?(stage.clientWidth-w*z)/2:clamp(x,stage.clientWidth-w*z,0);y=h*z<=stage.clientHeight?(stage.clientHeight-h*z)/2:clamp(y,stage.clientHeight-h*z,0);}
 function paint(){bounds();preview.style.width=w+'px';preview.style.height=h+'px';preview.style.transform=`translate(${x}px,${y}px) scale(${z})`;find('[data-action="fit"]').textContent=Math.round(z*100)+'%';}
 function invalidate(){version++;clearTimeout(timer);task?.cancel();tile?.remove();tile=null;}
 function schedule(){clearTimeout(timer);timer=setTimeout(render,140);}
 function fit(){invalidate();const ratio=pages[number-1].ratio||297/210;fitW=Math.max(1,stage.clientWidth-24);fitH=Math.max(1,stage.clientHeight-24);w=Math.min(fitW,fitH*ratio);h=w/ratio;z=1;x=(stage.clientWidth-w)/2;y=(stage.clientHeight-h)/2;paint();schedule();}
 function zoomAt(value,cx=stage.clientWidth/2,cy=stage.clientHeight/2){invalidate();const next=clamp(value,1,10),factor=next/z;x=cx-(cx-x)*factor;y=cy-(cy-y)*factor;z=next;paint();schedule();}
 async function render(){if(!dialog.open||points.size)return;const token=++version;task?.cancel();status.textContent='Preparando detalhes…';let canvas=null,ownTask=null;
  try{const doc=await loadDocument();if(token!==version||!dialog.open)return;const page=await doc.getPage(number);if(token!==version||!dialog.open)return;
   const left=Math.max(0,x),top=Math.max(0,y),right=Math.min(stage.clientWidth,x+w*z),bottom=Math.min(stage.clientHeight,y+h*z),cw=right-left,ch=bottom-top;if(cw<=0||ch<=0)return;
   const ratio=Math.min(devicePixelRatio||1,2,Math.sqrt(5000000/(cw*ch))),viewport=page.getViewport({scale:w*z/page.getViewport({scale:1}).width});
   canvas=document.createElement('canvas');canvas.className='sheet-detail';canvas.width=Math.ceil(cw*ratio);canvas.height=Math.ceil(ch*ratio);canvas.style.cssText=`left:${left}px;top:${top}px;width:${cw}px;height:${ch}px`;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',pages[number-1].title);
   ownTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,-(left-x)*ratio,-(top-y)*ratio]});task=ownTask;await ownTask.promise;
   if(token!==version||!dialog.open)return;tile?.remove();tile=canvas;stage.append(canvas);canvas=null;status.textContent='';
  }catch(e){if(e.name!=='RenderingCancelledException'&&token===version)status.textContent='Não foi possível carregar os detalhes. Toque em + ou ajuste a página para tentar novamente.';}
  finally{if(task===ownTask)task=null;if(canvas){canvas.width=0;canvas.height=0;}}
 }
 function select(n){invalidate();number=clamp(n,1,pages.length);preview.src=pages[number-1].thumb;preview.alt=pages[number-1].title;find('.sheet-number').textContent=number+' / '+pages.length;find('[data-action="previous"]').disabled=number===1;find('[data-action="next"]').disabled=number===pages.length;lastTap=null;points.clear();gesture=null;fit();}
 function open(n,trigger){if(!dialog.open){origin=trigger;restore={left:document.querySelector('#pdf-scroll').scrollLeft,top:document.querySelector('#pdf-scroll').scrollTop};onOpen();dialog.showModal();}select(n);find('[data-action="close"]').focus({preventScroll:true});}
 function close(){if(dialog.open)dialog.close();}
 dialog.addEventListener('close',()=>{invalidate();points.clear();gesture=null;preview.removeAttribute('src');const sc=document.querySelector('#pdf-scroll');if(restore){sc.scrollLeft=restore.left;sc.scrollTop=restore.top;}origin?.focus({preventScroll:true});onClose();});
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 dialog.addEventListener('click',async e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;if(action==='close')close();if(action==='fit')fit();if(action==='in')zoomAt(z*1.4);if(action==='out')zoomAt(z/1.4);if(action==='previous')select(number-1);if(action==='next')select(number+1);if(action==='print'){const button=e.target.closest('button');button.disabled=true;try{await printPage(number);}catch(e){status.textContent=e.message;}finally{button.disabled=false;}}});
 function point(e){const r=stage.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
 function state(){const a=[...points.values()];if(a.length>1)return {cx:(a[0].x+a[1].x)/2,cy:(a[0].y+a[1].y)/2,d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),x,y,z};return a.length?{cx:a[0].x,cy:a[0].y,x,y,z}:null;}
 stage.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();invalidate();const p=point(e);points.set(e.pointerId,p);stage.setPointerCapture(e.pointerId);gesture=state();tap=points.size===1?{id:e.pointerId,x:p.x,y:p.y,time:performance.now(),moved:false}:null;stage.classList.add('moving');});
 stage.addEventListener('pointermove',e=>{if(!points.has(e.pointerId)||!gesture)return;e.preventDefault();const p=point(e);points.set(e.pointerId,p);if(tap&&Math.hypot(p.x-tap.x,p.y-tap.y)>7)tap.moved=true;const now=state();if(points.size>1){const next=clamp(gesture.z*now.d/Math.max(1,gesture.d),1,10);x=now.cx-(gesture.cx-gesture.x)*next/gesture.z;y=now.cy-(gesture.cy-gesture.y)*next/gesture.z;z=next;}else{x=gesture.x+now.cx-gesture.cx;y=gesture.y+now.cy-gesture.cy;}paint();});
 function end(e){if(!points.has(e.pointerId))return;const p=point(e),valid=e.type==='pointerup'&&tap?.id===e.pointerId&&!tap.moved&&performance.now()-tap.time<400;points.delete(e.pointerId);gesture=state();if(!points.size){stage.classList.remove('moving');if(valid&&lastTap&&performance.now()-lastTap.time<320&&Math.hypot(p.x-lastTap.x,p.y-lastTap.y)<25){lastTap=null;zoomAt(z>1.4?1:2.5,p.x,p.y);}else{lastTap=valid?{...p,time:performance.now()}:null;schedule();}}tap=null;}
 stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);stage.addEventListener('lostpointercapture',end);
 stage.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
 stage.addEventListener('wheel',e=>{e.preventDefault();const p=point(e);zoomAt(z*Math.exp(-clamp(e.deltaY,-300,300)*.002),p.x,p.y);},{passive:false});
 stage.addEventListener('keydown',e=>{if(e.key==='+'||e.key==='='){e.preventDefault();zoomAt(z*1.4);}else if(e.key==='-'){e.preventDefault();zoomAt(z/1.4);}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();invalidate();if(e.key==='ArrowLeft')x+=60;if(e.key==='ArrowRight')x-=60;if(e.key==='ArrowUp')y+=60;if(e.key==='ArrowDown')y-=60;paint();schedule();}});
 let resizeTimer;new ResizeObserver(()=>{if(!dialog.open)return;clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(dialog.open)fit();},120);}).observe(stage);
 window.addEventListener('hashchange',close);
 return {open,close,get isOpen(){return dialog.open;}};
}
