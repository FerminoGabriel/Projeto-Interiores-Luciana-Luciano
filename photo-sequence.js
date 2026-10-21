export function startPhotoSequence({container,images,index=0,interval=6000}){
 if(!container||images.length<2)return;
 const first=container.querySelector('.hero-image'),second=first.cloneNode(false);second.removeAttribute('fetchpriority');second.alt='';second.setAttribute('aria-hidden','true');second.classList.add('photo-sequence-frame');second.style.opacity='0';first.after(second);first.classList.add('photo-sequence-frame');
 const frames=[first,second],control=document.createElement('button');control.className='photo-sequence-control';control.type='button';control.setAttribute('aria-label','Pausar sequência de imagens');container.append(control);
 let front=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,timer=0;
 function label(){control.textContent=(paused?'Reproduzir':'Pausar')+' imagens · '+String(index+1).padStart(2,'0')+' / '+String(images.length).padStart(2,'0');control.setAttribute('aria-pressed',String(paused));control.setAttribute('aria-label',paused?'Reproduzir sequência de imagens':'Pausar sequência de imagens');}
 function schedule(){clearTimeout(timer);timer=setTimeout(advance,interval);}
 async function advance(){if(paused||document.hidden||container.closest('[hidden]')){schedule();return;}const rect=container.getBoundingClientRect();if(rect.bottom<0||rect.top>innerHeight){schedule();return;}const nextIndex=(index+1)%images.length,next=1-front,frame=frames[next];frame.src=images[nextIndex].src;try{await frame.decode();if(paused||container.closest('[hidden]')){schedule();return;}frame.style.opacity='1';frames[front].style.opacity='0';first.alt=images[nextIndex].alt;front=next;index=nextIndex;label();}catch{}schedule();}
 control.onclick=()=>{paused=!paused;label();schedule();};label();schedule();window.addEventListener('pagehide',()=>clearTimeout(timer),{once:true});
}
