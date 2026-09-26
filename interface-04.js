
(()=>{const q=s=>document.querySelector(s),intro=q('.docIntro');if(intro){const actions=document.createElement('div');actions.className='docActions';actions.append(q('.docUnits'),q('#printSheet'));intro.append(actions)}const caption=q('.docIntro p');if(caption)caption.textContent='Selecione o móvel no projeto para acessar suas pranchas.';})();
