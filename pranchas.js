import {requireDocumentAccess} from './document-access.js?v=1';
await requireDocumentAccess();
document.querySelector('#document-library').hidden=false;
const tabs=[...document.querySelectorAll('[role=tab]')];
function route(){const key=location.hash.slice(1),active=tabs.find(t=>t.hash==='#'+key)||tabs[0];for(const tab of tabs){const selected=tab===active;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;document.getElementById(tab.getAttribute('aria-controls')).hidden=!selected;}}
for(const tab of tabs)tab.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();let n=tabs.indexOf(tab);n=e.key==='Home'?0:e.key==='End'?tabs.length-1:(n+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;location.hash=tabs[n].hash;tabs[n].focus();});
window.addEventListener('hashchange',route);route();
