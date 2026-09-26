
(()=>{
 const header=document.querySelector('header'),intro=document.querySelector('.docIntro'),nav=document.querySelector('.pageNav');
 const toolbar=document.createElement('section');toolbar.className='integratedDocumentToolbar';toolbar.setAttribute('aria-label','Controles das pranchas');
 header.after(toolbar);if(intro)toolbar.append(intro);if(nav)toolbar.append(nav);
})();
