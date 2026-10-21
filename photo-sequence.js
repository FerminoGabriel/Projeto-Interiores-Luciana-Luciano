export function startPhotoSequence({container,images,index=0,interval=5000}){
 if(!container||images.length<2)return;
 const first=container.querySelector('.hero-image'),second=first.cloneNode(false);second.removeAttribute('fetchpriority');second.alt='';second.setAttribute('aria-hidden','true');second.classList.add('photo-sequence-frame');second.style.opacity='0';first.after(second);first.classList.add('photo-sequence-frame');
 const frames=[first,second],cache=new Map();let front=0,timer=0,busy=false;
 function preload(i){if(!cache.has(i)){const image=new Image();image.src=images[i].src;cache.set(i,image.decode().catch(()=>{}));}return cache.get(i);}
 async function advance(){if(busy||document.hidden||container.closest('[hidden]'))return;const rect=container.getBoundingClientRect();if(rect.bottom<0||rect.top>innerHeight)return;busy=true;const nextIndex=(index+1)%images.length,next=1-front,frame=frames[next];try{await preload(nextIndex);if(document.hidden||container.closest('[hidden]'))return;frame.src=images[nextIndex].src;await frame.decode();frame.style.opacity='1';frames[front].style.opacity='0';first.alt=images[nextIndex].alt;front=next;index=nextIndex;preload((index+1)%images.length);}catch{}finally{busy=false;}}
 function start(){clearInterval(timer);timer=setInterval(advance,interval);}preload((index+1)%images.length);start();window.addEventListener('pagehide',()=>clearInterval(timer));window.addEventListener('pageshow',start);
}
