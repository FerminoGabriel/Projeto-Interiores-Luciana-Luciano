import {configure,show} from './documents.js?v=34';
const status=document.querySelector('#doc-status');
const notice=text=>{const n=document.querySelector('#notification');n.textContent=text;n.hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>n.hidden=true,6500);};
try{const response=await fetch('assets/arquitetonico-003/documento.json');if(!response.ok)throw Error('Documento indisponível.');const meta=await response.json();configure(meta,notice);const route=()=>show(Math.max(1,Math.min(meta.pages.length,Number(location.hash.split('/')[1])||1)));window.addEventListener('hashchange',route);await route();}catch(e){status.textContent='Não foi possível abrir a prancha do arquitetônico. '+e.message;}
