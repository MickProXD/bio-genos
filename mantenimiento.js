'use strict';
/* ═══ BIO-GENOS · Mantenimiento ═══
   Chofer: checklist de la unidad, reporte de incidentes (Defcon), «enterado», aviso de preventivo.
   Gerente: bandeja de incidentes en tiempo real, programación, evidencia, preventivos, checklist editable.
   Todo lo protege RLS / RPC en Supabase (gerente = supervisor o Dirección). Fotos en el bucket privado «mant». */
const CM = { d:null, f:{}, img:new Map(), rt:null, t:0, _t:null };
G.mt = 'inc'; G.mf = 'abiertos'; G.nInc = 0;

const DEFCON = {
  5:['Defcon 5', 'g', 'Observación', 'Detalle menor; no afecta la operación'],
  4:['Defcon 4', 'g', 'Programar', 'Hay que atenderlo en los próximos días'],
  3:['Defcon 3', 'a', 'Atender pronto', 'Puede empeorar; se opera con cuidado'],
  2:['Defcon 2', 'r', 'Operación limitada', 'La unidad trabaja con restricciones'],
  1:['Defcon 1', 'r', 'Unidad detenida', 'No puede operar o hay riesgo de seguridad']
};
const EST_INC = { nuevo:['Nuevo', 'r'], programado:['Programado', 'a'], enterado:['Enterado', 'g'], reparado:['Reparado', 'g'], descartado:['Descartado', ''] };
const dfTag = n => { const d = DEFCON[n] || DEFCON[4]; return `<span class="tag ${d[1]}">${d[0]} · ${d[2]}</span>`; };
const diasHasta = f => f ? Math.round((new Date(f + 'T12:00:00') - new Date(hoyLocal() + 'T12:00:00')) / 864e5) : null;
const fmtDT = iso => iso ? new Date(iso).toLocaleString('es-MX', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZone:TZ }) : '—';

/* ── fotos ── */
async function cmComprimir(file){
  let w, h, src; const bmp = await createImageBitmap(file).catch(() => null);
  if (bmp){ w = bmp.width; h = bmp.height; src = bmp; }
  else { const u = URL.createObjectURL(file); const im = await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = u; }); w = im.naturalWidth; h = im.naturalHeight; src = im; }
  const k = Math.min(1, 1280 / Math.max(w, h)), cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
  return new Promise(r => cv.toBlob(b => r(b), 'image/jpeg', 0.72));
}
function cmFotoBox(key, max, cam){
  CM.f[key] = [];
  return `<div id="cf-${key}"></div><input type="file" accept="image/*" ${cam ? 'capture="environment"' : ''} id="ci-${key}" style="display:none" onchange="cmAgregarFoto('${key}',${max},this)">`;
}
function cmFotoPintar(key, max){
  const a = CM.f[key] || [], box = $('cf-' + key); if (!box) return;
  box.innerHTML = `<div class="row" style="flex-wrap:wrap;gap:8px">${a.map((f, i) => `<div style="position:relative"><img src="${f.url}" alt="" style="width:84px;height:84px;object-fit:cover;border-radius:8px;border:1px solid var(--border)"><button type="button" class="btn sm" style="position:absolute;top:2px;right:2px;padding:0 7px" onclick="cmQuitarFoto('${key}',${max},${i})">✕</button></div>`).join('')}${a.length < max ? `<button type="button" class="btn sm" style="height:84px;width:84px" onclick="$('ci-${key}').click()">＋ Foto</button>` : ''}</div>`;
}
async function cmAgregarFoto(key, max, inp){
  const f = inp.files && inp.files[0]; inp.value = ''; if (!f) return;
  if ((CM.f[key] || []).length >= max) return;
  try { const blob = await cmComprimir(f); if (!blob) throw new Error('x'); CM.f[key].push({ blob, url:URL.createObjectURL(blob) }); cmFotoPintar(key, max); document.querySelectorAll('#g-md .err.show').forEach(e => e.classList.remove('show')); }
  catch(e){ toast('No se pudo procesar la foto. Intenta con otra.', 'error'); }
}
function cmQuitarFoto(key, max, i){ const a = CM.f[key] || []; const [x] = a.splice(i, 1); if (x) URL.revokeObjectURL(x.url); cmFotoPintar(key, max); }
async function cmSubir(key, carpeta){
  const out = [];
  for (const f of (CM.f[key] || [])){
    const p = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await sb.storage.from('mant').upload(p, f.blob, { contentType:'image/jpeg', upsert:false });
    if (error) throw error; out.push(p);
  }
  return out;
}
async function cmUrl(p){
  if (CM.img.has(p)) return CM.img.get(p);
  try { const { data, error } = await sb.storage.from('mant').download(p); if (error || !data) return null; const u = URL.createObjectURL(data); CM.img.set(p, u); return u; } catch(e){ return null; }
}
function cmImgs(root){ (root || document).querySelectorAll('img[data-p]').forEach(async im => { if (im.src && im.src.startsWith('blob:')) return; const u = await cmUrl(im.dataset.p); if (u) im.src = u; }); }
const cmTh = (p, s) => `<img data-p="${esc(p)}" alt="" onclick="cmVer('${esc(p)}')" style="width:${s || 84}px;height:${s || 84}px;object-fit:cover;border-radius:8px;border:1px solid var(--border);background:var(--border);cursor:pointer">`;
async function cmVer(p){ const u = await cmUrl(p); if (!u) return toast('No se pudo cargar la foto', 'error'); gModal(`<img src="${u}" alt="" style="width:100%;border-radius:10px"><div class="foot"><button class="btn" onclick="gCerrar()">Cerrar</button></div>`); }
const cmFotosSel = key => (CM.f[key] || []).length;

/* ═══════════════ CHOFER ═══════════════ */
function cmIniciar(){
  if (CM.rt) return;
  CM.rt = sb.channel('bg-cm').on('postgres_changes', { event:'*', schema:'public', table:'bg_incidentes' }, pl => {
    const n = pl.new || {};
    if (pl.eventType === 'UPDATE' && n.estado === 'programado') toast('Mantenimiento programado para ' + fmtF(n.fecha_programada) + '. Confirma de enterado.', 'success');
    if (pl.eventType === 'UPDATE' && n.estado === 'reparado') toast('Tu unidad fue reparada', 'success');
    clearTimeout(CM._t); CM._t = setTimeout(() => cmRender(true), 600);
  }).subscribe();
}
function cmDetener(){ clearTimeout(CM._t); if (CM.rt){ try { sb.removeChannel(CM.rt); } catch(e){} CM.rt = null; } CM.d = null; CM.t = 0; const b = $('mo-unidad'); if (b) b.innerHTML = ''; }

async function cmRender(force){
  if (!U || U.gerente) return; const box = $('mo-unidad'); if (!box) return;
  if (!force && Date.now() - CM.t < 20000 && CM.d) return;
  let d = null, off = false;
  try { if (!navigator.onLine || _sinSesion) throw new Error('offline'); d = await q(sb.rpc('bg_mi_unidad')); lsSet('bg_cm_' + U.id, d); CM.t = Date.now(); }
  catch(e){ d = lsGet('bg_cm_' + U.id, null); off = true; }
  CM.d = d;
  if (!d){ box.innerHTML = ''; return; }
  if (!d.unidad){ box.innerHTML = '<div class="card"><div class="sec">No tienes una unidad asignada. Tu gerente te la asigna desde Rutas.</div></div>'; return; }
  const u = d.unidad, p = d.preventivo || {}, lav = d.lavado || {}, inc = d.incidentes || [];
  const nom = [u.marca, u.modelo].filter(Boolean).join(' ');
  let aviso = '';
  if (p.estado && p.estado !== 'ok'){
    const col = (p.estado === 'vencido' || p.estado === 'urge') ? 'var(--red)' : 'var(--amber)';
    const cuando = p.estado === 'vencido' ? 'está <b>vencido</b>' : (p.dias === 0 ? 'es <b>hoy</b>' : `es en <b>${p.dias} día${p.dias === 1 ? '' : 's'}</b> (${fmtF(p.siguiente)})`);
    aviso += `<div class="card" style="border-color:${col};margin-top:10px;margin-bottom:0"><b>Servicio preventivo</b>: tu preventivo ${cuando}${p.km_restantes != null && p.km_restantes > 0 ? ` · faltan ~${Math.round(p.km_restantes).toLocaleString('es-MX')} km` : ''}. Avisa a tus supervisores para programarlo.</div>`;
  } else if (p.siguiente){
    aviso += `<div class="mut" style="margin-top:8px">Próximo preventivo: ${fmtF(p.siguiente)} (en ${p.dias} días)${p.km_restantes != null && p.km_restantes > 0 ? ` · ~${Math.round(p.km_restantes).toLocaleString('es-MX')} km` : ''}</div>`;
  }
  if (lav.dias != null && lav.dias <= 5) aviso += `<div class="mut" style="margin-top:6px">Lavado y engrasado: ${lav.dias < 0 ? 'atrasado ' + (-lav.dias) + ' d' : lav.dias === 0 ? 'toca hoy' : 'en ' + lav.dias + ' d'}.</div>`;
  const chk = d.checklist_hoy
    ? `<div class="row b" style="margin-top:10px"><span class="tag g">Checklist de hoy listo · ${fmtHora(d.checklist_hoy_en)}</span><button class="btn sm" ${off ? 'disabled' : ''} onclick="cmChecklistModal()">Repetir</button></div>`
    : `<div class="card" style="border-color:var(--amber);margin:10px 0 0"><b>Checklist pendiente.</b> Revisa tu unidad antes de salir a ruta.<button class="btn p w" style="margin-top:10px" ${off ? 'disabled' : ''} onclick="cmChecklistModal()">Hacer checklist de la unidad</button></div>`;
  const incs = inc.map(i => {
    const e = EST_INC[i.estado] || [i.estado, ''];
    return `<div class="orow" style="align-items:flex-start"><div style="flex:1"><div>${dfTag(i.defcon)} <span class="tag ${e[1]}">${e[0]}</span></div>
      <div class="sec" style="white-space:pre-wrap;margin-top:4px">${esc(String(i.descripcion).slice(0, 220))}</div>
      ${i.fecha_programada ? `<div style="margin-top:4px"><b>Programado para ${esc(fmtF(i.fecha_programada))}</b></div>` : ''}${i.notas_gerente ? `<div class="mut">${esc(i.notas_gerente)}</div>` : ''}
      ${i.estado === 'programado' ? `<button class="btn p sm" style="margin-top:8px" onclick="cmEnterado('${i.id}')">Enterado</button>` : ''}${i.estado === 'enterado' ? '<div class="mut">Ya confirmaste de enterado.</div>' : ''}</div></div>`;
  }).join('');
  box.innerHTML = `<div class="card">
    <div class="row" style="align-items:flex-start;gap:12px">
      ${u.foto_path ? `<div style="flex:0 0 auto">${cmTh(u.foto_path, 78)}</div>` : ''}
      <div style="flex:1;min-width:0"><div class="row b"><b style="font-size:17px">${esc(u.bak)}</b>${off ? '<span class="tag a">Sin señal</span>' : ''}</div>
        <div class="sec">${esc(nom || 'Mi unidad')}${u.tipo ? ' · ' + esc(u.tipo) : ''}</div><div class="mut">${u.placas ? 'Placas ' + esc(u.placas) : ''}</div></div>
    </div>${chk}${aviso}
    ${inc ? `<div style="margin-top:12px"><b>Incidentes abiertos</b>${incs}</div>` : ''}
    <button class="btn w" style="margin-top:12px" ${off ? 'disabled' : ''} onclick="cmIncModal()">Reportar incidente de mantenimiento</button></div>`;
  cmImgs(box);
}

async function cmEnterado(id){
  try { await q(sb.rpc('bg_incidente_enterado', { p_id:id })); toast('Listo, quedó registrado que estás enterado', 'success'); cmRender(true); } catch(e){ gErr(e); }
}

/* — checklist — */
async function cmChecklistModal(){
  const d = CM.d; if (!d || !d.unidad) return;
  gModal('<div class="card mut">Cargando checklist…</div>');
  let items;
  try { items = await q(sb.from('bg_checklist_items').select('*').eq('activo', true).order('orden')); } catch(e){ gCerrar(); return gErr(e); }
  if (!items.length){ gCerrar(); return toast('Tu gerente todavía no define el checklist.', 'error'); }
  CM.items = items; CM.res = items.map(() => ({ ok:true, nota:'' }));
  let sec = '', html = '';
  items.forEach((it, i) => {
    if (it.seccion !== sec){ sec = it.seccion; html += `<div style="font-weight:800;margin:14px 0 4px;color:var(--text2)">${esc(sec)}</div>`; }
    html += `<div class="orow" style="align-items:flex-start"><div style="flex:1"><div>${esc(it.texto)}${it.critico ? ' <span class="mut">(crítico)</span>' : ''}</div>
      <input id="ck-n-${i}" placeholder="¿Qué falla tiene?" style="display:none;margin-top:6px" oninput="CM.res[${i}].nota=this.value"></div>
      <div class="row" style="flex-shrink:0"><button type="button" id="ck-ok-${i}" class="btn sm p" onclick="cmCk(${i},true)">OK</button><button type="button" id="ck-no-${i}" class="btn sm" onclick="cmCk(${i},false)">Falla</button></div></div>`;
  });
  gModal(`<h2>Checklist · ${esc(d.unidad.bak)}</h2><div class="sec">Todo viene marcado como OK. Toca <b>Falla</b> en lo que no esté bien.</div>${html}
    <label class="l">Odómetro (km) *</label><input id="ck-odo" type="number" inputmode="decimal" min="0" placeholder="Kilometraje actual">
    <label class="l">Foto de la unidad *</label>${cmFotoBox('ck', 1, true)}
    <label class="l">Observaciones</label><textarea id="ck-obs" rows="2"></textarea>
    <div class="err" id="ck-err">—</div>
    <div class="foot"><button class="btn" onclick="gCerrar()">Cancelar</button><button class="btn p" id="ck-btn" onclick="cmChecklistEnviar()">Enviar checklist</button></div>`);
  cmFotoPintar('ck', 1);
}
function cmCk(i, ok){
  CM.res[i].ok = ok; $('ck-ok-' + i).className = 'btn sm' + (ok ? ' p' : ''); $('ck-no-' + i).className = 'btn sm' + (!ok ? ' p' : '');
  if (!ok) $('ck-no-' + i).style.cssText = 'background:var(--red);border-color:var(--red);color:#fff'; else $('ck-no-' + i).style.cssText = '';
  $('ck-n-' + i).style.display = ok ? 'none' : 'block'; if (!ok) $('ck-n-' + i).focus();
}
async function cmChecklistEnviar(){
  hide('ck-err'); const d = CM.d, odo = parseFloat($('ck-odo').value);
  if (!(odo > 0)) return say('ck-err', 'Escribe el kilometraje de la unidad');
  if (!cmFotosSel('ck')) return say('ck-err', 'Toma la foto de la unidad');
  const b = $('ck-btn'); b.disabled = true; b.textContent = 'Enviando…';
  try {
    const fotos = await cmSubir('ck', `${U.id}/${d.unidad.bak}`);
    const resp = CM.items.map((it, i) => ({ item_id:it.id, seccion:it.seccion, texto:it.texto, critico:it.critico, ok:CM.res[i].ok, nota:CM.res[i].ok ? '' : (CM.res[i].nota || '').trim() }));
    const r = await q(sb.rpc('bg_enviar_checklist', { p_unidad:d.unidad.id, p_respuestas:resp, p_odometro:odo, p_foto:fotos[0], p_obs:$('ck-obs').value }));
    gCerrar(); toast(r.fallas ? `Checklist enviado. Se avisó al gerente de ${r.fallas} falla${r.fallas > 1 ? 's' : ''}.` : 'Checklist enviado. ¡Buen viaje!', 'success'); cmRender(true);
  } catch(e){ b.disabled = false; b.textContent = 'Enviar checklist'; gEr('ck-err', e); }
}

/* — incidente (chofer o gerente) — */
function cmIncModal(unidadId){
  const g = U && U.gerente, d = CM.d;
  if (!g && (!d || !d.unidad)) return;
  const unis = g ? (G.cat?.uni || []).filter(x => x.estatus !== 'baja') : [];
  gModal(`<h2>Incidente de mantenimiento</h2>
    ${g ? `<label class="l">Unidad *</label><select id="in-u">${opt(unis, 'id', 'bak', unidadId, 'Elige la unidad')}</select>` : `<div class="sec">Unidad <b>${esc(d.unidad.bak)}</b></div>`}
    <label class="l">¿Qué tan grave es? *</label>
    <div id="in-df">${[5, 4, 3, 2, 1].map(n => `<label style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px"><input type="radio" name="in-df" value="${n}" ${n === 4 ? 'checked' : ''} style="width:20px;height:20px;margin-top:2px;flex:0 0 auto"><span><b>${DEFCON[n][0]} · ${DEFCON[n][2]}</b><br><span class="mut">${DEFCON[n][3]}</span></span></label>`).join('')}</div>
    <label class="l">¿Qué le pasa a la unidad? *</label><textarea id="in-d" rows="3" placeholder="Describe el problema: qué se escucha, qué falla, desde cuándo…"></textarea>
    <label class="l">Fotos * (al menos una)</label>${cmFotoBox('in', 3, !g)}
    <div class="err" id="in-err">—</div>
    <div class="foot"><button class="btn" onclick="gCerrar()">Cancelar</button><button class="btn p" id="in-btn" onclick="cmIncEnviar()">Enviar al gerente</button></div>`);
  cmFotoPintar('in', 3);
}
async function cmIncEnviar(){
  hide('in-err'); const g = U.gerente, uid = g ? $('in-u').value : CM.d.unidad.id, bak = g ? (G.cat.uni.find(x => x.id === uid) || {}).bak : CM.d.unidad.bak;
  const df = parseInt(document.querySelector('input[name=in-df]:checked')?.value || '4', 10), desc = $('in-d').value.trim();
  if (!uid) return say('in-err', 'Elige la unidad');
  if (desc.length < 5) return say('in-err', 'Describe qué le pasa a la unidad');
  if (!cmFotosSel('in')) return say('in-err', 'Adjunta al menos una foto');
  const b = $('in-btn'); b.disabled = true; b.textContent = 'Enviando…';
  try {
    const fotos = await cmSubir('in', `${U.id}/${bak}`);
    await q(sb.rpc('bg_reportar_incidente', { p_unidad:uid, p_descripcion:desc, p_defcon:df, p_fotos:fotos }));
    gCerrar(); toast('Incidente enviado al gerente', 'success'); if (g) gMant(); else cmRender(true);
  } catch(e){ b.disabled = false; b.textContent = 'Enviar al gerente'; gEr('in-err', e); }
}

/* ═══════════════ GERENTE ═══════════════ */
async function gMBadge(){
  try { const r = await sb.from('bg_incidentes').select('id', { count:'exact', head:true }).eq('estado', 'nuevo'); if (!r.error){ G.nInc = r.count || 0; gTabs(); } } catch(e){}
}
function gOnInc(pl){
  const n = pl.new || {}, u = (G.cat?.uni || []).find(x => x.id === n.unidad_id);
  if (pl.eventType === 'INSERT') toast(`Incidente nuevo${u ? ' en ' + u.bak : ''} · ${DEFCON[n.defcon]?.[0] || ''}`, 'error');
  else if (pl.eventType === 'UPDATE' && n.estado === 'enterado') toast(`Chofer enterado del mantenimiento${u ? ' de ' + u.bak : ''}`, 'success');
  gMBadge();
  if (G.tab === 'mant' && !document.querySelector('.ov.on')){ clearTimeout(G._rtM); G._rtM = setTimeout(gMant, 700); }
}
function gOnChk(pl){
  const n = pl.new || {}, u = (G.cat?.uni || []).find(x => x.id === n.unidad_id);
  if (n.fallas > 0) toast(`Checklist con ${n.fallas} falla(s)${u ? ' · ' + u.bak : ''}`, 'error');
  if (G.tab === 'mant' && G.mt === 'chk' && !document.querySelector('.ov.on')){ clearTimeout(G._rtM); G._rtM = setTimeout(gMant, 700); }
}

async function gMant(){
  const subs = [['inc', 'Incidentes'], ['prev', 'Preventivos'], ['chk', 'Checklists'], ['edit', 'Editar checklist']];
  $('g-body').innerHTML = `<div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:12px">${subs.map(([k, t]) => `<button class="btn sm ${G.mt === k ? 'p' : ''}" onclick="G.mt='${k}';gMant()">${t}</button>`).join('')}<span class="sp"></span><span class="mut" id="g-live"></span></div><div id="g-c" class="card mut">Cargando…</div>`;
  gVivo();
  try { await ({ inc:gMInc, prev:gMPrev, chk:gMChk, edit:gMEdit })[G.mt](); } catch(e){ const c = $('g-c'); if (c) c.innerHTML = `<div class="err show">${esc(e.message)}</div>`; }
}

/* — incidentes — */
async function gMInc(){
  const cat = await gCat(), ab = G.mf === 'abiertos';
  let qy = sb.from('bg_incidentes').select('*').order('created_at', { ascending:false }).limit(150);
  qy = ab ? qy.in('estado', ['nuevo', 'programado', 'enterado']) : qy.in('estado', ['reparado', 'descartado']);
  let lista = await q(qy);
  if (ab) lista.sort((a, b) => (a.estado === 'nuevo' ? 0 : 1) - (b.estado === 'nuevo' ? 0 : 1) || a.defcon - b.defcon || (a.created_at < b.created_at ? 1 : -1));
  G.inc = lista;
  const uni = Object.fromEntries(cat.uni.map(u => [u.id, u])), ch = Object.fromEntries(cat.chof.map(x => [x.colaborador_id, x.nombre]));
  const cards = lista.map((i, k) => {
    const u = uni[i.unidad_id] || {}, e = EST_INC[i.estado] || [i.estado, ''];
    const acc = [];
    if (i.estado === 'nuevo') acc.push(`<button class="btn p sm" onclick="gMProgModal(${k})">Programar</button>`);
    if (i.estado === 'programado') acc.push(`<button class="btn sm" onclick="gMProgModal(${k})">Reprogramar</button>`);
    if (i.estado === 'programado' || i.estado === 'enterado') acc.push(`<button class="btn p sm" onclick="gMRepModal(${k})">Marcar reparado</button>`);
    if (ab) acc.push(`<button class="btn sm" onclick="gMDescModal(${k})">Descartar</button>`);
    return `<div class="card" ${i.estado === 'nuevo' ? 'style="border-color:var(--red)"' : ''}>
      <div class="row b"><b style="font-size:16px">${esc(u.bak || '—')}</b><span class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">${dfTag(i.defcon)}<span class="tag ${e[1]}">${e[0]}</span></span></div>
      <div class="mut">${esc(i.reportado_nombre || '—')}${u.chofer_id && ch[u.chofer_id] && ch[u.chofer_id] !== i.reportado_nombre ? ' · chofer: ' + esc(ch[u.chofer_id]) : ''} · ${fmtDT(i.created_at)}${i.origen === 'checklist' ? ' · desde checklist' : ''}</div>
      <div class="sec" style="white-space:pre-wrap;margin-top:6px">${esc(i.descripcion)}</div>
      ${(i.fotos || []).length ? `<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">${i.fotos.map(p => cmTh(p)).join('')}</div>` : ''}
      ${i.fecha_programada ? `<div style="margin-top:8px"><b>Programado: ${esc(fmtF(i.fecha_programada))}</b> ${i.estado === 'enterado' ? `<span class="tag g">Chofer enterado ${fmtDT(i.enterado_en)}</span>` : i.estado === 'programado' ? '<span class="tag a">Esperando enterado del chofer</span>' : ''}</div>` : ''}
      ${i.notas_gerente ? `<div class="mut">Nota: ${esc(i.notas_gerente)}</div>` : ''}
      ${(i.evidencia || []).length ? `<div style="margin-top:8px"><div class="mut">Evidencia de la reparación${i.reparado_en ? ' · ' + fmtDT(i.reparado_en) : ''}</div><div class="row" style="gap:8px;flex-wrap:wrap;margin-top:4px">${i.evidencia.map(p => cmTh(p)).join('')}</div></div>` : ''}
      ${acc.length ? `<div class="row" style="margin-top:12px;flex-wrap:wrap">${acc.join('')}</div>` : ''}</div>`;
  }).join('') || `<div class="card"><div class="sec">${ab ? 'No hay incidentes abiertos. 👍' : 'Sin incidentes cerrados todavía.'}</div></div>`;
  $('g-c').outerHTML = `<div id="g-c"><div class="row" style="gap:6px;margin-bottom:10px"><button class="btn sm ${ab ? 'p' : ''}" onclick="G.mf='abiertos';gMant()">Abiertos</button><button class="btn sm ${!ab ? 'p' : ''}" onclick="G.mf='cerrados';gMant()">Cerrados</button><span class="sp"></span><button class="btn sm" onclick="cmIncModal()">Nuevo incidente</button></div>${cards}</div>`;
  cmImgs($('g-c'));
}
function gMProgModal(k){
  const i = G.inc[k]; if (!i) return; G.incSel = i.id; const m = new Date(); m.setDate(m.getDate() + 1);
  gModal(`<h2>Programar mantenimiento</h2><div class="sec">${esc(String(i.descripcion).split('\n')[0].slice(0, 120))}</div>
    <label class="l">Fecha del mantenimiento *</label><input id="gp-f" type="date" value="${esc(i.fecha_programada || m.toLocaleDateString('en-CA'))}" min="${hoyLocal()}">
    <label class="l">Nivel Defcon</label><select id="gp-d">${[5, 4, 3, 2, 1].map(n => `<option value="${n}" ${n === i.defcon ? 'selected' : ''}>${DEFCON[n][0]} · ${DEFCON[n][2]}</option>`).join('')}</select>
    <label class="l">Nota para el chofer (opcional)</label><textarea id="gp-n" rows="2" placeholder="Taller, hora, qué debe llevar…">${esc(i.notas_gerente || '')}</textarea>
    <div class="mut" style="margin-top:8px">El chofer recibe el aviso en su app y debe confirmar de enterado.</div><div class="err" id="gp-err">—</div>
    <div class="foot"><button class="btn" onclick="gCerrar()">Cancelar</button><button class="btn p" onclick="gMProg()">Programar</button></div>`);
}
async function gMProg(){
  hide('gp-err'); const f = $('gp-f').value; if (!f) return say('gp-err', 'Elige la fecha');
  try { await q(sb.rpc('bg_incidente_programar', { p_id:G.incSel, p_fecha:f, p_defcon:parseInt($('gp-d').value, 10), p_notas:$('gp-n').value })); gCerrar(); toast('Mantenimiento programado', 'success'); gMant(); gMBadge(); } catch(e){ gEr('gp-err', e); }
}
function gMRepModal(k){
  const i = G.inc[k]; if (!i) return; G.incSel = i.id;
  gModal(`<h2>Reparación realizada</h2><div class="sec">${esc(String(i.descripcion).split('\n')[0].slice(0, 120))}</div>
    <label class="l">Foto de evidencia * (al menos una)</label>${cmFotoBox('rep', 4, false)}
    <label class="l">Notas de la reparación (opcional)</label><textarea id="gr-n" rows="2" placeholder="Qué se hizo, refacciones, taller…"></textarea>
    <div class="err" id="gr-err">—</div><div class="foot"><button class="btn" onclick="gCerrar()">Cancelar</button><button class="btn p" id="gr-btn" onclick="gMRep()">Cerrar incidente</button></div>`);
  cmFotoPintar('rep', 4);
}
async function gMRep(){
  hide('gr-err'); if (!cmFotosSel('rep')) return say('gr-err', 'Sube al menos una foto de evidencia');
  const i = G.inc.find(x => x.id === G.incSel), bak = (G.cat.uni.find(x => x.id === i.unidad_id) || {}).bak || 'unidad';
  const b = $('gr-btn'); b.disabled = true; b.textContent = 'Subiendo…';
  try { const ev = await cmSubir('rep', `${U.id}/${bak}`); await q(sb.rpc('bg_incidente_reparado', { p_id:G.incSel, p_evidencia:ev, p_notas:$('gr-n').value })); gCerrar(); toast('Incidente cerrado con evidencia', 'success'); gMant(); }
  catch(e){ b.disabled = false; b.textContent = 'Cerrar incidente'; gEr('gr-err', e); }
}
function gMDescModal(k){
  const i = G.inc[k]; if (!i) return; G.incSel = i.id;
  gModal(`<h2>Descartar incidente</h2><div class="sec">${esc(String(i.descripcion).split('\n')[0].slice(0, 120))}</div><label class="l">Motivo *</label><textarea id="gd-m" rows="2" placeholder="Ej. Falsa alarma, duplicado…"></textarea><div class="err" id="gd-err">—</div>
    <div class="foot"><button class="btn" onclick="gCerrar()">Cancelar</button><button class="btn p" onclick="gMDesc()">Descartar</button></div>`);
}
async function gMDesc(){ hide('gd-err'); try { await q(sb.rpc('bg_incidente_descartar', { p_id:G.incSel, p_notas:$('gd-m').value })); gCerrar(); toast('Incidente descartado', 'success'); gMant(); gMBadge(); } catch(e){ gEr('gd-err', e); } }

/* — preventivos — */
function gPrevEstado(p){
  let dias = null, est = 'sinfecha', km = null, hr = null, lav = null;
  if (p.siguiente){ dias = diasHasta(p.siguiente); est = dias < 0 ? 'vencido' : dias <= 7 ? 'urge' : dias <= 30 ? 'proximo' : 'ok'; }
  if (p.intervalo_km && +p.km_hoy > 0 && +p.km_ultimo > 0){ km = +p.km_ultimo + p.intervalo_km - +p.km_hoy; if (km <= 0) est = 'vencido'; else if (km <= p.intervalo_km * 0.1 && ['ok', 'proximo', 'sinfecha'].includes(est)) est = 'urge'; }
  if (p.intervalo_hrs && +p.hrs_motor > 0 && +p.hrs_ultimo > 0) hr = +p.hrs_ultimo + p.intervalo_hrs - +p.hrs_motor;
  if (p.lavado_ultimo){ lav = diasHasta(p.lavado_ultimo) + (p.lavado_cada_dias || 30); }
  return { dias, est, km, hr, lav };
}
const PV_ORD = { vencido:0, urge:1, sinfecha:2, proximo:3, ok:4 };
async function gMPrev(){
  const [cat, prev] = await Promise.all([gCat(), q(sb.from('bg_preventivos').select('*'))]);
  const pm = Object.fromEntries(prev.map(p => [p.unidad_id, p])), act = cat.uni.filter(u => u.estatus !== 'baja');
  const filas = act.map(u => ({ u, p:pm[u.id] || null, s:pm[u.id] ? gPrevEstado(pm[u.id]) : null }));
  G.prevRows = filas;
  const c = e => filas.filter(f => f.s && f.s.est === e).length, f = G.pf || 'todos';
  const tarj = (n, t, col) => `<div class="card" style="margin:0;text-align:center"><div style="font-size:24px;font-weight:800;${col ? 'color:var(--' + col + ')' : ''}">${n}</div><div class="mut">${t}</div></div>`;
  const ver = filas.filter(x => f === 'todos' ? true : f === 'urgentes' ? x.s && ['vencido', 'urge'].includes(x.s.est) : f === 'proximos' ? x.s && x.s.est === 'proximo' : !x.p)
    .sort((a, b) => (a.s ? PV_ORD[a.s.est] : 9) - (b.s ? PV_ORD[b.s.est] : 9) || (a.s?.dias ?? 9999) - (b.s?.dias ?? 9999) || natural(a.u.bak, b.u.bak));
  const tag = s => !s ? '<span class="tag">Sin programa</span>' : ({ vencido:`<span class="tag r">Vencido${s.dias != null && s.dias < 0 ? ' hace ' + (-s.dias) + ' d' : ''}</span>`, urge:`<span class="tag r">Urge${s.dias != null ? ' · ' + (s.dias === 0 ? 'hoy' : s.dias + ' d') : ''}</span>`, proximo:`<span class="tag a">En ${s.dias} d</span>`, ok:`<span class="tag g">En ${s.dias} d</span>`, sinfecha:'<span class="tag a">Sin fecha</span>' })[s.est];
  const filaH = x => { const { u, p, s } = x, ch = cat.chof.find(z => z.colaborador_id === u.chofer_id);
    return `<div class="card"><div class="row b"><b>${esc(u.bak)}</b>${tag(s)}</div>
      <div class="mut">${esc([u.marca, u.modelo].filter(Boolean).join(' '))}${ch ? ' · ' + esc(ch.nombre) : ''}</div>
      ${p ? `<div class="kv" style="margin-top:6px"><div><small>Último servicio</small>${esc(fmtF(p.fecha_real || p.ultimo_servicio))}</div><div><small>Siguiente</small>${esc(fmtF(p.siguiente))}</div>
        <div><small>Cada</small>${[p.intervalo_km ? p.intervalo_km.toLocaleString('es-MX') + ' km' : '', p.intervalo_hrs ? p.intervalo_hrs + ' hrs' : ''].filter(Boolean).join(' / ') || '—'}</div>
        <div><small>Odómetro / horas</small>${p.km_hoy ? Math.round(p.km_hoy).toLocaleString('es-MX') + ' km' : '—'}${p.hrs_motor ? ' · ' + Math.round(p.hrs_motor) + ' h' : ''}${s.km != null ? `<br><span class="mut">${s.km > 0 ? 'faltan ~' + Math.round(s.km).toLocaleString('es-MX') + ' km' : 'excedido ' + Math.round(-s.km).toLocaleString('es-MX') + ' km'}</span>` : ''}</div>
        <div><small>Lavado y engrasado</small>${p.lavado_ultimo ? esc(fmtF(p.lavado_ultimo)) : '—'}${s.lav != null ? `<br><span class="mut" style="${s.lav < 0 ? 'color:var(--red)' : ''}">${s.lav < 0 ? 'atrasado ' + (-s.lav) + ' d' : s.lav === 0 ? 'toca hoy' : 'en ' + s.lav + ' d'}</span>` : ''}</div></div>
        ${p.observaciones ? `<div class="mut">${esc(p.observaciones)}</div>` : ''}` : '<div class="sec" style="margin-top:6px">Esta unidad no tiene programa de preventivo.</div>'}
      <div class="row" style="margin-top:10px;flex-wrap:wrap">${p ? `<button class="btn p sm" onclick="gMServModal('${u.id}')">Registrar servicio</button><button class="btn sm" onclick="gMLavModal('${u.id}')">Lavado hecho</button>` : ''}<button class="btn sm" onclick="gMPrevModal('${u.id}')">${p ? 'Editar programa' : 'Configurar'}</button></div></div>`; };
  const fb = (k, t) => `<button class="btn sm ${f === k ? 'p' : ''}" onclick="G.pf='${k}';gMant()">${t}</button>`;
  $('g-c').outerHTML = `<div id="g-c"><div class="g4" style="margin-bottom:10px">${tarj(c('vencido'), 'Vencidos', 'red')}${tarj(c('urge'), 'Urgentes (≤7 d)', 'red')}${tarj(c('proximo'), 'Próximos (≤30 d)', 'amber')}${tarj(c('ok'), 'Al corriente', 'green')}${tarj(c('sinfecha'), 'Sin fecha', 'amber')}</div>
    <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:10px">${fb('todos', 'Todas')}${fb('urgentes', 'Vencidos y urgentes')}${fb('proximos', 'Próximos')}${fb('sin', 'Sin programa')}</div>${ver.map(filaH).join('') || '<div class="card sec">Sin unidades en este filtro.</div>'}</div>`;
}
function gMPrevModal(uid){
  const x = G.prevRows.find(r => r.u.id === uid), p = x.p || {}; G.prevSel = uid;
  const f = (k, t, tipo, ph) => `<div style="flex:1;min-width:150px"><label class="l">${t}</label><input id="pv-${k}" type="${tipo || 'number'}" ${tipo === 'date' ? '' : 'inputmode="decimal" min="0"'} value="${esc(p[k] ?? '')}" ${ph ? `placeholder="${ph}"` : ''}></div>`;
  gModal(`<h2>Programa de preventivo · ${esc(x.u.bak)}</h2><div class="row" style="flex-wrap:wrap;gap:0 10px">${f('intervalo_km', 'Cada cuántos km', 'number', 'Ej. 12000')}${f('intervalo_hrs', 'Cada cuántas horas', 'number', 'Ej. 300')}${f('siguiente', 'Siguiente servicio', 'date')}${f('km_hoy', 'Odómetro actual (km)')}${f('hrs_motor', 'Horas de motor actuales')}${f('lavado_cada_dias', 'Lavado y engrasado cada (días)', 'number', '30')}</div>
    <label class="l">Observaciones</label><input id="pv-observaciones" value="${esc(p.observaciones || '')}">
    <div class="mut" style="margin-top:8px">El odómetro se actualiza solo con el checklist del chofer. Para registrar un servicio ya hecho usa «Registrar servicio».</div><div class="err" id="pv-err">—</div>
    <div class="foot"><button class="btn" onclick="gCerrar()">Cancelar</button><button class="btn p" onclick="gMPrevGuardar()">Guardar</button></div>`);
}
async function gMPrevGuardar(){
  hide('pv-err'); const v = k => $('pv-' + k).value.trim();
  try { await q(sb.rpc('bg_preventivo_guardar', { p:{ unidad_id:G.prevSel, intervalo_km:v('intervalo_km'), intervalo_hrs:v('intervalo_hrs'), siguiente:v('siguiente'), km_hoy:v('km_hoy'), hrs_motor:v('hrs_motor'), lavado_cada_dias:v('lavado_cada_dias'), observaciones:v('observaciones') } })); gCerrar(); toast('Programa guardado', 'success'); gMant(); } catch(e){ gEr('pv-err', e); }
}
function gMServModal(uid){
  const x = G.prevRows.find(r => r.u.id === uid), p = x.p || {}; G.prevSel = uid;
  gModal(`<h2>Registrar servicio · ${esc(x.u.bak)}</h2><div class="row" style="flex-wrap:wrap;gap:0 10px">
    <div style="flex:1;min-width:150px"><label class="l">Fecha del servicio *</label><input id="sv-f" type="date" value="${hoyLocal()}" max="${hoyLocal()}"></div>
    <div style="flex:1;min-width:150px"><label class="l">Siguiente servicio *</label><input id="sv-s" type="date" min="${hoyLocal()}"></div>
    <div style="flex:1;min-width:150px"><label class="l">Odómetro (km)</label><input id="sv-k" type="number" inputmode="decimal" value="${esc(p.km_hoy ?? '')}"></div>
    <div style="flex:1;min-width:150px"><label class="l">Horas de motor</label><input id="sv-h" type="number" inputmode="decimal" value="${esc(p.hrs_motor ?? '')}"></div></div>
    <label class="l">Notas</label><input id="sv-n" placeholder="Aceite, filtros, niveles…"><div class="err" id="sv-err">—</div>
    <div class="foot"><button class="btn" onclick="gCerrar()">Cancelar</button><button class="btn p" onclick="gMServ()">Guardar servicio</button></div>`);
}
async function gMServ(){
  hide('sv-err'); const n = id => { const v = $(id).value.trim(); return v === '' ? null : Number(v); };
  try { await q(sb.rpc('bg_preventivo_realizado', { p_unidad:G.prevSel, p_fecha:$('sv-f').value || null, p_km:n('sv-k'), p_hrs:n('sv-h'), p_siguiente:$('sv-s').value || null, p_notas:$('sv-n').value })); gCerrar(); toast('Servicio registrado', 'success'); gMant(); } catch(e){ gEr('sv-err', e); }
}
function gMLavModal(uid){
  const x = G.prevRows.find(r => r.u.id === uid); G.prevSel = uid;
  gModal(`<h2>Lavado y engrasado · ${esc(x.u.bak)}</h2><label class="l">Fecha *</label><input id="lv-f" type="date" value="${hoyLocal()}" max="${hoyLocal()}"><div class="err" id="lv-err">—</div>
    <div class="foot"><button class="btn" onclick="gCerrar()">Cancelar</button><button class="btn p" onclick="gMLav()">Guardar</button></div>`);
}
async function gMLav(){ hide('lv-err'); try { await q(sb.rpc('bg_lavado_realizado', { p_unidad:G.prevSel, p_fecha:$('lv-f').value || null })); gCerrar(); toast('Lavado registrado', 'success'); gMant(); } catch(e){ gEr('lv-err', e); } }

/* — checklists del día — */
async function gMChk(){
  const [cat, cls] = await Promise.all([gCat(), q(sb.from('bg_checklists').select('*').eq('fecha', G.fecha).order('created_at', { ascending:false }))]);
  G.cls = cls; const por = {}; cls.forEach(c => { (por[c.unidad_id] = por[c.unidad_id] || []).push(c); });
  const asig = cat.uni.filter(u => u.estatus === 'activo' && u.chofer_id).sort((a, b) => natural(a.bak, b.bak)), hechas = asig.filter(u => por[u.id]).length;
  const ch = Object.fromEntries(cat.chof.map(x => [x.colaborador_id, x.nombre]));
  const filas = asig.map(u => { const c = (por[u.id] || [])[0], k = c ? G.cls.indexOf(c) : -1;
    return `<div class="orow"><div><b>${esc(u.bak)}</b> <span class="mut">${esc(ch[u.chofer_id] || '')}</span>${c ? `<div class="mut">${fmtHora(c.created_at)}${c.odometro ? ' · ' + Math.round(c.odometro).toLocaleString('es-MX') + ' km' : ''}</div>` : ''}</div>
      <div class="row" style="flex-shrink:0">${c ? `<span class="tag ${c.fallas ? 'r' : 'g'}">${c.fallas ? c.fallas + ' falla' + (c.fallas > 1 ? 's' : '') : 'Sin fallas'}</span><button class="btn sm" onclick="gMChkVer(${k})">Ver</button>` : '<span class="tag a">Pendiente</span>'}</div></div>`; }).join('');
  const pct = asig.length ? Math.round(hechas / asig.length * 100) : 0;
  $('g-c').outerHTML = `<div id="g-c">${gFechaBar()}<div class="card"><div class="row b"><b>Checklists del día</b><span class="mut">${hechas}/${asig.length} unidades con chofer</span></div><div class="bar"><i style="width:${pct}%"></i></div>
    <div class="mut" style="margin-top:6px">El checklist es obligatorio para el chofer, pero no bloquea el inicio de ruta.</div>${filas || '<div class="sec" style="margin-top:8px">No hay unidades con chofer asignado.</div>'}</div></div>`;
}
function gMChkVer(k){
  const c = G.cls[k]; if (!c) return; const u = G.cat.uni.find(x => x.id === c.unidad_id) || {};
  const bad = (c.respuestas || []).filter(r => !r.ok);
  gModal(`<h2>Checklist · ${esc(u.bak || '')}</h2><div class="mut">${esc(c.chofer_nombre || '')} · ${fmtDT(c.created_at)}${c.odometro ? ' · ' + Math.round(c.odometro).toLocaleString('es-MX') + ' km' : ''}</div>
    ${c.foto_path ? `<div style="margin-top:10px">${cmTh(c.foto_path, 120)}</div>` : ''}
    <div style="margin-top:10px"><b>${bad.length ? 'Fallas reportadas' : 'Sin fallas: todos los puntos en OK'}</b></div>
    ${bad.map(r => `<div class="orow"><div>${esc(r.texto)}${r.critico ? ' <span class="mut">(crítico)</span>' : ''}${r.nota ? `<div class="mut">${esc(r.nota)}</div>` : ''}</div><span class="tag r">Falla</span></div>`).join('')}
    ${c.observaciones ? `<div class="sec" style="margin-top:8px">Observaciones: ${esc(c.observaciones)}</div>` : ''}<div class="foot"><button class="btn" onclick="gCerrar()">Cerrar</button></div>`);
  cmImgs($('g-md'));
}

/* — editor del checklist — */
let _cl = [];
async function gMEdit(){
  const items = await q(sb.from('bg_checklist_items').select('*').eq('activo', true).order('orden'));
  _cl = items.map(i => ({ id:i.id, seccion:i.seccion, texto:i.texto, critico:i.critico }));
  $('g-c').outerHTML = '<div id="g-c"></div>'; gMClPintar();
}
function gMClPintar(){
  const secs = [...new Set(_cl.map(x => x.seccion).filter(Boolean))];
  $('g-c').innerHTML = `<datalist id="cl-secs">${secs.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    <div class="card"><b>Checklist de las unidades</b><div class="sec">Estos son los puntos que el chofer revisa. Edita, reordena, agrega o quita. «Crítico» sube el incidente automático a Defcon 3. Los checklists ya hechos conservan el texto con el que se respondieron.</div></div>
    ${_cl.map((x, i) => `<div class="card" style="padding:10px"><div class="row" style="gap:6px;flex-wrap:wrap"><input list="cl-secs" value="${esc(x.seccion)}" oninput="_cl[${i}].seccion=this.value" style="flex:1 1 140px" placeholder="Sección"><input value="${esc(x.texto)}" oninput="_cl[${i}].texto=this.value" style="flex:3 1 220px" placeholder="Punto a revisar"></div>
      <div class="row" style="margin-top:6px;flex-wrap:wrap"><label style="display:flex;gap:6px;align-items:center"><input type="checkbox" style="width:18px;height:18px" ${x.critico ? 'checked' : ''} onchange="_cl[${i}].critico=this.checked"> Crítico</label><span class="sp"></span>
      <button class="btn sm" ${i === 0 ? 'disabled' : ''} onclick="gMClMover(${i},-1)">↑</button><button class="btn sm" ${i === _cl.length - 1 ? 'disabled' : ''} onclick="gMClMover(${i},1)">↓</button><button class="btn sm" onclick="gMClQuitar(${i})">Quitar</button></div></div>`).join('')}
    <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" onclick="gMClAgregar()">＋ Agregar punto</button><span class="sp"></span><button class="btn p" id="cl-save" onclick="gMClGuardar()">Guardar checklist</button></div><div class="err" id="cl-err">—</div>`;
}
function gMClAgregar(){ _cl.push({ id:null, seccion:_cl.length ? _cl[_cl.length - 1].seccion : 'General', texto:'', critico:false }); gMClPintar(); window.scrollTo(0, document.body.scrollHeight); }
function gMClQuitar(i){ _cl.splice(i, 1); gMClPintar(); }
function gMClMover(i, d){ const j = i + d; if (j < 0 || j >= _cl.length) return; [_cl[i], _cl[j]] = [_cl[j], _cl[i]]; gMClPintar(); }
async function gMClGuardar(){
  hide('cl-err'); const items = _cl.filter(x => x.texto.trim()).map(x => ({ id:x.id, seccion:(x.seccion || 'General').trim() || 'General', texto:x.texto.trim(), critico:!!x.critico }));
  if (!items.length) return say('cl-err', 'El checklist necesita al menos un punto');
  const b = $('cl-save'); b.disabled = true;
  try { const n = await q(sb.rpc('bg_checklist_guardar', { p_items:items })); toast(`Checklist guardado (${n} puntos)`, 'success'); gMEdit(); } catch(e){ gEr('cl-err', e); } finally { b.disabled = false; }
}

/* — foto de la unidad (pestaña Unidades) — */
function gUniFotoModal(id){
  const u = G.cat.uni.find(x => x.id === id); G.uniSel = id;
  gModal(`<h2>Foto de ${esc(u.bak)}</h2><div class="sec">Es la foto con la que el chofer identifica su camión.</div>
    ${u.foto_path ? `<div style="margin:10px 0">${cmTh(u.foto_path, 120)}<div class="mut">Foto actual</div></div>` : ''}
    <label class="l">${u.foto_path ? 'Nueva foto' : 'Foto'} *</label>${cmFotoBox('uf', 1, false)}<div class="err" id="uf-err">—</div>
    <div class="foot"><button class="btn" onclick="gCerrar()">Cancelar</button><button class="btn p" id="uf-btn" onclick="gUniFoto()">Guardar foto</button></div>`);
  cmFotoPintar('uf', 1); cmImgs($('g-md'));
}
async function gUniFoto(){
  hide('uf-err'); if (!cmFotosSel('uf')) return say('uf-err', 'Elige o toma una foto');
  const u = G.cat.uni.find(x => x.id === G.uniSel), b = $('uf-btn'); b.disabled = true; b.textContent = 'Subiendo…';
  try { const [p] = await cmSubir('uf', `unidades/${u.bak}`); await q(sb.rpc('bg_unidad_foto', { p_unidad:u.id, p_path:p })); gCerrar(); toast('Foto guardada', 'success'); gUni(); }
  catch(e){ b.disabled = false; b.textContent = 'Guardar foto'; gEr('uf-err', e); }
}
