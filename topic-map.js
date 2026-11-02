let context;
let query='';
let queryProject;
const collapsed=new Set(), signedCache=new Map();
export function configureMap(value){context=value;}
const state=()=>context.getState();
const h=value=>context.esc(value);
const clean=value=>String(value||'').trim();
export function mapTopic(item){
  if(clean(item.topic))return clean(item.topic);
  if(item.kind==='topic')return clean(item.title);
  if(item.kind==='slide'){
    const source=state().items.find(r=>(item.resource_ids||[]).includes(r.id)&&clean(r.topic));
    if(source)return clean(source.topic);
  }
  return '공통';
}
const cards=()=>state().items.filter(i=>['resource','slide'].includes(i.kind));
const category=item=>item.asset_type||(item.kind==='slide'?'발표 · 대본':'자료');
function topics(){return [...new Set(state().items.filter(i=>['topic','resource','slide','task'].includes(i.kind)).map(mapTopic))];}
const groupKey=topic=>state().project.id+':'+topic;
export function mapFields(item={}){
  return context.select('카드 종류','asset_type',[['자료','자료'],['대본','대본'],['PPT','PPT'],['발표 · 대본','발표 · 대본'],['기타','기타']],category(item))+
    '<label for="map-thumbnail">카드 썸네일 (선택 · JPG, PNG, WebP · 최대 2MB)</label><input id="map-thumbnail" name="thumbnail" type="file" accept="image/jpeg,image/png,image/webp">'+
    (item.thumbnail_path||item.demo_thumbnail?'<label class="thumbnail-remove"><input type="checkbox" name="remove_thumbnail"> 기존 썸네일 지우기</label>':'')+
    '<p class="muted map-form-hint">썸네일은 카드 표지이고, 첨부파일은 카드를 누르면 열리는 실제 파일입니다.</p>';
}
export async function collectMapFields(form,item={}){
  const data={asset_type:form.get('asset_type')||category(item)};
  if(form.has('remove_thumbnail')){data.thumbnail_path=null;if(state().demo)data.demo_thumbnail=null;}
  const image=form.get('thumbnail');
  if(image?.size){
    if(image.size>2*1024*1024)throw Error('썸네일은 2MB 이하로 선택해주세요.');
    if(!['image/jpeg','image/png','image/webp'].includes(image.type))throw Error('JPG, PNG, WebP 이미지를 선택해주세요.');
    // Reject files that only claim an image MIME type before storing a thumbnail.
    const bitmap=await createImageBitmap(image).catch(()=>{throw Error('이미지 파일을 읽을 수 없어요. 다른 이미지를 선택해주세요.');});bitmap.close();
    if(state().demo)data.demo_thumbnail=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('이미지를 읽을 수 없어요.'));reader.readAsDataURL(image);});
    else data.thumbnail_path=await uploadMapFile(image);
  }
  return data;
}
export async function uploadMapFile(file){
  if(file.size>10*1024*1024)throw Error('첨부파일은 10MB 이하로 선택해주세요.');
  // api() refreshes an expiring session before the direct Storage request.
  await context.api('/auth/v1/user');
  const {cfg,session,project}=state();
  const extension=file.type==='image/jpeg'?'jpg':file.type==='image/png'?'png':file.type==='image/webp'?'webp':file.name.split('.').pop().toLowerCase();
  if(!['jpg','jpeg','png','webp','pdf','ppt','pptx','txt'].includes(extension))throw Error('PDF, 이미지, PPT, TXT 파일을 선택해주세요.');
  const path=project.id+'/'+crypto.randomUUID()+'.'+extension;
  const response=await fetch(cfg.url+'/storage/v1/object/team-files/'+path,{method:'POST',headers:{apikey:cfg.key,Authorization:'Bearer '+session.access_token,'Content-Type':file.type||'application/octet-stream'},body:file});
  if(!response.ok)throw Error('파일을 올리지 못했어요. 잠시 후 다시 시도해주세요.');
  return path;
}
async function signedUrl(path){
  const {cfg,project}=state();
  if(!path.startsWith(project.id+'/'))throw Error('현재 팀의 파일이 아닙니다.');
  const cached=signedCache.get(path);if(cached&&cached.until>Date.now())return cached.url;
  const result=await context.api('/storage/v1/object/sign/team-files/'+path,{expiresIn:300},'POST');
  const url=result.signedURL.startsWith('/storage/v1/')?cfg.url+result.signedURL:cfg.url+'/storage/v1/'+result.signedURL.replace(/^\/+/, '');
  signedCache.set(path,{url,until:Date.now()+240000});return url;
}
function placeholder(item){return `<div class="map-cover-fallback" aria-hidden="true"><span class="map-paper-icon">${item.kind==='slide'||category(item)==='대본'?'≡':'▧'}</span><span>${h(category(item))}</span></div>`;}
function mapCard(item){return `<article class="map-asset"><button class="map-open" data-map-open="${h(item.id)}" aria-label="${h(item.title)} 열기"><div class="map-cover">${placeholder(item)}${item.thumbnail_path?`<img data-map-image="${h(item.thumbnail_path)}" alt="${h(item.title)} 썸네일" loading="lazy" hidden>`:item.demo_thumbnail?`<img src="${h(item.demo_thumbnail)}" alt="${h(item.title)} 썸네일">`:''}</div><div class="map-card-text"><span class="map-type">${h(category(item))}</span><h3>${h(item.title)}</h3><small>${h(context.memberName(item.author))} · ${item.file_path||item.demo_file?'첨부파일':item.kind==='slide'?'발표 장면':'문서'}</small></div><span class="map-card-arrow" aria-hidden="true">↗</span></button><button class="map-edit" data-map-edit="${h(item.id)}" aria-label="${h(item.title)} 편집">편집</button></article>`;}
function mapBody(){
  const all=cards(),search=clean(query).toLocaleLowerCase();
  const groups=topics().map(topic=>({topic,assets:all.filter(i=>mapTopic(i)===topic)})).filter(g=>!search||g.topic.toLocaleLowerCase().includes(search)||g.assets.some(i=>(i.title+' '+category(i)).toLocaleLowerCase().includes(search)));
  return `<div class="map-root"><span>대주제</span><h2>${h(state().project.name)}</h2><small>${topics().length}개 소주제 · ${all.length}개 자료·대본</small></div><div class="map-branches">${groups.map(({topic,assets})=>{
    const visible=search&&!topic.toLocaleLowerCase().includes(search)?assets.filter(i=>(i.title+' '+category(i)).toLocaleLowerCase().includes(search)):assets;
    const closed=!search&&collapsed.has(groupKey(topic));
    return `<section class="map-branch"><div class="map-topic"><button data-map-collapse="${h(topic)}" aria-expanded="${!closed}"><span class="map-topic-label">소주제 <span aria-hidden="true">${closed?'＋':'−'}</span></span><h3>${h(topic)}</h3><small>${assets.length}개 자료·대본</small></button><button class="map-topic-add" data-map-add="${h(topic)}" aria-label="${h(topic)}에 자료 추가">+ 자료·대본 추가</button></div><div class="map-assets" ${closed?'hidden':''}>${visible.map(mapCard).join('')||`<button class="map-empty-card" data-map-add="${h(topic)}"><span>＋</span>첫 자료나 대본을 연결해보세요</button>`}</div></section>`;
  }).join('')||'<div class="map-no-results">'+(search?'검색 결과가 없어요. 다른 제목이나 소주제로 찾아보세요.':'아직 소주제가 없습니다. 위의 ‘소주제 추가’로 첫 가지를 만들어보세요.')+'</div>'}</div>`;
}
export function topicMap(){if(queryProject!==state().project.id){query='';queryProject=state().project.id;}return `<section class="topic-map"><div class="map-toolbar"><div><p class="eyebrow">PROJECT AT A GLANCE</p><p class="muted">대주제부터 자료와 대본까지, 우리 팀의 생각을 한눈에.</p></div><div class="row wrap"><button id="map-expand">모두 펼치기</button><button class="primary" id="map-new-topic">+ 소주제 추가</button></div></div><div class="map-filter"><label for="map-search">자료 찾기</label><input id="map-search" type="search" placeholder="소주제, 자료 제목, 대본 검색" value="${h(query)}"><span class="map-legend"><i></i> 대주제·소주제 <i class="blue"></i> 자료·대본 · 카드를 눌러 열기</span></div><div class="map-scroll" tabindex="0" aria-label="대주제와 소주제별 자료 연결 지도"><div class="map-canvas" id="map-canvas">${mapBody()}</div></div></section>`;}
function redraw(){const canvas=document.querySelector('#map-canvas');if(canvas){canvas.innerHTML=mapBody();hydrateThumbnails();}}
async function hydrateThumbnails(){
  await Promise.all([...document.querySelectorAll('[data-map-image]')].map(async img=>{try{const url=await signedUrl(img.dataset.mapImage);if(!img.isConnected)return;img.onload=()=>{img.hidden=false;};img.onerror=()=>{img.hidden=true;};img.src=url;}catch{img.hidden=true;}}));
}
export function bindTopicMap(){
  const root=document.querySelector('.topic-map');if(!root)return;
  root.onclick=event=>{const button=event.target.closest('button');if(!button)return;const d=button.dataset;
    if(d.mapOpen)openMapItem(d.mapOpen);
    if(d.mapEdit)context.editItem(state().items.find(i=>i.id===d.mapEdit));
    if(d.mapAdd!==undefined)context.editItem({kind:'resource',topic:d.mapAdd});
    if(d.mapCollapse!==undefined){const key=groupKey(d.mapCollapse);collapsed.has(key)?collapsed.delete(key):collapsed.add(key);redraw();}
  };
  document.querySelector('#map-new-topic').onclick=()=>context.modal('소주제 추가',context.field('소주제 이름','title'),async form=>{const title=clean(form.get('title'));if(!title)throw Error('소주제 이름을 입력해주세요.');if(topics().includes(title))throw Error('이미 있는 소주제입니다. 해당 가지에 자료를 추가해주세요.');await context.saveItem({kind:'topic',title,topic:title});});
  document.querySelector('#map-expand').onclick=()=>{for(const topic of topics())collapsed.delete(groupKey(topic));redraw();};
  document.querySelector('#map-search').oninput=event=>{query=event.target.value;redraw();};
  hydrateThumbnails();
}
export async function openMapItem(id){
  const item=state().items.find(i=>i.id===id);if(!item)return;
  const dialog=document.querySelector('#modal');dialog.classList.add('map-viewer');
  dialog.innerHTML=`<div class="map-viewer-head"><div><span class="map-type">${h(mapTopic(item))} / ${h(category(item))}</span><h2>${h(item.title)}</h2><small class="muted">${h(context.memberName(item.author))}</small></div><button id="map-close" aria-label="자료 닫기">✕</button></div><div id="map-file-preview">${item.file_path?'<p class="muted">첨부파일을 불러오는 중…</p>':''}</div><div class="map-document">${item.body?`<h3>내용</h3><p>${context.highlight(item.body,item.highlight)}</p>`:''}${item.script?`<h3>발표 대본</h3><p>${h(item.script)}</p>`:''}${!item.body&&!item.script&&!item.file_path?'<p class="muted">아직 작성된 내용이나 첨부파일이 없어요. 편집에서 추가해주세요.</p>':''}</div>${context.safeUrl(item.url)?`<a href="${h(item.url)}" target="_blank" rel="noopener noreferrer">출처 열기 ↗</a>`:''}<div class="actions"><button id="map-edit-content">내용 · 썸네일 편집</button><button id="map-done" class="primary">닫기</button></div>`;
  const close=()=>dialog.close();document.querySelector('#map-close').onclick=close;document.querySelector('#map-done').onclick=close;
  document.querySelector('#map-edit-content').onclick=()=>{close();context.editItem(item);};
  dialog.addEventListener('close',()=>dialog.classList.remove('map-viewer'),{once:true});dialog.showModal();
  const target=document.querySelector('#map-file-preview');
  if(item.demo_file&&target){target.innerHTML='<p class="notice">체험 모드의 파일은 현재 화면에서만 열립니다.</p>'+previewFile(item.demo_file,item.demo_file_name||'file');}
  if(item.file_path){try{const url=await signedUrl(item.file_path);if(target.isConnected)target.innerHTML=previewFile(url,item.file_path);}catch(error){if(target.isConnected)target.textContent='첨부파일을 열지 못했어요. '+error.message;}}
}
function previewFile(url,path){
  const extension=path.split('.').pop().toLowerCase();
  const link=`<a class="file-open-link" href="${h(url)}" target="_blank" rel="noopener noreferrer">파일 새 창에서 열기 / 다운로드 ↗</a>`;
  if(['jpg','jpeg','png','webp'].includes(extension))return `<img class="map-image-preview" src="${h(url)}" alt="첨부 이미지">${link}`;
  if(extension==='pdf')return `<iframe class="map-pdf-preview" src="${h(url)}" title="첨부 PDF 미리보기"></iframe>${link}`;
  return `<div class="notice">이 형식은 브라우저 미리보기를 지원하지 않을 수 있어요. 파일을 내려받아 열어주세요.</div>${link}`;
}
