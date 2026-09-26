'use strict';
(async()=>{
const $=s=>document.querySelector(s),D=JSON.parse($('#projectData').textContent),canvas=$('#view'),hud=$('#hud');$('#logo').src=D.logo;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const fmt=m=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:$('#units').value==='mm'?1:2}).format(Math.abs(m)<.00001?0:m*($('#units').value==='mm'?1000:100));
let gl,parts=[],mats=[],view='iso',room=D.rooms[0],isCabinet=false,technical=false,yaw=-.85,pitch=.95,span=24,target=[3.25,9.9,0],scheduled=false,shadowDirty=true,shadowEnabled=true,showEdges=true,showDims=false,cat={piso:true,paredes:true,esquadrias:true,marcenaria:true,forro:false,outros:true};
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>{const l=Math.hypot(...a)||1;return a.map(x=>x/l)};
function mm(a,b){let o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o}
function look(eye,center,up=[0,0,1]){const z=norm(sub(eye,center)),x=norm(cross(up,z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1])}
function ortho(w,h,n=.01,f=120){return new Float32Array([2/w,0,0,0,0,2/h,0,0,0,0,-2/(f-n),0,0,0,-(f+n)/(f-n),1])}
function perspective(aspect,n=.02,f=160){const v=1/Math.tan(Math.PI/7);return new Float32Array([v/aspect,0,0,0,0,v,0,0,0,0,(f+n)/(n-f),-1,0,0,2*f*n/(n-f),0])}
function cameraMatrix(){const asp=canvas.clientWidth/canvas.clientHeight;if(view==='plan')return mm(ortho(span*asp,span),look([target[0],target[1],target[2]+40],target,matchMedia('(orientation: landscape)').matches?[1,0,0]:[0,1,0]));const dist=view==='iso'?span*1.25:40,eye=[target[0]+dist*Math.cos(pitch)*Math.cos(yaw),target[1]+dist*Math.cos(pitch)*Math.sin(yaw),target[2]+dist*Math.sin(pitch)];return mm(ortho(span*asp,span),look(eye,target))}
let matrix;
function fit(){const b=isCabinet?D.hallBounds:room.bounds,sz=sub(b[1],b[0]),aspect=Math.max(.3,canvas.clientWidth/canvas.clientHeight);target=b[0].map((v,i)=>(v+b[1][i])/2);if(view==='plan'){target[2]=0;span=(matchMedia('(orientation: landscape)').matches?Math.max(sz[0],sz[1]/aspect):Math.max(sz[1],sz[0]/aspect))*1.22}else if(view==='front')span=Math.max(sz[2],sz[0]/aspect)*1.6;else if(view==='side')span=Math.max(sz[2],sz[1]/aspect)*1.6;else{const ya=Math.PI/4,pi=Math.atan(1/Math.sqrt(2));const projectedW=Math.abs(Math.sin(ya))*sz[0]+Math.abs(Math.cos(ya))*sz[1],projectedH=Math.sin(pi)*(Math.abs(Math.cos(ya))*sz[0]+Math.abs(Math.sin(ya))*sz[1])+Math.cos(pi)*sz[2];span=Math.max(projectedH,projectedW/aspect)*1.32}yaw=Math.PI/4;pitch=Math.atan(1/Math.sqrt(2));if(view==='front'){yaw=Math.PI/2;pitch=0}if(view==='side'){yaw=0;pitch=0}request()}
function visible(p){return cat[p.category]&&p.on&&(!isCabinet||p.root===12)&&!(view==='plan'&&p.category==='forro')}
function partClip(p){return p.category==='paredes'||p.category==='esquadrias'?($('#cutWalls').checked||view==='plan'?1.2:50):50}
const geometryDownloads=new Map();
async function unpack(value){if(typeof DecompressionStream==='undefined')throw Error('Atualize o navegador para visualizar o projeto.');let bytes;if(typeof value==='string'){bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0))}else{if(!geometryDownloads.has(value.file))geometryDownloads.set(value.file,fetch(value.file).then(r=>{if(!r.ok)throw Error('Falha ao carregar a geometria. Recarregue a página.');return r.arrayBuffer()}));const buffer=await geometryDownloads.get(value.file);bytes=new Uint8Array(buffer,value.offset,value.length)}return new Float32Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())}

function shader(type,code){const sh=gl.createShader(type);gl.shaderSource(sh,code);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh}
function program(v,f){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,v));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p}
function gpu(a){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,a,gl.STATIC_DRAW);return b}
let prog,shadowProg,edgeProg,shadowFbo,shadowTex,lightM,shadowSize=1024,L,E,S;
function texture(image){const tx=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tx);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);if(image){const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=1024;c.height=1024;c.getContext('2d').drawImage(im,0,0,1024,1024);gl.bindTexture(gl.TEXTURE_2D,tx);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,c);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);request()};im.onerror=()=>{$('#status').textContent='Uma textura não carregou.'};im.src=image}return tx}
function setupGL(){gl=canvas.getContext('webgl',{antialias:true,alpha:true,preserveDrawingBuffer:true});if(!gl)throw Error('WebGL indisponível. A visualização requer aceleração gráfica.');
prog=program('attribute vec3 p;attribute vec3 n;attribute vec2 uv;uniform mat4 m;uniform mat4 lm;uniform vec3 shift;varying vec3 wp;varying vec3 nn;varying vec2 st;varying vec4 sp;void main(){wp=p+shift;nn=n;st=uv;sp=lm*vec4(wp,1.);gl_Position=m*vec4(wp,1.);}',
'precision highp float;varying vec3 wp;varying vec3 nn;varying vec2 st;varying vec4 sp;uniform vec3 color;uniform sampler2D tex;uniform sampler2D shadow;uniform float textured;uniform float cut;uniform float opacity;uniform float useShadow;uniform vec2 texel;void main(){if(wp.z>cut)discard;vec3 n=normalize(nn);if(!gl_FrontFacing)n=-n;vec3 base=mix(color,texture2D(tex,st).rgb,textured);vec3 sc=sp.xyz/sp.w*.5+.5;float shade=1.;if(useShadow>.5&&sc.x>0.&&sc.x<1.&&sc.y>0.&&sc.y<1.){float sum=0.;for(int x=-1;x<=1;x++){for(int y=-1;y<=1;y++){float dep=texture2D(shadow,sc.xy+vec2(float(x),float(y))*texel).r;sum+=sc.z-.0015>dep?.4:1.;}}shade=sum/9.;}float diff=max(dot(n,normalize(vec3(-.7,-.6,1.5))),0.);float fill=max(dot(n,normalize(vec3(.8,.3,.5))),0.);float light=.58+.43*diff*shade+.13*fill;vec3 rgb=pow(pow(base,vec3(2.2))*light,vec3(1./2.2));gl_FragColor=vec4(rgb,opacity);}')
;edgeProg=program('attribute vec3 p;uniform mat4 m;varying float z;void main(){z=p.z;gl_Position=m*vec4(p,1.);}','precision mediump float;varying float z;uniform float cut;void main(){if(z>cut)discard;gl_FragColor=vec4(.23,.26,.22,.25);}')
;shadowProg=program('attribute vec3 p;uniform mat4 m;varying float z;void main(){z=p.z;gl_Position=m*vec4(p,1.);}','precision mediump float;varying float z;uniform float cut;void main(){if(z>cut)discard;gl_FragColor=vec4(1.);}')
;L={};for(const n of ['m','lm','shift','color','tex','shadow','textured','cut','opacity','useShadow','texel'])L[n]=gl.getUniformLocation(prog,n);for(const n of ['p','n','uv'])L[n]=gl.getAttribLocation(prog,n);E={p:gl.getAttribLocation(edgeProg,'p'),m:gl.getUniformLocation(edgeProg,'m'),cut:gl.getUniformLocation(edgeProg,'cut')};S={p:gl.getAttribLocation(shadowProg,'p'),m:gl.getUniformLocation(shadowProg,'m'),cut:gl.getUniformLocation(shadowProg,'cut')};
if(gl.getExtension('WEBGL_depth_texture')){shadowTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,shadowTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT,shadowSize,shadowSize,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);const ct=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,ct);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,shadowSize,shadowSize,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);shadowFbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,shadowFbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,shadowTex,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,ct,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)shadowFbo=null;gl.bindFramebuffer(gl.FRAMEBUFFER,null)}else{$('#shadows').checked=false;$('#shadows').disabled=true;shadowEnabled=false}
lightM=mm(ortho(29,29,.1,100),look([-15,-8,35],[3.25,9.8,0]));gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0)}
function shadowPass(){if(!shadowFbo||!shadowEnabled)return;gl.bindFramebuffer(gl.FRAMEBUFFER,shadowFbo);gl.viewport(0,0,shadowSize,shadowSize);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(shadowProg);for(let i=0;i<8;i++)gl.disableVertexAttribArray(i);gl.enableVertexAttribArray(S.p);gl.uniformMatrix4fv(S.m,false,lightM);for(const p of parts)if(visible(p)){gl.uniform1f(S.cut,partClip(p));for(const mesh of p.meshes){if(mats[mesh.material].opacity<.5)continue;gl.bindBuffer(gl.ARRAY_BUFFER,mesh.gpu);gl.vertexAttribPointer(S.p,3,gl.FLOAT,false,32,0);gl.drawArrays(gl.TRIANGLES,0,mesh.count)}}gl.bindFramebuffer(gl.FRAMEBUFFER,null);shadowDirty=false}
function request(){if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;draw()})}}
function draw(){if(!gl||technical||!mats.length)return;const quality=$('#quality').value,ratio=quality==='light'?1:Math.min(devicePixelRatio||1,quality==='high'?2:matchMedia('(max-width:760px)').matches?1.35:1.7),w=Math.round(canvas.clientWidth*ratio),h=Math.round(canvas.clientHeight*ratio);if(!w||!h)return;if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}if(shadowDirty)shadowPass();gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);matrix=cameraMatrix();gl.useProgram(prog);for(let i=0;i<8;i++)gl.disableVertexAttribArray(i);[L.p,L.n,L.uv].forEach(l=>gl.enableVertexAttribArray(l));gl.uniformMatrix4fv(L.m,false,matrix);gl.uniformMatrix4fv(L.lm,false,lightM);gl.uniform1i(L.tex,0);gl.uniform1i(L.shadow,1);gl.uniform1f(L.useShadow,shadowEnabled&&!!shadowFbo&&explosionAmount===0?1:0);gl.uniform2f(L.texel,1/shadowSize,1/shadowSize);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,shadowTex||mats[0].gpu);gl.activeTexture(gl.TEXTURE0);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,1);const translucent=[];let tris=0;
function meshDraw(mesh,p){const mat=mats[mesh.material];gl.uniform3fv(L.color,mat.color);gl.uniform1f(L.opacity,mat.opacity);gl.uniform1f(L.textured,mat.image?1:0);gl.uniform1f(L.cut,partClip(p));gl.bindTexture(gl.TEXTURE_2D,mat.gpu);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.gpu);gl.vertexAttribPointer(L.p,3,gl.FLOAT,false,32,0);gl.vertexAttribPointer(L.n,3,gl.FLOAT,false,32,12);gl.vertexAttribPointer(L.uv,2,gl.FLOAT,false,32,24);drawFurnitureMesh(mesh,p);tris+=mesh.count/3}
for(const p of parts)if(visible(p))for(const mesh of p.meshes){if(mats[mesh.material].opacity<.99)translucent.push([mesh,p]);else meshDraw(mesh,p)}gl.disable(gl.POLYGON_OFFSET_FILL);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);for(const [mesh,p] of translucent)meshDraw(mesh,p);gl.depthMask(true);if(showEdges&&explosionAmount===0){gl.useProgram(edgeProg);for(let i=0;i<8;i++)gl.disableVertexAttribArray(i);gl.enableVertexAttribArray(E.p);gl.uniformMatrix4fv(E.m,false,matrix);for(const p of parts)if(visible(p)&&p.category!=='esquadrias'){gl.uniform1f(E.cut,partClip(p));gl.bindBuffer(gl.ARRAY_BUFFER,p.edgeGpu);gl.vertexAttribPointer(E.p,3,gl.FLOAT,false,12,0);gl.drawArrays(gl.LINES,0,p.edgeCount)}}gl.disable(gl.BLEND);$('#status').textContent=tris.toLocaleString('pt-BR')+' triângulos visíveis · renderização sob demanda';canvas.dataset.rendered='true';drawHUD()}
function project(p){const q=[0,0,0,0];for(let r=0;r<4;r++)q[r]=matrix[r]*p[0]+matrix[4+r]*p[1]+matrix[8+r]*p[2]+matrix[12+r];return [(q[0]/q[3]*.5+.5)*canvas.clientWidth,(.5-q[1]/q[3]*.5)*canvas.clientHeight]}
function drawHUD(){hud.setAttribute('viewBox','0 0 '+canvas.clientWidth+' '+canvas.clientHeight);let labels='';if(view==='plan'&&!isCabinet){labels=D.rooms.slice(1).filter(r=>room.id==='all'||r.id===room.id).map(r=>{const c=r.bounds[0].map((x,i)=>(x+r.bounds[1][i])/2);c[2]=.1;const q=project(c),w=r.name.length*6.7+18;return `<rect x="${q[0]-w/2}" y="${q[1]-13}" width="${w}" height="24" rx="4" fill="#ffffffe6"/><text x="${q[0]}" y="${q[1]+3}" text-anchor="middle" font-size="12" fill="#59604f">${esc(r.name)}</text>`}).join('')}if(!showDims){hud.innerHTML=labels;return}const [lo,hi]=isCabinet?D.hallBounds:D.bounds;let lines=[];if(view==='plan')lines=[[[lo[0],lo[1]-.25,0],[hi[0],lo[1]-.25,0],hi[0]-lo[0]],[[hi[0]+.25,lo[1],0],[hi[0]+.25,hi[1],0],hi[1]-lo[1]]];else if(isCabinet)lines=[[[lo[0],hi[1]+.2,0],[hi[0],hi[1]+.2,0],hi[0]-lo[0]],[[hi[0]+.2,hi[1],lo[2]],[hi[0]+.2,hi[1],hi[2]],hi[2]-lo[2]]];else{hud.innerHTML='<text x="24" y="130" font-size="12" fill="#596153">Cotas completas na área Documentação.</text>';return}hud.innerHTML=labels+lines.map(([a,b,d])=>{const p=project(a),q=project(b),x=(p[0]+q[0])/2,y=(p[1]+q[1])/2;return `<g stroke="#776648" stroke-width="1"><path d="M${p}L${q}"/><circle cx="${p[0]}" cy="${p[1]}" r="2"/><circle cx="${q[0]}" cy="${q[1]}" r="2"/></g><rect x="${x-35}" y="${y-18}" width="70" height="22" rx="3" fill="white"/><text x="${x}" y="${y-3}" text-anchor="middle" font-size="12" fill="#4f493b">${fmt(d)} ${$('#units').value}</text>`}).join('')}
function setView(v){view=v;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===v));$('#orient').textContent={iso:'3D / ISOMÉTRICA',plan:'2D / PLANTA',front:'2D / FRONTAL',side:'2D / LATERAL'}[v];$('#sceneSubtitle').textContent=(isCabinet?'Marcenaria do hall':'Arquitetura original')+' · '+{iso:'Isométrica',plan:'Planta humanizada',front:'Elevação frontal',side:'Elevação lateral'}[v];shadowDirty=true;fit()}
function focusRoom(r){room=r;isCabinet=false;$('#sceneName').textContent=r.name;document.querySelectorAll('[data-room]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.room===r.id));setView(view);try{const saved=JSON.parse(localStorage.getItem('gf-camera-'+r.id));if(saved&&Array.isArray(saved.target)&&saved.target.length===3&&saved.target.every(Number.isFinite)&&[saved.span,saved.yaw,saved.pitch].every(Number.isFinite)){target=saved.target;span=saved.span;yaw=saved.yaw;pitch=saved.pitch}}catch{}request()}
function setTechnical(on){document.body.classList.remove('rendersOpen');$('#rendersButton').setAttribute('aria-pressed','false');technical=on;$('#technical').classList.toggle('active',on);$('#docs').setAttribute('aria-pressed',on);$('#explore').setAttribute('aria-pressed',!on);hud.style.display=on?'none':'';if(on)sheet();else request()}
const categoryNames={piso:'Piso e base',paredes:'Paredes',esquadrias:'Portas e janelas',marcenaria:'Marcenaria',forro:'Forro'};
for(const [id,label] of Object.entries(categoryNames)){const row=document.createElement('div');row.className='layer';row.innerHTML=`<input id="layer-${id}" type="checkbox" ${cat[id]?'checked':''}><label for="layer-${id}">${label}</label>`;row.querySelector('input').onchange=e=>{cat[id]=e.target.checked;shadowDirty=true;request()};$('#layers').append(row)}
D.rooms.forEach((r,i)=>{const b=document.createElement('button');b.dataset.room=r.id;b.setAttribute('aria-pressed',i===0);b.innerHTML=`<span class="num">${i?'0'+i:'↗'}</span>${esc(r.name)}`;b.onclick=()=>{if(technical)setTechnical(false);focusRoom(r)};$('#rooms').append(b)});
$('#explore').onclick=()=>setTechnical(false);$('#docs').onclick=()=>setTechnical(true);$('#panel').onclick=()=>{const on=document.body.classList.toggle('panelOpen');$('#panel').setAttribute('aria-expanded',on)};document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));$('#fit').onclick=fit;$('#zoomIn').onclick=()=>{span=Math.max(.4,span*.8);request()};$('#zoomOut').onclick=()=>{span=Math.min(80,span*1.25);request()};$('#cabinet').onclick=()=>{isCabinet=true;room=D.rooms[1];document.querySelectorAll('[data-room]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.room==='hall'));$('#sceneName').textContent='Armário do Hall';cat.marcenaria=true;$('#layer-marcenaria').checked=true;parts.filter(p=>p.root===12).forEach(p=>p.on=true);document.querySelectorAll('[data-piece]').forEach(i=>i.checked=true);setTechnical(false);setView('iso');document.body.classList.remove('panelOpen');$('#panel').setAttribute('aria-expanded',false)};$('#resetAll').onclick=()=>{Object.keys(cat).forEach(k=>cat[k]=k!=='forro');Object.keys(categoryNames).forEach(k=>$('#layer-'+k).checked=cat[k]);parts.forEach(p=>p.on=true);document.querySelectorAll('[data-piece]').forEach(i=>i.checked=true);$('#cutWalls').checked=true;focusRoom(D.rooms[0]);shadowDirty=true};$('#cutWalls').onchange=()=>{shadowDirty=true;request()};$('#dimensions').onchange=e=>{showDims=e.target.checked;request()};$('#contours').onchange=e=>{showEdges=e.target.checked;request()};$('#shadows').onchange=e=>{shadowEnabled=e.target.checked;shadowDirty=true;request()};$('#quality').onchange=()=>{shadowEnabled=$('#quality').value!=='light'&&$('#shadows').checked;shadowDirty=true;request()};$('#units').onchange=()=>{request();if(technical)sheet()};$('#saveCamera').onclick=()=>{try{localStorage.setItem('gf-camera-'+room.id,JSON.stringify({target,span,yaw,pitch}));$('#status').textContent='Enquadramento salvo neste navegador.'}catch{$('#status').textContent='O navegador não permite salvar o enquadramento.'}};$('#resetCamera').onclick=()=>{try{localStorage.removeItem('gf-camera-'+room.id)}catch{}fit()};
const pointers=new Map();let gesture=null;function gestureState(){const a=[...pointers.values()];return a.length>1?{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2,d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)}:a[0]||null}
canvas.onpointerdown=e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});gesture=gestureState();canvas.setPointerCapture(e.pointerId)};canvas.onpointermove=e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const next=gestureState();if(gesture){const dx=next.x-gesture.x,dy=next.y-gesture.y;if(pointers.size>1||e.shiftKey||view==='plan'){if(next.d&&gesture.d)span=Math.max(.4,Math.min(80,span*gesture.d/next.d));const k=span/canvas.clientHeight;if(view==='plan'){if(matchMedia('(orientation: landscape)').matches){target[0]+=dy*k;target[1]+=dx*k}else{target[0]-=dx*k;target[1]+=dy*k}}else{target[0]+=dx*k*Math.sin(yaw);target[1]-=dx*k*Math.cos(yaw);target[2]+=dy*k}}else{view='iso';yaw-=dx*.006;pitch=Math.max(-1.45,Math.min(1.5,pitch+dy*.006));document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===view))}request()}gesture=next};canvas.onpointerup=canvas.onpointercancel=e=>{pointers.delete(e.pointerId);gesture=gestureState()};canvas.onwheel=e=>{e.preventDefault();span=Math.max(.4,Math.min(80,span*Math.exp(e.deltaY*.001)));request()};canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','='].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')yaw-=.1;if(e.key==='ArrowRight')yaw+=.1;if(e.key==='ArrowUp')pitch=Math.min(1.5,pitch+.1);if(e.key==='ArrowDown')pitch=Math.max(-1.45,pitch-.1);if(e.key==='+'||e.key==='=')span=Math.max(.4,span*.9);if(e.key==='-')span=Math.min(80,span*1.1);request()}});
// REVISAO 03 — armario parametrico; unidades internas do projeto em milimetros.
const HALL={W:1800,L:1750,depth:600,t:30,back:5,plinth:100,bodyTop:2900,total:3000,overlap:30,sideGap:3,railAllowance:30,doorSkin:15,rib:15,ribWidth:30,ribGap:15};
let hallPieces=[],hallDraw=[];
function remodelHall(){
 const P=HALL,T=P.t,Z0=P.plinth+T,Z1=P.bodyTop-T,doorH=Z1-Z0-P.railAllowance;
 const ids={linen:mats.findIndex(m=>/LINHO/i.test(m.name)),wood:mats.findIndex(m=>/JEQUITIBA/i.test(m.name)),stone:mats.findIndex(m=>/QUARTZITO/i.test(m.name))};
 for(const k of Object.keys(ids))if(ids[k]<0)ids[k]=0;mats[ids.stone].name='QUARTZITO WHITE TAJ — branco exotico polido (textura ilustrativa)';
 const metal=mats.length;mats.push({name:'Aluminio — representacao do envelope dos trilhos',color:[.48,.49,.46],opacity:1,gpu:texture(null)});
 const newParts=[];
 function box(id,label,x,y,z,w,d,h,mat,kind='panel',note=''){
  const lo=[2.35+x/1000,.15+y/1000,z/1000],hi=[lo[0]+w/1000,lo[1]+d/1000,lo[2]+h/1000];
  const v=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]].map(q=>q.map((n,i)=>n?hi[i]:lo[i]));
  const faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],a=[],e=[];
  for(const f of faces){const n=norm(cross(sub(v[f[1]],v[f[0]]),sub(v[f[2]],v[f[0]])));for(const j of [0,1,2,0,2,3]){const p=v[f[j]],uv=Math.abs(n[2])>.5?[p[0],p[1]]:Math.abs(n[0])>.5?[p[1],p[2]]:[p[0],p[2]];a.push(...p,...n,...uv)}}
  for(const [i,j] of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]])e.push(...v[i],...v[j]);
  const edges=new Float32Array(e);newParts.push({root:12,name:id+' · '+label,category:'marcenaria',bounds:[lo,hi],on:true,meshes:[{material:mat,count:a.length/8,gpu:gpu(new Float32Array(a)),pickArray:new Float32Array(a)}],edgeArray:edges,edgeCount:edges.length/3,edgeGpu:gpu(edges),section:lo[2]<1.2&&hi[2]>1.2?[[[lo[0],lo[1]],[hi[0],lo[1]]],[[hi[0],lo[1]],[hi[0],hi[1]]],[[hi[0],hi[1]],[lo[0],hi[1]]],[[lo[0],hi[1]],[lo[0],lo[1]]]]:[]});
  hallDraw.push({id,label,x,y,z,w,d,h,mat,kind});
  if(kind!=='rib'&&kind!=='rail')hallPieces.push({id,label,x,y,z,w,d,h,mat,kind,note});
 }
 // Soculo em L: volume de referencia, nao bloco macico de pedra.
 box('Q01','Quartzito White TAJ — frente A',570,550,0,1230,20,100,ids.stone,'stone','Polido, branco exotico; face acabada recuada 30 mm.');
 box('Q02','Quartzito White TAJ — retorno B',550,550,0,20,1200,100,ids.stone,'stone','Encontro de topo com Q01; cotas de projeto, conferir molde na obra.');
 // Corpo em L: placas retangulares encostadas, sem sobreposicao no canto.
 for(const [id,z] of [['B',100],['T',2870]]){box(id+'01',id==='B'?'Base principal':'Tampo principal',0,0,z,1800,600,30,ids.linen);box(id+'02',id==='B'?'Base retorno':'Tampo retorno',0,600,z,600,1150,30,ids.linen)}
 
 box('L02','Lateral direita',1770,0,130,30,600,2740,ids.linen);
 box('L03','Fechamento retorno',5,1720,130,595,30,2740,ids.linen);
 // Travessas posteriores criam rebaixo de 5 mm para fundo sobreposto, sem alterar envelope.
 box('R01','Travessa posterior inferior',30,5,130,1740,30,60,ids.linen);
 box('R02','Travessa posterior superior',30,5,2810,1740,30,60,ids.linen);
 box('F01','Fundo ARAUCO LINHO 5 mm',5,0,130,1765,5,2740,ids.linen,'back','Fundo sobreposto as travessas; confirmar disponibilidade do acabamento em 5 mm.');
 box('F02','Fundo retorno ARAUCO LINHO 5 mm',0,0,130,5,1720,2740,ids.linen,'back','Fundo simples 5 mm, sem painel de 30 mm sobreposto.');
 for(const [i,z] of [720,1230,1740,2250].entries()){
  box('P'+(i+1)+'A1','Prateleira esquerda '+(i+1),5,5,z,565,505,30,ids.linen);box('P'+(i+1)+'A2','Prateleira direita '+(i+1),600,5,z,1170,505,30,ids.linen,'panel','Validar carga e flecha do vao livre de 1170 mm.');
  box('P'+(i+1)+'B','Prateleira retorno '+(i+1),5,510,z,505,1210,30,ids.linen);
 }
 // Divisorias fixas: apoio das prateleiras, sem interpenetracao com elas.
 const spans=[[130,720],[750,1230],[1260,1740],[1770,2250],[2280,2870]];
 box('DA00','Apoio continuo alinhado ao L',570,5,130,30,565,2740,ids.linen);
 // Canto frontal fixo e batentes. Travessas de canto formam um L de 60 x 60.
 box('C01','Montante canto A',570,570,130,60,30,2740,ids.wood);
 box('C02','Montante canto B',570,600,130,30,30,2740,ids.wood);
 box('CA','Compensador frontal superior',570,540,2900,1230,30,100,ids.linen,'panel','Altura nominal; ajustar ao forro medido.');
 box('CB','Compensador superior retorno',540,570,2900,30,1180,100,ids.linen);
 // Quatro folhas: duas por ramo; planos de deslizamento independentes.
 function pair(axis,start,len){const width=(len-2*P.sideGap+P.overlap)/2,starts=[start+P.sideGap,start+len-P.sideGap-width];
  starts.forEach((q,i)=>{const id=(axis==='A'?'D0':'D0')+(axis==='A'?i+1:i+3),z=Z0+P.railAllowance/2,plane=i?570:530;
   const dims=axis==='A'?[q,plane,z,width,P.doorSkin,doorH]:[plane,q,z,P.doorSkin,width,doorH];
   box(id,'Porta ripada '+axis+' / folha '+(i+1),...dims,ids.wood,'door','Painel 15 mm + ripas 15 mm = espessura maxima 30 mm. Altura nominal: depende do kit de correr.');
   const count=Math.floor((width+P.ribGap)/(P.ribWidth+P.ribGap)),margin=(width-(count*P.ribWidth+(count-1)*P.ribGap))/2;
   for(let r=0;r<count;r++){
 const off=margin+r*(P.ribWidth+P.ribGap),grip=r===(i===0?0:count-1);
 function ribPiece(suffix,lateral,zmin,width,depth,height,inset=0){const dr=axis==='A'?[q+off+lateral,plane+P.doorSkin+inset,zmin,width,depth,height]:[plane+P.doorSkin+inset,q+off+lateral,zmin,depth,width,height];box(id+'-R'+(r+1)+suffix,grip?'Ripa com cava vertical':'Ripa vertical',...dr,ids.wood,'rib')}
 if(grip){ribPiece('a',0,z,30,15,900-z);ribPiece('b',0,1100,30,15,z+doorH-1100);ribPiece('c',i===0?0:15,900,15,15,200)}else ribPiece('',0,z,30,15,doorH);
}
   hallPieces.push({id:id+'-R',label:count+' ripas / folha',x:0,y:0,z,w:30,d:15,h:doorH,mat:ids.wood,kind:'rips',note:'Quantidade '+count+'; vao 15 mm; margens simetricas '+margin.toFixed(2)+' mm. Revestir faces e bordas aparentes.'});
  });
  for(const z of [130,2858]){const ds=axis==='A'?[start,510,z,len,90,12]:[510,start,z,90,len,12];box('TR-'+axis+'-'+z,'Reserva para trilho embutido',...ds,metal,'rail')}
 }
 pair('A',630,1140);pair('B',630,1090);
 // Apenas root 12 e substituido. Arquitetura e demais materiais permanecem intactos.
 const old=parts.filter(p=>p.root===12);for(const p of old){gl.deleteBuffer(p.edgeGpu);p.meshes.forEach(m=>gl.deleteBuffer(m.gpu))}
 parts=parts.filter(p=>p.root!==12).concat(newParts);D.hallBounds=[[2.35,.15,0],[4.15,1.9,3]];
 // Evita centenas de controles para as ripas, mantendo geometria individual.
 const byMaterial=new Map();for(const p of newParts){const m=p.meshes[0].material;if(!byMaterial.has(m))byMaterial.set(m,0);byMaterial.set(m,byMaterial.get(m)+1)}
}
function hallSheet(kind){
 const unit=$('#units').value, f=n=>fmt(n/1000),titles={cabplan:'MAR 01 · Planta construtiva em L',front:'MAR 02 · Frente A — duas portas',side:'MAR 03 · Retorno B — duas portas',levels:'MAR 04 · Corpo, apoios e niveis',halljoin:'MAR 05 · Composicao e montagem',halldoor:'MAR 06 · Portas ripadas e trilhos',hallstone:'MAR 07 · Soculo em quartzito',hallcut:'MAR 08 · Relacao de pecas'};
 const tx=(x,y,s,size=12)=>`<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" fill="#364139">${esc(s)}</text>`;
 const ln=(x,y,X,Y)=>`<path d="M${x},${y}L${X},${Y}" stroke="#797f72" fill="none" stroke-width=".8"/>`;
 const rect=(x,y,w,h,c='#e8e9df')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" stroke="#65705e" stroke-width=".8"/>`;
 function dim(x,y,X,Y,n){const mx=(x+X)/2,my=(y+Y)/2;return ln(x,y,X,Y)+ln(x-3,y+3,x+3,y-3)+ln(X-3,Y+3,X+3,Y-3)+`<rect x="${mx-27}" y="${my-10}" width="54" height="18" fill="white"/>`+tx(mx-21,my+3,f(n),11)}
 let a='',notes=[];
 const data=hallDraw.filter(p=>!['rib','rail','stone'].includes(p.kind));
 if(kind==='cabplan'){
  const s=.245,ox=115,oy=570;
  // Corte horizontal a 1500 mm: somente pecas que cruzam o plano.
  for(const p of data.filter(p=>p.z<1500&&p.z+p.h>1500))a+=rect(ox+p.x*s,oy-(p.y+p.d)*s,p.w*s,p.d*s,p.kind==='door'?'#c4a47b':'#e6e4d8');
  a+=dim(ox,610,ox+1800*s,610,1800)+dim(70,oy,70,oy-1750*s,1750)+dim(ox,110,ox+600*s,110,600)+dim(ox+630*s,oy-650*s,ox+1770*s,oy-650*s,1140)+dim(ox+670*s,oy-630*s,ox+670*s,oy-1720*s,1090);
  a+=tx(125,650,'Origem: canto posterior esquerdo. X = frente A; Y = retorno B.',11);
  notes=['Envelope preservado: '+f(1800)+' x '+f(1750)+'.','Profundidade dos ramos: '+f(600)+'.','Corpo: MDF duplado '+f(30)+'.','Fundos F01/F02: MDF simples '+f(5)+'.','Frente A: vao '+f(1140)+'.','Retorno B: vao '+f(1090)+'.','Canto fixo C01/C02: '+f(60)+' x '+f(60)+'.','Corte horizontal a +'+f(1500)+'.','Portas: duas folhas por ramo.','Deslizamento paralelo a cada frente.'];
 }else if(['front','side','levels'].includes(kind)){
  const isB=kind==='side',s=.15,ox=170,oy=615;
  const selected=kind==='levels'?data.filter(p=>p.kind!=='door'&&p.mat===mats.findIndex(m=>/LINHO/i.test(m.name))):hallDraw.filter(p=>p.id.startsWith(isB?'D03':'D01')||p.id.startsWith(isB?'D04':'D02'));
  for(const p of selected){const q=isB?p.y:p.x,w=isB?p.d:p.w;a+=rect(ox+q*s,oy-(p.z+p.h)*s,w*s,p.h*s,p.kind==='rib'?'#b4976e':p.kind==='door'?'#d4bc98':'#e8e6da')}
  a+=dim(100,oy,100,oy-3000*s,3000)+dim(ox,650,ox+(isB?1750:1800)*s,650,isB?1750:1800);
  for(const z of [0,100,130,720,750,1230,1260,1740,1770,2250,2280,2870,2900,3000]){const y=oy-z*s;a+=ln(490,y,530,y)+tx(535,y+3,'+'+f(z),10)}
  if(kind!=='levels'){const width=isB?557:582;a+=dim(ox+633*s,110,ox+(633+width)*s,110,width);a+=tx(185,140,'2 folhas de '+f(width)+' x '+f(2710)+' (nominal)',12)}
  notes=['Cotas verticais desde piso acabado.','Soculo: +0 a +'+f(100)+'.','Base: +'+f(100)+' a +'+f(130)+'.','Tampo: +'+f(2870)+' a +'+f(2900)+'.','Compensador: '+f(100)+' nominal.','Prateleiras: '+f(30)+' de espessura.','Um apoio DA proposto; retorno sem DB.','Vao livre entre prateleiras: '+f(480)+'.','Vao inferior e superior: '+f(590)+'.','Folha: '+f(2710)+' de altura nominal.','Confirmar deducao do kit de correr.'];
 }else{
  const pages={
   halljoin:[['01 / CORPO E REVESTIMENTOS','Paineis estruturais: MDF duplado 30 mm, formado por 2 placas de 15 mm.','Acabamento interno: ARAUCO LINHO. Externo aparente: ARAUCO JEQUITIBA.','Colagem integral das faces internas, prensagem plana e cura conforme adesivo.','Nao colar sobre revestimento melaminico sem processo homologado pelo fornecedor.','Dimensoes da tabela sao ACABADAS; considerar revestimentos e fitas no corte.'],['02 / ENCONTROS','Bases e tampos em dois retangulos com junta de topo: sem sobreposicao.','Unir B01/B02 e T01/T02 com cavilhas e conectores compativeis com MDF.','Laterais entre base e tampo. Montantes DA/DB entre as prateleiras fixas.','F01 de 5 mm nas travessas R01/R02; F02 de 5 mm sobre a lateral estrutural L01.','Fixacoes removiveis para montagem; posicoes e diametros conforme ferragem escolhida.'],['03 / SEQUENCIA DE MONTAGEM','Conferir obra; executar soculo nivelado; montar bases, laterais e travessas.','Inserir apoios/prateleiras por nivel; fechar tampo e fundo; instalar canto fixo.','Ancorar corpo a parede adequada; instalar trilhos e folhas; regular e testar curso.','Nao usar fundo de 5 mm como unico contraventamento ou ponto de ancoragem.','Fixacao a parede depende do substrato: confirmar buchas, parafusos e quantidade.']],
   halldoor:[['01 / QUATRO PORTAS DE CORRER','Frente A: D01 e D02, cada folha 582 x 2710 mm (altura nominal).','Retorno B: D03 e D04, cada folha 557 x 2710 mm (altura nominal).','Substrato MDF 15 mm + ripas de MDF 15 mm = 30 mm maximos.','Acabamento ARAUCO JEQUITIBA, veios verticais; contraface equilibrada.','Este conjunto ripado nao e uma placa macica de 30 mm. Corpo duplado: 2 x 15 mm.'],['02 / MODULACAO DO RIPADO','Ripas: 20 mm de face x 15 mm de espessura, verticais, vao de 20 mm.','D01/D02: 15 ripas por folha; margens laterais 1 mm.','D03/D04: 14 ripas por folha; margens laterais 8,5 mm.','Comprimento nominal das ripas: 2710 mm; acabamento em todas as bordas aparentes.','Sobreposicao das folhas: 30 mm; folgas laterais fechadas: 3 mm por extremidade.'],['03 / TRILHOS EMBUTIDOS — INTERFACE A CONFIRMAR','Dois sistemas independentes, cada um com duas vias; comprimentos 1140 / 1090 mm.','Reserva transversal 90 mm; planos de folha separados por 40 mm.','Volume cinza 90 x 12 mm e somente reserva; NAO e desenho de usinagem.','Deducao vertical provisoria: 30 mm. Altura final = vao 2740 - deducao do fabricante.','Definir kit para altura, espessura e massa reais; prever antiqueda, batentes e regulagem.','Confirmar curso, puxador, acesso ao canto e ausencia de choque entre os dois ramos.','Nao usinar rasgos nem cortar folhas antes de confirmar perfil, cargas e ficha do kit.']],
   hallstone:[['01 / GEOMETRIA DO SOCULO','Envelope em L: 1800 x 1750 mm; profundidade dos ramos 600 mm; altura 100 mm.','Q01/Q02 no 3D representam o volume acabado, nao uma pedra macica de 100 mm.','Material: quartzito branco conforme referencia do SketchUp.','Variedade comercial, lote, acabamento e espessura da chapa: confirmar com marmoraria.'],['02 / COMPOSICAO CONSTRUTIVA','Prever suporte continuo, estavel e nivelado sob as bases de MDF.','Proposta: soculo de suporte revestido em quartzito; dimensionar suporte na obra.','Altura de suporte + assentamento + capa deve totalizar 100 mm acabados.','Tirar moldes apos levantamento; planejar juntas, bordas aparentes e encontro no L.','Nao apoiar MDF sobre base umida; prever separacao adequada e vedacao dos encontros.'],['03 / LIBERACAO','Corte de pedra depende da espessura real, juntas e tipo de encontro aprovado.','Por isso Q01/Q02 NAO integram a lista de corte de chapas de pedra.','Conferir acesso e transporte, planicidade, nivel e esquadro antes da marcenaria.']],
   hallcut:[['01 / LISTA DE PECAS ABAIXO DA PRANCHA','Cada ID corresponde a uma peca modelada; X / Y / Z sao dimensoes acabadas.','Paineis de 30 mm: fabricar cada ID a partir de duas laminas de 15 mm.','F01/F02 sao simples de 5 mm; portas D01–D04: base 15 mm mais ripas 15 mm.','Ripas aparecem agrupadas na tabela; quantidade indicada em cada linha.','Veios verticais nas portas, ripas e laterais aparentes; compor visualmente os encontros.'],['02 / FITAS, FURACOES E TOLERANCIAS','Fitas de borda compativeis com ARAUCO LINHO / JEQUITIBA em bordas aparentes.','Definir espessura da fita antes do corte: bruto = acabado menos fitas correspondentes.','Usinagem e furacao dependem dos conectores; nao ha coordenadas de furacao liberadas.','Tolerancias de corte, colagem e montagem devem ser acordadas com a marcenaria.','Folgas de obra e arremates dependem do levantamento; envelope mantido do SketchUp.'],['03 / STATUS DOS DADOS','CONFIRMADO PELO CLIENTE: corpo 30 mm, fundo 5 mm, acabamentos, quatro folhas ripadas.','EXTRAIDO: envelope 1800 x 1750 x 3000 mm e niveis das quatro prateleiras.','PROPOSTO NESTA REVISAO: profundidade 600 mm, subdivisoes, apoios, folgas e ripado.','A CONFIRMAR: levantamento, ferragens, pedra, fitas, fixacoes e cargas de uso.','A precisao numerica do modelo nao substitui essas definicoes de fabricacao.']]};
  let y=125;for(const [title,...lines] of pages[kind]||pages.hallcut){a+=tx(60,y,title,14);y+=25;for(const line of lines){a+=tx(60,y,line,12);y+=22}y+=22}
 }
 if(notes.length)notes.forEach((n,i)=>a+=tx(760,145+i*29,n,12));
 $('#sheet').innerHTML=`<rect width="1120" height="760" fill="white"/><rect x="20" y="20" width="1080" height="720" fill="none" stroke="#c9cec3"/>${tx(50,61,titles[kind]||titles.hallcut,24)}${tx(50,87,'HALL / REVISAO 08 / COTAS EM '+unit.toUpperCase()+' / DIMENSOES ACABADAS',11)}${a}${ln(20,680,1100,680)}${tx(45,706,'GABRIEL FERMINO ARQUITETURA',14)}${tx(45,728,'Modelo parametrico — conferir obra e ferragens antes de fabricar. Sem escala de impressao.',11)}${tx(790,706,'DETALHAMENTO PARA COMPATIBILIZACAO',10)}${tx(790,728,'Folhas / trilhos: dimensoes nominais.',10)}`;
 $('#measureTable').innerHTML=hallPieces.map(p=>`<tr><td>${esc(p.id+' · '+p.label)}<small style="display:block;white-space:normal;max-width:340px">${esc(p.note||'MDF duplado 30 mm — 2 x 15 mm; dimensoes acabadas.')}</small></td><td>${f(p.w)} ${unit}</td><td>${f(p.d)} ${unit}</td><td>${f(p.h)} ${unit}</td><td>${f(p.z)} ${unit}</td><td>${esc(mats[p.mat].name)}</td></tr>`).join('');
 document.querySelector('.technicalHelp').textContent='Hall remodelado por codigo. Tabela de pecas acabadas: X / Y / altura, nao plano de corte bruto. Consulte as notas da prancha. Altura das portas e rasgos dos trilhos dependem do kit escolhido.';
}
for(const [value,label] of [['halljoin','MAR 05 · Composicao e montagem'],['halldoor','MAR 06 · Portas e trilhos'],['hallstone','MAR 07 · Quartzito'],['hallcut','MAR 08 · Pecas e especificacoes']]){const o=document.createElement('option');o.value=value;o.textContent=label;$('#sheetType').append(o)}
// Prancha integrada: todas as vistas derivam das pecas do modelo parametrico.
function presentationSheet(){
 const s=$('#sheet'),unit=$('#units').value,F=n=>fmt(n/1000),E=esc;
 s.setAttribute('viewBox','0 0 1600 1100');
 const text=(x,y,t,size=13,color='#41473e')=>`<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" fill="${color}">${E(t)}</text>`;
 const line=(x,y,X,Y,color='#70776d',dash='')=>`<path d="M${x},${y}L${X},${Y}" fill="none" stroke="${color}" stroke-width="1" ${dash?'stroke-dasharray="'+dash+'"':''}/>`;
 const box=(x,y,w,h,fill='#e5e3d8')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="#72786c" stroke-width=".8"/>`;
 function dim(x,y,X,Y,n){const vertical=Math.abs(Y-y)>Math.abs(X-x),cx=(x+X)/2,cy=(y+Y)/2;return line(x,y,X,Y,'#a34f49')+line(x-4,y+5,x+4,y-5,'#a34f49')+line(X-4,Y+5,X+4,Y-5,'#a34f49')+`<g transform="translate(${cx},${cy}) rotate(${vertical?-90:0})"><rect x="-25" y="-10" width="50" height="18" fill="white"/>${text(-20,3,F(n),12,'#963e3a')}</g>`}
 const label=(x,y,n,t)=>`<circle cx="${x+14}" cy="${y-4}" r="14" fill="white" stroke="#626d5a"/>${text(x+10,y,n,12)}${text(x+36,y,t,14)}${text(x+36,y+19,'COTAS EM '+unit.toUpperCase()+' · SEM ESCALA',9)} `;
 let svg='<rect width="1600" height="1100" fill="#fff"/><rect x="15" y="15" width="1570" height="1070" fill="none" stroke="#636b5c"/>';
 svg+=box(30,30,600,38,'#eee6d8')+text(45,56,'01  ARMÁRIO DO HALL · MARCENARIA',23);
 [['ARAUCO LINHO · corpo duplado 30 mm / fundos 5 mm','#dedbc9'],['ARAUCO JEQUITIBA · portas ripadas / arremates','#bea17b'],['QUARTZITO BRANCO · sóculo de 100 mm (envelope)','#eee9df']].forEach(([t,c],i)=>{svg+=box(40,84+i*24,14,14,c)+text(65,96+i*24,t,12)});
 // Perspectiva por faces: sem capturas externas, gerada da mesma lista de pecas.
 const items=hallDraw.filter(p=>!['rail'].includes(p.kind));
 const proj=(x,y,z)=>[165+(x-y)*.055,558+(x+y)*.020-z*.105];
 const polys=[];
 for(const p of items){const x=p.x,y=p.y,z=p.z,X=x+p.w,Y=y+p.d,Z=z+p.h,c=p.kind==='rib'?'#b3956c':p.kind==='door'?'#cbb08a':p.kind==='stone'?'#eee8dd':/^(C|CA|CB)/.test(p.id)?'#c4aa85':'#dedccf';
 for(const pts of [[[x,y,Z],[X,y,Z],[X,Y,Z],[x,Y,Z]],[[x,Y,z],[X,Y,z],[X,Y,Z],[x,Y,Z]],[[X,y,z],[X,Y,z],[X,Y,Z],[X,y,Z]]])polys.push({order:pts.reduce((v,q)=>v+q[0]+q[1]+q[2]*.01,0)/4,pts:pts.map(q=>proj(...q)),c});}
 polys.sort((a,b)=>a.order-b.order).forEach(p=>svg+=`<polygon points="${p.pts.map(q=>q.join(',')).join(' ')}" fill="${p.c}" stroke="#7d806e" stroke-width=".35"/>`);
 svg+=label(42,650,'1','PERSPECTIVA')+dim(42,558,42,243,3000);
 // Elevacoes alinhadas. Retangulos em cada plano sao recortados ao modulo representado.
 function elevation(x,y,axis,internal,number,title){
  const sc=.115,width=axis==='A'?1800:1750,base=y,xx=x;
  svg+=box(xx,base-3000*sc,width*sc,3000*sc,'#fbfaf7');
  const selected=hallDraw.filter(p=>p.kind!=='rail'&&(internal?!['door','rib'].includes(p.kind):p.kind==='door'||p.kind==='rib'||p.kind==='stone'||['CA','CB','C01','C02','L02','L03'].includes(p.id)));
  for(const p of selected){if(!internal&&(p.kind==='door'||p.kind==='rib')&&!p.id.startsWith(axis==='A'?'D01':'D03')&&!p.id.startsWith(axis==='A'?'D02':'D04'))continue;
   if(internal&&axis==='A'&&p.y>510)continue;
   const q=axis==='A'?p.x:p.y,w=axis==='A'?p.w:p.d;
   svg+=box(xx+q*sc,base-(p.z+p.h)*sc,w*sc,p.h*sc,p.kind==='rib'?'#bca078':p.kind==='door'?'#d4bea0':p.kind==='stone'?'#eee9df':'#e4e2d7');
  }
  svg+=dim(xx-22,base,xx-22,base-3000*sc,3000)+dim(xx,base+25,xx+width*sc,base+25,width);
  if(internal){for(const z of [130,720,750,1230,1260,1740,1770,2250,2280,2870])svg+=line(xx+width*sc,base-z*sc,xx+width*sc+8,base-z*sc,'#a34f49');
    for(const [lo,hi] of [[130,720],[750,1230],[1260,1740],[1770,2250],[2280,2870]])svg+=dim(xx+width*sc+19,base-lo*sc,xx+width*sc+19,base-hi*sc,hi-lo);
    for(const z of [720,1230,1740,2250])svg+=text(xx+45,base-z*sc-6,'PRATELEIRA 30',9);
  }else{const st=633,leaf=axis==='A'?582:557;svg+=dim(xx+st*sc,base-3000*sc-22,xx+(st+leaf)*sc,base-3000*sc-22,leaf);
   svg+=text(xx+77,base-2200*sc,'←  CORRER  →',10,'#67573f')+text(xx+65,base-1500*sc,axis==='A'?'D01 / D02':'D03 / D04',12);
   svg+=dim(xx+width*sc+18,base-145*sc,xx+width*sc+18,base-2855*sc,2710);
  }
  svg+=label(xx-12,650,number,title);
 }
 elevation(360,597,'A',false,'2','FRENTE A');elevation(690,597,'A',true,'3','VISTA INTERNA A');elevation(1010,597,'B',false,'4','FRENTE B / RETORNO');
 // Planta horizontal real das pecas no nivel 1500 mm.
 const px=95,py=991,ps=.128;
 for(const p of hallDraw.filter(p=>p.z<1500&&p.z+p.h>1500&&p.kind!=='rail'&&p.kind!=='rib'))svg+=box(px+p.x*ps,py-(p.y+p.d)*ps,p.w*ps,p.d*ps,p.kind==='door'?'#c8ac84':'#e0dfd3');
 svg+=dim(px,py+25,px+1800*ps,py+25,1800)+dim(px-25,py,px-25,py-1750*ps,1750)+dim(px,py-1750*ps-24,px+600*ps,py-1750*ps-24,600);
 svg+=text(280,927,'A ↑',14,'#9d4943')+text(195,830,'← B',14,'#9d4943')+label(58,1060,'5','PLANTA · CORTE +'+F(1500));
 // Corte local parametrico: corpo, fundo, reserva de trilho e portas.
 svg+=text(432,731,'CORTE C–C · PROFUNDIDADE / PORTAS',14);
 const dx=450,dy=945,cs=.68;
 svg+=box(dx,dy-150,5*cs,150,'#d6d4c7')+box(dx,dy,600*cs,30*cs,'#dedccf');
 svg+=box(dx+510*cs,dy-12*cs,90*cs,12*cs,'#a6aaa6');
 for(const q of [525,565])svg+=box(dx+q*cs,dy-150,15*cs,140,'#cbb38e')+box(dx+(q+15)*cs,dy-150,15*cs,140,'#b69a72');
 svg+=dim(dx,dy+52,dx+600*cs,dy+52,600)+dim(dx+510*cs,dy-179,dx+600*cs,dy-179,90)+dim(dx-20,dy,dx-20,dy+30*cs,30);
 svg+=text(450,790,'Fundo 5 mm',11)+line(495,797,dx+3,dy-40)+text(450,827,'MDF duplado: 15 + 15 = 30 mm',12)+text(450,858,'LINHO · face interna / bordas acabadas',11);
 svg+=label(432,1058,'6','DETALHE CONSTRUTIVO')+text(880,781,'PORTA RIPADA',14);
 svg+=box(886,808,100,15,'#cbb38e')+box(886,793,20,15,'#b69a72')+box(926,793,20,15,'#b69a72')+box(966,793,20,15,'#b69a72');
 svg+=text(885,850,'Face 20 / vão 20 / relevo 15 mm',12)+text(885,875,'Base 15 + ripa 15 = 30 mm',12)+text(885,912,'JEQUITIBA · veios verticais',12)+text(885,944,'Trilhos cinza: reserva geométrica.',12)+text(885,966,'Perfil e rasgos: confirmar kit.',12)+text(885,988,'Folhas: altura nominal 2710 mm.',12)+text(885,1010,'Não usinar por este esquema.',12);
 // Carimbo lateral, avisos e identidade propria.
 svg+=box(1318,28,250,1040,'#fafaf7');
 if(D.logo)svg+=`<image href="${D.logo}" x="1330" y="40" width="222" height="92" preserveAspectRatio="xMidYMid meet"/>`;
 const block=(y,title,lines)=>{svg+=line(1318,y,1568,y)+text(1330,y+24,title,12);lines.forEach((t,i)=>svg+=text(1330,y+49+i*21,t,11))};
 block(145,'QUADRO DE AVISOS',['Conferir todas as medidas na obra.','Cotas são dimensões acabadas.','Folgas e divisões: proposta de projeto.','Confirmar sistema de portas antes','do corte das folhas e dos rasgos.','Fixação conforme parede existente.','Não apoiar cargas no fundo de 5 mm.']);
 block(365,'MATERIAIS',['MDF ARAUCO LINHO','Corpo: 2 x 15 mm colados.','Fundos: 5 mm simples.','MDF ARAUCO JEQUITIBA','Portas: base 15 + ripas 15 mm.','Quartzito branco: confirmar lote.']);
 block(555,'PROJETO',['LUCIANA & LUCIANO','Armário do Hall','GABRIEL FERMINO ARQUITETURA']);
 block(670,'CONTROLE',['Revisão 04 · modelagem por código','Origem dimensional: SketchUp.','Conferir medidas e ferragens.','Validar antes da fabricação.']);
 block(800,'UNIDADES / ESCALA',['Cotas em '+unit.toUpperCase()+'.','Sem escala fixa de impressão.','Valores numéricos prevalecem.']);
 block(920,'STATUS',['Detalhamento para compatibilização.','Não liberado para fabricação.']);
 svg+=text(1350,1040,'MAR 00',32);
 s.innerHTML=svg;
 // A tabela usa o mesmo inventario parametrico, sem duplicar dimensoes manualmente.
 const current=$('#sheet').innerHTML;hallSheet('hallcut');s.setAttribute('viewBox','0 0 1600 1100');s.innerHTML=current;
 document.querySelector('.technicalHelp').textContent='Prancha de marcenaria: vistas geradas das peças do Hall. Medidas em '+unit+'. Detalhes ampliados são esquemáticos; dimensões do kit de correr e fixações continuam pendentes. Os renders mostram o projeto de referência, podendo divergir da remodelagem técnica.';
}
function sheet(){if(!parts.length)return;$('#sheet').setAttribute('viewBox','0 0 1120 760');if($('#sheetType').value==='hallboard'){presentationSheet();return;}if(!['architecture','floor','ceiling'].includes($('#sheetType').value)){hallSheet($('#sheetType').value);return;}const kind=$('#sheetType').value,unit=$('#units').value,architect=['architecture','floor','ceiling'].includes(kind),plan=['architecture','floor','ceiling','cabplan'].includes(kind);let ps=parts.filter(p=>architect?(kind==='floor'?p.category==='piso':kind==='ceiling'?p.category==='forro':p.category!=='forro'):p.root===12);const bounds=architect?D.bounds:D.hallBounds,lo=bounds[0].slice(),hi=bounds[1].slice();if(kind==='architecture'){lo[2]=0;hi[1]=19.75}const ax=kind==='side'?1:0,ay=plan?1:2,dx=hi[ax]-lo[ax],dy=hi[ay]-lo[ay],scale=Math.min(600/dx,460/dy),ox=100+(600-dx*scale)/2,oy=600-(460-dy*scale)/2,pt=p=>[ox+(p[ax]-lo[ax])*scale,oy-(p[ay]-lo[ay])*scale];let body='';
const line=(a,b,color='#4b514a',width=.7,dash='')=>`<path d="M${a[0].toFixed(2)},${a[1].toFixed(2)}L${b[0].toFixed(2)},${b[1].toFixed(2)}" fill="none" stroke="${color}" stroke-width="${width}" ${dash?'stroke-dasharray="'+dash+'"':''}/>`;
function dim(a,b,offset,label){const vx=b[0]-a[0],vy=b[1]-a[1],ll=Math.hypot(vx,vy)||1,n=[-vy/ll*offset,vx/ll*offset],aa=[a[0]+n[0],a[1]+n[1]],bb=[b[0]+n[0],b[1]+n[1]],x=(aa[0]+bb[0])/2,y=(aa[1]+bb[1])/2;return line(a,aa,'#8a806c',.65)+line(b,bb,'#8a806c',.65)+line(aa,bb,'#8a806c',.65)+line([aa[0]-3,aa[1]+3],[aa[0]+3,aa[1]-3],'#645b4a',1)+line([bb[0]-3,bb[1]+3],[bb[0]+3,bb[1]-3],'#645b4a',1)+`<rect x="${x-30}" y="${y-10}" width="60" height="18" fill="white"/><text x="${x}" y="${y+3}" text-anchor="middle" font-size="12" fill="#60533e">${esc(label)}</text>`}
if(kind==='architecture'){for(const p of ps){if(p.category==='piso'){for(let i=0;i<p.edgeArray.length;i+=6){const a=Array.from(p.edgeArray.slice(i,i+3)),b=Array.from(p.edgeArray.slice(i+3,i+6));if(Math.abs(a[2])<.01&&Math.abs(b[2])<.01)body+=line(pt(a),pt(b),'#c6cbbf',.6)}}for(const s of p.section||[])body+=line(pt([...s[0],1.2]),pt([...s[1],1.2]),p.category==='paredes'?'#262e28':'#8a8b7c',p.category==='paredes'?1.8:.6)}}else{for(const p of ps)for(let i=0;i<p.edgeArray.length;i+=6){const a=Array.from(p.edgeArray.slice(i,i+3)),b=Array.from(p.edgeArray.slice(i+3,i+6));body+=line(pt(a),pt(b),p.category==='marcenaria'?'#525c50':'#68715f',.65)}}
if(kind==='architecture'){
for(const y of [1.3,5.5,11,16.5]){let intervals=[];for(const part of ps.filter(p=>p.category==='paredes')){let xs=[];for(const seg of part.section||[]){const [a,b]=seg;if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]))}xs.sort((a,b)=>a-b);xs=xs.filter((x,i)=>!i||x-xs[i-1]>.0001);for(let i=0;i+1<xs.length;i+=2)intervals.push([xs[i],xs[i+1]])}intervals.sort((a,b)=>a[0]-b[0]);let merged=[];for(const r of intervals){const last=merged[merged.length-1];if(last&&r[0]<=last[1]+.001)last[1]=Math.max(last[1],r[1]);else merged.push(r.slice())}for(let i=0;i+1<merged.length;i++){const a=merged[i][1],b=merged[i+1][0];if(b-a>.6){const p=pt([a,y,0]),q=pt([b,y,0]),mid=(p[0]+q[0])/2;body+=line(p,q,'#a99a7b',.5,'3 3')+`<rect x="${mid-18}" y="${p[1]-7}" width="36" height="13" fill="white"/><text x="${mid}" y="${p[1]+3}" font-size="9" text-anchor="middle" fill="#74644b">${fmt(b-a)}</text>`}}}}
let a=lo.slice(),b=lo.slice();b[ax]=hi[ax];body+=dim(pt(a),pt(b),34,fmt(dx));a=lo.slice();b=lo.slice();a[ax]=b[ax]=hi[ax];b[ay]=hi[ay];body+=dim(pt(a),pt(b),42,fmt(dy));
if(!architect&&!plan){const selected=parts.filter(p=>p.root===12&&(p.name.startsWith('Prateleira')||p.name==='Base em quartzito'||p.name==='Fechamento superior'));for(const part of selected){const z=(part.bounds[0][2]+part.bounds[1][2])/2,pp=lo.slice();pp[ax]=hi[ax];pp[2]=z;const q=pt(pp),labelX=ox+dx*scale+85;body+=line(q,[labelX,q[1]],'#a8aea0',.5,'3 3');body+=`<text x="${labelX+6}" y="${q[1]+4}" font-size="11" fill="#5c664f">+${fmt(part.bounds[0][2])} / +${fmt(part.bounds[1][2])}</text>`}}
const title={architecture:'Planta de arquitetura',floor:'Piso e base · geometria',ceiling:'Forro · projeção geométrica',cabplan:'Armário do hall · planta',front:'Armário do hall · elevação X',side:'Armário do hall · elevação Y',levels:'Armário do hall · níveis'}[kind],code={architecture:'ARQ 01',floor:'ARQ 02',ceiling:'ARQ 03',cabplan:'MAR 01',front:'MAR 02',side:'MAR 03',levels:'MAR 04'}[kind];
let notes=architect?['Vãos cotados nos eixos tracejados.','Planta: corte a '+fmt(1.2)+' '+unit+'.','Forro: nível inferior '+fmt(3)+' '+unit+'.','Piso/base: altura '+fmt(.15)+' '+unit+'.','Sistemas e composição: a definir.','Paginação e fixações: a definir.']:['Conjunto: '+fmt(1.8)+' × '+fmt(1.75)+' × '+fmt(3)+' '+unit+'.','Base modelada: '+fmt(.1)+' '+unit+'.','Prateleiras: altura '+fmt(.03)+' '+unit+'.','Ferragens e fixações: a definir.','Folgas de fabricação: a definir.','Conferir as medidas no local.'];
let notesSVG=notes.map((s,i)=>`<text x="850" y="${165+i*25}" font-size="12" fill="#626c5f">${esc(s)}</text>`).join('');
$('#sheet').innerHTML=`<rect width="1120" height="760" fill="white"/><rect x="20" y="20" width="1080" height="720" fill="none" stroke="#c6cbc0"/><text x="50" y="61" font-family="Georgia,serif" font-size="24" fill="#28342b">${esc(title)}</text><text x="50" y="85" font-size="11" letter-spacing="1.2" fill="#78816f">LUCIANA &amp; LUCIANO / REVISÃO 02 / COTAS EM ${unit.toUpperCase()}</text><line x1="830" x2="830" y1="110" y2="650" stroke="#e2e5dc"/>${body}<text x="850" y="134" font-size="11" fill="#8e7953" letter-spacing="1.5">NOTAS DE PROJETO</text>${notesSVG}<rect x="845" y="355" width="240" height="74" fill="#f7f3eb"/><text x="857" y="378" font-size="12" fill="#866e46">EM DESENVOLVIMENTO</text><text x="857" y="400" font-size="11" fill="#866e46">Não liberado para fabricação.</text><text x="850" y="468" font-size="11" fill="#6d7766">${plan?'Projeção ortogonal em planta.':'Projeção de arestas; linhas internas.'}</text><text x="850" y="487" font-size="11" fill="#6d7766">Cotas de envelopes geométricos.</text><text x="850" y="506" font-size="11" fill="#6d7766">Sem indicação de giro das portas.</text><line x1="20" x2="1100" y1="670" y2="670" stroke="#c6cbc0"/><text x="50" y="701" font-size="15" letter-spacing="1" fill="#29342c">GABRIEL FERMINO</text><text x="50" y="720" font-size="10" letter-spacing="2" fill="#75806e">ARQUITETURA</text><text x="405" y="700" font-size="12" fill="#697360">Fonte: ARMÁRIO - HALL.skp</text><text x="405" y="720" font-size="11" fill="#697360">Sem escala de impressão · cotas prevalecem</text><text x="985" y="714" font-family="Georgia,serif" font-size="27" fill="#394833">${code}</text>`;
$('#measureTable').innerHTML=parts.filter(p=>p.root===12).map(p=>{const sz=sub(p.bounds[1],p.bounds[0]);return `<tr><td>${esc(p.name)}</td>${sz.map(n=>'<td>'+fmt(n)+' '+unit+'</td>').join('')}<td>${fmt(p.bounds[0][2])} ${unit}</td><td>${esc([...new Set(p.meshes.map(m=>mats[m.material].name.replace('MDF ARAUCO ','MDF ')))].join(', '))}</td></tr>`}).join('')}
$('#sheetType').onchange=sheet;$('#downloadSheet').onclick=()=>{const blob=new Blob([new XMLSerializer().serializeToString($('#sheet'))],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='GF-'+$('#sheetType').value+'-'+$('#units').value+'.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};$('#printSheet').onclick=()=>window.print();
// Selecao de marcenaria pela geometria real projetada; sem bibliotecas externas.
let selectedFurniture=null,selectionDown=null;
const furnitureCard=document.createElement('div');furnitureCard.id='furnitureCard';furnitureCard.hidden=true;
furnitureCard.innerHTML='<div class="eyebrow">MÓVEL SELECIONADO</div><h3 id="furnitureName"></h3><p id="furnitureNote"></p><button id="furnitureDrawing">Abrir prancha deste móvel ↗</button><button id="furnitureBack">Voltar ao ambiente</button>';
document.querySelector('.stage').append(furnitureCard);
function furnitureBounds(root){const group=parts.filter(p=>p.root===root);return [group.reduce((a,p)=>a.map((v,i)=>Math.min(v,p.bounds[0][i])),[Infinity,Infinity,Infinity]),group.reduce((a,p)=>a.map((v,i)=>Math.max(v,p.bounds[1][i])),[-Infinity,-Infinity,-Infinity])];}
const savedVisible=visible;
visible=function(p){return selectedFurniture!==null?cat[p.category]&&p.on&&p.root===selectedFurniture:savedVisible(p)};
const savedFit=fit;
fit=function(){if(selectedFurniture===null){savedFit();return}const b=furnitureBounds(selectedFurniture),sz=sub(b[1],b[0]),asp=Math.max(.3,canvas.clientWidth/canvas.clientHeight);target=b[0].map((n,i)=>(n+b[1][i])/2);yaw=furnitureFacing(selectedFurniture);pitch=Math.atan(1/Math.sqrt(2));if(view==='plan'){target[2]=0;span=(matchMedia('(orientation: landscape)').matches?Math.max(sz[0],sz[1]/asp):Math.max(sz[1],sz[0]/asp))*1.55}else{const w=(sz[0]+sz[1])*Math.SQRT1_2,h=Math.sin(pitch)*w+Math.cos(pitch)*sz[2];span=Math.max(h,w/asp)*1.55}request()};
function clearFurniture(){selectedFurniture=null;furnitureCard.hidden=true;isCabinet=false;shadowDirty=true;}
const savedFocusRoom=focusRoom;
focusRoom=function(r){clearFurniture();savedFocusRoom(r)};
function selectFurniture(root){view='iso';document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view==='iso'));$('#orient').textContent='3D / ISOMÉTRICA';selectedFurniture=root;isCabinet=root===12;parts.filter(p=>p.root===root).forEach(p=>{p.on=true;cat[p.category]=true});const name=root===12?'Armário do Hall':parts.find(p=>p.root===root)?.name||'Marcenaria';$('#sceneName').textContent=name;$('#furnitureName').textContent=name;$('#furnitureNote').textContent=root===12?'Peça isolada · vistas e detalhes construtivos disponíveis.':'Peça isolada · este elemento ainda não possui prancha de detalhamento.';$('#furnitureDrawing').hidden=root!==12;furnitureCard.hidden=false;document.body.classList.remove('panelOpen');$('#panel').setAttribute('aria-expanded','false');$('#sceneSubtitle').textContent='Móvel selecionado · '+(view==='plan'?'Planta humanizada':'Isométrica');shadowDirty=true;fit();}
$('#furnitureBack').onclick=()=>{focusRoom(room)};
$('#furnitureDrawing').onclick=()=>{$('#sheetType').value='hallboard';$('#docs').click()};
// Guarda vertices decodificados para intersecao no clique, sem duplicar a geometria.
const oldUnpack=unpack;
unpack=async function(encoded){const data=await oldUnpack(encoded);return data};
function inverseMatrix(m){const a=Array.from({length:4},(_,r)=>[...Array.from({length:4},(_,c)=>m[c*4+r]),...Array.from({length:4},(_,c)=>r===c?1:0)]);for(let i=0;i<4;i++){let k=i;for(let j=i+1;j<4;j++)if(Math.abs(a[j][i])>Math.abs(a[k][i]))k=j;if(Math.abs(a[k][i])<1e-12)return null;[a[i],a[k]]=[a[k],a[i]];const v=a[i][i];for(let j=0;j<8;j++)a[i][j]/=v;for(let r=0;r<4;r++)if(r!==i){const f=a[r][i];for(let j=0;j<8;j++)a[r][j]-=f*a[i][j]}}return a.map(row=>row.slice(4))}
function unproject(inv,x,y,z){const q=inv.map(row=>row[0]*x+row[1]*y+row[2]*z+row[3]);return q.slice(0,3).map(n=>n/q[3])}
function rayBox(o,d,b){let near=0,far=Infinity;for(let i=0;i<3;i++){if(Math.abs(d[i])<1e-10){if(o[i]<b[0][i]||o[i]>b[1][i])return false}else{let a=(b[0][i]-o[i])/d[i],c=(b[1][i]-o[i])/d[i];if(a>c)[a,c]=[c,a];near=Math.max(near,a);far=Math.min(far,c);if(near>far)return false}}return true}
function hitTriangle(o,d,a,b,c){const e1=sub(b,a),e2=sub(c,a),p=cross(d,e2),det=dot(e1,p);if(Math.abs(det)<1e-10)return null;const inv=1/det,t=sub(o,a),u=dot(t,p)*inv;if(u<0||u>1)return null;const q=cross(t,e1),v=dot(d,q)*inv;if(v<0||u+v>1)return null;const dist=dot(e2,q)*inv;return dist>0?dist:null}
function pickFurniture(e){if(!gl||technical||!matrix||document.body.classList.contains('rendersOpen'))return;const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*2-1,y=1-(e.clientY-r.top)/r.height*2,inv=inverseMatrix(matrix);if(!inv)return;const origin=unproject(inv,x,y,-1),dir=norm(sub(unproject(inv,x,y,1),origin));let nearest=Infinity,hit=null;
 for(const p of parts){if(!visible(p)||!rayBox(origin,dir,p.bounds))continue;for(const m of p.meshes){if(mats[m.material].opacity<.5||!m.pickArray)continue;const v=m.pickArray;for(let i=0;i<v.length;i+=24){const a=[v[i],v[i+1],v[i+2]],b=[v[i+8],v[i+9],v[i+10]],c=[v[i+16],v[i+17],v[i+18]],t=hitTriangle(origin,dir,a,b,c);if(t!==null&&t<nearest&&origin[2]+dir[2]*t<=partClip(p)+.0001){nearest=t;hit=p}}}}
 if(hit&&hit.category==='marcenaria')selectFurniture(hit.root);
}
canvas.addEventListener('pointerdown',e=>{if(e.button!==0){selectionDown=null;return}if(pointers.size>1){selectionDown=null;return}selectionDown={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now(),moved:false}});
canvas.addEventListener('pointermove',e=>{if(selectionDown&&(Math.hypot(e.clientX-selectionDown.x,e.clientY-selectionDown.y)>6||pointers.size>1))selectionDown.moved=true});
canvas.addEventListener('pointerup',e=>{if(selectionDown&&selectionDown.id===e.pointerId&&!selectionDown.moved&&performance.now()-selectionDown.time<650)pickFurniture(e);selectionDown=null});
canvas.addEventListener('pointercancel',()=>selectionDown=null);
$('#cabinet').addEventListener('click',()=>selectFurniture(12));
$('#resetAll').addEventListener('click',()=>{clearFurniture();focusRoom(D.rooms[0])});
$('.help').textContent='Clique em um móvel para isolá-lo · Arraste para navegar · Roda para zoom';
// Revisao 07: uma unica prancha, inventario incorporado e transicao de selecao.
let furnitureTransition=0;
const directSelectFurniture=selectFurniture;
selectFurniture=function(root){
 const start={target:target.slice(),span,yaw,pitch};
 directSelectFurniture(root);
 const end={target:target.slice(),span,yaw,pitch};
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const token=++furnitureTransition,t0=performance.now(),duration=650;
 target=start.target.slice();span=start.span;yaw=start.yaw;pitch=start.pitch;
 const tick=now=>{if(token!==furnitureTransition||selectedFurniture!==root||technical)return;const t=Math.min(1,(now-t0)/duration),ease=1-Math.pow(1-t,3);target=start.target.map((v,i)=>v+(end.target[i]-v)*ease);span=start.span+(end.span-start.span)*ease;yaw=start.yaw+(end.yaw-start.yaw)*ease;pitch=start.pitch+(end.pitch-start.pitch)*ease;request();if(t<1)requestAnimationFrame(tick)};
 requestAnimationFrame(tick);
};
canvas.addEventListener('pointerdown',()=>furnitureTransition++);
canvas.addEventListener('wheel',()=>furnitureTransition++,{passive:true});
const originalClearFurniture=clearFurniture;
clearFurniture=function(){furnitureTransition++;originalClearFurniture()};
// Controles legados permanecem ocultos para preservar os eventos internos.
$('#sheetType').value='hallboard';$('#sheetType').hidden=true;$('#downloadSheet').hidden=true;$('#printSheet').textContent='Imprimir / PDF';
// Prancha unificada: dimensoes de portas, ripado e pedra calculadas pelas pecas.
const hallBoardBase=presentationSheet;
presentationSheet=function(){
 hallBoardBase();const el=$('#sheet');
 // Atualiza textos da composicao geral anterior. Os desenhos principais usam hallDraw.
 let svg=el.innerHTML;
 svg=svg.replace('QUARTZITO BRANCO · sóculo de 100 mm (envelope)','WHITE TAJ · polido · faces 20 mm / altura 100 mm');
 svg=svg.replace('Base 15 + ripa 15 = 30 mm','Base 15 + ripa 15 = 30 mm').replace('Face 20 / vão 20 / relevo 15 mm','Face 30 / vão 15 / relevo 15 mm').replace('Portas: base 15 + ripas 15 mm.','Portas: base 15 + ripas 15 mm.').replace('Quartzito branco: confirmar lote.','White TAJ polido · esp. 20 mm.');
 // Substitui a faixa de detalhes esquematicos antiga por detalhes desta revisao.
 const E=esc,F=n=>fmt(n/1000),u=$('#units').value;
 const t=(x,y,s,size=12)=>`<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" fill="#3d473c">${E(s)}</text>`;
 const r=(x,y,w,h,c='#e4dfcf')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" stroke="#737a6d" stroke-width="1"/>`;
 const l=(x,y,X,Y,c='#a14f47')=>`<path d="M${x},${y}L${X},${Y}" fill="none" stroke="${c}"/>`;
 function dim(x,y,X,Y,n){const mx=(x+X)/2,my=(y+Y)/2;return l(x,y,X,Y)+l(x-4,y+4,x+4,y-4)+l(X-4,Y+4,X+4,Y-4)+`<rect x="${mx-25}" y="${my-9}" width="50" height="18" fill="white"/>`+t(mx-20,my+4,F(n),11)}
 svg+='<rect x="418" y="704" width="880" height="366" fill="white"/>';
 svg+=t(435,730,'06 / CAVA NA RIPA · SEM ATINGIR A BASE',14);
 svg+=r(458,760,60,255,'#bea17a')+r(468,790,40,200,'#947b5b');
 svg+=dim(542,790,542,990,200)+t(572,803,'Topo: +'+F(1100)+' '+u)+t(572,830,'Base: +'+F(900)+' '+u)+t(572,870,'Ripa: 30 × 15 mm')+t(572,897,'Bolso proposto: 20 × 200 × 10 mm')+t(572,924,'Restam 5 mm de espessura na ripa.')+t(572,951,'Uma cava por folha, na ripa extrema.')+t(572,978,'Validar conforto e resistência em amostra.')+t(440,1040,'Arredondar as arestas; raio e acabamento conforme ferramenta.',11);
 svg+=t(930,730,'07 / COMPOSIÇÃO DA PORTA',14)+r(940,805,250,30,'#c8af87')+r(940,760,90,45,'#b99b70')+r(1075,760,90,45,'#b99b70');
 svg+=dim(940,744,1030,744,30)+dim(1030,854,1075,854,15)+t(930,898,'ARAUCO JEQUITIBÁ · veios verticais')+t(930,925,'Painel fechado 15 mm + ripas 15 mm.')+t(930,952,'Espessura total nas ripas: 25 mm.')+t(930,979,'Trilho inferior discreto + amortecimento.')+t(930,1006,'Sem marca; descontos conforme kit.')+t(930,1033,'Não executar rasgos sem ficha do trilho.',11);
 // Segunda faixa da mesma prancha: especificacoes essenciais e pedra, sem tabela de pecas.
 svg+='<rect x="0" y="1090" width="1600" height="640" fill="white"/><rect x="15" y="1105" width="1570" height="610" fill="none" stroke="#737a6d"/>';
 svg+=t(40,1140,'08 / SÓCULO WHITE TAJ · COTAS PARA MARMORARIA',21);
 const stone=hallDraw.filter(p=>p.kind==='stone'),sx=70,sy=1485,sc=.18;
 for(const p of stone)svg+=r(sx+p.x*sc,sy-p.y*sc-p.d*sc,p.w*sc,p.d*sc,'#f0ebe0');
 const qa=stone.find(p=>p.id==='Q01'),qb=stone.find(p=>p.id==='Q02');
 svg+=dim(sx+qa.x*sc,sy-qa.y*sc+25,sx+(qa.x+qa.w)*sc,sy-qa.y*sc+25,qa.w);
 svg+=dim(sx+qb.x*sc-24,sy-qb.y*sc,sx+qb.x*sc-24,sy-(qb.y+qb.d)*sc,qb.d);
 svg+=t(440,1190,'Q01: '+F(qa.w)+' × '+F(qa.h)+' × '+F(qa.d)+' '+u)+t(440,1216,'Q02: '+F(qb.d)+' × '+F(qb.h)+' × '+F(qb.w)+' '+u)+t(440,1255,'Quartzito White TAJ, branco exótico, polido.')+t(440,1281,'Somente nas duas faces visíveis; espessura 20 mm.')+t(440,1307,'Sóculo: altura 100 mm, face recuada 30 mm.')+t(440,1333,'Encontro de topo; Q02 recebe a extremidade de Q01.')+t(440,1359,'Cotas geométricas de projeto; ajustar juntas no molde.')+t(440,1385,'Não é bloco maciço: prever suporte contínuo sob o móvel.')+t(440,1411,'Fechamento superior LINHO igualmente recuado 30 mm.');
 svg+=t(900,1140,'09 / DEFINIÇÕES DA MARCENARIA',21);
 const notes=['Conjunto 1800 × 1750 × 3000 mm; ramos de 600 mm.','LINHO em todo o corpo; JEQUITIBÁ somente nas portas.','Corpo duplado 30 mm; fundos fixos 5 mm nos dois braços.','Uso: maleiro, mantas e almofadas. Sem instalações internas.','Quatro prateleiras nos níveis originais: 720 / 1230 / 1740 / 2250 mm.','Duas portas por ramo; acesso de aproximadamente metade da frente.','Apoio único proposto em X=900 mm; não há apoio DB no retorno.','Vãos do ramo A: 870 e 840 mm; retorno: 1210 mm nominal.','Confirmar flecha e carga admissível antes de dispensar reforço.','Canto acessível pelo interior; validar acesso com portas abertas.','Evitar emendas secas aparentes; colar/prensar os painéis duplados.','Ferragens inferiores com amortecimento e dispositivo antiqueda.','Folhas: altura nominal 2710 mm; corte final conforme trilho.'];
 notes.forEach((s,i)=>svg+=t(900,1176+i*26,s,11));
 for(const [i,id] of ['D01','D03'].entries()){const p=hallDraw.find(p=>p.id===id),w=p.w===10?p.d:p.w,n=Math.floor((w+15)/45),margin=(w-(n*30+(n-1)*15))/2;svg+=t(45,1530+i*25,(i?'D03/D04':'D01/D02')+': largura '+F(w)+' '+u+'; '+n+' ripas/folha; margens '+F(margin)+' '+u+'.',12)}
 svg+=t(45,1603,'CONFERIR TODAS AS MEDIDAS IN LOCO. Ajustar o projeto às condições verificadas antes da fabricação.',15);
 svg+=t(45,1634,'Prancha para orçamento / revisão 09. Cava: desenho proposto; confirmar pega em amostra. Trilhos e fixações: compatibilizar com fornecedor.',12);
 svg+=t(45,1678,'GABRIEL FERMINO ARQUITETURA · LUCIANA & LUCIANO · ARMÁRIO DO HALL',15);
 el.setAttribute('viewBox','0 0 1600 1730');el.innerHTML=svg;
 document.querySelector('.technicalHelp').textContent='Revisão 09 conforme respostas aprovadas. Conferir todas as medidas na obra. Cotas numéricas prevalecem; desenhos sem escala fixa. Cava e ferragens sujeitas à compatibilização pela marcenaria.';
};
// Apresentacao R10: transicao continua do enquadramento e informacoes do material.
let hallMotion=0;
selectFurniture=function(root){
 furnitureTransition++;const token=++hallMotion,wasPlan=view==='plan',wide=matchMedia('(orientation: landscape)').matches;
 const from={target:target.slice(),span,yaw:wasPlan?(wide?Math.PI:Math.PI/2):yaw,pitch:wasPlan?Math.PI/2-.001:pitch};
 directSelectFurniture(root);
 const to={target:target.slice(),span,yaw,pitch};
 const samples=$('#furnitureSamples');if(samples)samples.remove();
 const gallery=document.createElement('div');gallery.id='furnitureSamples';
 for(const [pattern,title,caption] of [[/LINHO/i,'ARAUCO LINHO','Textura do modelo · corpo'],[/JEQUITIBA/i,'ARAUCO JEQUITIBÁ','Textura do modelo · portas'],[/QUARTZITO/i,'QUARTZITO WHITE TAJ','Amostra ilustrativa · confirmar lote']]){const mat=mats.find(m=>pattern.test(m.name));if(!mat)continue;const row=document.createElement('div');row.className='furnitureSample';const img=document.createElement('img');if(mat.image)img.src=mat.image;img.alt=title;const captionEl=document.createElement('div');const strong=document.createElement('strong');strong.textContent=title;const small=document.createElement('small');small.textContent=caption;captionEl.append(strong,small);row.append(img,captionEl);gallery.append(row)}
 furnitureCard.append(gallery);
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 target=from.target.slice();span=from.span;yaw=from.yaw;pitch=from.pitch;const t0=performance.now();
 let angle=((to.yaw-from.yaw+Math.PI*3)%(Math.PI*2))-Math.PI;
 function tick(now){if(token!==hallMotion||selectedFurniture!==root||technical)return;const t=Math.min(1,(now-t0)/950),e=t*t*t*(t*(t*6-15)+10);target=from.target.map((v,i)=>v+(to.target[i]-v)*e);span=Math.exp(Math.log(from.span)+(Math.log(to.span)-Math.log(from.span))*e);yaw=from.yaw+angle*e;pitch=from.pitch+(to.pitch-from.pitch)*e;request();if(t<1)requestAnimationFrame(tick)}requestAnimationFrame(tick);
};
canvas.addEventListener('pointerdown',()=>hallMotion++);canvas.addEventListener('wheel',()=>hallMotion++,{passive:true});
$('#resetAll').addEventListener('click',()=>hallMotion++);$('#furnitureBack').addEventListener('click',()=>hallMotion++);
const originalHallHUD=drawHUD;
drawHUD=function(){originalHallHUD();if(selectedFurniture!==12||technical||view!=='iso'||!matrix)return;
 const W=canvas.clientWidth,H=canvas.clientHeight,small=W<760;
 const points=[['Sóculo · quartzito White TAJ',[1450,570,55]],['ARAUCO JEQUITIBÁ · ripado',[1450,600,2100]],['Puxador cava · 90–110 cm',[1738.5,585,1000]],['Fechamento em L · LINHO',[1350,570,2950]]];
 let labels='';const x=Math.max(12,W*.065),maxY=Math.max(160,H-130);
 points.forEach(([name,p],i)=>{if(small&&i!==0&&i!==2)return;const point=project([2.35+p[0]/1000,.15+p[1]/1000,p[2]/1000]);const ly=small?(i===0?maxY:maxY-50):140+i*62;const label=small?name.split(' · ')[0]:name;const width=Math.min(small?165:260,label.length*6.2+18),end=x+width;
 labels+=`<path d="M${point[0]},${point[1]}L${end+18},${ly+9}L${end},${ly+9}" fill="none" stroke="#6b715f" stroke-width="1"/><circle cx="${point[0]}" cy="${point[1]}" r="2.5" fill="#857452"/><rect x="${x}" y="${ly-4}" width="${width}" height="26" rx="5" fill="#ffffffed"/><text x="${x+9}" y="${ly+13}" font-family="Arial" font-size="${small?10:11}" fill="#46503e">${esc(label)}</text>`;
 });hud.innerHTML+=labels;
};
// R10 — vistas com teste de profundidade. Cotas e chamadas usam a mesma projecao.
const cabinetViewCache=new Map();
function technicalView(key,source,u,v,depth,bounds){
 if(dot(cross(u,v),depth)<0){u=u.map(n=>-n);if(bounds)bounds=[-bounds[1],-bounds[0],bounds[2],bounds[3]]}
 if(cabinetViewCache.has(key))return cabinetViewCache.get(key);
 const corners=p=>[[p.x,p.y,p.z],[p.x+p.w,p.y,p.z],[p.x+p.w,p.y+p.d,p.z],[p.x,p.y+p.d,p.z],[p.x,p.y,p.z+p.h],[p.x+p.w,p.y,p.z+p.h],[p.x+p.w,p.y+p.d,p.z+p.h],[p.x,p.y+p.d,p.z+p.h]];
 const projected=source.flatMap(corners).map(p=>[dot(p,u),dot(p,v)]),xs=projected.map(p=>p[0]),ys=projected.map(p=>p[1]);
 const ext=bounds||[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)];
 const width=720,height=Math.max(240,Math.min(1200,Math.round(width*(ext[3]-ext[2])/(ext[1]-ext[0])))),scale=Math.min((width-4)/(ext[1]-ext[0]),(height-4)/(ext[3]-ext[2]));
 const ox=(width-(ext[1]-ext[0])*scale)/2,oy=(height-(ext[3]-ext[2])*scale)/2;
 const project=p=>[ox+(dot(p,u)-ext[0])*scale,oy+(ext[3]-dot(p,v))*scale,dot(p,depth)];
 const canvas2=document.createElement('canvas');canvas2.width=width;canvas2.height=height;const ctx=canvas2.getContext('2d'),im=ctx.createImageData(width,height),zbuf=new Float32Array(width*height).fill(-Infinity),facebuf=new Int32Array(width*height).fill(-1),colors=[];
 const faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
 let faceId=0;
 for(const p of source){const world=corners(p),points=world.map(project),name=mats[p.mat]?.name||'',base=p.kind==='rail'?[173,178,172]:/JEQUITIBA/i.test(name)?[197,170,131]:p.kind==='stone'?[235,232,218]:[223,222,207];
  for(const f of faces){const n=norm(cross(sub(world[f[1]],world[f[0]]),sub(world[f[2]],world[f[0]])));if(dot(n,depth)<-.0001)continue;const light=.79+.21*Math.max(0,dot(n,norm([.3,.4,1]))),id=faceId++;colors[id]=base.map(c=>Math.round(c*light));
   for(const tri of [[f[0],f[1],f[2]],[f[0],f[2],f[3]]]){const [a,b,c]=tri.map(i=>points[i]),den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-8)continue;
    const minX=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),maxX=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c[0]))),minY=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),maxY=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c[1])));
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const px=x+.5,py=y+.5,wa=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/den,wb=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/den,wc=1-wa-wb;if(wa<-.00001||wb<-.00001||wc<-.00001)continue;const z=wa*a[2]+wb*b[2]+wc*c[2],idx=y*width+x;if(z>zbuf[idx]){zbuf[idx]=z;facebuf[idx]=id}}
   }
  }
 }
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x,id=facebuf[i];if(id<0)continue;let c=colors[id];if((x>0&&facebuf[i-1]!==id)||(y>0&&facebuf[i-width]!==id))c=c.map(n=>Math.round(n*.60));im.data.set([...c,255],i*4)}
 ctx.putImageData(im,0,0);const result={url:canvas2.toDataURL('image/png'),width,height,project};cabinetViewCache.set(key,result);return result;
}
presentationSheet=function(){
 const s=$('#sheet'),unit=$('#units').value,F=n=>fmt(n/1000),T=(x,y,t,size=13,color='#374437')=>`<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" fill="${color}">${esc(t)}</text>`;
 let svg='<rect width="2000" height="1810" fill="white"/><rect x="22" y="22" width="1956" height="1766" fill="none" stroke="#7a8275"/>';
 const line=(a,b,color='#95534b',width=.8)=>`<path d="M${a[0]},${a[1]}L${b[0]},${b[1]}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
 function tick(p){return line([p[0]-4,p[1]+4],[p[0]+4,p[1]-4],'#95534b',1.2)}
 function dimension(V,a,b,offset,vertical=false){const A=V.map(a),B=V.map(b),aa=vertical?[offset,A[1]]:[A[0],offset],bb=vertical?[offset,B[1]]:[B[0],offset],value=Math.hypot(...sub(a,b));svg+=line(A,aa,'#b0a09a',.65)+line(B,bb,'#b0a09a',.65)+line(aa,bb)+tick(aa)+tick(bb);const x=(aa[0]+bb[0])/2,y=(aa[1]+bb[1])/2;svg+=`<g transform="translate(${x},${y}) rotate(${vertical?-90:0})"><rect x="-28" y="-11" width="56" height="21" fill="white"/>${T(-23,4,F(value),12,'#8e443e')}</g>`}
 function leader(V,point,x,y,label){const p=V.map(point),w=label.length*6.5,side=x<p[0]?x+w+8:x-8;svg+=line(p,[side,y-5],'#64725e')+line([side,y-5],[x<p[0]?x: x+w,y-5],'#64725e')+`<circle cx="${p[0]}" cy="${p[1]}" r="2.4" fill="#64725e"/>`+T(x,y-11,label,12)}
 function view(key,list,u,v,d,x,y,w,h,title){const result=technicalView(key,list,u,v,d),ratio=Math.min(w/result.width,h/result.height),rw=result.width*ratio,rh=result.height*ratio,rx=x+(w-rw)/2,ry=y+(h-rh)/2;svg+=T(x,y-30,title,16)+`<image href="${result.url}" x="${rx}" y="${ry}" width="${rw}" height="${rh}"/>`;return{map:p=>{const q=result.project(p);return[rx+q[0]*ratio,ry+q[1]*ratio]},x:rx,y:ry,w:rw,h:rh}}
 const all=hallDraw,withoutDoors=all.filter(p=>p.kind!=='door'&&p.kind!=='rib'),u=[Math.SQRT1_2,-Math.SQRT1_2,0],v=[-1/Math.sqrt(6),-1/Math.sqrt(6),Math.sqrt(2/3)],depth=[1/Math.sqrt(3),1/Math.sqrt(3),1/Math.sqrt(3)];
 svg+=T(55,70,'ARMÁRIO DO HALL',29)+T(55,99,'MARCENARIA / LUCIANA & LUCIANO / REVISÃO 16',12)+T(55,126,'Cotas em '+unit+' · valores numéricos prevalecem · conferir todas as medidas in loco',12);
 if(D.logo)svg+=`<image href="${D.logo}" x="1710" y="40" width="230" height="105" preserveAspectRatio="xMidYMid meet"/>`;
 const closed=view('closed10',all,u,v,depth,70,230,385,480,'01 / ISOMÉTRICA');
 const opened=view('opened10',withoutDoors,u,v,depth,545,230,385,480,'02 / ISOMÉTRICA SEM PORTAS');
 leader(closed,[1350,570,2950],70,193,'Fechamento em L / LINHO');
 leader(closed,[1450,570,50],75,778,'Sóculo quartzito White TAJ');
 leader(closed,[1738.5,585,1000],230,737,'Puxador cava');
 leader(opened,[1350,475,1740],560,770,'Prateleira');
 leader(opened,[915,450,1900],650,193,'Apoio vertical proposto');
for(const [lo,hi] of [[130,720],[750,1230],[1260,1740],[1770,2250],[2280,2870]])dimension(opened,[1770,510,lo],[1770,510,hi],984,true);
 // Recortar os ramos para vistas normais a cada frente; o outro ramo nao se sobrepoe.
 function crop(axis,min){return all.map(p=>{const q={...p},dim=axis==='x'?'w':'d',end=q[axis]+q[dim];if(end<=min)return null;q[axis]=Math.max(min,q[axis]);q[dim]=end-q[axis];return q}).filter(Boolean)}
 const frontA=view('frontA10',crop('x',570),[1,0,0],[0,0,1],[0,1,0],1030,235,340,480,'03 / FRENTE A');
 const frontB=view('frontB10',crop('y',570),[0,-1,0],[0,0,1],[1,0,0],1510,235,340,480,'04 / FRENTE B · RETORNO');
 dimension(frontA,[570,570,0],[1800,570,0],760);dimension(frontA,[1800,600,0],[1800,600,3000],1435,true);
 dimension(frontA,[630,600,2870],[1770,600,2870],205);
 dimension(frontB,[570,570,0],[570,1750,0],760);dimension(frontB,[600,1750,0],[600,1750,3000],1475,true);
 dimension(frontB,[600,630,2870],[600,1720,2870],205);
 const doorA=all.find(p=>p.id==='D02'),doorB=all.find(p=>p.id==='D04');
 const pa=frontA.map([doorA.x+doorA.w/2,600,1900]),pb=frontB.map([600,doorB.y+doorB.d/2,1900]);svg+=`<rect x="${pa[0]-48}" y="${pa[1]-13}" width="96" height="22" fill="#ffffffe0"/>`+T(pa[0]-43,pa[1]+2,'porta de correr',12)+`<rect x="${pb[0]-48}" y="${pb[1]-13}" width="96" height="22" fill="#ffffffe0"/>`+T(pb[0]-43,pb[1]+2,'porta de correr',12);
 leader(frontA,[1738.5,585,1000],1240,807,'Puxador cava');leader(frontB,[585,1686,1000],1640,807,'Puxador cava');
 // Corte horizontal: so entidades efetivamente interceptadas por z=1500.
 const section=all.filter(p=>p.z<1500&&p.z+p.h>1500).map(p=>({...p,z:1499,h:1}));
 const cut=view('cut10',section,[1,0,0],[0,1,0],[0,0,1],100,965,355,310,'05 / PLANTA · CORTE A +'+F(1500));
 const top=view('top10',all,[1,0,0],[0,1,0],[0,0,1],610,965,355,310,'06 / VISTA SUPERIOR');
 for(const V of [cut,top]){dimension(V,[0,0,1500],[1800,0,1500],1320);dimension(V,[0,0,1500],[0,1750,1500],V.x-35,true)}
 dimension(cut,[0,1750,1500],[600,1750,1500],910);dimension(top,[1800,0,3000],[1800,600,3000],1030,true);
 leader(cut,[630,580,1500],275,1405,'Canto fixo / encontro do L');leader(top,[1250,555,3000],660,1405,'Arremate em L recuado 30 mm');
 // Cava detalhada, retirada lateral de 15 mm adjacente ao vao de 15 mm.
 svg+=T(1130,925,'07 / PUXADOR CAVA · DETALHE',16);
 const rect=(x,y,w,h,fill)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="#747b68"/>`;
 const cx=1170,cy=960,k=1.35;
 svg+=rect(cx,cy,75*k,270*k,'#eadccb')+rect(cx,cy,30*k,270*k,'#c5a477')+rect(cx+45*k,cy,30*k,270*k,'#c5a477');
 svg+=rect(cx+15*k,cy+35*k,15*k,200*k,'#eadccb');
 // Cotagem da abertura e sua altura com referencia direta aos limites desenhados.
 const detail={map:p=>[cx+p[0]*k,cy+p[1]*k]};
 dimension(detail,[15,35,0],[45,35,0],cy-19);dimension(detail,[15,35,0],[15,235,0],cx-30,true);
 svg+=line([cx+15*k,cy+35*k],[1340,1000],'#697563')+T(1350,1004,'+ '+F(1100)+' '+unit+' do piso',12)+line([cx+15*k,cy+235*k],[1340,1235],'#697563')+T(1350,1239,'+ '+F(900)+' '+unit+' do piso',12);
 svg+=T(1340,1052,'15 mm retirados de uma ripa',13)+T(1340,1077,'+ 15 mm do vão entre ripas',13)+T(1340,1102,'= 30 mm de abertura lateral.',13)+T(1340,1140,'Recorte atravessa a ripa de 15 mm.',12)+T(1340,1165,'Painel de fundo de 15 mm preservado.',12)+T(1340,1190,'Arredondar e selar as arestas.',12);
 svg+=T(1128,1360,'O recorte se abre para o vão da ripa vizinha.',12)+T(1128,1385,'Validar a pega em amostra antes de usinar as quatro folhas.',12);
 // Notas essenciais integradas, sem inventario ou lista de pecas.
 svg+=line([55,1460],[1945,1460],'#bec5b8');
 const notes=[['MATERIAIS / CONSTRUÇÃO','Corpo: ARAUCO LINHO, MDF duplado 30 mm (2 × 15).','Fundos fixos: MDF LINHO 5 mm nos dois braços.','Portas: ARAUCO JEQUITIBÁ; veios verticais.','Base 15 mm + ripas 30 × 15 mm; vãos de 15 mm.','Prateleiras: 30 mm; níveis 720 / 1230 / 1740 / 2250 mm.'],['PEDRA / ARREMATES','White TAJ branco exótico polido, espessura 20 mm.','Sóculo: 100 mm de altura; recuo de 30 mm.','Q01: 1230 × 100 × 20 mm; Q02: 1200 × 100 × 20 mm.','Encontro de topo: conferir juntas e moldes na obra.','Fechamento superior: somente L frontal; recuo 30 mm.'],['FERRAGENS / LIBERAÇÃO','Trilhos inferiores discretos, amortecimento e antiqueda.','Altura das folhas: 2710 mm nominal; validar pelo kit.','Um apoio vertical proposto; validar cargas e flecha.','Cava: 200 mm, entre +900 e +1100 mm do piso.','Conferir medidas in loco e compatibilizar antes de fabricar.']];
 notes.forEach(([title,...lines],i)=>{const x=60+i*645;svg+=T(x,1498,title,15);lines.forEach((n,j)=>svg+=T(x,1532+j*27,n,12))});
 svg+=line([55,1698],[1945,1698],'#bec5b8')+T(60,1732,'GABRIEL FERMINO ARQUITETURA',19)+T(60,1760,'Detalhamento para orçamento e compatibilização · vistas com ocultação por profundidade · sem escala fixa de impressão',12)+T(1690,1744,'MAR 01 / REV. 10',19);
 s.setAttribute('viewBox','0 0 2000 1810');s.innerHTML=svg;
 document.querySelector('.technicalHelp').textContent='As cotas e chamadas usam as coordenadas das peças nas vistas. Cortes e vistas superiores são distintos. Confirmar medidas na obra, ferragens e pega da cava antes da fabricação.';
};
// REV11: seis folhas A4, cotas com linhas de extensao e vistas sem recortes.
let wallMode='cut';
const wallControl=document.createElement('label');wallControl.className='layer';wallControl.innerHTML='Paredes <select id="wallMode" aria-label="Altura das paredes"><option value="full">Inteiras</option><option value="cut" selected>Corte a 1,30 m</option><option value="none">Ocultas</option></select>';
$('#cutWalls').closest('label').replaceWith(wallControl);
// Mantem o checkbox legado para os manipuladores internos.
const hiddenCut=document.createElement('input');hiddenCut.id='cutWalls';hiddenCut.type='checkbox';hiddenCut.checked=true;hiddenCut.hidden=true;document.body.append(hiddenCut);
const priorVisibility=visible;
visible=function(p){return !(wallMode==='none'&&(p.category==='paredes'||p.category==='esquadrias'))&&priorVisibility(p)};
partClip=function(p){return p.category==='paredes'||p.category==='esquadrias'?(view==='plan'?1.3:wallMode==='cut'?1.3:50):50};
$('#wallMode').onchange=e=>{wallMode=e.target.value;shadowDirty=true;request()};
let sheetPage=0,a4Pages=[];
const pageNav=document.createElement('div');pageNav.className='pageNav';pageNav.innerHTML='<button id="prevSheet" aria-label="Prancha anterior">←</button><select id="pageNumber" aria-label="Selecionar folha"></select><button id="nextSheet" aria-label="Próxima prancha">→</button><span>A4 · 297 × 210 mm</span>';
$('.docIntro')?.after(pageNav);if(!pageNav.isConnected)$('#technical').prepend(pageNav);
const titles=['Perspectivas e materiais','Planta e vista superior','Vistas frontais 1 e 2','Interior e fundos','Portas, cava e trilhos','Quartzito e arremates'];
titles.forEach((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=String(i+1).padStart(2,'0')+' / '+s;$('#pageNumber').append(o)});
function showA4(){const s=$('#sheet');s.setAttribute('viewBox','0 0 1120 792');s.innerHTML=a4Pages[sheetPage]||'';$('#pageNumber').value=sheetPage;$('#prevSheet').disabled=sheetPage===0;$('#nextSheet').disabled=sheetPage===5;}
$('#pageNumber').onchange=e=>{sheetPage=Number(e.target.value);showA4()};$('#prevSheet').onclick=()=>{sheetPage=Math.max(0,sheetPage-1);showA4()};$('#nextSheet').onclick=()=>{sheetPage=Math.min(a4Pages.length-1,sheetPage+1);showA4()};
const printPages=document.createElement('div');printPages.id='printPages';document.body.append(printPages);
presentationSheet=function(){
 const F=n=>fmt(n/1000),U=$('#units').value,all=hallDraw,internal=all.filter(p=>!['door','rib'].includes(p.kind)),iv=[Math.SQRT1_2,-Math.SQRT1_2,0],jv=[-1/Math.sqrt(6),-1/Math.sqrt(6),Math.sqrt(2/3)],dv=norm([1,1,1]);
 const text=(x,y,s,size=12)=>`<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" fill="#354230">${esc(s)}</text>`;
 const ln=(a,b,c='#9b514b')=>`<path d="M${a}L${b}" stroke="${c}" stroke-width=".65" fill="none"/>`;
 const rect=(x,y,w,h,c='#e9e6db')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" stroke="#798273" stroke-width=".7"/>`;
 let body='';
 function heading(n){body=rect(0,0,1120,792,'white')+rect(20,20,1080,752,'none')+text(42,53,'ARMÁRIO DO HALL / '+titles[n],20)+text(42,76,'LUCIANA & LUCIANO · COTAS EM '+U.toUpperCase()+' · CONFERIR MEDIDAS IN LOCO',10)+ln([40,90],[1080,90],'#bbc2b5');}
 function finish(n){body+=ln([40,714],[1080,714],'#bbc2b5')+text(42,741,'GABRIEL FERMINO ARQUITETURA',14)+text(42,760,'Para orçamento e compatibilização · sem escala fixa de impressão',10)+text(860,741,'MAR '+String(n+1).padStart(2,'0')+' / 06 · REV. 16',13)+text(860,760,'A4 PAISAGEM · 297 × 210 mm',10);return body}
 function V(key,ps,u,v,d,x,y,w,h){const a=technicalView('r12'+key,ps,u,v,d),k=Math.min(w/a.width,h/a.height),W=a.width*k,H=a.height*k,X=x+(w-W)/2,Y=y+(h-H)/2;body+=`<image href="${a.url}" x="${X}" y="${Y}" width="${W}" height="${H}"/>`;return{map:p=>{const q=a.project(p);return[X+q[0]*k,Y+q[1]*k]},x:X,y:Y,w:W,h:H}}
 function dim(V,a,b,offset,vertical=false){
 const A=V.map(a),B=V.map(b);
 // Linhas de cota externas ao retangulo que enquadra a vista inteira.
 if(Number.isFinite(V.x)&&Number.isFinite(V.w)){
  if(vertical)offset=offset<V.x+V.w/2?Math.min(offset,V.x-26):Math.max(offset,V.x+V.w+26);
  else offset=offset<V.y+V.h/2?Math.min(offset,V.y-25):Math.max(offset,V.y+V.h+25);
 }
 const P=vertical?[offset,A[1]]:[A[0],offset],Q=vertical?[offset,B[1]]:[B[0],offset];
 body+=ln(A,P,'#baa49b')+ln(B,Q,'#baa49b')+ln(P,Q);for(const p of [P,Q])body+=ln([p[0]-3,p[1]+4],[p[0]+3,p[1]-4]);
 const x=(P[0]+Q[0])/2,y=(P[1]+Q[1])/2;
 body+=`<text x="${x}" y="${y-5}" transform="rotate(${vertical?-90:0} ${x} ${y})" text-anchor="middle" font-family="Arial" font-size="11" fill="#874c44">${esc(F(Math.hypot(...sub(a,b))))}</text>`;
}
function isoDim(V,a,b,dx,dy){
 const A=V.map(a),B=V.map(b);let P=[A[0]+dx,A[1]+dy],Q=[B[0]+dx,B[1]+dy];
 const vertical=Math.abs(A[0]-B[0])<.1;
 if(vertical){const outside=dx>=0?V.x+V.w+30:V.x-30;P=[outside,A[1]];Q=[outside,B[1]]}
 body+=ln(A,P,'#baa49b')+ln(B,Q,'#baa49b')+ln(P,Q);for(const p of [P,Q])body+=ln([p[0]-3,p[1]+4],[p[0]+3,p[1]-4]);
 const x=(P[0]+Q[0])/2,y=(P[1]+Q[1])/2;
 body+=`<text x="${x}" y="${y-6}" transform="rotate(${vertical?-90:0} ${x} ${y})" text-anchor="middle" font-family="Arial" font-size="11" fill="#874c44">${esc(F(Math.hypot(...sub(a,b))))}</text>`;
}
function call(V,p,x,y,s){
 const A=V.map(p),left=x<A[0],words=s.split(' '),lines=[];let row='';for(const word of words){if((row+' '+word).trim().length>19&&row){lines.push(row);row=word}else row=(row+' '+word).trim()}if(row)lines.push(row);
 const edge=left?V.x-13:V.x+V.w+13,anchor=left?'end':'start';
 body+=ln(A,[edge,A[1]],'#637258')+`<circle cx="${A[0]}" cy="${A[1]}" r="2" fill="#637258"/>`;
 lines.forEach((line,i)=>body+=`<text x="${edge+(left?-4:4)}" y="${A[1]-5-(lines.length-1-i)*13}" text-anchor="${anchor}" font-family="Arial" font-size="10" fill="#354230">${esc(line)}</text>`);
}function notes(x,y,lines){lines.forEach((s,i)=>body+=text(x,y+i*20,s,11))}
 let pages=[];
 heading(0);body+=text(70,121,'01 / CONJUNTO',14)+text(625,121,'02 / SEM PORTAS',14);
 let a=V('iso',all,iv,jv,dv,130,188,275,355),b=V('open',internal,iv,jv,dv,685,188,275,355);
 for(const q of [a,b]){isoDim(q,[0,0,3000],[1800,0,3000],8,-30);isoDim(q,[0,0,3000],[0,1750,3000],-8,-30);isoDim(q,[1800,600,0],[1800,600,3000],40,0)}
 isoDim(a,[0,1750,0],[600,1750,0],-14,30);isoDim(a,[1800,0,0],[1800,600,0],14,30);isoDim(b,[0,1750,0],[600,1750,0],-14,30);isoDim(b,[1800,0,0],[1800,600,0],14,30);call(a,[1350,570,50],65,582,'Sóculo White TAJ');call(a,[1738.5,585,1000],280,617,'Puxador cava');call(b,[1250,475,1740],620,581,'Prateleira');call(b,[585,450,1900],845,616,'Apoio alinhado ao L');
 notes(65,659,['LINHO: corpo 30 mm duplado / fundos 5 mm.','JEQUITIBÁ: portas e acabamento do canto.']);notes(620,659,['Dimensões gerais: '+F(1800)+' × '+F(1750)+' × '+F(3000)+' '+U+'.','Profundidade dos dois braços: '+F(600)+' '+U+'.']);pages.push(finish(0));
 heading(1);body+=text(85,120,'PLANTA / CORTE A +'+F(1500)+' '+U,14)+text(620,120,'VISTA SUPERIOR',14);
 const sec=all.filter(p=>p.z<1500&&p.z+p.h>1500).map(p=>({...p,z:1499,h:1}));
 a=V('plan',sec,[1,0,0],[0,1,0],[0,0,1],140,210,295,290);b=V('top',all,[1,0,0],[0,1,0],[0,0,1],680,210,295,290);
 for(const q of [a,b]){dim(q,[0,0,1500],[1800,0,1500],550);dim(q,[0,0,1500],[0,1750,1500],q.x-40,true);dim(q,[0,1750,1500],[600,1750,1500],170)}
 dim(a,[1800,0,1500],[1800,600,1500],a.x+a.w+32,true);dim(b,[1800,0,3000],[1800,600,3000],b.x+b.w+32,true); // Setas normais aos planos frontais, fora do desenho.
 for(const [q,p,label] of [[a,[1300,600,1500],'VISTA FRONTAL 1'],[a,[600,1250,1500],'VISTA FRONTAL 2']]){const p2=q.map(p),end=label.endsWith('1')?[p2[0],p2[1]-45]:[p2[0]+90,p2[1]];body+=ln(end,p2,'#354230')+`<circle cx="${p2[0]}" cy="${p2[1]}" r="3" fill="#354230"/>`+text(end[0]+5,end[1]-8,label,10)}
 call(a,[2.5,1300,1500],48,600,'Fundo 5 mm');call(b,[1350,555,2950],685,600,'Arremate frontal em L');notes(55,649,['Apoio: face alinhada em X = '+F(600)+' '+U+'.','Fundos simples de 5 mm; sem chapa sobreposta de 30 mm.']);notes(620,649,['Corte: somente peças interceptadas a +'+F(1500)+' '+U+'.','Vista superior: projeção completa, sem corte.']);pages.push(finish(1));
 heading(2);body+=text(90,123,'VISTA FRONTAL 1 / DIREÇÃO INDICADA EM PLANTA',12)+text(625,123,'VISTA FRONTAL 2 / DIREÇÃO INDICADA EM PLANTA',12);
 a=V('fa',all,[1,0,0],[0,0,1],[0,1,0],155,205,270,340);b=V('fb',all,[0,-1,0],[0,0,1],[1,0,0],700,205,270,340);
 dim(a,[0,600,0],[1800,600,0],590);dim(a,[1800,600,0],[1800,600,3000],480,true);dim(a,[630,600,2870],[1770,600,2870],170);
 dim(b,[600,0,0],[600,1750,0],590);dim(b,[600,0,0],[600,0,3000],1020,true);dim(b,[600,630,2870],[600,1720,2870],170);
 dim(a,[1185,600,145],[1767,600,145],565);dim(a,[1767,600,145],[1767,600,2855],a.x+a.w+20,true);dim(b,[600,1160,145],[600,1717,145],565);dim(b,[600,1717,145],[600,1717,2855],b.x-24,true);call(a,[1400,600,2000],355,360,'porta de correr');call(b,[600,1400,2000],610,360,'porta de correr');call(a,[1738.5,585,1000],350,635,'Puxador cava');call(b,[585,1686,1000],780,635,'Puxador cava');notes(65,678,['Vistas completas do conjunto; faces opacas dos retornos permanecem representadas. Portas: quatro folhas em dois sistemas independentes.']);pages.push(finish(2));
 heading(3);body+=text(70,124,'INTERIOR / NÍVEIS E APOIO',14)+text(660,124,'FUNDOS E ENCONTROS',14);
 a=V('internalFront',internal,[1,0,0],[0,0,1],[0,1,0],140,190,285,370);
 for(const [lo,hi] of [[0,100],[130,720],[750,1230],[1260,1740],[1770,2250],[2280,2870]])dim(a,[1770,510,lo],[1770,510,hi],480,true);
 dim(a,[5,510,720],[570,510,720],603);dim(a,[600,510,720],[1770,510,720],643);
 for(const z of [720,1230,1740,2250]){const p=a.map([1200,510,z]);body+=text(p[0]-22,p[1]-6,'prateleira',10)}
 call(a,[585,475,1800],50,166,'Apoio face X = '+F(600)+' '+U);
 body+=rect(685,220,270,12,'#dedaca')+rect(685,232,12,190,'#dedaca')+rect(697,292,210,72,'#d2cbb5');
 const mock={map:p=>[685+p[0]*2.4,220+p[1]*2.4]};dim(mock,[0,0,0],[0,5,0],655,true);dim(mock,[5,30,0],[5,60,0],980,true);
 notes(630,475,['Esquema ampliado dos fundos: espessura 5 mm.','Peças horizontais: MDF duplado 30 mm.','Fixar o fundo ao corpo, sem função de apoio de carga.','Manter os quatro níveis originais de prateleiras.','Um apoio vertical, em X = 570 a 600 mm.','Validar flecha e carga dos vãos antes de fabricar.']);
 notes(55,684,['Cotas dos vãos entre apoio e extremidades: '+F(565)+' e '+F(1170)+' '+U+'. Retorno sem segundo apoio; verificar dimensionamento para a carga prevista.']);pages.push(finish(3));
 heading(4);body+=text(55,122,'PORTAS / RIPADO',14)+text(625,122,'CAVA ABERTA PARA O VÃO',14);
 body+=rect(75,190,385,25,'#dbc29a');for(let i=0;i<6;i++)body+=rect(75+i*67.5,165,45,25,'#b79a71');
 notes(65,286,['Painel fechado: 15 mm. Ripas: 30 mm de face × 15 mm.','Espaçamento: 15 mm. Espessura total: 30 mm.','ARAUCO JEQUITIBÁ / veios verticais.','Frente 1: duas folhas de 582 mm de largura nominal.','Frente 2: duas folhas de 557 mm de largura nominal.','Altura nominal: 2710 mm, dependente do trilho.']);
 body+=rect(695,182,105,350,'#e9d9c1')+rect(695,182,42,350,'#b99b73')+rect(758,182,42,350,'#b99b73')+rect(716,230,21,280,'#e9d9c1');
 const cv={map:p=>[695+p[0]*1.4,230+p[1]*1.4]};dim(cv,[15,0,0],[45,0,0],158);dim(cv,[15,0,0],[15,200,0],654,true);
 body+=ln([716,230],[850,230],'#65725f')+text(860,234,'+ '+F(1100)+' '+U,12)+ln([716,510],[850,510],'#65725f')+text(860,514,'+ '+F(900)+' '+U,12);
 notes(625,577,['Retirar 15 mm da largura da ripa, na espessura integral.','A abertura soma 15 mm recortados + 15 mm do vão.','Altura 200 mm. Preservar o painel de 15 mm.','Arredondar e selar arestas; validar pega em amostra.']);
 notes(65,482,['TRILHOS E AMORTECIMENTO','Apoio inferior; trilho discreto com amortecimento.','Prever antiqueda, batentes e regulagem.','Não definir marca para orçamento.','Usinagens e descontos finais conforme kit fornecido.','Folgas laterais nominais 3 mm; sobreposição 30 mm.','Reservas de trilho: 1140 mm e 1090 mm.']);pages.push(finish(4));
 heading(5);body+=text(55,123,'QUARTZITO WHITE TAJ / PLANTA',14)+text(650,123,'ELEVAÇÕES DAS PEÇAS',14);
 a=V('stone',all.filter(p=>p.kind==='stone'),[1,0,0],[0,1,0],[0,0,1],125,220,300,290);
 dim(a,[570,550,0],[1800,550,0],550);dim(a,[550,550,0],[550,1750,0],75,true);
 body+=rect(660,206,330,28,'#eeeadd')+text(660,189,'Q01 / FRENTE 1',12)+rect(660,335,322,28,'#eeeadd')+text(660,318,'Q02 / RETORNO',12);
 const q1={map:p=>[660+p[0]*(330/1230),206+p[1]*(28/100)]},q2={map:p=>[660+p[0]*(322/1200),335+p[1]*(28/100)]};dim(q1,[0,0,0],[1230,0,0],265);dim(q1,[1230,0,0],[1230,100,0],1030,true);dim(q2,[0,0,0],[1200,0,0],393);dim(q2,[1200,0,0],[1200,100,0],1030,true);
 notes(620,450,['White TAJ branco exótico / polido / espessura 20 mm.','Q01: 1230 × 100 × 20 mm; Q02: 1200 × 100 × 20 mm.','Encontro de topo; Q02 recebe a extremidade de Q01.','Conferir juntas e moldes antes do corte pela marmoraria.']);
 notes(55,606,['SÓCULO: 100 mm de altura / recuado 30 mm da face frontal de referência. Prever suporte contínuo e nivelado.','FECHAMENTO SUPERIOR: altura 100 mm / MDF LINHO 30 mm / recuo 30 mm / somente nas duas faces do L.','ACABAMENTO DO CANTO: JEQUITIBÁ, solução provisória a compatibilizar com os trilhos e o curso das portas.','CONFERIR TODAS AS MEDIDAS NA OBRA E AJUSTAR CONFORME NECESSÁRIO.']);pages.push(finish(5));pages.push(...newFurnitureSheets());
 a4Pages=pages;showA4();printPages.innerHTML=pages.map((p,i)=>`<section class="printSheet"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 792" aria-label="Folha ${i+1}">${p}</svg></section>`).join('');
 $('.technicalHelp').textContent='Seis folhas A4 paisagem. Imprimir / PDF imprime o conjunto completo. Selecione papel A4 e desative cabeçalhos e rodapés do navegador.';
};
$('#printSheet').onclick=()=>{presentationSheet();window.print()};
// REV12 — leitura continua das pranchas e controle de alvenaria na navegacao principal.
const masonry=document.createElement('label');masonry.className='masonryControl';masonry.textContent='Alvenaria ';const directWalls=document.createElement('select');directWalls.id='directWalls';directWalls.setAttribute('aria-label','Alvenaria na visão geral');directWalls.innerHTML='<option value="full">Inteira</option><option value="cut" selected>Corte 1,30 m</option><option value="none">Oculta</option>';masonry.append(directWalls);$('.nav').append(masonry);
directWalls.onchange=e=>{wallMode=e.target.value;$('#wallMode').value=wallMode;shadowDirty=true;request()};$('#wallMode').addEventListener('change',()=>directWalls.value=wallMode);
const oldSelectR12=selectFurniture;selectFurniture=function(root){oldSelectR12(root);document.body.classList.add('furnitureSelected')};const oldClearR12=clearFurniture;clearFurniture=function(){oldClearR12();document.body.classList.remove('furnitureSelected')};
// Linhas horizontais seguem a altura projetada do ponto, sem cruzamento diagonal.
drawHUD=function(){hud.setAttribute('viewBox','0 0 '+canvas.clientWidth+' '+canvas.clientHeight);hud.innerHTML='';if(selectedFurniture!==12||technical||view!=='iso'||!matrix){originalHallHUD();return}
 const W=canvas.clientWidth,H=canvas.clientHeight,narrow=W<760;
 const refs=[['Fechamento em L · LINHO',[1300,570,2950]],['ARAUCO JEQUITIBÁ · portas',[1450,600,2150]],['Puxador cava · 90–110 cm',[1738.5,585,1000]],['Sóculo · White TAJ',[1450,570,55]]];
 const bounds=parts.filter(p=>p.root===12).flatMap(p=>[project(p.bounds[0]),project(p.bounds[1])]),left=Math.min(...bounds.map(p=>p[0]));
 let labels='';for(const [name,p] of refs){const q=project([2.35+p[0]/1000,.15+p[1]/1000,p[2]/1000]);if(q[1]<85||q[1]>H-75)continue;const label=narrow?name.split(' · ')[0]:name,width=label.length*(narrow?5:5.8)+14,x=Math.max(8,left-width-28),end=x+width;
 labels+=`<path d="M${q[0]},${q[1]}H${end}" fill="none" stroke="#74806b" stroke-width=".85"/><circle cx="${q[0]}" cy="${q[1]}" r="2" fill="#6d775d"/><text x="${x+7}" y="${q[1]-5}" font-size="${narrow?9:10}" fill="#43513b">${esc(label)}</text>`;
 }hud.innerHTML=labels;
};
const documentViewer=document.createElement('div');documentViewer.className='documentViewer';documentViewer.innerHTML='<nav class="sheetThumbnails" aria-label="Miniaturas das pranchas"></nav><div class="sheetSequence"></div>';
$('#technical').append(documentViewer);
const oldPaper=$('#sheet').closest('.sheetscroll');oldPaper.hidden=true;
$('#pageNumber').hidden=true;const counter=document.createElement('span');counter.id='sheetCounter';$('#pageNumber').after(counter);
let pageObserver=null;
function highlightSheet(n){sheetPage=n;$('#sheetCounter').textContent=(n+1)+' / '+a4Pages.length;$('#prevSheet').disabled=n===0;$('#nextSheet').disabled=n===a4Pages.length-1;document.querySelectorAll('[data-sheet-thumb]').forEach(b=>b.setAttribute('aria-current',Number(b.dataset.sheetThumb)===n?'page':'false'))}
showA4=function(){highlightSheet(sheetPage);document.getElementById('folio-'+sheetPage)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'})};
const buildA4R12=presentationSheet;
presentationSheet=function(){buildA4R12();if(pageObserver)pageObserver.disconnect();
 document.querySelector('.sheetSequence').innerHTML=a4Pages.map((p,i)=>`<article class="folio" id="folio-${i}" aria-label="Prancha ${i+1}: ${esc(titles[i])}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1120 792" role="img" aria-label="Prancha ${i+1}">${p}</svg></article>`).join('');
 const nav=document.querySelector('.sheetThumbnails');nav.replaceChildren();a4Pages.forEach((p,i)=>{const b=document.createElement('button');b.type='button';b.dataset.sheetThumb=i;b.setAttribute('aria-label','Ir para prancha '+(i+1));b.innerHTML=`<svg viewBox="0 0 1120 792" aria-hidden="true">${p}</svg><span>${String(i+1).padStart(2,'0')} · ${esc(titles[i])}</span>`;b.onclick=()=>{sheetPage=i;showA4()};nav.append(b)});
 pageObserver=new IntersectionObserver(entries=>{let best=null;for(const e of entries)if(e.isIntersecting&&(!best||e.intersectionRatio>best.intersectionRatio))best=e;if(best)highlightSheet(Number(best.target.id.split('-')[1]))},{root:$('#technical'),threshold:[.15,.35,.55]});document.querySelectorAll('.folio').forEach(p=>pageObserver.observe(p));highlightSheet(sheetPage);
 $('.technicalHelp').textContent='Seis folhas A4 em sequência. Use as miniaturas ou as setas para navegar. Imprimir / PDF imprime todas as folhas.';
};
// NOVOS CONJUNTOS: geometria e texturas do SketchUp, nas coordenadas originais.
const newNames={100:'Painel de TV e rack',101:'Divisória de correr em alumínio'};
titles.push('Painel e rack / conjunto','Painel TV e rack / sala TV','Painel e rack / jantar e cozinha','Basculantes, nicho e LED','Divisória / conjunto e folhas','Divisória / trilhos e guia interior');
const newQuick=document.createElement('div');newQuick.className='furnitureQuick';newQuick.setAttribute('aria-label','Selecionar móvel');newQuick.innerHTML='<span>Móveis</span><button data-new-root="12">Armário do Hall</button><button data-new-root="100">Painel de TV e rack</button><button data-new-root="101">Divisória de correr</button>';
$('.stage').append(newQuick);
newQuick.querySelectorAll('button').forEach(b=>b.onclick=()=>selectFurniture(Number(b.dataset.newRoot)));
let desiredFolio=null;
const beforeSelectNew=selectFurniture;
selectFurniture=function(root){beforeSelectNew(root);if(!newNames[root])return;
 $('#sceneName').textContent=newNames[root];$('#furnitureName').textContent=newNames[root];$('#sceneSubtitle').textContent='Geometria do SketchUp · Isométrica';$('#furnitureNote').textContent=root===100?'Painel, rack, nicho e LED · abertura por toque com amortecimento.':'Trilho superior e guia interior · três folhas ripadas.';$('#furnitureDrawing').hidden=false;
 const samples=$('#furnitureSamples');if(samples&&root===101){samples.querySelectorAll('.furnitureSample').forEach(el=>{if(!el.textContent.includes('JEQUITIB'))el.remove()});const caption=samples.querySelector('strong');if(caption)caption.textContent='ALUMÍNIO RIPADO';const sm=samples.querySelector('small');if(sm)sm.textContent='Acabamento a confirmar · aparência do modelo';}
};
$('#furnitureDrawing').onclick=()=>{desiredFolio=selectedFurniture===100?6:selectedFurniture===101?10:0;sheetPage=desiredFolio;$('#sheetType').value='hallboard';$('#docs').click();requestAnimationFrame(()=>{sheetPage=desiredFolio;showA4();desiredFolio=null})};
// Mantem o sistema de chamadas do Hall e acrescenta as chamadas extraidas do novo modelo.
const previousHUDNew=drawHUD;
drawHUD=function(){previousHUDNew();if(!newNames[selectedFurniture]||technical||view!=='iso'||!matrix)return;const relevant=(D.newSource?.texts||[]).filter(t=>t.point&&(selectedFurniture===101?/ALUM|TRILHO/.test(t.text):!/ALUM|TRILHO/.test(t.text)));let content='';
 for(const t of relevant){const q=project(t.point);if(q[1]<85||q[1]>canvas.clientHeight-85)continue;const label=t.text.trim().replace(/\n/g,' '),short=label.length>38?label.slice(0,36)+'…':label,x=Math.max(10,q[0]-180);content+=`<path d="M${q[0]},${q[1]}H${x}" stroke="#69765f" fill="none"/><circle cx="${q[0]}" cy="${q[1]}" r="2" fill="#69765f"/><text x="${x}" y="${q[1]-6}" font-size="10" fill="#46553a">${esc(short)}</text>`}hud.innerHTML=content;
};
const newViewCache=new Map();
function newMeshView(key,ps,u,v,dir,range){
 if(dot(cross(u,v),dir)<0){u=u.map(n=>-n);if(range)range=[-range[1],-range[0],range[2],range[3]]}
 if(newViewCache.has(key))return newViewCache.get(key);
 const pts=ps.flatMap(p=>{const [a,b]=p.bounds;return[[a[0],a[1],a[2]],[b[0],a[1],a[2]],[a[0],b[1],a[2]],[b[0],b[1],a[2]],[a[0],a[1],b[2]],[b[0],a[1],b[2]],[a[0],b[1],b[2]],[b[0],b[1],b[2]]].map(q=>q.map(n=>n*1000))});
 const xx=pts.map(p=>dot(p,u)),yy=pts.map(p=>dot(p,v)),ext=range||[Math.min(...xx),Math.max(...xx),Math.min(...yy),Math.max(...yy)];
 const width=1200,height=Math.max(200,Math.min(900,Math.round(width*(ext[3]-ext[2])/(ext[1]-ext[0])))),scale=Math.min((width-4)/(ext[1]-ext[0]),(height-4)/(ext[3]-ext[2])),ox=(width-(ext[1]-ext[0])*scale)/2,oy=(height-(ext[3]-ext[2])*scale)/2;
 const project=p=>[ox+(dot(p,u)-ext[0])*scale,oy+(ext[3]-dot(p,v))*scale,dot(p,dir)];
 const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d'),im=ctx.createImageData(width,height),z=new Float32Array(width*height).fill(-Infinity),colors=new Int32Array(width*height).fill(-1),palette=[];let id=0;
 for(const p of ps)for(const mesh of p.meshes){const data=mesh.pickArray;if(!data)continue;const mat=mats[mesh.material];for(let j=0;j<data.length;j+=24){const a=project([data[j]*1000,data[j+1]*1000,data[j+2]*1000]),b=project([data[j+8]*1000,data[j+9]*1000,data[j+10]*1000]),c1=project([data[j+16]*1000,data[j+17]*1000,data[j+18]*1000]),normal=[data[j+3],data[j+4],data[j+5]],light=.76+.24*Math.abs(dot(normal,norm([.5,.4,1]))),color=mat.color.map(c=>Math.round(c*255*light)),thisId=id++;palette.push(color);
 const den=(b[1]-c1[1])*(a[0]-c1[0])+(c1[0]-b[0])*(a[1]-c1[1]);if(Math.abs(den)<1e-8)continue;
 const minX=Math.max(0,Math.floor(Math.min(a[0],b[0],c1[0]))),maxX=Math.min(width-1,Math.ceil(Math.max(a[0],b[0],c1[0]))),minY=Math.max(0,Math.floor(Math.min(a[1],b[1],c1[1]))),maxY=Math.min(height-1,Math.ceil(Math.max(a[1],b[1],c1[1])));
 for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const X=x+.5,Y=y+.5,wa=((b[1]-c1[1])*(X-c1[0])+(c1[0]-b[0])*(Y-c1[1]))/den,wb=((c1[1]-a[1])*(X-c1[0])+(a[0]-c1[0])*(Y-c1[1]))/den,wc=1-wa-wb;if(wa<0||wb<0||wc<0)continue;const depth=wa*a[2]+wb*b[2]+wc*c1[2],index=y*width+x;if(depth>z[index]){z[index]=depth;colors[index]=thisId}}
 }}
 for(let i=0;i<colors.length;i++)if(colors[i]>=0)im.data.set([...palette[colors[i]],255],i*4);ctx.putImageData(im,0,0);
 // Arestas visiveis, com teste de profundidade; evita diagonais de triangulacao.
 const pixels=ctx.getImageData(0,0,width,height);
 for(const p of ps){const e=p.edgeArray;for(let j=0;j<e.length;j+=6){const a=project([e[j]*1000,e[j+1]*1000,e[j+2]*1000]),b=project([e[j+3]*1000,e[j+4]*1000,e[j+5]*1000]),steps=Math.min(1600,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])));for(let k=0;k<=steps;k++){const t=steps?k/steps:0,x=Math.round(a[0]+(b[0]-a[0])*t),y=Math.round(a[1]+(b[1]-a[1])*t);if(x<0||x>=width||y<0||y>=height)continue;const ix=y*width+x,d=a[2]+(b[2]-a[2])*t;if(d>=z[ix]-2&&colors[ix]>=0){pixels.data[ix*4]*=.65;pixels.data[ix*4+1]*=.65;pixels.data[ix*4+2]*=.65}}}}
 ctx.putImageData(pixels,0,0);const result={url:c.toDataURL('image/png'),width,height,project};newViewCache.set(key,result);return result;
}
function newFurnitureSheets(){
 const ps=parts.filter(p=>p.root===100),ds=parts.filter(p=>p.root===101),rack=ps.filter(p=>/rack|basculante|Soculo|Nicho/i.test(p.name)),doors=ps.filter(p=>p.basculante),unit=$('#units').value,F=n=>fmt(n/1000),frontU=[0,1,0],up=[0,0,1];let body='',pages=[];
 const tx=(x,y,s,size=11)=>`<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" fill="#394531">${esc(s)}</text>`,line=(a,b)=>`<path d="M${a}L${b}" fill="none" stroke="#987169" stroke-width=".7"/>`;
 function head(title,no){body='<rect width="1120" height="792" fill="white"/><rect x="20" y="20" width="1080" height="752" fill="none" stroke="#929b88"/>'+tx(42,52,title,20)+tx(42,77,'LUCIANA & LUCIANO / COTAS EM '+unit.toUpperCase()+' / GEOMETRIA EXTRAÍDA DO SKETCHUP',10);}
 function finish(no){return body+line([40,717],[1080,717])+tx(42,742,'GABRIEL FERMINO ARQUITETURA',14)+tx(42,762,'Conferir todas as medidas in loco · para orçamento e compatibilização · A4 paisagem',10)+tx(880,748,'NOV '+no+' / 06 · REV. 16',12)}
 function view(key,list,u,v,d,x,y,w,h,range){const r=newMeshView(key,list,u,v,d,range),s=Math.min(w/r.width,h/r.height),W=r.width*s,H=r.height*s,X=x+(w-W)/2,Y=y+(h-H)/2;body+=`<image href="${r.url}" x="${X}" y="${Y}" width="${W}" height="${H}"/>`;return{map:p=>{const q=r.project(p);return[X+q[0]*s,Y+q[1]*s]},x:X,y:Y,w:W,h:H}}
 function dim(V,a,b,offset,vertical=false){const A=V.map(a),B=V.map(b);if(vertical)offset=offset<V.x?Math.min(offset,V.x-20):Math.max(offset,V.x+V.w+20);else offset=offset<V.y?Math.min(offset,V.y-22):Math.max(offset,V.y+V.h+22);const P=vertical?[offset,A[1]]:[A[0],offset],Q=vertical?[offset,B[1]]:[B[0],offset];body+=line(A,P)+line(B,Q)+line(P,Q);for(const p of [P,Q])body+=line([p[0]-3,p[1]+4],[p[0]+3,p[1]-4]);const x=(P[0]+Q[0])/2,y=(P[1]+Q[1])/2;body+=`<text x="${x}" y="${y-5}" text-anchor="middle" transform="rotate(${vertical?-90:0} ${x} ${y})" font-family="Arial" font-size="11" fill="#8a4e42">${esc(F(Math.hypot(...sub(a,b))))}</text>`}
 function notes(x,y,lines){lines.forEach((s,i)=>body+=tx(x,y+20*i,s))}
 function call(V,p,label,left=true){const A=V.map(p),x=left?V.x-12:V.x+V.w+12;body+=line(A,[x,A[1]])+`<circle cx="${A[0]}" cy="${A[1]}" r="2" fill="#727e63"/><text x="${x+(left?-3:3)}" y="${A[1]-6}" text-anchor="${left?'end':'start'}" font-family="Arial" font-size="10" fill="#45503b">${esc(label)}</text>`}
 head('PAINEL DE TV E RACK / CONJUNTO',1);
 let a=view('tvIso',ps,norm([1,-1,0]),norm([-.4,-.4,1]),norm([1,1,1]),110,135,900,240);body+=tx(55,118,'ISOMÉTRICA / CONTINUIDADE ENTRE SALA TV, JANTAR E COZINHA',12);
 let b=view('tvAll',ps,frontU,up,[1,0,0],130,415,880,210);dim(b,[1850,3700,0],[1850,13650,0],665);dim(b,[1850,3700,0],[1850,3700,3000],1055,true);
 notes(55,690,['Rack: '+F(9950)+' × '+F(500)+' × '+F(500)+' '+unit+'. Painel/ripado com retorno em L conforme modelo. Não confundir espessura do conjunto com espessura da chapa.']);pages.push(finish(1));
 head('SALA TV / PAINEL E RACK',2);a=view('tvFront',ps,frontU,up,[1,0,0],165,155,785,375,[3700,9065,0,3000]);dim(a,[1850,3700,0],[1850,9065,0],570);dim(a,[1450,3700,3000],[1450,8175,3000],122);dim(a,[1850,3700,0],[1850,3700,3000],1010,true);
 notes(55,616,['Painel TV: '+F(4475)+' de largura × '+F(2100)+' de altura; base a +'+F(900)+' '+unit+'.','Rack neste trecho: '+F(5365)+' de comprimento. Seis frentes de '+F(885)+' × '+F(365)+' '+unit+'.','Frentes ripadas basculantes: abertura por toque e amortecimento, conforme sua especificação.','TV representada conforme arquivo; compatibilizar suporte, ventilação e passagens antes de fabricar.']);pages.push(finish(2));
 head('JANTAR / COZINHA / PAINEL, RACK E NICHO',3);a=view('diningFront',ps,frontU,up,[1,0,0],165,155,785,375,[9115,13680,0,3000]);dim(a,[1850,9115,0],[1850,13650,0],570);dim(a,[1450,9115,3000],[1450,12690,3000],122);dim(a,[1850,13650,0],[1850,13650,3000],1010,true);
 notes(55,616,['Painel principal: '+F(3575)+' × '+F(2100)+' '+unit+'. Rack: '+F(4535)+' de comprimento.','Quatro frentes basculantes de '+F(885)+' × '+F(365)+' '+unit+' e nicho na extremidade.','Nicho: envelope '+F(895)+' de largura × '+F(500)+' de profundidade × '+F(340)+' de altura.','Ripado faz o L no retorno, conforme chamada do SketchUp. Preservar alinhamento dos veios.']);pages.push(finish(3));
 head('RACK / BASCULANTES, MATERIAIS E LED',4);
 a=view('rackDoor',doors.slice(0,1),frontU,up,[1,0,0],180,168,375,200);const door=doors[0],lo=door.bounds[0].map(n=>n*1000),hi=door.bounds[1].map(n=>n*1000);dim(a,[hi[0],lo[1],lo[2]],[hi[0],hi[1],lo[2]],402);dim(a,[hi[0],hi[1],lo[2]],[hi[0],hi[1],hi[2]],600,true);
 b=view('rackSide',rack,[1,0,0],up,[0,-1,0],750,168,180,200);dim(b,[1350,3700,0],[1850,3700,0],402);dim(b,[1850,3700,0],[1850,3700,500],980,true);
 notes(55,459,['DEZ FRENTES BASCULANTES','Geometria modelada: '+F(885)+' × '+F(365)+' × '+F(30)+' '+unit+'.','Base e ripado aparecem com 15 + 15 mm no arquivo.','Toque para abrir; ferragem com amortecimento.','Sentido de basculamento, ângulo, carga e furação:','compatibilizar com a ferragem antes da usinagem.','Não usar a frente aberta como apoio sem previsão do sistema.']);
 notes(620,459,['MATERIAIS / ILUMINAÇÃO','ARAUCO JEQUITIBÁ e ARAUCO LINHO conforme modelo.','Sóculo com material quartzito: referência White TAJ do Hall.','Fitas identificadas no arquivo: LED 3000 K.','Prever perfil dissipador/difusor e driver acessível.','Potência, tensão, acionamento e divisão dos circuitos: a definir.','Perfis e rasgos seguem a fita e o sistema efetivamente fornecidos.']);pages.push(finish(4));
 head('DIVISÓRIA RIPADA DE ALUMÍNIO / CONJUNTO',5);
 a=view('dividerIso',ds,norm([1,-1,0]),norm([-.4,-.4,1]),norm([1,1,1]),125,130,880,230);
 b=view('dividerFront',ds,[1,0,0],up,[0,-1,0],160,415,795,230);dim(b,[1350,8970,0],[6350,8970,0],680);dim(b,[6350,8970,0],[6350,8970,3100],1020,true);
 body+=tx(55,376,'Três folhas ripadas de alumínio / suspensão superior / guia interior / acabamento a confirmar.',12);pages.push(finish(5));
 head('DIVISÓRIA / FOLHAS, TRILHO SUPERIOR E GUIA',6);
 const leaves=ds.filter(p=>p.name.startsWith('Folha')),leaf=leaves[0];a=view('dividerLeaf',[leaf],[1,0,0],up,[0,-1,0],150,170,190,345);dim(a,[3770,8970,0],[5000,8970,0],550);dim(a,[5000,8970,0],[5000,8970,3000],400,true);
 b=view('dividerPlan',ds,[1,0,0],[0,1,0],[0,0,1],525,200,480,150);dim(b,[1350,9150,3100],[6350,9150,3100],174);
 notes(485,414,['FOLHAS MODELADAS: 3 × '+F(1230)+' × '+F(3000)+' × '+F(45)+' '+unit+'.','Suporte superior: '+F(5000)+' × '+F(185)+' × '+F(100)+' '+unit+'.','Trilho superior suspenso e guia interior conforme solicitado.','Dimensionar suporte e ancoragens para peso e esforços das folhas.','Compatibilizar recolhimento, batentes, antiqueda e sobreposições.','A posição da guia interior e os perfis dependem do sistema escolhido.','Modelo encosta no nível zero: descontos e folga inferior não definidos.','O material do SketchUp usa aparência amadeirada; estrutura é alumínio.','Não fabricar perfis nem rasgos apenas pelos envelopes apresentados.']);
 notes(55,638,['Cotas extraídas do arquivo. As chamadas identificam os móveis, mas não especificam marcas ou furações de ferragens.','A geometria original foi preservada. Confirmar vãos na obra, cargas, perfis, folgas e fixações antes da execução.']);pages.push(finish(6));
 return pages;
}
// Remove os controles individuais de categorias em ambas as interfaces.
document.body.classList.add('unifiedArchitecture');
// Revisão 15 — conjuntos extraídos dos três SketchUps, em coordenadas originais.
const addedFurniture={
102:{name:'Cristaleira · sala de jantar',short:'Cristaleira',folio:12,side:-1,groups:[3,4],notes:[
'ARAUCO JEQUITIBÁ: ripado. ARAUCO LINHO: corpo e prateleiras, conforme materiais do arquivo.',
'Conjunto: 438,5 × 45,5 × 300 cm. Corpo principal: 400 × 45 × 240 cm, instalado a +10 cm.',
'Fundo modelado com 5 mm. Espessuras de cada peça devem ser conferidas no detalhamento de corte.',
'Sóculo em quartzito: altura modelada 10 cm. Confirmar pedra White TAJ, lote, juntas e apoio.',
'Portas de vidro de correr e porta de vidro conforme chamadas. Vidro: espessura e têmpera a definir.',
'Prateleiras de vidro com perfil de alumínio inferior; verificar carga, vão livre e apoio contínuo.',
'Espelho ao fundo, suportes de vinho e gavetões conforme geometria; prever acesso aos fixadores.',
'Puxadores slim nas portas; gavetões com corrediças dimensionadas à carga e abertura disponível.',
'LED identificado como 3000 K. Prever perfil dissipador, difusor e driver acessível.',
'Não usinar trilhos nem furar vidros antes de definir sistema, folgas, sobreposição e ferragens.'
]},
103:{name:'Armários · cozinha',short:'Armários da cozinha',folio:15,side:1,notes:[
'ARAUCO JEQUITIBÁ e ARAUCO LINHO conforme arquivo. Manter sentido dos veios e acabamento de bordas.',
'Linha de armários: 495 cm entre Y=13,65 e 18,60 m; altura total 300 cm, incluindo ripado superior.',
'Módulo inferior: 315 × 59,5 × 78 cm, base a +10 cm. Sóculo modelado com 10 cm de altura.',
'Aéreo: corpo 315 × 37 × 85 cm, base a +165 cm. Seis portas modeladas: 52 × 83,622 × 3 cm.',
'Torre fria, lava-louças, forno e nichos: preservar respiros e afastamentos exigidos por cada fabricante.',
'Porta basculante da torre: 88 × 48,5 × 1,5 cm no modelo; não generalizar 30 mm para esta peça.',
'Portas de abrir, gavetões, gavetão lixeira e fruteiras conforme chamadas; definir ferragens e cargas.',
'Bancada, cuba, escorredor, torneira e filtro: recortes apenas com gabaritos dos produtos selecionados.',
'Moldura de quartzito e portas guilhotina de vidro junto à churrasqueira: compatibilizar calor e ventilação.',
'LED 3000 K identificado. Prever manutenção sem desmontar bancada ou eletrodomésticos.'
]},
104:{name:'Bancada ilha · cozinha',short:'Ilha',folio:18,side:1,notes:[
'Ilha modelada: corpo entre X=2,02 e 3,02 m e Y=15,10 e 18,60 m; comprimento 350 cm.',
'Bancada em quartzito conforme chamada. Confirmar White TAJ, lote, espessura e bordas com marmoraria.',
'Ripado em ARAUCO JEQUITIBÁ. Demais acabamentos seguem os materiais efetivamente presentes no modelo.',
'Portas, gavetões e porta-temperos: preservar modulação do SketchUp; folgas e ferragens a compatibilizar.',
'Frentes modeladas com cerca de 30 mm; o envelope não substitui composição de chapa e ripado.',
'Fogão na bancada: conferir produto, afastamentos térmicos e gabarito antes de qualquer recorte.',
'Duas torres de tomada conforme arquivo. Definir produto e recortes, mantendo acesso inferior.',
'Prever caminho acessível para elétrica e alimentação do fogão; compatibilizar com instalações existentes.',
'Conferir circulação, abertura integral de gavetas e interferências com banquetas e equipamentos.',
'Apoio da pedra, reforços, fixação ao piso e juntas dependem de dimensionamento e conferência em obra.'
]},
105:{name:'Muxarabi, rebaixo e coifa · cozinha',short:'Muxarabi e coifa',folio:21,side:1,notes:[
'Conjunto modelado: 370 × 140 cm em planta; rebaixo entre +240 e +300 cm do piso.',
'Muxarabi fechado e muxarabi vazado com acrílico translúcido e LED conforme chamadas do SketchUp.',
'MDF ARAUCO JEQUITIBÁ no muxarabi. Rebaixo de gesso representado apenas para compatibilização.',
'Acrílico modelado como superfície a +242 cm: espessura não definida; não tratar como chapa sem espessura.',
'LED: prever perfil dissipador, difusor e ventilação. Temperatura de cor conforme material do modelo.',
'Coifa representada entre +240 e aproximadamente +296,23 cm; validar altura sobre fogão com fabricante.',
'Fixar coifa e estrutura do muxarabi em suporte dimensionado; não descarregar peso apenas no gesso.',
'Prever acesso removível a driver, conexões e duto da coifa, sem danificar acabamento.',
'Definir modulação de montagem, juntas, parafusos e reforços antes da fabricação.',
'Manter afastamento de calor e ventilação conforme equipamentos, LED e acrílico efetivamente escolhidos.'
]}
};
for(const [key,c] of Object.entries(addedFurniture)){
 const b=document.createElement('button');b.textContent=c.short;b.onclick=()=>selectFurniture(Number(key));newQuick.append(b);
 titles.push(c.short+' / conjunto',c.short+' / planta e modulação',c.short+' / componentes e montagem');
}
const selectBefore15=selectFurniture;
selectFurniture=function(root){selectBefore15(root);const c=addedFurniture[root];if(!c)return;
 $('#sceneName').textContent=c.name;$('#furnitureName').textContent=c.name;$('#furnitureNote').textContent='Modelo original · medidas extraídas · detalhes e pendências nas pranchas.';$('#furnitureDrawing').hidden=false;
 $('#sceneSubtitle').textContent='Isométrica · '+c.short;
 let sample=$('#furnitureSamples');if(!sample){sample=document.createElement('div');sample.id='furnitureSamples';furnitureCard.append(sample)}sample.replaceChildren();
 const ids=[...new Set(parts.filter(p=>p.root===root).flatMap(p=>p.meshes.map(m=>m.material)))];
 for(const id of ids){const m=mats[id];if(!/ARAUCO|QUARTZITO|ESPELHO|Glass|LED/i.test(m.name))continue;const row=document.createElement('div');row.className='furnitureSample';const image=document.createElement('img');if(m.image)image.src=m.image;else image.style.background='rgb('+m.color.map(v=>Math.round(v*255)).join(',')+')';image.alt=m.name;const label=document.createElement('div');const strong=document.createElement('strong');strong.textContent=m.name;const small=document.createElement('small');small.textContent='Material incorporado ao SketchUp';label.append(strong,small);row.append(image,label);sample.append(row)}
};
$('#furnitureDrawing').onclick=()=>{desiredFolio=addedFurniture[selectedFurniture]?.folio??(selectedFurniture===100?6:selectedFurniture===101?10:0);sheetPage=desiredFolio;$('#sheetType').value='hallboard';$('#docs').click();requestAnimationFrame(()=>{sheetPage=desiredFolio;showA4();desiredFolio=null})};
function addedCalls(root){const b=furnitureBounds(root);return(D.addedSources?.[root]?.texts||[]).filter(t=>t.point&&t.point.every((v,i)=>v>=b[0][i]-.15&&v<=b[1][i]+.15)&&!/^Agrupar|^Cylinder|^Line|m²/.test(t.text)).map(t=>({...t,text:t.text.replace(/TRUTEIRA/gi,'FRUTEIRA').trim()}))}
const hudBefore15=drawHUD;
drawHUD=function(){if(!addedFurniture[selectedFurniture]){hudBefore15();return}hud.setAttribute('viewBox','0 0 '+canvas.clientWidth+' '+canvas.clientHeight);hud.innerHTML='';if(technical||view!=='iso'||!matrix)return;const list=addedCalls(selectedFurniture).slice(0,canvas.clientWidth<700?4:7);let s='';list.forEach((t,i)=>{const p=project(t.point),y=100+i*32,x=16;const label=t.text.length>44?t.text.slice(0,42)+'…':t.text;s+=`<path d="M${p[0]},${p[1]}L${x+150},${y}H${x}" stroke="#79816e" stroke-width=".7" fill="none"/><circle cx="${p[0]}" cy="${p[1]}" r="2" fill="#657057"/><text x="${x}" y="${y-5}" font-size="10" fill="#34432c">${esc(label)}</text>`});hud.innerHTML=s};
// Vistas técnicas da geometria real. Cotas vetoriais projetadas a partir dos mesmos pontos.
function addedSheets15(){let pages=[],body='';const unit=$('#units').value,fmtM=x=>fmt(x),T=(x,y,t,size=11)=>`<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" fill="#3a4434">${esc(t)}</text>`,L=(a,b)=>`<path d="M${a}L${b}" stroke="#996e64" stroke-width=".65" fill="none"/>`;
 function words(text,width=140){let out=[],line='';for(const w of text.split(' ')){if((line+' '+w).length>width){out.push(line);line=w}else line+=(line?' ':'')+w}if(line)out.push(line);return out}
 function notes(x,y,lines,width=142){for(const text of lines)for(const l of words(text,width)){body+=T(x,y,l,10);y+=16}}
 function begin(c,title){body='<rect width="1120" height="792" fill="#fff"/><rect x="20" y="20" width="1080" height="752" fill="none" stroke="#929b88"/>'+T(42,50,c.name.toUpperCase(),19)+T(42,74,title+' / COTAS EM '+unit.toUpperCase(),11)}
 function end(c,index){body+=L([40,717],[1080,717])+T(42,741,'GABRIEL FERMINO ARQUITETURA',14)+T(42,761,'Medidas do modelo · conferir em obra · ferragens e recortes pendentes de compatibilização',10)+T(918,741,'A4 · REV. 16',11)+T(918,761,'PRANCHA '+(c.folio+index+1)+' / 24',11);pages.push(body)}
 function view15(key,ps,u,v,dir,x,y,w,h){const r=newMeshView('r15-'+key,ps,u,v,dir),scale=Math.min(w/r.width,h/r.height),W=r.width*scale,H=r.height*scale,X=x+(w-W)/2,Y=y+(h-H)/2;body+=`<image href="${r.url}" x="${X}" y="${Y}" width="${W}" height="${H}"/>`;return{x:X,y:Y,w:W,h:H,map:p=>{const q=r.project(p.map(v=>v*1000));return[X+q[0]*scale,Y+q[1]*scale]}}}
 function dimension(V,a,b,vertical=false,above=false){const A=V.map(a),B=V.map(b),offset=vertical?V.x+V.w+24:above?V.y-22:V.y+V.h+27,P=vertical?[offset,A[1]]:[A[0],offset],Q=vertical?[offset,B[1]]:[B[0],offset],cx=(P[0]+Q[0])/2,cy=(P[1]+Q[1])/2;body+=L(A,P)+L(B,Q)+L(P,Q);for(const p of [P,Q])body+=L([p[0]-3,p[1]+3],[p[0]+3,p[1]-3]);body+=`<text x="${cx}" y="${cy-5}" text-anchor="middle" font-family="Arial" font-size="10" fill="#895548" transform="rotate(${vertical?-90:0} ${cx} ${cy})">${esc(fmtM(Math.hypot(...sub(a,b))))}</text>`}
 function bounds(ps){return [ps.reduce((a,p)=>a.map((v,i)=>Math.min(v,p.bounds[0][i])),[Infinity,Infinity,Infinity]),ps.reduce((a,p)=>a.map((v,i)=>Math.max(v,p.bounds[1][i])),[-Infinity,-Infinity,-Infinity])]}
 function frontDims(V,b){const[a,z]=b;dimension(V,[a[0],a[1],a[2]],[a[0],z[1],a[2]]);dimension(V,[a[0],z[1],a[2]],[a[0],z[1],z[2]],true)}
 function planDims(V,b){const[a,z]=b;dimension(V,[a[0],a[1],z[2]],[a[0],z[1],z[2]]);dimension(V,[a[0],z[1],z[2]],[z[0],z[1],z[2]],true)}
 function calls(V,root,max=5){addedCalls(root).slice(0,max).forEach((t,i)=>{const p=V.map(t.point),x=725,y=144+i*37;body+=L(p,[x-15,y])+L([x-15,y],[x,y])+`<circle cx="${p[0]}" cy="${p[1]}" r="2" fill="#737c67"/>`;words(t.text,47).forEach((s,j)=>body+=T(x+5,y-4+j*12,s,9))})}
 for(const [key,c] of Object.entries(addedFurniture)){const root=Number(key),ps=parts.filter(p=>p.root===root);if(!ps.length)continue;const b=bounds(ps),[lo,hi]=b,U=[0,c.side,0],up=[0,0,1],dir=[c.side,0,0],iu=norm([1,-c.side,0]),iv=norm([-.4*c.side,-.4,1]),id=norm([c.side,1,1]);
 begin(c,'01 / CONJUNTO E ELEVAÇÃO');body+=T(55,108,'ISOMÉTRICA',11)+T(575,108,'ELEVAÇÃO PRINCIPAL',11);
 view15(root+'iso',ps,iu,iv,id,65,140,430,355);let v=view15(root+'front',ps,U,up,dir,585,140,395,355);frontDims(v,b);
 notes(55,555,c.notes.slice(0,4));body+=T(55,651,'Envelope do conjunto: '+fmtM(hi[1]-lo[1])+' × '+fmtM(hi[0]-lo[0])+' × '+fmtM(hi[2]-lo[2])+' '+unit,11);body+=T(55,674,'Inclui equipamentos e saliências presentes no arquivo. Não equivale a uma lista de corte.',10);end(c,0);
 begin(c,'02 / VISTA SUPERIOR E MODULAÇÃO');body+=T(55,108,root===105?'PROJEÇÃO SUPERIOR / MUXARABI E COIFA':'PLANTA / VISTA SUPERIOR',11);
 v=view15(root+'top',ps,[0,1,0],[1,0,0],[0,0,1],100,145,850,175);planDims(v,b);
 const groups=[...new Set(ps.map(p=>p.sourceGroup))];let component=ps;
 if(root===102)component=ps.filter(p=>p.sourceGroup===3&&[3,4,5,6,8,9,10,11,12,13,14,15,20,21].includes(p.subGroup));
 if(root===103)component=ps.filter(p=>[12,14,15,16,17,18,19,20,21,22,23,24,25,26,27].includes(p.sourceGroup));
 if(root===104)component=ps.filter(p=>p.sourceGroup===6);
 if(root===105)component=ps.filter(p=>p.sourceGroup===11);
 if(!component.length)component=ps;body+=T(55,382,root===102?'INTERIOR / PORTAS OCULTAS':root===104?'FRENTES / PORTAS E GAVETÕES':'ELEVAÇÃO / COMPONENTES SELECIONADOS',11);
 v=view15(root+'modules',component,U,up,dir,100,408,850,190);frontDims(v,bounds(component));
 notes(55,659,[root===102?'Vidros, espelho, prateleiras e suportes conforme modelo. Não omitir apoio das prateleiras de vidro.':root===103?'Modulação conforme SketchUp. Gavetão lixeira representado aberto no arquivo; envelope inclui projeção de abertura.':root===104?'Cotas das frentes são envelopes do modelo; conferir folgas, frentes ripadas e corrediças antes do corte.':'Projeção inclui estrutura e coifa; acrílico e elementos superpostos podem ocultar o vazado na vista superior.']);end(c,1);
 begin(c,'03 / CHAMADAS E ORIENTAÇÕES DE MONTAGEM');v=view15(root+'call',ps,iu,iv,id,90,126,550,250);calls(v,root,6);
 notes(55,423,c.notes.slice(4),144);
 const src=D.addedSources[root]?.file||'';notes(55,677,['Fonte: '+src+' · Sem definição automática de furação, carga de ferragens ou espessura de vidro.']);end(c,2);
 }
 return pages;
}
const sheetsBefore15=newFurnitureSheets;
newFurnitureSheets=function(){return [...sheetsBefore15(),...addedSheets15()]};

// Fichas de itens compráveis; dados comerciais e fotografias serão preenchidos depois.
let explosionAmount=0,explosionToken=0,explosionBaseSpan=null,explosionRoot=null;
const explosionRoots=new Set([12,100,101,102,103,104,105]);
const explodeButton=document.createElement('button');explodeButton.id='explodeFurniture';explodeButton.textContent='Explodir';explodeButton.hidden=true;explodeButton.setAttribute('aria-pressed','false');$('#furnitureDrawing').before(explodeButton);
const explosionCaption=document.createElement('p');explosionCaption.className='explosionCaption';explosionCaption.hidden=true;explodeButton.after(explosionCaption);
const productPanel=document.createElement('section');productPanel.id='productDetails';productPanel.hidden=true;furnitureCard.append(productPanel);
const productMenu=document.createElement('select');productMenu.id='productMenu';productMenu.setAttribute('aria-label','Selecionar item comprável');productMenu.innerHTML='<option value="">Itens compráveis</option>';for(const [root,p] of Object.entries(D.products||{})){const opt=document.createElement('option');opt.value=root;opt.textContent=p.name;productMenu.append(opt)}productMenu.onchange=()=>{if(productMenu.value)selectFurniture(Number(productMenu.value));productMenu.value=''};newQuick.append(productMenu);
function resetExplosion(){explosionToken++;if(explosionBaseSpan!==null)span=explosionBaseSpan;explosionBaseSpan=null;explosionAmount=0;explosionRoot=null;explodeButton.textContent='Explodir';explodeButton.setAttribute('aria-pressed','false');explosionCaption.hidden=true;shadowDirty=true}
const selectBefore16=selectFurniture;
selectFurniture=function(root){resetExplosion();selectBefore16(root);const product=D.products?.[root];productPanel.hidden=!product;explodeButton.hidden=!explosionRoots.has(root);document.body.classList.toggle('productSelected',!!product);
 if(!product)return;
 $('#furnitureName').textContent=product.name;$('#sceneName').textContent=product.name;$('#sceneSubtitle').textContent='Item comprável · Isométrica';$('#furnitureNote').textContent='Ficha de especificação do produto';$('#furnitureDrawing').hidden=true;
 const samples=$('#furnitureSamples');if(samples)samples.hidden=true;
 productPanel.innerHTML='<div class="productPhotoPlaceholder" role="img" aria-label="Espaço reservado para foto real do produto"><svg viewBox="0 0 64 48" width="54" height="42" aria-hidden="true"><rect x="3" y="3" width="58" height="42" rx="4" fill="none" stroke="currentColor"/><circle cx="43" cy="15" r="5" fill="none" stroke="currentColor"/><path d="M6 39L22 23L34 34L42 27L58 39" fill="none" stroke="currentColor"/></svg><strong>Foto real do produto</strong><span>A adicionar na próxima etapa</span></div><dl><div><dt>Nome</dt><dd>'+esc(product.name)+'</dd></div><div><dt>Marca</dt><dd>'+esc(product.brand||'A definir')+'</dd></div><div><dt>Modelo</dt><dd>'+esc(product.model||'A definir')+'</dd></div></dl><p class="productPending">Referência 3D do projeto. Identificação comercial e foto real pendentes.</p>';
};
const roomBefore16=focusRoom;focusRoom=function(...args){resetExplosion();document.body.classList.remove('productSelected');productPanel.hidden=true;explodeButton.hidden=true;return roomBefore16(...args)};
const techBefore16=setTechnical;setTechnical=function(...args){resetExplosion();return techBefore16(...args)};
const fitBefore16=fit;fit=function(...args){if(explosionAmount>0)resetExplosion();return fitBefore16(...args)};
explodeButton.onclick=()=>{
 if(!explosionRoots.has(selectedFurniture))return;const expand=explodeButton.getAttribute('aria-pressed')!=='true',root=selectedFurniture;explosionRoot=root;
 furnitureTransition++;hallMotion++;
 if(explosionBaseSpan===null)explosionBaseSpan=span;const from=explosionAmount,to=expand?1:0,startSpan=span,endSpan=explosionBaseSpan*(expand?1.8:1),token=++explosionToken,t0=performance.now(),duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:1100;
 explodeButton.textContent=expand?'Recompor':'Explodir';explodeButton.setAttribute('aria-pressed',String(expand));explosionCaption.hidden=false;explosionCaption.textContent='Vista de montagem ilustrativa. Peças conectadas permanecem juntas; não substitui sequência de instalação.';
 const tick=now=>{if(token!==explosionToken||selectedFurniture!==root)return;const t=duration?Math.min(1,(now-t0)/duration):1,e=t*t*t*(t*(t*6-15)+10);explosionAmount=from+(to-from)*e;span=startSpan+(endSpan-startSpan)*e;request();if(t<1)requestAnimationFrame(tick);else if(!expand){resetExplosion();request()}};requestAnimationFrame(tick);
};
const explosionCenters=new Map();
function furnitureExplosionCenter(root){if(!explosionCenters.has(root)){const b=furnitureBounds(root);explosionCenters.set(root,b[0].map((v,i)=>(v+b[1][i])/2))}return explosionCenters.get(root)}
function drawFurnitureMesh(mesh,p){
 if(explosionAmount<=0||p.root!==explosionRoot){gl.uniform3f(L.shift,0,0,0);gl.drawArrays(gl.TRIANGLES,0,mesh.count);return}
 const c=furnitureExplosionCenter(p.root),ranges=mesh.explodeRanges||[{start:0,count:mesh.count,center:p.bounds[0].map((v,i)=>(v+p.bounds[1][i])/2)}];
 for(const r of ranges){const delta=r.center.map((v,i)=>(v-c[i])*1.1*explosionAmount);gl.uniform3fv(L.shift,delta);gl.drawArrays(gl.TRIANGLES,r.start,r.count)}
}
const hudBefore16=drawHUD;drawHUD=function(){if(explosionAmount>0||D.products?.[selectedFurniture]){hud.innerHTML='';return}hudBefore16()};
const pickBefore16=pickFurniture;pickFurniture=function(e){if(explosionAmount>0)return;pickBefore16(e)};
const clearBefore16=clearFurniture;clearFurniture=function(...args){resetExplosion();productPanel.hidden=true;explodeButton.hidden=true;document.body.classList.remove('productSelected');return clearBefore16(...args)};
const finalSelect16=selectFurniture;selectFurniture=function(root){finalSelect16(root);const sample=$('#furnitureSamples');if(sample)sample.hidden=!!D.products?.[root]};


// R17: ficheiros de informações fora da área de desenho no celular.
function furnitureFacing(root){
 if(root===102||root===104||root===203||root>=400&&root<500)return 3*Math.PI/4;
 if(root===8||root===100||root===103||root===105)return -Math.PI/4;
 if(root===209)return -Math.PI/2-.2;
 if(root>=210&&root<=215)return -Math.PI/4;
 if(root>=301&&root<=310){const b=furnitureBounds(root),x=(b[0][0]+b[1][0])/2,y=(b[0][1]+b[1][1])/2;return Math.atan2(11.30-y,3.89-x)+.18}
 return Math.PI/4;
}
const mobileDetailMedia=matchMedia('(max-width: 900px)');
const cardStage=$('.stage');const detailCalls=document.createElement('section');detailCalls.className='detailCalls';furnitureCard.append(detailCalls);
function placeFurnitureCard(){if(mobileDetailMedia.matches)cardStage.after(furnitureCard);else cardStage.append(furnitureCard)}
placeFurnitureCard();mobileDetailMedia.addEventListener('change',()=>{placeFurnitureCard();if(parts.length)fit()});
const boundsBefore17=furnitureBounds;furnitureBounds=function(root){if(root!==8)return boundsBefore17(root);const ps=parts.filter(p=>p.root===8||p.root===103&&[5,28].includes(p.sourceGroup));return [ps.reduce((a,p)=>a.map((v,i)=>Math.min(v,p.bounds[0][i])),[Infinity,Infinity,Infinity]),ps.reduce((a,p)=>a.map((v,i)=>Math.max(v,p.bounds[1][i])),[-Infinity,-Infinity,-Infinity])]};
const visibleBefore17=visible;visible=function(p){if(selectedFurniture===8)return p.on&&(p.root===8||p.root===103&&[5,28].includes(p.sourceGroup));return visibleBefore17(p)};
const barbecueButton=document.createElement('button');barbecueButton.textContent='Churrasqueira';barbecueButton.onclick=()=>selectFurniture(8);newQuick.append(barbecueButton);
const selectBefore17=selectFurniture;selectFurniture=function(root){placeFurnitureCard();selectBefore17(root);detailCalls.replaceChildren();
 const names=new Set();let calls=[];
 if(addedFurniture[root])calls=addedCalls(root).map(t=>t.text);
 if(root===100||root===101)calls=(D.newSource?.texts||[]).filter(t=>root===101?/ALUM|TRILHO/.test(t.text):!/ALUM|TRILHO/.test(t.text)).map(t=>t.text);
 if(root===12)calls=['Portas ripadas de correr','Puxador cava','Prateleiras em MDF ARAUCO LINHO','Sóculo em quartzito White TAJ'];
 if(root===8){$('#sceneName').textContent='Churrasqueira';$('#furnitureName').textContent='Churrasqueira · cozinha';$('#sceneSubtitle').textContent='Isométrica frontal';$('#furnitureNote').textContent='Conjunto identificado no SketchUp: corpo da churrasqueira, moldura de quartzito e portas guilhotina de vidro. Equipamento, ventilação e instalação a compatibilizar.';$('#furnitureDrawing').hidden=true;explodeButton.hidden=true;const sample=$('#furnitureSamples');if(sample)sample.hidden=true;calls=['Corpo da churrasqueira','Moldura de quartzito','Portas guilhotina de vidro'];parts.filter(p=>p.root===103&&[5,28].includes(p.sourceGroup)).forEach(p=>p.on=true)}
 if(calls.length){const heading=document.createElement('h4');heading.textContent='Elementos do conjunto';detailCalls.append(heading);const ul=document.createElement('ul');for(const text of calls){const label=text.trim();if(!label||names.has(label))continue;names.add(label);const li=document.createElement('li');li.textContent=label;ul.append(li)}detailCalls.append(ul)}
 if(mobileDetailMedia.matches)requestAnimationFrame(()=>{if(selectedFurniture===root&&!technical){hallMotion++;furnitureTransition++;fit();cardStage.scrollIntoView({block:'start',behavior:'smooth'})}});
};
const hudBefore17=drawHUD;drawHUD=function(){if(mobileDetailMedia.matches&&selectedFurniture!==null){hud.innerHTML='';return}hudBefore17()};

try{$('#loading p').textContent='Preparando materiais e geometria 3D…';setupGL();mats=D.materials.map(m=>({...m,gpu:texture(m.image)}));for(const p of D.parts){const edgeArray=await unpack(p.edges),meshes=[];for(const m of p.meshes){const a=await unpack(m.data);meshes.push({...m,gpu:gpu(a),pickArray:a})}parts.push({...p,meshes,edgeArray,edgeGpu:gpu(edgeArray),on:true})}remodelHall();for(const p of parts.filter(p=>p.root===12 && !/-R\d+/.test(p.name))){const label=document.createElement('label');label.className='layer';const input=document.createElement('input');input.type='checkbox';input.checked=true;input.dataset.piece=p.name;input.onchange=()=>{p.on=input.checked;const id=p.name.split(' · ')[0];parts.filter(q=>q.root===12&&q.name.startsWith(id+'-R')).forEach(q=>q.on=input.checked);shadowDirty=true;request()};label.append(input,document.createTextNode(p.name));$('#cabParts').append(label)}
for(const name of ['MDF ARAUCO LINHO','MDF ARAUCO JEQUITIBA','QUARTZITO BRANCO']){const mat=mats.find(m=>m.name===name);if(!mat)continue;const row=document.createElement('div');row.className='material';const sample=document.createElement('div');sample.className='sample';sample.style.backgroundImage=mat.image?'url('+mat.image+')':'';const label=document.createElement('div');label.innerHTML='<strong>'+esc(name.replace('MDF ARAUCO ','MDF '))+'</strong><small>Textura incorporada ao SketchUp</small>';row.append(sample,label);$('#materials').append(row)}
geometryDownloads.clear();$('#loading').hidden=true;new ResizeObserver(()=>{fit()}).observe(canvas);focusRoom(room);canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();$('#loading').hidden=false;$('#loading').innerHTML='<div class="app-error">A visualização foi interrompida pelo navegador. Reabra o arquivo para restaurar o projeto.</div>'});}
catch(e){$('#loading').innerHTML='<div class="app-error">'+esc(e.message)+'</div>';console.error(e)}
})();
