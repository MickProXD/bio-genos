'use strict';
/* ═══ BIO-GENOS · Panel de gerente ═══
   Rutas, unidades, personal, clientes y manifiestos. Todo lo protege RLS en Supabase (gerente = supervisor o Dirección). */
const G = { tab:'hoy', fecha:null, ords:[], cat:null, par:null, rt:null, live:false, open:{}, _rtT:null };
const DIAS = ['LUN','MAR','MIE','JUE','VIE','SAB','DOM'], DIA_L = { LUN:'L', MAR:'M', MIE:'X', JUE:'J', VIE:'V', SAB:'S', DOM:'D' };
const diaDe = f => DIAS[(new Date(f + 'T12:00:00').getDay() + 6) % 7];
const G_TABS = [['hoy','Hoy'], ['man','Manifiestos'], ['rutas','Rutas'], ['pers','Personal'], ['uni','Unidades'], ['cli','Clientes']];
const ESTG = { programada:['Programada','a'], en_sitio:['En sitio','g'], completada:['Completada','g'], no_realizada:['No realizada','r'], anulada:['Anulada',''] };
const natural = (a, b) => String(a).localeCompare(String(b), 'es', { numeric:true });
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

async function q(p){ const r = await p; if (r.error) throw r.error; return r.data; }
function gModal(html){ $('g-md').innerHTML = html; abrir('m-g'); }
function gCerrar(){ cerrar('m-g'); }
function gErr(e){ toast(esErrorRed(e) ? 'Sin señal. Inténtalo de nuevo.' : (e?.message || 'No se pudo completar'), 'error'); }
function gEr(id, e){ say(id, esErrorRed(e) ? 'Sin señal. Inténtalo de nuevo.' : (e?.message || 'No se pudo completar')); }
const opt = (arr, val, lbl, sel, vacio) => (vacio !== undefined ? `<option value="">${esc(vacio)}</option>` : '') + arr.map(x => `<option value="${esc(x[val])}" ${x[val] === sel ? 'selected' : ''}>${esc(typeof lbl === 'function' ? lbl(x) : x[lbl])}</option>`).join('');
function gSeguro(btn, fn, arg){
  if (btn.dataset.sure === '1'){ btn.dataset.sure = ''; return window[fn](arg); }
  const t = btn.textContent; btn.dataset.sure = '1'; btn.textContent = '¿Seguro?';
  setTimeout(() => { if (btn.isConnected){ btn.dataset.sure = ''; btn.textContent = t; } }, 4000);
}
async function invocarCuentas(body){
  const { data, error } = await sb.functions.invoke('gg-cuentas', { body });
  if (error || data?.error){ let m = data?.error; if (!m) try { m = (await error.context.json()).error; } catch(e){} throw new Error(m || error?.message || 'No se pudo completar'); }
  return data;
}

/* ── catálogos (se recargan al entrar a cada pestaña) ── */
async function gCat(){
  const [rutas, uni, chof, ayu, cli] = await Promise.all([
    q(sb.from('rutas').select('*')), q(sb.from('unidades').select('*').order('bak')), q(sb.rpc('gg_choferes')), q(sb.rpc('gg_ayudantes')),
    q(sb.from('clientes_servicio').select('*').order('nombre')) ]);
  rutas.sort((a, b) => natural(a.nombre, b.nombre));
  G.cat = { rutas, uni, chof, ayu, cli }; return G.cat;
}
async function gParadas(){ G.par = await q(sb.from('ruta_clientes').select('id,ruta_id,dias')); return G.par; }

/* ── estructura ── */
function gIniciar(){ G.fecha = hoyLocal(); G.tab = 'hoy'; gRealtime(); gIr('hoy'); }
function gTabs(){ $('g-tabs').innerHTML = G_TABS.map(([k, t]) => `<button class="${G.tab === k ? 'on' : ''}" onclick="gIr('${k}')">${t}</button>`).join(''); }
function gIr(t){ G.tab = t; gTabs(); window.scrollTo(0, 0); ({ hoy:gHoy, man:gMan, rutas:gRutas, pers:gPers, uni:gUni, cli:gCli })[t](); }
function gFechaBar(){
  const t = new Date(G.fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long' });
  return `<div class="row b" style="margin-bottom:12px"><button class="btn sm" onclick="gDia(-1)">‹</button><div style="text-align:center"><div style="font-weight:700">${esc(t.charAt(0).toUpperCase() + t.slice(1))}</div><a href="#" class="mut" style="visibility:${G.fecha === hoyLocal() ? 'hidden' : 'visible'}" onclick="G.fecha=hoyLocal();gIr(G.tab);return false">Ir a hoy</a></div><button class="btn sm" onclick="gDia(1)">›</button></div>`;
}
function gDia(d){ const f = new Date(G.fecha + 'T12:00:00'); f.setDate(f.getDate() + d); G.fecha = f.toLocaleDateString('en-CA'); gIr(G.tab); }
function gVivo(){ const e = $('g-live'); if (e) e.innerHTML = `<i class="dot ${G.live ? '' : 'off'}"></i>${G.live ? 'En vivo' : 'Conectando…'}`; }

/* ── tiempo real ── */
function gRealtime(){
  if (G.rt) return;
  G.rt = sb.channel('bg-ordenes').on('postgres_changes', { event:'*', schema:'public', table:'ordenes_servicio' }, pl => {
    const n = pl.new || {};
    if (pl.eventType === 'UPDATE' && n.estado === 'completada' && n.completada_at && Date.now() - new Date(n.completada_at).getTime() < 30000) toast(`Completado: ${n.cliente_nombre || n.folio} · ${n.operador_nombre || ''}`, 'success');
    if (pl.eventType === 'UPDATE' && n.estado === 'no_realizada') toast(`No realizado: ${n.cliente_nombre || n.folio}`, 'error');
    if (!document.querySelector('.ov.on') && (G.tab === 'hoy' || G.tab === 'man')){ clearTimeout(G._rtT); G._rtT = setTimeout(() => gIr(G.tab), 700); }
  }).subscribe(st => { G.live = st === 'SUBSCRIBED'; gVivo(); });
}
function gDetener(){ clearTimeout(G._rtT); if (G.rt){ try { sb.removeChannel(G.rt); } catch(e){} G.rt = null; } G.live = false; G.cat = null; G.par = null; }

/* ═══ HOY (tiempo real) ═══ */
async function gOrdsDia(todas){
  let qy = sb.from('ordenes_servicio').select('*').eq('fecha', G.fecha).order('hora', { ascending:true });
  if (!todas) qy = qy.neq('estado', 'anulada');
  G.ords = await q(qy); return G.ords;
}
async function gHoy(){
  $('g-body').innerHTML = gFechaBar() + '<div id="g-c" class="card mut">Cargando…</div>';
  try { await gOrdsDia(false); gHoyPintar(); } catch(e){ $('g-c').innerHTML = `<div class="err show">${esc(e.message)}</div>`; }
}
function gHoyPintar(){
  const o = G.ords, c = k => o.filter(x => x.estado === k).length, tot = o.length, comp = c('completada');
  const pct = tot ? Math.round(comp / tot * 100) : 0;
  const grupos = {}; o.forEach(x => { const k = x.ruta_id || 'manual'; (grupos[k] = grupos[k] || { nombre:x.ruta_nombre || 'Manifiestos manuales', items:[] }).items.push(x); });
  const claves = Object.keys(grupos).sort((a, b) => a === 'manual' ? 1 : b === 'manual' ? -1 : natural(grupos[a].nombre, grupos[b].nombre));
  const tarj = (n, t, col) => `<div class="card" style="margin:0;text-align:center"><div style="font-size:24px;font-weight:800;${col ? 'color:var(--' + col + ')' : ''}">${n}</div><div class="mut">${t}</div></div>`;
  const body = !tot ? '<div class="card"><div class="sec">No hay manifiestos programados para este día. Ve a «Manifiestos» para generarlos.</div></div>' : claves.map(k => {
    const g = grupos[k], it = g.items, cc = it.filter(x => x.estado === 'completada').length, nr = it.filter(x => x.estado === 'no_realizada').length, si = it.filter(x => x.estado === 'en_sitio').length;
    const p = Math.round(cc / it.length * 100), f = it[0];
    return `<details class="card" ${G.open[k] ? 'open' : ''} ontoggle="G.open['${k}']=this.open"><summary style="cursor:pointer;list-style:none">
      <div class="row b"><b>${esc(g.nombre)}</b><span class="mut">${cc}/${it.length}${nr ? ` · ${nr} no realiz.` : ''}${si ? ` · ${si} en sitio` : ''} ▾</span></div>
      <div class="mut">${esc(f.operador_nombre || 'Sin chofer')}${f.unidad_bak ? ' · ' + esc(f.unidad_bak) : ''}${f.ayudante1 ? ' · ' + esc(f.ayudante1) : ''}${f.ayudante2 ? ', ' + esc(f.ayudante2) : ''}</div>
      <div class="bar"><i style="width:${p}%"></i></div></summary>
      ${it.map(x => { const e = ESTG[x.estado] || [x.estado, '']; const idx = G.ords.indexOf(x);
        return `<div class="orow"><div><b>${esc(x.cliente_nombre || '')}</b> <span class="mut">${esc(x.hora || '')}</span><div class="mut">${esc(x.folio || '')}${x.hora_llegada ? ' · llegó ' + fmtHora(x.hora_llegada) : ''}${x.hora_fin ? ' · fin ' + fmtHora(x.hora_fin) : ''}${x.motivo_no_realizada ? ' · ' + esc(x.motivo_no_realizada) : ''}</div></div>
        <div class="row" style="flex-shrink:0"><span class="tag ${e[1]}">${e[0]}</span>${x.estado === 'completada' ? `<button class="btn sm" onclick="gComprobante(${idx})">Comprobante</button>` : ''}${x.lat != null && x.estado !== 'programada' ? `<a class="btn sm" style="text-decoration:none" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${x.lat},${x.lng}">Mapa</a>` : ''}</div></div>`; }).join('')}
    </details>`; }).join('');
  $('g-body').innerHTML = gFechaBar() + `<div class="row b" style="margin-bottom:8px"><h2 style="margin:0">Cumplimiento del día</h2><span class="mut" id="g-live"></span></div>
    <div class="g4">${tarj(pct + '%', 'Cumplimiento', pct >= 80 ? 'green' : pct >= 50 ? 'amber' : 'red')}${tarj(comp + '/' + tot, 'Completados', 'green')}${tarj(c('en_sitio'), 'En sitio')}${tarj(c('programada'), 'Pendientes', 'amber')}${tarj(c('no_realizada'), 'No realizados', 'red')}</div>
    <div style="height:12px"></div>${body}`;
  gVivo();
}
function gComprobante(i){ const o = G.ords[i]; if (o) verComprobanteO(o); }

/* ═══ MANIFIESTOS ═══ */
async function gMan(){
  $('g-body').innerHTML = gFechaBar() + '<div class="row" style="margin-bottom:12px;flex-wrap:wrap"><button class="btn p sm" onclick="gGenerarModal()">Generar de rutas</button><button class="btn sm" onclick="gManualModal()">Manifiesto manual</button><span class="sp"></span><span class="mut" id="g-live"></span></div><div id="g-c" class="card mut">Cargando…</div>';
  try { await gOrdsDia(true); gManPintar(); } catch(e){ $('g-c').innerHTML = `<div class="err show">${esc(e.message)}</div>`; }
}
function gManPintar(){
  const o = G.ords;
  $('g-c').outerHTML = !o.length ? '<div class="card"><div class="sec">No hay manifiestos este día.</div></div>' : o.map((x, i) => {
    const e = ESTG[x.estado] || [x.estado, ''], abierta = ['programada','en_sitio'].includes(x.estado);
    return `<div class="card"><div class="row b"><b>${esc(x.cliente_nombre || '')}</b><span class="tag ${e[1]}">${e[0]}</span></div>
      <div class="mut">${esc(x.folio || '')}${x.hora ? ' · ' + esc(x.hora) : ''} · ${esc(x.ruta_nombre || 'Manual')}${x.extemporanea ? ' · <span style="color:var(--amber)">extemporáneo</span>' : ''}</div>
      <div class="sec">${esc(x.operador_nombre || 'Sin chofer')}${x.unidad_bak ? ' · ' + esc(x.unidad_bak) : ''}${x.ayudante1 ? ' · ' + esc(x.ayudante1) : ''}${x.ayudante2 ? ', ' + esc(x.ayudante2) : ''}</div>
      <div class="mut">${(x.tipos || []).length ? esc(x.tipos.join(', ')) : 'Sin tipo de residuo'}${x.volumen ? ' · ' + esc(x.volumen) : ''}</div>
      <div class="row" style="margin-top:10px;flex-wrap:wrap">${x.estado === 'programada' ? `<button class="btn sm" onclick="gReasignarModal(${i})">Reasignar</button>` : ''}${x.estado === 'completada' ? `<button class="btn sm" onclick="gComprobante(${i})">Comprobante</button>` : ''}${abierta ? `<button class="btn sm" onclick="gSeguro(this,'gAnular',${i})">Anular</button>` : ''}</div></div>`; }).join('');
  gVivo();
}
async function gAnular(i){
  const x = G.ords[i]; if (!x) return;
  try { await q(sb.from('ordenes_servicio').update({ estado:'anulada' }).eq('id', x.id)); toast('Manifiesto anulado', 'success'); gMan(); } catch(e){ gErr(e); }
}

const TIPOS_G = [{ k:'RESIDUOS SOLIDOS URBANOS', t:'RSU · Residuos sólidos urbanos' }, { k:'RESIDUOS DE MANEJO ESPECIAL', t:'RME · Residuos de manejo especial' }];
const radiosTipo = () => TIPOS_G.map(t => `<label style="display:flex;gap:9px;align-items:center;margin-bottom:8px"><input type="radio" name="g-tipo" style="width:20px;height:20px" value="${esc(t.k)}"> ${t.t}</label>`).join('');
const tipoSel = () => document.querySelector('input[name=g-tipo]:checked')?.value || null;

async function gGenerarModal(){
  gModal('<h2>Generar manifiestos</h2><div class="mut">Cargando…</div>');
  try {
    const [cat, par] = await Promise.all([gCat(), gParadas()]);
    G.genRutas = cat.rutas.filter(r => r.activo);
    gModal(`<h2>Generar manifiestos de rutas</h2>
      <div class="sec">Se crean desde la sábana de rutas con las paradas que tocan ese día de la semana.</div>
      <label class="l">Fecha</label><input id="gg-f" type="date" value="${G.fecha}" onchange="gGenResumen()">
      <label class="l">Ruta</label><select id="gg-r" onchange="gGenResumen()"><option value="*">Todas las rutas con paradas ese día</option>${G.genRutas.map(r => `<option value="${esc(r.id)}">${esc(r.nombre)}</option>`).join('')}</select>
      <div id="gg-res" class="mut" style="margin-top:6px"></div>
      <label class="l">Tipo de residuo *</label>${radiosTipo()}
      <div class="err" id="gg-err">—</div>
      <div class="foot"><button class="btn" onclick="gCerrar()">Cancelar</button><button class="btn p" id="gg-ok" onclick="gGenerar()">Generar</button></div>`);
    gGenResumen();
  } catch(e){ gModal(`<h2>Generar manifiestos</h2><div class="err show">${esc(e.message)}</div><div class="foot"><button class="btn" onclick="gCerrar()">Cerrar</button></div>`); }
}
function gNParadas(rutaId, dia){ return (G.par || []).filter(p => p.ruta_id === rutaId && p.dias && Object.prototype.hasOwnProperty.call(p.dias, dia) && !(p.dias[dia] && p.dias[dia].llamada)).length; }
function gGenResumen(){
  const f = $('gg-f').value, r = $('gg-r').value; if (!f) return; const d = diaDe(f);
  const rs = r === '*' ? G.genRutas : G.genRutas.filter(x => x.id === r), n = rs.reduce((s, x) => s + gNParadas(x.id, d), 0), k = rs.filter(x => gNParadas(x.id, d) > 0).length;
  $('gg-res').textContent = `${d}: ${n} parada${n === 1 ? '' : 's'}${r === '*' ? ' en ' + k + ' ruta' + (k === 1 ? '' : 's') : ''}.`;
}
async function gGenerar(){
  const f = $('gg-f').value, r = $('gg-r').value, tipo = tipoSel(); hide('gg-err');
  if (!f) return say('gg-err', 'Elige la fecha'); if (!tipo) return say('gg-err', 'Selecciona el tipo de residuo (RSU o RME)');
  const d = diaDe(f), rs = (r === '*' ? G.genRutas : G.genRutas.filter(x => x.id === r)).filter(x => gNParadas(x.id, d) > 0);
  if (!rs.length) return say('gg-err', 'Ninguna ruta tiene paradas para ' + d);
  const b = $('gg-ok'); b.disabled = true; let ok = 0, tot = 0; const fallas = [];
  for (const x of rs){
    try { tot += await q(sb.rpc('gg_generar_manifiestos', { p_ruta:x.id, p_fecha:f, p_tipos:[tipo] })); ok++; }
    catch(e){ fallas.push(`${x.nombre}: ${e.message}`); }
  }
  b.disabled = false;
  if (fallas.length && !ok) return say('gg-err', fallas.join(' · '));
  gCerrar(); toast(`${tot} manifiesto${tot === 1 ? '' : 's'} en ${ok} ruta${ok === 1 ? '' : 's'}` + (fallas.length ? ` · ${fallas.length} omitida${fallas.length === 1 ? '' : 's'} (${fallas[0]})` : ''), fallas.length ? '' : 'success');
  G.fecha = f; gIr('man');
}

function selPersonal(pref, o){
  const c = G.cat; const chof = c.chof.filter(x => x.estatus === 'activo'), ay = c.ayu.filter(x => x.estatus === 'activo');
  return `<label class="l">Chofer</label><select id="${pref}-op">${opt(chof, 'colaborador_id', x => x.nombre + (x.perfil_operativo ? ' · ' + x.perfil_operativo : ''), o.operador_id, 'Sin asignar')}</select>
    <label class="l">Unidad</label><select id="${pref}-un">${opt(c.uni, 'id', x => x.bak + (x.placas ? ' · ' + x.placas : ''), o.unidad_id, 'Sin unidad')}</select>
    <div class="row"><div style="flex:1"><label class="l">Ayudante 1</label><select id="${pref}-a1">${opt(ay, 'colaborador_id', 'nombre', o.ayudante1_id, 'Ninguno')}</select></div><div style="flex:1"><label class="l">Ayudante 2</label><select id="${pref}-a2">${opt(ay, 'colaborador_id', 'nombre', o.ayudante2_id, 'Ninguno')}</select></div></div>`;
}
const vp = id => $(id).value || null;

async function gManualModal(){
  gModal('<h2>Manifiesto manual</h2><div class="mut">Cargando…</div>');
  try {
    const c = await gCat();
    gModal(`<h2>Manifiesto manual</h2><div class="sec">Para servicios sueltos o de destajo.</div>
      <label class="l">Fecha</label><input id="gm-f" type="date" value="${G.fecha}">
      <label class="l">Cliente</label><input id="gm-c" list="gm-cl" placeholder="Escribe para buscar en el catálogo" autocomplete="off"><datalist id="gm-cl">${c.cli.filter(x => x.activo).map(x => `<option value="${esc(x.nombre)}">`).join('')}</datalist>
      <label class="l">Dirección</label><input id="gm-d"><div class="row"><div style="flex:1"><label class="l">Hora</label><input id="gm-h" placeholder="Ej. 10:00"></div><div style="flex:1"><label class="l">Volumen</label><input id="gm-v" placeholder="Ej. 3 x 1,100 Lt."></div></div>
      <label class="l">Tipo de residuo *</label>${radiosTipo()}
      ${selPersonal('gm', {})}
      <label class="l">Comentarios</label><textarea id="gm-m" rows="2"></textarea>
      <div class="err" id="gm-err">—</div>
      <div class="foot"><button class="btn" onclick="gCerrar()">Cancelar</button><button class="btn p" id="gm-ok" onclick="gManual()">Crear</button></div>`);
    $('gm-op').onchange = () => { const ch = c.chof.find(x => x.colaborador_id === $('gm-op').value); if (ch?.unidad_id) $('gm-un').value = ch.unidad_id; };
  } catch(e){ gModal(`<h2>Manifiesto manual</h2><div class="err show">${esc(e.message)}</div><div class="foot"><button class="btn" onclick="gCerrar()">Cerrar</button></div>`); }
}
async function gManual(){
  hide('gm-err'); const nom = $('gm-c').value.trim(), tipo = tipoSel(); if (!nom) return say('gm-err', 'Indica el cliente'); if (!tipo) return say('gm-err', 'Selecciona el tipo de residuo (RSU o RME)');
  if (!$('gm-op').value) return say('gm-err', 'Elige el chofer que hará el servicio');
  const cli = G.cat.cli.find(x => norm(x.nombre) === norm(nom)), b = $('gm-ok'); b.disabled = true;
  try {
    const r = await q(sb.rpc('gg_crear_manifiesto', { p:{ fecha:$('gm-f').value, cliente_id:cli?.id || null, cliente_nombre:nom, direccion:$('gm-d').value.trim(), hora:$('gm-h').value.trim(), volumen:$('gm-v').value.trim(),
      tipos:[tipo], comentarios:$('gm-m').value.trim(), operador_id:vp('gm-op'), unidad_id:vp('gm-un'), ayudante1_id:vp('gm-a1'), ayudante2_id:vp('gm-a2') } }));
    gCerrar(); toast('Manifiesto ' + (r?.folio || '') + ' creado', 'success'); G.fecha = $('gm-f')?.value || G.fecha; gIr('man');
  } catch(e){ gEr('gm-err', e); } finally { b.disabled = false; }
}
async function gReasignarModal(i){
  const x = G.ords[i]; if (!x) return; G.reasig = x;
  try { await gCat(); } catch(e){ return gErr(e); }
  const c = G.cat, a1 = c.ayu.find(a => a.nombre === x.ayudante1), a2 = c.ayu.find(a => a.nombre === x.ayudante2);
  gModal(`<h2>Reasignar manifiesto</h2><div class="sec">${esc(x.cliente_nombre || '')} · ${esc(x.folio || '')}</div>
    ${selPersonal('gr', { operador_id:x.operador_id, unidad_id:x.unidad_id, ayudante1_id:a1?.colaborador_id, ayudante2_id:a2?.colaborador_id })}
    <div class="err" id="gr-err">—</div><div class="foot"><button class="btn" onclick="gCerrar()">Cancelar</button><button class="btn p" onclick="gReasignar()">Guardar</button></div>`);
}
async function gReasignar(){
  hide('gr-err');
  try { await q(sb.rpc('gg_asignar_orden', { p_orden:G.reasig.id, p_operador:vp('gr-op'), p_unidad:vp('gr-un'), p_ay1:vp('gr-a1'), p_ay2:vp('gr-a2') })); gCerrar(); toast('Manifiesto reasignado', 'success'); gMan(); }
  catch(e){ gEr('gr-err', e); }
}

/* ═══ RUTAS ═══ */
async function gRutas(){
  $('g-body').innerHTML = '<div class="row b" style="margin-bottom:12px"><h2 style="margin:0">Rutas</h2><button class="btn p sm" onclick="gRutaNuevaModal()">Nueva ruta</button></div><div id="g-c" class="card mut">Cargando…</div>';
  try { await Promise.all([gCat(), gParadas()]); gRutasPintar(); } catch(e){ $('g-c').innerHTML = `<div class="err show">${esc(e.message)}</div>`; }
}
function gRutasPintar(){
  const c = G.cat, nCli = {}; G.par.forEach(p => { nCli[p.ruta_id] = (nCli[p.ruta_id] || 0) + 1; });
  const porId = Object.fromEntries(c.chof.map(x => [x.colaborador_id, x])), aId = Object.fromEntries(c.ayu.map(x => [x.colaborador_id, x]));
  $('g-c').outerHTML = c.rutas.map(r => {
    const ch = porId[r.operador_id], sinAsig = !r.operador_id;
    const ays = [aId[r.ayudante1_id]?.nombre, aId[r.ayudante2_id]?.nombre].filter(Boolean).join(', ');
    return `<div class="card" style="${r.activo ? '' : 'opacity:.6'}"><div class="row b"><b>${esc(r.nombre)}</b><span class="mut">${nCli[r.id] || 0} parada${(nCli[r.id] || 0) === 1 ? '' : 's'}</span></div>
      <div class="sec">Chofer: ${ch ? esc(ch.nombre) + (ch.perfil_operativo ? ' <span class="tag">' + esc(ch.perfil_operativo) + '</span>' : '') : (r.operador_nombre ? `<span style="color:var(--amber)">${esc(r.operador_nombre)} (sábana, sin asignar)</span>` : '<span style="color:var(--amber)">sin asignar</span>')}</div>
      <div class="sec">Unidad: ${esc(c.uni.find(u => u.id === r.unidad_id)?.bak || r.unidad_bak || '—')}${ays ? ' · Ayudantes: ' + esc(ays) : ''}</div>
      <div class="row" style="margin-top:10px;flex-wrap:wrap"><button class="btn p sm" onclick="gAsignarModal('${r.id}')">${sinAsig ? 'Asignar' : 'Cambiar asignación'}</button><button class="btn sm" onclick="gParadasModal('${r.id}')">Paradas</button><button class="btn sm" onclick="gRutaActivo('${r.id}',${!r.activo})">${r.activo ? 'Desactivar' : 'Activar'}</button></div></div>`; }).join('');
}
async function gRutaActivo(id, activo){ try { await q(sb.from('rutas').update({ activo }).eq('id', id)); gRutas(); } catch(e){ gErr(e); } }
function gAsignarModal(id){
  const r = G.cat.rutas.find(x => x.id === id); if (!r) return; G.rutaSel = r;
  const sugerido = !r.operador_id && r.operador_nombre ? G.cat.chof.find(x => norm(x.nombre) === norm(r.operador_nombre)) : null;
  const unidadSug = r.unidad_id || G.cat.uni.find(u => norm(u.bak) === norm(r.unidad_bak))?.id;
  gModal(`<h2>${esc(r.nombre)}</h2><div class="sec">Chofer, unidad y ayudantes de esta ruta.</div>
    ${!r.operador_id && (r.operador_nombre || r.unidad_bak) ? `<div class="card" style="margin-top:8px"><b>Sábana:</b> ${esc(r.operador_nombre || '—')} · ${esc(r.unidad_bak || '—')}${sugerido ? '' : '<div class="mut">Ese chofer aún no tiene registro. Créalo en Personal y se asigna aquí.</div>'}</div>` : ''}
    ${selPersonal('ga', { operador_id:r.operador_id || sugerido?.colaborador_id, unidad_id:unidadSug, ayudante1_id:r.ayudante1_id, ayudante2_id:r.ayudante2_id })}
    <div class="mut" style="margin-top:8px">Los manifiestos programados de hoy en adelante se actualizan con este cambio.</div>
    <div class="err" id="ga-err">—</div><div class="foot"><button class="btn" onclick="gCerrar()">Cancelar</button><button class="btn p" id="ga-ok" onclick="gAsignar()">Guardar</button></div>`);
}
async function gAsignar(){
  hide('ga-err'); const b = $('ga-ok'); b.disabled = true;
  try {
    const r = await q(sb.rpc('gg_asignar_ruta', { p_ruta:G.rutaSel.id, p_operador:vp('ga-op'), p_unidad:vp('ga-un'), p_ay1:vp('ga-a1'), p_ay2:vp('ga-a2') }));
    gCerrar(); toast('Asignación guardada' + (r?.ordenes_actualizadas ? ` · ${r.ordenes_actualizadas} manifiesto${r.ordenes_actualizadas === 1 ? '' : 's'} actualizado${r.ordenes_actualizadas === 1 ? '' : 's'}` : '') + (r?.avisos?.length ? ' · Aviso: ' + r.avisos[0] : ''), 'success'); gRutas();
  } catch(e){ gEr('ga-err', e); } finally { b.disabled = false; }
}
function gRutaNuevaModal(){
  gModal(`<h2>Nueva ruta</h2><label class="l" style="margin-top:0">Nombre de la ruta *</label><input id="gn-n" placeholder="Ej. RUTA 22 (BAK-12)" autocomplete="off">
    <div class="mut" style="margin-top:6px">Después agregas las paradas y asignas chofer, unidad y ayudantes.</div><div class="err" id="gn-err">—</div>
    <div class="foot"><button class="btn" onclick="gCerrar()">Cancelar</button><button class="btn p" onclick="gRutaNueva()">Crear</button></div>`);
}
async function gRutaNueva(){
  hide('gn-err'); const n = $('gn-n').value.trim(); if (n.length < 3) return say('gn-err', 'Escribe el nombre de la ruta');
  try { const r = await q(sb.from('rutas').insert({ nombre:n, activo:true }).select('id').single()); await gRutas(); gParadasModal(r.id); } catch(e){ gEr('gn-err', /duplicate|unique/i.test(e.message) ? 'Ya existe una ruta con ese nombre' : e); }
}

/* paradas de una ruta */
let _pRuta = null, _pRows = [], _pDias = {};
async function gParadasModal(id){
  _pRuta = G.cat.rutas.find(x => x.id === id); if (!_pRuta) return; _pDias = {};
  gModal(`<h2>${esc(_pRuta.nombre)}</h2><div class="mut">Cargando paradas…</div>`);
  try { _pRows = await q(sb.from('ruta_clientes').select('*').eq('ruta_id', id).order('orden', { ascending:true })); gParadasPintar(); }
  catch(e){ gModal(`<h2>${esc(_pRuta.nombre)}</h2><div class="err show">${esc(e.message)}</div><div class="foot"><button class="btn" onclick="gCerrar()">Cerrar</button></div>`); }
}
const chips = (act, onclk) => DIAS.map(d => `<button type="button" class="chip ${act(d) ? 'on' : ''}" onclick="${onclk(d)}">${DIA_L[d]}</button>`).join('');
function gParadasPintar(){
  gModal(`<h2>${esc(_pRuta.nombre)}</h2><div class="sec">${_pRows.length} parada${_pRows.length === 1 ? '' : 's'}. Toca los días para activar o quitar la parada.</div>
    <div style="max-height:42vh;overflow:auto;margin:8px 0">${_pRows.map((p, i) => `<div class="orow" style="align-items:flex-start"><div style="min-width:0"><b>${esc(p.nombre)}</b><div class="mut">${esc(p.direccion || '')}${p.horario ? ' · ' + esc(p.horario) : ''}</div><div class="chips">${chips(d => p.dias && Object.prototype.hasOwnProperty.call(p.dias, d), d => `gToggleDia(${i},'${d}')`)}</div></div><button class="btn sm" onclick="gSeguro(this,'gQuitarPar',${i})">Quitar</button></div>`).join('') || '<div class="mut">Sin paradas todavía.</div>'}</div>
    <div class="card" style="margin-bottom:0"><b>Agregar parada</b>
      <label class="l" style="margin-top:6px">Cliente</label><input id="gp-c" list="gp-cl" autocomplete="off" placeholder="Busca en el catálogo o escribe uno nuevo"><datalist id="gp-cl">${G.cat.cli.filter(x => x.activo).map(x => `<option value="${esc(x.nombre)}">`).join('')}</datalist>
      <label class="l">Dirección</label><input id="gp-d"><div class="row"><div style="flex:1"><label class="l">Horario</label><input id="gp-h" placeholder="Ej. 09:00-11:00"></div><div style="flex:1"><label class="l">m³</label><input id="gp-m" inputmode="decimal"></div></div>
      <label class="l">Días</label><div class="chips" id="gp-dias">${chips(d => _pDias[d], d => `gPDia('${d}')`)}</div><div class="err" id="gp-err">—</div>
      <button class="btn p sm" style="margin-top:10px" onclick="gAgregarPar()">Agregar parada</button></div>
    <div class="foot"><button class="btn" onclick="gCerrar();gRutas()">Cerrar</button></div>`);
}
function gPDia(d){ _pDias[d] = !_pDias[d]; $('gp-dias').innerHTML = chips(x => _pDias[x], x => `gPDia('${x}')`); }
async function gToggleDia(i, d){
  const p = _pRows[i]; if (!p) return; const dias = { ...(p.dias || {}) };
  if (Object.prototype.hasOwnProperty.call(dias, d)) delete dias[d]; else dias[d] = { tipo:null, llamada:false };
  try { await q(sb.from('ruta_clientes').update({ dias }).eq('id', p.id)); p.dias = dias; const sc = document.querySelector('#g-md [style*="max-height"]')?.scrollTop || 0; gParadasPintar(); const e = document.querySelector('#g-md [style*="max-height"]'); if (e) e.scrollTop = sc; } catch(e){ gErr(e); }
}
async function gQuitarPar(i){ const p = _pRows[i]; if (!p) return; try { await q(sb.from('ruta_clientes').delete().eq('id', p.id)); _pRows.splice(i, 1); gParadasPintar(); } catch(e){ gErr(e); } }
async function gAgregarPar(){
  hide('gp-err'); const nom = $('gp-c').value.trim(); if (!nom) return say('gp-err', 'Indica el cliente');
  const dias = {}; DIAS.forEach(d => { if (_pDias[d]) dias[d] = { tipo:null, llamada:false }; }); if (!Object.keys(dias).length) return say('gp-err', 'Elige al menos un día');
  const cli = G.cat.cli.find(x => norm(x.nombre) === norm(nom)), m3 = parseFloat($('gp-m').value.replace(',', '.'));
  try {
    const row = await q(sb.from('ruta_clientes').insert({ ruta_id:_pRuta.id, cliente_id:cli?.id || null, nombre:cli?.nombre || nom, direccion:$('gp-d').value.trim() || null, horario:$('gp-h').value.trim() || null, m3:isNaN(m3) ? null : m3, dias,
      orden:(_pRows.reduce((m, x) => Math.max(m, x.orden || 0), 0)) + 1 }).select('*').single());
    _pRows.push(row); _pDias = {}; gParadasPintar();
  } catch(e){ gEr('gp-err', e); }
}

/* ═══ PERSONAL ═══ */
async function gPers(){
  $('g-body').innerHTML = '<div id="g-c" class="card mut">Cargando…</div>';
  try {
    await gCat();
    if (U.role === 'direccion_ceo') G.gerentes = await q(sb.from('profiles').select('id,nombre,correo_contacto,role,activo,debe_cambiar_password').in('role', ['supervisor','direccion_ceo']).order('nombre'));
    gPersPintar();
  } catch(e){ $('g-c').innerHTML = `<div class="err show">${esc(e.message)}</div>`; }
}
function cuentaTag(x){
  if (!x.user_id) return '<span class="tag a">Sin cuenta</span>';
  if (!x.cuenta_activa) return '<span class="tag r">Desactivada</span>';
  return x.debe_cambiar_password ? '<span class="tag a">Contraseña temporal</span>' : '<span class="tag g">Cuenta activa</span>';
}
function gPersPintar(){
  const c = G.cat, nombres = new Set(c.chof.map(x => norm(x.nombre)));
  const sabana = [...new Map(c.rutas.filter(r => !r.operador_id && r.operador_nombre && !nombres.has(norm(r.operador_nombre))).map(r => [norm(r.operador_nombre), r])).values()];
  const choferes = c.chof.map((x, i) => `<div class="card"><div class="row b"><b>${esc(x.nombre)}</b>${cuentaTag(x)}</div>
    <div class="mut">${esc(x.correo || 'Sin correo')}${x.tel ? ' · ' + esc(x.tel) : ''}</div>
    <div class="sec">${x.unidad_bak ? 'Unidad ' + esc(x.unidad_bak) : 'Sin unidad'}${x.ruta_nombre ? ' · ' + esc(x.ruta_nombre) : ''}</div>
    <div class="row" style="margin-top:10px;flex-wrap:wrap"><select style="width:auto" onchange="gPerfil('${x.colaborador_id}',this.value)">${opt([{ k:'recolector', t:'Recolector' }, { k:'destajo', t:'Destajo' }], 'k', 't', x.perfil_operativo, x.perfil_operativo ? undefined : 'Sin perfil')}</select>
    ${!x.user_id ? `<button class="btn p sm" onclick="gCuentaModal('chofer',${i})">Crear cuenta</button>` : `<button class="btn sm" onclick="gSeguro(this,'gReset','${x.user_id}')">Nueva contraseña</button><button class="btn sm" onclick="gSeguro(this,'gActivo','${x.user_id}|${x.cuenta_activa ? 0 : 1}')">${x.cuenta_activa ? 'Desactivar' : 'Reactivar'}</button>`}</div></div>`).join('') || '<div class="card sec">Aún no hay choferes registrados.</div>';
  const sab = sabana.length ? `<h2 style="margin-top:18px">Choferes de la sábana sin cuenta</h2><div class="sec" style="margin-bottom:8px">Aparecen en las rutas precargadas. Al crear su cuenta se les asigna su ruta y unidad.</div>${sabana.map(r => `<div class="card"><div class="row b"><div><b>${esc(r.operador_nombre)}</b><div class="mut">${esc(r.nombre)}${r.unidad_bak ? ' · ' + esc(r.unidad_bak) : ''}</div></div><button class="btn p sm" onclick="gCuentaModal('sabana','${r.id}')">Crear cuenta</button></div></div>`).join('')}` : '';
  const ayus = c.ayu.map(x => `<div class="card"><div class="row b"><b>${esc(x.nombre)}</b><span class="mut">${x.unidad_bak ? esc(x.unidad_bak) : 'Sin unidad'}</span></div>${x.tel ? `<div class="mut">${esc(x.tel)}</div>` : ''}</div>`).join('') || '<div class="card sec">Aún no hay ayudantes.</div>';
  const ger = U.role === 'direccion_ceo' ? `<h2 style="margin-top:18px">Gerentes</h2><div class="row" style="margin-bottom:8px"><button class="btn p sm" onclick="gCuentaModal('gerente')">Crear cuenta de gerente</button></div>${(G.gerentes || []).map(x => `<div class="card"><div class="row b"><div><b>${esc(x.nombre)}</b><div class="mut">${esc(x.correo_contacto || '')}</div></div><span class="tag ${x.activo ? 'g' : 'r'}">${x.role === 'direccion_ceo' ? 'Dirección' : x.activo ? 'Gerente' : 'Desactivada'}</span></div>${x.role === 'supervisor' && x.id !== U.id ? `<div class="row" style="margin-top:10px"><button class="btn sm" onclick="gSeguro(this,'gReset','${x.id}')">Nueva contraseña</button><button class="btn sm" onclick="gSeguro(this,'gActivo','${x.id}|${x.activo ? 0 : 1}')">${x.activo ? 'Desactivar' : 'Reactivar'}</button></div>` : ''}</div>`).join('')}` : '';
  $('g-c').outerHTML = `<div class="row b" style="margin-bottom:8px"><h2 style="margin:0">Choferes</h2><button class="btn p sm" onclick="gCuentaModal('chofer')">Nuevo chofer</button></div>${choferes}${sab}
    <div class="row b" style="margin:18px 0 8px"><h2 style="margin:0">Ayudantes</h2><button class="btn p sm" onclick="gAyudanteModal()">Nuevo ayudante</button></div>${ayus}${ger}`;
}
async function gPerfil(id, perfil){ if (!perfil) return; try { await q(sb.rpc('gg_set_perfil', { p_colaborador:id, p_perfil:perfil })); toast('Perfil actualizado', 'success'); } catch(e){ gErr(e); } }
function gAyudanteModal(){
  gModal(`<h2>Nuevo ayudante</h2><label class="l" style="margin-top:0">Nombre completo *</label><input id="ay-n" autocomplete="off"><label class="l">Teléfono</label><input id="ay-t" inputmode="tel">
    <div class="mut" style="margin-top:6px">Los ayudantes no tienen cuenta: solo se asignan a rutas y manifiestos.</div><div class="err" id="ay-err">—</div>
    <div class="foot"><button class="btn" onclick="gCerrar()">Cancelar</button><button class="btn p" onclick="gAyudante()">Guardar</button></div>`);
}
async function gAyudante(){ hide('ay-err'); try { await q(sb.rpc('gg_alta_ayudante', { p_nombre:$('ay-n').value, p_tel:$('ay-t').value })); gCerrar(); toast('Ayudante registrado', 'success'); gPers(); } catch(e){ gEr('ay-err', e); } }

let _cuenta = null;
function gCuentaModal(modo, ref){
  _cuenta = { modo, ref };
  const x = modo === 'chofer' && ref !== undefined ? G.cat.chof[ref] : null, r = modo === 'sabana' ? G.cat.rutas.find(z => z.id === ref) : null;
  const gerente = modo === 'gerente', nom = x?.nombre || r?.operador_nombre || '', per = x?.perfil_operativo || 'recolector';
  gModal(`<h2>${gerente ? 'Cuenta de gerente' : 'Cuenta de chofer'}</h2>
    <div class="sec">${gerente ? 'El gerente podrá gestionar rutas, unidades, personal y manifiestos.' : 'El chofer solo verá sus manifiestos de recolección.'} Se genera una contraseña temporal que verás una sola vez.</div>
    <label class="l">Nombre completo *</label><input id="cu-n" value="${esc(nom)}" ${x ? 'readonly' : ''} autocomplete="off">
    <label class="l">Correo *</label><input id="cu-c" type="email" inputmode="email" autocomplete="off" placeholder="nombre@bioambientalistik.mx">
    ${gerente ? '' : `<label class="l">Teléfono</label><input id="cu-t" inputmode="tel"><label class="l">Perfil</label><select id="cu-p"><option value="recolector" ${per === 'recolector' ? 'selected' : ''}>Recolector (ruta base)</option><option value="destajo" ${per === 'destajo' ? 'selected' : ''}>Destajo (servicios manuales)</option></select>`}
    <div class="err" id="cu-err">—</div><div class="foot"><button class="btn" onclick="gCerrar()">Cancelar</button><button class="btn p" id="cu-ok" onclick="gCuenta()">Crear cuenta</button></div>`);
}
async function gCuenta(){
  hide('cu-err'); const { modo, ref } = _cuenta, b = $('cu-ok'); const nombre = $('cu-n').value.trim(), correo = $('cu-c').value.trim().toLowerCase();
  if (nombre.length < 3) return say('cu-err', 'Escribe el nombre completo'); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return say('cu-err', 'Escribe un correo válido');
  b.disabled = true;
  try {
    const x = modo === 'chofer' && ref !== undefined ? G.cat.chof[ref] : null;
    const d = await invocarCuentas(modo === 'gerente' ? { accion:'crear_gerente', nombre, correo }
      : { accion:'crear_chofer', nombre, correo, tel:$('cu-t').value.trim(), perfil:$('cu-p').value, colaborador_id:x?.colaborador_id || undefined });
    if (modo === 'sabana'){
      const r = G.cat.rutas.find(z => z.id === ref), u = r.unidad_id || G.cat.uni.find(z => norm(z.bak) === norm(r.unidad_bak))?.id || null;
      try { await q(sb.rpc('gg_asignar_ruta', { p_ruta:r.id, p_operador:d.colaborador_id, p_unidad:u, p_ay1:r.ayudante1_id || null, p_ay2:r.ayudante2_id || null })); } catch(e){ toast('Cuenta creada, pero no se pudo asignar la ruta: ' + e.message, 'error'); }
    }
    gCredenciales(nombre, d.correo, d.password, 'creada');
  } catch(e){ gEr('cu-err', e); b.disabled = false; }
}
function gCredenciales(nombre, correo, pass, que){
  const url = location.origin + location.pathname.replace(/index\.html$/, ''); G.cred = `BIO-GENOS\nPágina: ${url}\nCorreo: ${correo}\nContraseña temporal: ${pass}\nAl entrar te pedirá cambiarla.`;
  gModal(`<h2>Cuenta ${que}</h2><div class="sec">${esc(nombre)}. Entrega estos datos; la contraseña no se vuelve a mostrar.</div>
    <div class="card" style="margin-top:10px"><div class="mut">Correo</div><div style="font-weight:700;word-break:break-all">${esc(correo)}</div><div class="mut" style="margin-top:8px">Contraseña temporal</div><div style="font:700 20px ui-monospace,Menlo,Consolas,monospace;letter-spacing:1px;word-break:break-all">${esc(pass)}</div></div>
    <div class="mut">Debe cambiarla al entrar; si no lo hace en 24 horas, la app se lo exige.</div>
    <div class="foot"><button class="btn" onclick="gCopiar()">Copiar datos</button><button class="btn p" onclick="gCerrar();gPers()">Listo</button></div>`);
}
async function gCopiar(){ try { await navigator.clipboard.writeText(G.cred); toast('Datos copiados', 'success'); } catch(e){ toast('No se pudo copiar. Anótalos manualmente.', 'error'); } }
async function gReset(uid){
  try { const d = await invocarCuentas({ accion:'reset_password', user_id:uid }); const x = G.cat.chof.find(z => z.user_id === uid) || (G.gerentes || []).find(z => z.id === uid); gCredenciales(x?.nombre || d.correo, d.correo, d.password, 'con nueva contraseña'); } catch(e){ gErr(e); }
}
async function gActivo(arg){ const [uid, a] = arg.split('|'); try { await invocarCuentas({ accion:'set_activo', user_id:uid, activo:a === '1' }); toast(a === '1' ? 'Cuenta reactivada' : 'Cuenta desactivada', 'success'); gPers(); } catch(e){ gErr(e); } }

/* ═══ UNIDADES ═══ */
async function gUni(){
  $('g-body').innerHTML = '<div class="row b" style="margin-bottom:12px"><h2 style="margin:0">Unidades</h2><button class="btn p sm" onclick="gUniModal()">Nueva unidad</button></div><div id="g-c" class="card mut">Cargando…</div>';
  try { await gCat(); const c = G.cat, ch = Object.fromEntries(c.chof.map(x => [x.colaborador_id, x.nombre]));
    $('g-c').outerHTML = c.uni.map(u => `<div class="card"><div class="row b"><b>${esc(u.bak)}</b><span class="tag ${u.estatus === 'activo' ? 'g' : 'a'}">${esc(u.estatus || '')}</span></div>
      <div class="sec">${esc([u.marca, u.modelo, u.anio].filter(Boolean).join(' ') || 'Sin datos')}${u.tipo ? ' · ' + esc(u.tipo) : ''}</div><div class="mut">${u.placas ? 'Placas ' + esc(u.placas) : 'Sin placas'}${u.niv ? ' · NIV ' + esc(u.niv) : ''}${u.chofer_id ? ' · ' + esc(ch[u.chofer_id] || '') : ''}</div>
      <div class="row" style="margin-top:10px"><button class="btn sm" onclick="gUniModal('${u.id}')">Editar</button></div></div>`).join('');
  } catch(e){ $('g-c').innerHTML = `<div class="err show">${esc(e.message)}</div>`; }
}
function gUniModal(id){
  const u = id ? G.cat.uni.find(x => x.id === id) : {}; G.uniSel = id || null; const est = [...new Set(['activo', 'mantenimiento', 'baja', ...G.cat.uni.map(x => x.estatus).filter(Boolean)])];
  const f = (k, t, ph) => `<div style="flex:1;min-width:140px"><label class="l">${t}</label><input id="gu-${k}" value="${esc(u[k] || '')}" ${ph ? `placeholder="${ph}"` : ''} autocomplete="off"></div>`;
  gModal(`<h2>${id ? 'Editar ' + esc(u.bak) : 'Nueva unidad'}</h2><div class="row" style="flex-wrap:wrap;gap:0 10px">${f('bak', 'BAK *', 'BAK-37')}${f('placas', 'Placas')}${f('niv', 'NIV')}${f('marca', 'Marca')}${f('modelo', 'Modelo')}${f('anio', 'Año')}${f('tipo', 'Tipo', 'Rabón, Torton…')}
    <div style="flex:1;min-width:140px"><label class="l">Estatus</label><select id="gu-estatus">${est.map(e => `<option ${e === (u.estatus || 'activo') ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></div></div>
    <div class="mut" style="margin-top:8px">La foto de la unidad se agrega en la siguiente fase, junto con el checklist.</div><div class="err" id="gu-err">—</div>
    <div class="foot"><button class="btn" onclick="gCerrar()">Cancelar</button><button class="btn p" onclick="gUniGuardar()">Guardar</button></div>`);
}
async function gUniGuardar(){
  hide('gu-err'); const v = k => $('gu-' + k).value.trim() || null, bak = ($('gu-bak').value.trim()).toUpperCase(); if (!bak) return say('gu-err', 'Escribe el BAK de la unidad');
  const row = { bak, placas:v('placas'), niv:v('niv'), marca:v('marca'), modelo:v('modelo'), anio:v('anio'), tipo:v('tipo'), estatus:$('gu-estatus').value };
  try { await q(G.uniSel ? sb.from('unidades').update(row).eq('id', G.uniSel) : sb.from('unidades').insert(row)); gCerrar(); toast('Unidad guardada', 'success'); gUni(); }
  catch(e){ gEr('gu-err', /duplicate|unique/i.test(e.message) ? 'Ya existe una unidad con ese BAK' : e); }
}

/* ═══ CLIENTES ═══ */
async function gCli(){
  $('g-body').innerHTML = '<div class="row b" style="margin-bottom:10px"><h2 style="margin:0">Clientes</h2><button class="btn p sm" onclick="gCliModal()">Nuevo cliente</button></div><input id="gc-q" placeholder="Buscar cliente…" oninput="gCliPintar()" style="margin-bottom:10px"><div id="g-c" class="card mut">Cargando…</div>';
  try { await gCat(); gCliPintar(); } catch(e){ $('g-c').innerHTML = `<div class="err show">${esc(e.message)}</div>`; }
}
function gCliPintar(){
  const t = norm($('gc-q')?.value || ''), lista = G.cat.cli.filter(x => !t || norm(x.nombre + ' ' + (x.razon_social || '')).includes(t)).slice(0, 80);
  const html = lista.map(x => `<div class="card"><div class="row b"><b>${esc(x.nombre)}</b><span class="tag ${x.activo ? 'g' : 'r'}">${x.activo ? 'Activo' : 'Inactivo'}</span></div><div class="mut">${esc(x.razon_social || '')}${x.rfc ? ' · ' + esc(x.rfc) : ''}${x.contacto ? ' · ' + esc(x.contacto) : ''}${x.tel ? ' · ' + esc(x.tel) : ''}</div>
    <div class="row" style="margin-top:10px"><button class="btn sm" onclick="gCliModal('${x.id}')">Editar</button></div></div>`).join('') || '<div class="card sec">Sin resultados.</div>';
  const box = $('g-c'); if (box){ box.outerHTML = `<div id="g-c">${html}</div>`; }
}
function gCliModal(id){
  const x = id ? G.cat.cli.find(z => z.id === id) : {}; G.cliSel = id || null;
  const f = (k, t) => `<div style="flex:1;min-width:200px"><label class="l">${t}</label><input id="gk-${k}" value="${esc(x[k] || '')}" autocomplete="off"></div>`;
  gModal(`<h2>${id ? 'Editar cliente' : 'Nuevo cliente'}</h2><div class="row" style="flex-wrap:wrap;gap:0 10px">${f('nombre', 'Nombre *')}${f('razon_social', 'Razón social')}${f('rfc', 'RFC')}${f('contacto', 'Contacto')}${f('tel', 'Teléfono')}${f('correo', 'Correo')}</div>
    ${id ? `<label style="display:flex;gap:9px;align-items:center;margin-top:12px"><input type="checkbox" id="gk-activo" style="width:20px;height:20px" ${x.activo ? 'checked' : ''}> Cliente activo</label>` : ''}
    <div class="err" id="gk-err">—</div><div class="foot"><button class="btn" onclick="gCerrar()">Cancelar</button><button class="btn p" onclick="gCliGuardar()">Guardar</button></div>`);
}
async function gCliGuardar(){
  hide('gk-err'); const v = k => $('gk-' + k).value.trim() || null, nombre = v('nombre'); if (!nombre) return say('gk-err', 'Escribe el nombre del cliente');
  const row = { nombre, razon_social:v('razon_social'), rfc:v('rfc'), contacto:v('contacto'), tel:v('tel'), correo:v('correo') };
  if (G.cliSel) row.activo = $('gk-activo').checked;
  try { await q(G.cliSel ? sb.from('clientes_servicio').update(row).eq('id', G.cliSel) : sb.from('clientes_servicio').insert(row)); gCerrar(); toast('Cliente guardado', 'success'); gCli(); } catch(e){ gEr('gk-err', e); }
}
