let unlocked=false,pending=null;
export function requireDocumentAccess(){
 if(unlocked||sessionStorage.getItem('ll-document-access')==='granted')return Promise.resolve();
 if(pending)return pending;
 pending=new Promise(resolve=>{
  const style=document.createElement('style');style.textContent=`.document-access{width:min(420px,calc(100% - 36px));padding:30px;border:1px solid #c9bdab;background:#f4f1eb;color:#282923;box-sizing:border-box}.document-access::backdrop{background:#20251fe8}.document-access h2{font:32px Georgia,serif;margin:0 0 14px}.document-access p{font-size:14px;line-height:1.6}.document-access label{display:block;font-size:13px;margin:20px 0 8px}.document-access input{display:block;width:100%;box-sizing:border-box;padding:13px;border:1px solid #9a8c70;background:#fff;font-size:16px}.document-access button{width:100%;padding:14px;margin-top:14px;border:0;background:#282923;color:#fff;cursor:pointer}.document-access a{display:block;margin-top:18px;color:inherit;font-size:13px}.document-access [role=alert]{color:#9b3329;min-height:22px;margin:10px 0 0}`;document.head.append(style);
  const dialog=document.createElement('dialog');dialog.className='document-access';dialog.setAttribute('aria-labelledby','access-title');dialog.innerHTML='<form><h2 id="access-title">Acesso às pranchas</h2><p>Informe a senha para consultar os documentos do projeto.</p><label for="document-password">Senha</label><input id="document-password" type="password" autocomplete="current-password" required><p role="alert" aria-live="polite"></p><button type="submit">Acessar pranchas</button><a href="index.html#ambientes">← Voltar ao início</a></form>';
  dialog.addEventListener('cancel',e=>{e.preventDefault();location.href='index.html#ambientes';});
  dialog.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const input=dialog.querySelector('input');if(input.value!=='LL123'){dialog.querySelector('[role=alert]').textContent='Senha incorreta. Tente novamente.';input.select();return;}unlocked=true;sessionStorage.setItem('ll-document-access','granted');dialog.close();dialog.remove();resolve();});
  document.body.append(dialog);dialog.showModal();dialog.querySelector('input').focus();
 });return pending;
}
