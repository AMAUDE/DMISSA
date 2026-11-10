'use strict';
/* ====== constantes ====== */
const TYPE_LAB=['Normal','Régularisation','Non renseigné'], TYPE_COL=['#2e9e6b','#f0a030','#9aa5b1'];
const SRC_LAB=['DU','DTC','Non renseigné'], SRC_COL=['#1f6fd1','#8e44ad','#9aa5b1'];
const CONF_LAB=['Non conforme','Conforme','Non renseigné'], CONF_COL=['#d9342b','#2e9e6b','#9aa5b1'];
const COL_A='#1f6fd1', COL_B='#f0a030', RED='#d9342b';
const ZCOL=['#1f6fd1','#f0a030','#8e44ad','#14919b'], ZLET=['A','B','C','D'];
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();

/* ====== état ====== */
const S={mode:'overview',q:'',types:new Set([0,1,2]),arr:'all',srcs:new Set([0,1,2]),confs:new Set([0,1,2]),sel:null,zone:null,counts:{}};
let plans=[],byId={},zones=[],map,loaded=false;

/* ====== utilisateur (collaboration) ====== */
function user(){return localStorage.getItem('dmissa_user')||''}
function askUser(){
  const n=prompt('Votre nom (affiché dans vos commentaires) :',user());
  if(n&&n.trim()){localStorage.setItem('dmissa_user',n.trim());}
  return user();
}
function showUser(){}


/* ====== données ====== */
async function boot(){
  const [p,z,l]=await Promise.all([fetch('data/plans.json?v='+Date.now()).then(r=>r.json()),fetch('data/zones.geojson?v='+Date.now()).then(r=>r.json()),fetch('data/lots.geojson?v='+Date.now()).then(r=>r.json())]);
  plans=p.map(x=>({...x,t:x.type==='NORMAL'?0:x.type==='REGULARISATION'?1:2,s:x.source==='DU'?0:x.source==='DTC'?1:2,a:x.arrete?1:0,cf:x.conformite==='conforme'?1:x.conformite==='non_conforme'?0:2,k:norm(x.nom+' '+(x.barcode||''))}));
  plans.forEach(x=>byId[x.id]=x);
  zones=z.features.filter(f=>f.geometry).map(f=>({id:f.properties.id,plans:f.properties.plans||[],conflit:!!f.properties.conflit,bbox:bboxOf(f.geometry)}));
  initMap(l,z);
}
function bboxOf(g){let a=[1e9,1e9,-1e9,-1e9];const w=c=>{if(typeof c[0]==='number'){a=[Math.min(a[0],c[0]),Math.min(a[1],c[1]),Math.max(a[2],c[0]),Math.max(a[3],c[1])]}else c.forEach(w)};w(g.coordinates);return a}
function allBbox(list){return list.reduce((a,p)=>[Math.min(a[0],p.bbox[0]),Math.min(a[1],p.bbox[1]),Math.max(a[2],p.bbox[2]),Math.max(a[3],p.bbox[3])],[1e9,1e9,-1e9,-1e9])}

/* ====== carte ====== */
const BASES={
  plan:{tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'],attr:'Esri, HERE, Garmin, © OpenStreetMap'},
  sat:{tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],attr:'Esri World Imagery'}
};
function initMap(lots,zonesGJ){
  const b=allBbox(plans);
  map=new maplibregl.Map({container:'map',bounds:[[b[0],b[1]],[b[2],b[3]]],fitBoundsOptions:{padding:40},
    style:{version:8,glyphs:'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',sources:{
      plan:{type:'raster',tiles:BASES.plan.tiles,tileSize:256,maxzoom:16,attribution:BASES.plan.attr},
      sat:{type:'raster',tiles:BASES.sat.tiles,tileSize:256,maxzoom:19,attribution:BASES.sat.attr}},
      layers:[{id:'plan',type:'raster',source:'plan'},{id:'sat',type:'raster',source:'sat',layout:{visibility:'none'}}]}});
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
  map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-right');
  map.once('style.load',()=>{
    map.addSource('lots',{type:'geojson',data:lots,tolerance:0.4,buffer:16});
    map.addSource('zones',{type:'geojson',data:zonesGJ});
    map.addSource('labels',{type:'geojson',data:{type:'FeatureCollection',features:plans.map(p=>({type:'Feature',properties:{p:p.id,nom:p.nom},geometry:{type:'Point',coordinates:[(p.bbox[0]+p.bbox[2])/2,(p.bbox[1]+p.bbox[3])/2]}}))}});
    map.addLayer({id:'lots-fill',type:'fill',source:'lots',paint:{'fill-color':'#999','fill-opacity':0.62}});
    map.addLayer({id:'lots-line',type:'line',source:'lots',minzoom:14.5,paint:{'line-color':'#ffffff','line-width':0.6,'line-opacity':0.9}});
    map.addLayer({id:'chev-lots',type:'fill',source:'lots',minzoom:14,layout:{visibility:'none'},paint:{'fill-color':RED,'fill-opacity':0.75}});
    map.addLayer({id:'chev-lots-line',type:'line',source:'lots',minzoom:14,layout:{visibility:'none'},paint:{'line-color':'#fff','line-width':0.7}});
    map.addLayer({id:'zones-fill',type:'fill',source:'zones',layout:{visibility:'none'},paint:{'fill-color':RED,'fill-opacity':0.28}});
    map.addLayer({id:'zones-line',type:'line',source:'zones',layout:{visibility:'none'},paint:{'line-color':RED,'line-width':2,'line-dasharray':[2,1.5]}});
    map.addLayer({id:'zone-sel',type:'line',source:'zones',layout:{visibility:'none'},filter:['==',['get','id'],-1],paint:{'line-color':'#111','line-width':3}});
    map.addLayer({id:'labels',type:'symbol',source:'labels',minzoom:11.5,layout:{'text-field':['get','nom'],'text-font':['Open Sans Semibold'],'text-size':12,'text-max-width':9,'text-padding':4},paint:{'text-color':'#0f2a43','text-halo-color':'#fff','text-halo-width':1.6}});
    map.on('click','lots-fill',onLotClick);map.on('click','chev-lots',onLotClick);
    map.on('click','zones-fill',e=>{const f=e.features[0];if(S.mode==='chev')selectZone(f.properties.id)});
    ['lots-fill','chev-lots','zones-fill'].forEach(l=>{map.on('mouseenter',l,()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave',l,()=>map.getCanvas().style.cursor='')});
    map.on('zoomend',zoomHint);
    loaded=true;$('#loader').style.display='none';setMode('overview');
  });
}
function onLotClick(e){
  const f=e.features[0],p=byId[f.properties.p];if(!p)return;
  const lot=[f.properties.i?'Îlot '+esc(f.properties.i):'',f.properties.l?'Lot '+esc(f.properties.l):'',f.properties.u?esc(f.properties.u):''].filter(Boolean).join(' · ');
  const btn=S.mode==='chev'?'':`<br><a href="#" onclick="selectPlan(${p.id});return false">Isoler ce lotissement</a>`;
  new maplibregl.Popup({closeButton:false,maxWidth:'280px'}).setLngLat(e.lngLat).setHTML(`<b>${esc(p.nom)}</b><br>${lot||'<span style="color:#888">Entité sans numéro</span>'}${S.mode==='conf'?'<br><b style="color:'+CONF_COL[p.cf]+'">'+CONF_LAB[p.cf]+'</b>':''}${btn}`).addTo(map);
}
$('#basemap').onclick=e=>{const b=e.target.closest('button');if(!b||!map)return;
  document.querySelectorAll('#basemap button').forEach(x=>x.classList.toggle('on',x===b));
  map.setLayoutProperty('plan','visibility',b.dataset.b==='plan'?'visible':'none');map.setLayoutProperty('sat','visibility',b.dataset.b==='sat'?'visible':'none')};

/* ====== filtrage ====== */
function matches(p,ignoreQ){
  if(!ignoreQ&&S.q&&!p.k.includes(norm(S.q)))return false;
  if(S.mode==='direction')return S.srcs.has(p.s);
  if(S.mode==='conf')return S.confs.has(p.cf);
  if(!S.types.has(p.t))return false;
  if(S.arr==='avec'&&!p.a)return false;
  if(S.arr==='sans'&&p.a)return false;
  return true;
}
function visibleIds(){
  if(S.sel)return [S.sel];
  return plans.filter(p=>matches(p,true)&&(!S.q||matches(p))).map(p=>p.id);
}
function applyMap(){
  if(!loaded)return;
  const ids=visibleIds();
  const flt=ids.length?['in',['get','p'],['literal',ids]]:['==',1,0];
  const dir=S.mode==='direction',cnf=S.mode==='conf';
  map.setFilter('lots-fill',flt);map.setFilter('labels',flt);
  map.setPaintProperty('lots-fill','fill-color',cnf?['match',['get','c'],1,CONF_COL[1],0,CONF_COL[0],CONF_COL[2]]:dir?['match',['get','s'],0,SRC_COL[0],1,SRC_COL[1],SRC_COL[2]]:['match',['get','t'],0,TYPE_COL[0],1,TYPE_COL[1],TYPE_COL[2]]);
  const chev=S.mode==='chev';
  const vis=(l,v)=>map.setLayoutProperty(l,'visibility',v?'visible':'none');
  vis('lots-fill',!chev);vis('lots-line',!chev);vis('chev-lots',chev);vis('chev-lots-line',chev);vis('zones-fill',chev);vis('zones-line',chev);vis('zone-sel',chev);
  if(chev){
    if(S.zone){
      const z=zones.find(x=>x.id===S.zone),tag='|'+S.zone+'|',inz=['in',tag,['coalesce',['get','z'],'']];
      const zp=z.plans.length?z.plans:[-1];
      map.setFilter('chev-lots',['in',['get','p'],['literal',zp]]);map.setFilter('chev-lots-line',['in',['get','p'],['literal',zp]]);
      map.setPaintProperty('chev-lots','fill-color',['match',['get','p'],...z.plans.flatMap((id,i)=>[id,ZCOL[i]]),'#999']);
      map.setPaintProperty('chev-lots','fill-opacity',['case',inz,0.85,0.15]);
      map.setFilter('zone-sel',['==',['get','id'],S.zone]);
      map.setFilter('zones-fill',['!=',['get','id'],S.zone]);map.setFilter('zones-line',['!=',['get','id'],S.zone]);
      map.setFilter('labels',['in',['get','p'],['literal',zp]]);
    }else{
      map.setFilter('chev-lots',['has','z']);map.setFilter('chev-lots-line',['has','z']);
      map.setPaintProperty('chev-lots','fill-color',RED);map.setPaintProperty('chev-lots','fill-opacity',0.75);
      map.setFilter('zone-sel',['==',['get','id'],-1]);map.setFilter('zones-fill',null);map.setFilter('zones-line',null);
      map.setFilter('labels',['in',['get','p'],['literal',[...new Set(zones.flatMap(z=>z.plans)),-1]]]);
    }
  }
  legend();
}
function legend(){
  const row=(c,t)=>`<div><i style="background:${c}"></i>${t}</div>`;let h='';
  if(S.mode==='overview')h='<b>Type de plan</b>'+TYPE_LAB.map((t,i)=>row(TYPE_COL[i],t)).join('');
  else if(S.mode==='conf')h='<b>Conformité du plan</b>'+[1,0,2].filter(i=>i<2||plans.some(p=>p.cf===2)).map(i=>row(CONF_COL[i],CONF_LAB[i])).join('')+'<div style="color:#6b7a8c;max-width:170px">Selon le champ « classe » de la couche</div>';
  else if(S.mode==='direction')h='<b>Direction source</b>'+SRC_LAB.map((t,i)=>row(SRC_COL[i],t)).join('');
  else h='<b>Chevauchement</b>'+row(RED,'Zone de chevauchement')+(S.zone?ZCOL.map((c,i)=>row(c,'Lotissement '+ZLET[i])).join('')+'<div style="color:#6b7a8c">Zoomez pour voir les lots</div>':'<div style="color:#6b7a8c">Zoomez pour voir les lots<br>en conflit</div>');
  $('#legend').innerHTML=h;
}
function hint(t){const h=$('#hint');if(!t){h.style.display='none';return}h.textContent=t;h.style.display='block'}

/* ====== navigation ====== */
function setMode(m){
  S.mode=m;S.sel=null;S.zone=null;
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.mode===m));
  hint('');renderSide();applyMap();
  if(map)map.fitBounds([[allBbox(plans)[0],allBbox(plans)[1]],[allBbox(plans)[2],allBbox(plans)[3]]],{padding:40});
}
$('#tabs').onclick=e=>{const b=e.target.closest('button');if(b)setMode(b.dataset.mode)};
function selectPlan(id){
  S.sel=id;const p=byId[id];renderSide();applyMap();
  map.fitBounds([[p.bbox[0],p.bbox[1]],[p.bbox[2],p.bbox[3]]],{padding:70,maxZoom:18.5,duration:900});
  hint('Lotissement isolé : '+p.nom);
}
function clearSel(){S.sel=null;S.q='';renderSide();applyMap();hint('');const b=allBbox(plans);map.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:40})}
function selectZone(id){
  S.zone=id;const z=zones.find(x=>x.id===id);renderSide();applyMap();
  map.fitBounds([[z.bbox[0],z.bbox[1]],[z.bbox[2],z.bbox[3]]],{padding:90,maxZoom:17.5,duration:900});
  hint(map.getZoom()<14?'Zoomez pour voir les lots qui se chevauchent':'');
}
function zoomHint(){if(S.mode==='chev'&&S.zone)hint(map.getZoom()<14?'Zoomez pour voir les lots qui se chevauchent':'')}
function clearZone(){S.zone=null;renderSide();applyMap();hint('');const b=allBbox(plans);map.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:40})}
window.selectPlan=selectPlan;

/* ====== panneau latéral ====== */
const tag=(t,c)=>`<span class="tag" style="background:${c}">${esc(t)}</span>`;
const confTag=p=>tag(CONF_LAB[p.cf],CONF_COL[p.cf]);
const planTags=p=>(S.mode==='conf'?confTag(p):'')+tag(TYPE_LAB[p.t],TYPE_COL[p.t])+tag(SRC_LAB[p.s],SRC_COL[p.s])+(p.a?tag('Arrêté','#0f2a43'):'<span class="tag out">Sans arrêté</span>');
function renderSide(){
  const el=$('#side');
  if(S.mode==='overview')el.innerHTML=overviewHTML();
  else if(S.mode==='direction')el.innerHTML=directionHTML();
  else if(S.mode==='conf')el.innerHTML=confHTML();
  else el.innerHTML=chevHTML();
  bindSide();refreshList();if(S.sel)loadComments('plan:'+S.sel);if(S.zone)loadComments('zone:'+S.zone);
}
function counts(f){const c=[0,0,0];plans.filter(f).forEach(p=>c[0]++);return c[0]}
function overviewHTML(){
  const nT=[0,1,2].map(i=>plans.filter(p=>p.t===i).length), nA=plans.filter(p=>p.a).length;
  return `
  <div class="sec"><div class="kpis"><div class="kpi"><b>${plans.length}</b><span>lotissements</span></div><div class="kpi"><b>${nA}</b><span>avec n° d'arrêté</span></div><div class="kpi"><b>${plans.length-nA}</b><span>sans n° d'arrêté</span></div></div></div>
  <div class="sec"><h3>Rechercher un lotissement</h3><input type="search" id="q" placeholder="Nom du lotissement ou code-barre…" value="${esc(S.q)}" autocomplete="off"></div>
  <div class="sec"><h3>Type de plan</h3><div class="chips" id="fTypes">${[0,1,2].map(i=>`<button class="chip ${S.types.has(i)?'on':''}" data-t="${i}"><i style="background:${TYPE_COL[i]}"></i>${TYPE_LAB[i]} <b>${nT[i]}</b></button>`).join('')}</div></div>
  <div class="sec"><h3>Numéro d'arrêté</h3><div class="chips" id="fArr">${[['all','Tous'],['avec','Avec n° d\'arrêté'],['sans','Sans n° d\'arrêté']].map(([k,t])=>`<button class="chip ${S.arr===k?'on':''}" data-a="${k}">${t}</button>`).join('')}</div></div>
  ${S.sel?detailHTML():''}
  <div class="sec"><h3 id="lh">Lotissements</h3><div class="list" id="list"></div></div>`;
}
function directionHTML(){
  const n=[0,1,2].map(i=>plans.filter(p=>p.s===i).length);
  const tot=plans.length;
  const tbl=[0,1,2].map(i=>`<tr><td><i class="dot" style="background:${SRC_COL[i]};display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px"></i>${SRC_LAB[i]}</td>${[0,1,2].map(t=>`<td>${plans.filter(p=>p.s===i&&p.t===t).length}</td>`).join('')}<td><b>${n[i]}</b></td></tr>`).join('');
  return `
  <div class="sec"><h3>Direction source des plans</h3>
    <div class="kpis">${[0,1,2].map(i=>`<div class="kpi"><b style="color:${SRC_COL[i]}">${n[i]}</b><span>${SRC_LAB[i]}</span></div>`).join('')}</div>
    <div class="bar">${[0,1,2].map(i=>`<div style="width:${n[i]/tot*100}%;background:${SRC_COL[i]}"></div>`).join('')}</div>
    <div style="font-size:12px;color:var(--mut)">DU : Direction de l'Urbanisme · DTC : Direction de la Topographie et de la Cartographie</div></div>
  <div class="sec"><h3>Filtrer par direction</h3><div class="chips" id="fSrc">${[0,1,2].map(i=>`<button class="chip ${S.srcs.has(i)?'on':''}" data-s="${i}"><i style="background:${SRC_COL[i]}"></i>${SRC_LAB[i]} <b>${n[i]}</b></button>`).join('')}</div></div>
  <div class="sec"><h3>Direction × type de plan</h3><table><tr><th></th><th>Normal</th><th>Régul.</th><th>N.R.</th><th>Total</th></tr>${tbl}</table></div>
  <div class="sec"><h3>Rechercher</h3><input type="search" id="q" placeholder="Nom du lotissement…" value="${esc(S.q)}" autocomplete="off"></div>
  ${S.sel?detailHTML():''}
  <div class="sec"><h3 id="lh">Lotissements</h3><div class="list" id="list"></div></div>`;
}
function confHTML(){
  const n=[0,1,2].map(i=>plans.filter(p=>p.cf===i).length),tot=plans.length,pct=v=>Math.round(v/tot*100);
  const showNR=n[2]>0, idx=showNR?[1,0,2]:[1,0];
  const row=(lab,f)=>`<tr><td>${lab}</td>${idx.map(i=>`<td>${plans.filter(p=>f(p)&&p.cf===i).length}</td>`).join('')}<td><b>${plans.filter(f).length}</b></td></tr>`;
  const head=`<tr><th></th>${idx.map(i=>`<th>${CONF_LAB[i]==='Non conforme'?'Non conf.':CONF_LAB[i]}</th>`).join('')}<th>Total</th></tr>`;
  return `
  <div class="sec"><h3>Conformité des plans</h3>
    <div class="kpis"><div class="kpi"><b>${tot}</b><span>lotissements</span></div><div class="kpi"><b style="color:${CONF_COL[1]}">${n[1]}</b><span>conformes</span></div><div class="kpi"><b style="color:${CONF_COL[0]}">${n[0]}</b><span>non conformes</span></div></div>
    <div class="bar">${idx.map(i=>`<div style="width:${n[i]/tot*100}%;background:${CONF_COL[i]}"></div>`).join('')}</div>
    <div style="font-size:12px;color:var(--mut)">${pct(n[1])} % des lotissements sont conformes · ${pct(n[0])} % non conformes. Conformité issue du champ « classe » de la couche.</div></div>
  <div class="sec"><h3>Filtrer par conformité</h3><div class="chips" id="fConf">${idx.map(i=>`<button class="chip ${S.confs.has(i)?'on':''}" data-c="${i}"><i style="background:${CONF_COL[i]}"></i>${CONF_LAB[i]} <b>${n[i]}</b></button>`).join('')}</div></div>
  <div class="sec"><h3>Conformité × direction</h3><table>${head}${[0,1,2].map(s=>row(SRC_LAB[s],p=>p.s===s)).join('')}</table></div>
  <div class="sec"><h3>Conformité × type de plan</h3><table>${head}${[0,1,2].map(s=>row(TYPE_LAB[s],p=>p.t===s)).join('')}</table></div>
  <div class="sec"><h3>Rechercher</h3><input type="search" id="q" placeholder="Nom du lotissement…" value="${esc(S.q)}" autocomplete="off"></div>
  ${S.sel?detailHTML():''}
  <div class="sec"><h3 id="lh">Lotissements</h3><div class="list" id="list"></div></div>`;
}
function chevPairs(){
  const m={};zones.forEach(z=>{if(z.plans.length<2)return;const a=byId[z.plans[0]],b=byId[z.plans[1]];const k=[SRC_LAB[a.s],SRC_LAB[b.s]].sort().join(' ↔ ');m[k]=(m[k]||0)+1});return Object.entries(m).sort((x,y)=>y[1]-x[1]);
}
const zoneName=z=>z.plans.length?z.plans.slice(0,2).map(i=>byId[i].nom).join(' ↔ ')+(z.plans.length>2?' (+'+(z.plans.length-2)+')':''):'Zone n° '+z.id;
function chevHTML(){
  const ids=new Set(zones.flatMap(z=>z.plans));
  const cnt={};zones.forEach(z=>z.plans.forEach(i=>cnt[i]=(cnt[i]||0)+1));
  const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,6);
  if(S.zone){
    const z=zones.find(x=>x.id===S.zone);
    const box=(p,c,l)=>`<div class="card2"><div style="display:flex;align-items:center;gap:8px"><span class="pill" style="background:${c}">${l}</span><h2 style="margin:0">${esc(p.nom)}</h2></div>
      <div class="kv" style="margin-top:8px"><span>Code-barre</span><b>${esc(p.barcode||'—')}</b><span>Direction</span><b>${esc(SRC_LAB[p.s])}</b><span>Type</span><b>${esc(TYPE_LAB[p.t])}</b><span>N° d'arrêté</span><b>${p.arrete?esc(p.arrete):'—'}</b><span>Autres zones</span><b>${(cnt[p.id]||1)-1}</b></div>
      <div style="margin-top:8px"><button class="btn sec2" onclick="goPlan(${p.id})">Voir ce lotissement</button></div></div>`;
    return `<div class="sec"><button class="btn sec2" onclick="clearZone()">← Toutes les zones</button></div>
      <div class="sec"><h3>Zone de chevauchement n° ${z.id}</h3>${z.plans.length?z.plans.map((id,i)=>box(byId[id],ZCOL[i],ZLET[i])).join(''):'<div class="empty">Aucun lotissement de l’assemblage dans cette zone.</div>'}
      <div style="font-size:12.5px;color:var(--mut)">${z.conflit?'Les lots en couleur sont ceux qui se superposent ; les autres lots des lotissements concernés apparaissent en transparence.':'Zone identifiée : aucun lot ne se superpose dans l’assemblage actuel ; les lots des lotissements concernés sont affichés en transparence.'}</div></div>
      <div class="sec"><h3>Discussion sur cette zone</h3><div id="cmt"></div></div>`;
  }
  return `<div class="sec"><div class="kpis" style="grid-template-columns:repeat(2,1fr)"><div class="kpi"><b>${zones.length}</b><span>zones</span></div><div class="kpi"><b>${ids.size}</b><span>lotissements concernés</span></div></div></div>
  <div class="sec"><h3>Zones de chevauchement</h3><div class="list" id="list"></div></div>`;
}
window.goPlan=id=>{S.mode='overview';S.confs=new Set([0,1,2]);document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.mode==='overview'));S.zone=null;S.types=new Set([0,1,2]);S.arr='all';selectPlan(id)};
function detailHTML(){
  const p=byId[S.sel];
  const arr=p.arrete?p.arrete.split(/\s*;\s*/).map(a=>`<div>${esc(a)}</div>`).join(''):`<span style="color:var(--mut)">${p.appr?esc(p.appr):'Non renseigné'}</span>`;
  return `<div class="card2"><h2>${esc(p.nom)}</h2><div style="margin-bottom:8px" class="m">${planTags(p)}</div>
  <div class="kv"><span>Code-barre</span><b>${esc(p.barcode||'—')}</b><span>Type</span><b>${TYPE_LAB[p.t]}</b><span>Conformité</span><b style="color:${CONF_COL[p.cf]}">${CONF_LAB[p.cf]}</b><span>Direction</span><b>${SRC_LAB[p.s]}</b><span>N° d'arrêté</span><div>${arr}</div></div>
  <div style="margin-top:10px"><button class="btn sec2" onclick="clearSel()">✕ Afficher tous les lotissements</button></div></div>
  <div class="sec"><h3>Commentaires</h3><div id="cmt"></div></div>`;
}
function bindSide(){
  const q=$('#q');if(q){q.oninput=()=>{S.q=q.value;if(S.sel){S.sel=null;renderSide();$('#q').focus();$('#q').setSelectionRange(S.q.length,S.q.length);}refreshList();applyMap()};
    q.onkeydown=e=>{if(e.key==='Enter'){const r=plans.filter(p=>matches(p));if(r.length>=1)selectPlan(r[0].id)}}}
  const ft=$('#fTypes');if(ft)ft.onclick=e=>{const b=e.target.closest('button');if(!b)return;const t=+b.dataset.t;S.types.has(t)?S.types.delete(t):S.types.add(t);b.classList.toggle('on');refreshList();applyMap()};
  const fa=$('#fArr');if(fa)fa.onclick=e=>{const b=e.target.closest('button');if(!b)return;S.arr=b.dataset.a;fa.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));refreshList();applyMap()};
  const fc=$('#fConf');if(fc)fc.onclick=e=>{const b=e.target.closest('button');if(!b)return;const t=+b.dataset.c;S.confs.has(t)?S.confs.delete(t):S.confs.add(t);b.classList.toggle('on');refreshList();applyMap()};
  const fs=$('#fSrc');if(fs)fs.onclick=e=>{const b=e.target.closest('button');if(!b)return;const t=+b.dataset.s;S.srcs.has(t)?S.srcs.delete(t):S.srcs.add(t);b.classList.toggle('on');refreshList();applyMap()};
}
function refreshList(){
  const el=$('#list');if(!el)return;
  if(S.mode==='chev'){
    el.innerHTML=zones.map(z=>{const n=S.counts['zone:'+z.id];return `<div class="item" data-z="${z.id}"><div class="n">${esc(zoneName(z))}${n?`<span class="badge">💬${n}</span>`:''}</div><div class="m">${z.plans.slice(0,3).map(i=>tag(SRC_LAB[byId[i].s],SRC_COL[byId[i].s])).join('')}<span class="tag out">Zone ${z.id}</span>${z.conflit?tag('Lots superposés',RED):''}</div></div>`}).join('');
    el.onclick=e=>{const i=e.target.closest('.item');if(i)selectZone(+i.dataset.z)};return;
  }
  const r=plans.filter(p=>matches(p));
  const lh=$('#lh');if(lh)lh.textContent=r.length+' lotissement'+(r.length>1?'s':'')+(S.q?' trouvé'+(r.length>1?'s':''):'');
  el.innerHTML=r.length?r.map(p=>{const n=S.counts['plan:'+p.id];return `<div class="item ${S.sel===p.id?'sel':''}" data-p="${p.id}"><div class="n">${esc(p.nom)}${n?`<span class="badge">💬${n}</span>`:''}</div><div class="m">${planTags(p)}</div></div>`}).join(''):'<div class="empty">Aucun lotissement ne correspond.</div>';
  el.onclick=e=>{const i=e.target.closest('.item');if(i)selectPlan(+i.dataset.p)};
}


/* ====== API commentaires : serveur si disponible, sinon stockage local (hébergement statique) ====== */
let SERVER=null;
async function detectServer(){
  if(SERVER!==null)return SERVER;
  try{const r=await fetch('api/comments/counts');SERVER=r.ok&&(r.headers.get('content-type')||'').includes('json');}catch{SERVER=false}
  return SERVER;
}
const LS_KEY='dmissa_comments';
const lsAll=()=>{try{return JSON.parse(localStorage.getItem(LS_KEY)||'[]')}catch{return[]}};
async function apiList(target){
  if(await detectServer())return fetch('api/comments?target='+encodeURIComponent(target)).then(r=>r.json()).catch(()=>[]);
  return lsAll().filter(c=>c.target===target).sort((a,b)=>b.id-a.id);
}
async function apiAdd(target,author,text){
  if(await detectServer())return fetch('api/comments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target,author,text})});
  const all=lsAll();all.push({id:Date.now(),target,author,text,created:new Date().toISOString()});localStorage.setItem(LS_KEY,JSON.stringify(all));
}
async function apiCounts(){
  if(await detectServer())return fetch('api/comments/counts').then(r=>r.json()).catch(()=>S.counts);
  const o={};lsAll().forEach(c=>o[c.target]=(o[c.target]||0)+1);return o;
}

/* ====== commentaires (collaboratif) ====== */
let cmtTarget=null;
async function loadComments(target){
  cmtTarget=target;const box=$('#cmt');if(!box)return;
  const list=await apiList(target);
  if(cmtTarget!==target||!$('#cmt'))return;
  const keep=box.querySelector('textarea')?.value||'';
  box.innerHTML=`<textarea id="ct" rows="2" placeholder="Ajouter un commentaire, une correction, une question…">${esc(keep)}</textarea><div style="margin:6px 0 10px"><button class="btn" id="cs">Publier</button></div>`+
   (list.length?list.map(c=>`<div class="cmt"><b>${esc(c.author)}</b><small>${new Date(c.created).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})}</small><div>${esc(c.text)}</div></div>`).join(''):'<div class="empty">Aucun commentaire pour le moment.</div>');
  $('#cs').onclick=async()=>{const t=$('#ct').value.trim();if(!t)return;const a=user()||askUser();if(!a)return;
    await apiAdd(target,a,t);$('#ct').value='';loadComments(target);pollCounts()};
}
async function pollCounts(){
  S.counts=await apiCounts();
  if(!document.activeElement||document.activeElement.id!=='q')refreshList();
}
setInterval(()=>{pollCounts();if(cmtTarget&&document.activeElement?.id!=='ct')loadComments(cmtTarget)},15000);pollCounts();

boot();
