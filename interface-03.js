
(()=>{
 const q=s=>document.querySelector(s), body=document.body;
 const intro=document.createElement('div');intro.className='docIntro';intro.innerHTML='<div><div class="eyebrow">MARCENARIA / PROJETO COMPLETO</div><h2>Prancha de detalhamento</h2><p>Vistas, cotas e informações construtivas reunidas em uma página.</p></div><label class="docUnits">Cotas em <select id="docUnits" aria-label="Unidades na prancha"><option value="cm">Centímetros</option><option value="mm">Milímetros</option></select></label>';
 q('#technical').prepend(intro);
 q('#docUnits').value=q('#units').value;
 q('#docUnits').onchange=e=>{q('#units').value=e.target.value;q('#units').dispatchEvent(new Event('change'))};
 q('#units').addEventListener('change',()=>q('#docUnits').value=q('#units').value);
 const table=q('#measureTable').closest('.sheetscroll'),fold=document.createElement('details');fold.className='piecesDisclosure';const summary=document.createElement('summary');summary.textContent='Peças, materiais e dimensões';fold.append(summary);table.before(fold);fold.append(table);
 q('#sheetType').setAttribute('aria-label','Prancha principal e detalhes complementares');
 q('#sheetType').options[0].textContent='Prancha completa do Hall';
 q('#docs').addEventListener('click',()=>{body.classList.add('docsMode');body.classList.remove('panelOpen');q('#panel').setAttribute('aria-expanded','false')});
 q('#explore').addEventListener('click',()=>{body.classList.remove('docsMode','panelOpen');q('#panel').setAttribute('aria-expanded','false')});
 q('#rendersButton').addEventListener('click',()=>{body.classList.remove('docsMode','panelOpen');q('#panel').setAttribute('aria-expanded','false')});
 // Opcoes avancadas continuam acessiveis sem ocupar a navegacao principal.
 const options=q('aside');options.querySelector('.paneltitle h2').textContent='Opções de visualização';
 for(const section of options.querySelectorAll('.section')){const title=section.querySelector('h3');if(title&&title.textContent==='Materiais do hall')section.style.display='none'}
 q('#resetAll').textContent='Mostrar projeto completo';q('#cabinet').textContent='Ver apenas o armário do Hall';
})();