// =============================================
// SISTEMA DE CONTROL ESCOLAR - EPO 381
// Funciones basadas en epoMariana (IndexedDB)
// =============================================
"use strict";

/* ═══════════════════════════════════════════
   BASE DE DATOS — IndexedDB
═══════════════════════════════════════════ */
let DB;
const DB_NAME = 'epoan381_db';
const DB_VERSION = 1;

function openDB() {
    return new Promise((res, rej) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('alumnos'))
                db.createObjectStore('alumnos', { keyPath: 'matricula' });
            if (!db.objectStoreNames.contains('calificaciones'))
                db.createObjectStore('calificaciones', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('eventos'))
                db.createObjectStore('eventos', { keyPath: 'id', autoIncrement: true });
            if (!db.objectStoreNames.contains('reportes'))
                db.createObjectStore('reportes', { keyPath: 'id', autoIncrement: true });
            if (!db.objectStoreNames.contains('usuarios'))
                db.createObjectStore('usuarios', { keyPath: 'usuario' });
            if (!db.objectStoreNames.contains('asistencias'))
                db.createObjectStore('asistencias', { keyPath: 'matricula' });
        };
        req.onsuccess = e => { DB = e.target.result; res(DB); };
        req.onerror = () => rej(req.error);
    });
}

function dbGet(store, key) { return new Promise((res, rej) => { const tx = DB.transaction(store, 'readonly'); const req = tx.objectStore(store).get(key); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
function dbGetAll(store) { return new Promise((res, rej) => { const tx = DB.transaction(store, 'readonly'); const req = tx.objectStore(store).getAll(); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
function dbPut(store, data) { return new Promise((res, rej) => { const tx = DB.transaction(store, 'readwrite'); const req = tx.objectStore(store).put(data); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
function dbAdd(store, data) { return new Promise((res, rej) => { const tx = DB.transaction(store, 'readwrite'); const req = tx.objectStore(store).add(data); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }

/* ── Sin datos semilla — conectar a PostgreSQL via API ── */
const HORARIO_BASE = [];

async function seedDB() {
    // Los datos se cargan desde la API/PostgreSQL
    // No se insertan registros de prueba
}

/* ═══════════════════════════════════════════
   SESIÓN
═══════════════════════════════════════════ */
let SESSION = null;

async function openLogin(role) {
    const roleMap = { 'Alumnos': 'alumno', 'Docentes': 'docente', 'Orientadores': 'orientador' };
    SESSION = { pendingRole: roleMap[role] || role };

    const loginTitle = document.getElementById('l-title');
    const loginHint  = document.getElementById('l-hint');
    if (loginTitle) loginTitle.innerText = 'Acceso ' + role;
    if (loginHint) loginHint.innerText = '';

    document.getElementById('login-usuario').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').style.display = 'none';
    showPage('login');
}

async function processLogin() {
    const usuario  = document.getElementById('login-usuario').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const errorEl  = document.getElementById('login-error');
    const rol      = SESSION?.pendingRole || '';

    if (!usuario || !password) { errorEl.style.display = 'block'; return; }

    const user = await dbGet('usuarios', usuario);
    if (!user || user.password !== password || user.rol !== rol) {
        errorEl.style.display = 'block';
        return;
    }
    errorEl.style.display = 'none';
    SESSION = user;

    // Activar modo portal (oculta header/footer)
    activarPortal(user.nombre);

    if (rol === 'alumno') {
        const a = await dbGet('alumnos', usuario);
        await renderPortalAlumno(usuario, user, a);
        aluInicializarPanels();
        showPage('Alumnos');
    } else if (rol === 'docente') {
        await renderPortalDocenteNuevo(usuario, user);
        showPage('Docentes');
    } else {
        await renderPortalOrientador(usuario, user);
        showPage('staff');
    }
}

function cerrarSesion() {
    SESSION = null;
    desactivarPortal();
    showPage('home');
}

/* ═══════════════════════════════════════════
   NAVEGACIÓN
═══════════════════════════════════════════ */
function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + id);
    if (target) {
        target.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        console.error('No se encontró la página: page-' + id);
    }
}

/* ═══════════════════════════════════════════
   TABS
═══════════════════════════════════════════ */
function showTab(tabId) {
    document.querySelectorAll('.alumno-tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const tab = document.getElementById('tab-' + tabId);
    if (tab) tab.style.display = 'block';
    if (event && event.target) event.target.classList.add('active');
}

function showTabAlumno(btn, tabId) {
    document.querySelectorAll('.alumno-tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const tab = document.getElementById('tab-' + tabId);
    if (tab) tab.style.display = 'block';
    if (btn) btn.classList.add('active');
}

function showStaffTab(tabId) {
    document.querySelectorAll('.staff-tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.staff-tab-btn').forEach(b => b.classList.remove('active'));
    const tab = document.getElementById('stab-' + tabId);
    if (tab) tab.style.display = 'block';
    if (event && event.target) event.target.classList.add('active');
}

/* ═══════════════════════════════════════════
   INDICADOR DE RIESGO
═══════════════════════════════════════════ */
function setRisk(level) {
    // level: 4=sin riesgo, 3=bajo, 2=medio, 1=alto, 0=baja
    const flagColors = {
        0: '#d1d5db',  // Baja   — gris
        1: '#fca5a5',  // Alto   — rojo claro
        2: '#fde68a',  // Medio  — amarillo
        3: '#bbf7d0',  // Bajo   — verde claro
        4: '#4ade80',  // Sin riesgo — verde
    };
    const activeBorderColor = {
        0: '#6b7280', 1: '#ef4444', 2: '#f59e0b', 3: '#22c55e', 4: '#16a34a'
    };
    const situacionLabels = ['BAJA', 'RIESGO ALTO', 'RIESGO MEDIO', 'RIESGO BAJO', 'REGULAR'];

    document.querySelectorAll('.risk-item').forEach(item => {
        const lvl   = parseInt(item.dataset.level);
        const shape = item.querySelector('.risk-flag-shape');
        const pole  = item.querySelector('div[style*="background:#6b7280"]');
        const span  = item.querySelector('span');
        const isActive = lvl === level;

        // Bandera: color siempre visible, activa más saturada
        if (shape) {
            shape.style.background  = flagColors[lvl] || '#d1d5db';
            shape.style.opacity     = isActive ? '1' : '0.45';
            shape.style.filter      = isActive ? 'none' : 'saturate(0.3)';
        }
        // Texto
        if (span) {
            span.style.color      = isActive ? '#1e293b' : '#9ca3af';
            span.style.fontWeight = isActive ? '900'     : '700';
        }
        // Borde en el item activo (recuadro verde como en la imagen)
        item.style.border       = isActive ? '2px solid ' + activeBorderColor[lvl] : 'none';
        item.style.borderRadius = isActive ? '8px' : '0';
        item.style.background   = isActive ? (lvl === 4 ? '#f0fdf4' : lvl === 3 ? '#f0fdf4' : lvl === 2 ? '#fffbeb' : lvl === 1 ? '#fef2f2' : '#f9fafb') : 'transparent';
        item.style.padding      = isActive ? '6px 14px 8px' : '6px 14px 8px';
    });

    // Cuadro info: situación actual
    const sitEl = document.getElementById('ri-situacion');
    if (sitEl) sitEl.innerText = situacionLabels[level] || '—';
}

/* ═══════════════════════════════════════════
   PORTAL ALUMNO
═══════════════════════════════════════════ */

/* ── Navegación sidebar ── */
function sideGo(btn, panelId) {
    // Verificar primer ingreso completo
    const bloqueados = ['datos-gen','domicilio','procedencia','calificaciones','boleta','reportes-al'];
    const pInicio    = panelId === 'inicio';
    if (!pInicio && bloqueados.includes(panelId)) {
        const llave = '_epo381_perfil_' + (SESSION?.usuario || 'x');
        if (!localStorage.getItem(llave)) {
            showAlert('⚠️ Debes completar tus datos personales primero.');
            document.getElementById('modal-primer-ingreso')?.style && (document.getElementById('modal-primer-ingreso').style.display = 'block');
            return;
        }
    }
    // Activar sidebar
    document.querySelectorAll('.side-item').forEach(b => b.classList.remove('side-active'));
    if (btn) btn.classList.add('side-active');
    // Mostrar panel
    document.querySelectorAll('.al-panel').forEach(p => p.classList.remove('al-active'));
    const target = document.getElementById('al-' + panelId);
    if (target) target.classList.add('al-active');
}

/* ── Primer ingreso — guardar y desbloquear ── */
async function guardarPrimerIngreso() {
    const g  = id => document.getElementById(id)?.value.trim() || '';
    const gc = id => document.getElementById(id)?.checked || false;
    const nombre    = g('fi-nombre');
    const ap1       = g('fi-ap1');
    const genero    = g('fi-genero');
    const fechaNac  = g('fi-fecha-nac');
    const curp      = g('fi-curp');
    const tutorN    = g('fi-tutor');
    const municipio = g('fi-municipio-nac');
    if (!nombre || !ap1 || !genero || !fechaNac || !curp || !tutorN || !municipio) {
        showAlert('⚠️ Completa todos los campos obligatorios (*).');
        return;
    }
    const a = await dbGet('alumnos', SESSION.usuario);
    if (a) {
        a.datos_generales = {
            nombre_corto: nombre, ap1, ap2: g('fi-ap2'),
            genero, fecha_nac: fechaNac, curp: curp.toUpperCase(),
            email: g('fi-email'), pais: 'MÉXICO',
            pais_nac: g('fi-pais-nac') || 'MÉXICO',
            estado_nac: g('fi-estado-nac') || 'MÉXICO',
            municipio_nac: municipio, sangre: g('fi-sangre'),
            tutor: tutorN, tel_tutor: g('fi-tel-tutor'),
            indigena: gc('fi-indigena'), dialecto: gc('fi-dialecto'),
            madre_soltera: gc('fi-madre-soltera'),
            discapacidad: gc('fi-discapacidad'), debil_visual: gc('fi-debil-visual'),
        };
        await dbPut('alumnos', a);
    }
    const llave = '_epo381_perfil_' + SESSION.usuario;
    localStorage.setItem(llave, '1');
    document.getElementById('modal-primer-ingreso').style.display = 'none';
    await renderDatosGenerales();
    showAlert('✅ Datos guardados. ¡Bienvenido al portal!');
}

/* ── Render portal alumno ── */
async function renderPortalAlumno(id, user, alumno) {
    const a = alumno || await dbGet('alumnos', id);

    // Datos en sidebar
    const si = (elId, val) => { const el = document.getElementById(elId); if (el) el.innerText = val; };
    si('side-nombre', a ? a.nombre.split(' ').slice(0,2).join(' ') : user.nombre);
    si('side-semestre', a ? `${a.semestre}° Sem. — Gpo ${a.grupo}` : '');
    si('alumno-nombre', a ? a.nombre : user.nombre);
    si('alumno-semestre', a ? `${a.semestre}° Semestre — Grupo ${a.grupo}` : '');

    // Fecha
    const hoy = new Date();
    const fechaStr = hoy.toLocaleDateString('es-MX', {day:'2-digit',month:'long',year:'numeric'});
    si('side-fecha', fechaStr);

    // Calificaciones
    const cals = (await dbGetAll('calificaciones')).filter(c => c.matricula === id);
    if (cals.length) {
        const prom = +(cals.reduce((s,c) => s+c.final, 0) / cals.length).toFixed(2);
        const ul   = +(cals.reduce((s,c) => s+c.p3,    0) / cals.length).toFixed(1);
        si('alumno-promedio', prom);
        si('ri-promedio', prom);
        si('ri-ultimo',   ul);
        renderCalTable(cals);
        renderBoleta(id, a, cals, prom);
        const sel = document.getElementById('rep-materia');
        if (sel) sel.innerHTML = '<option value="">-- Selecciona --</option>' + cals.map(c => `<option>${c.materia}</option>`).join('');
    }

    // Riesgo
    const riskLevel = a ? (4 - (a.riesgo > 4 ? 4 : a.riesgo < 0 ? 0 : a.riesgo)) : 4;
    setRisk(riskLevel);
    const situaciones = ['BAJA','RIESGO ALTO','RIESGO MEDIO','RIESGO BAJO','REGULAR'];
    const gradoAvance = ((( a?.semestre || 1) / 6) * 100).toFixed(2) + '%';
    const hoyFmt = String(hoy.getDate()).padStart(2,'0') + '/' + String(hoy.getMonth()+1).padStart(2,'0') + '/' + hoy.getFullYear();
    si('ri-avance',    gradoAvance);
    si('ri-situacion', situaciones[riskLevel] || 'REGULAR');
    si('ri-fecha',     hoyFmt);

    // Datos generales y domicilio
    await renderDatosGenerales();
    await renderDomicilio();
    await renderProcedencia();
    await renderReportesConducta();

    // ¿Primer ingreso?
    const llave = '_epo381_perfil_' + id;
    if (!localStorage.getItem(llave)) {
        document.getElementById('modal-primer-ingreso').style.display = 'block';
    }
}

/* ── Datos generales ── */
const DG_CAMPOS = [
    ['Cuenta','matricula'],['Primer apellido','ap1'],['Segundo apellido','ap2'],
    ['Nombre','nombre_corto'],['Género','genero'],['Fecha de nacimiento','fecha_nac'],
    ['País de nacionalidad','pais'],['Identificador Nacional o clave CURP*','curp'],
    ['Correo electrónico personal**','email'],['Correo electrónico institucional','email_inst'],
    ['País de nacimiento','pais_nac'],['Estado de nacimiento','estado_nac'],
    ['Municipio de nacimiento','municipio_nac'],['Tipo de sangre','sangre'],
    ['Nombre del padre o tutor*','tutor'],['IMSS','imss'],
    ['En grupo indígena','indigena_str'],['Habla dialecto','dialecto_str'],
    ['Madre soltera','madre_soltera_str'],['Con discapacidad','discapacidad_str'],
    ['Débil visual','debil_visual_str'],
];

async function renderDatosGenerales() {
    if (!SESSION) return;
    const a = await dbGet('alumnos', SESSION.usuario);
    const d = a?.datos_generales || {};
    const partes = a?.nombre?.split(' ') || [];
    const vals = {
        matricula: SESSION.usuario,
        ap1: d.ap1 || partes[0] || '—',
        ap2: d.ap2 || partes[1] || '—',
        nombre_corto: d.nombre_corto || partes.slice(2).join(' ') || a?.nombre || '—',
        genero: d.genero || 'NO ESPECIFICADO',
        fecha_nac: d.fecha_nac || 'NO REGISTRADO',
        pais: d.pais || 'MÉXICO',
        curp: d.curp || 'PENDIENTE',
        email: d.email || 'PENDIENTE',
        email_inst: `${SESSION.usuario.toLowerCase()}@epoan381.edu.mx`,
        pais_nac: d.pais_nac || 'MÉXICO',
        estado_nac: d.estado_nac || 'MÉXICO',
        municipio_nac: d.municipio_nac || 'TENANCINGO',
        sangre: d.sangre || '—',
        tutor: a?.tutor || d.tutor || '—',
        imss: d.imss || '—',
        indigena_str: d.indigena ? 'SÍ' : 'NO',
        dialecto_str: d.dialecto ? 'SÍ' : 'NO',
        madre_soltera_str: d.madre_soltera ? 'SÍ' : 'NO',
        discapacidad_str: d.discapacidad ? 'SÍ' : 'NO',
        debil_visual_str: d.debil_visual ? 'SÍ' : 'NO',
    };
    const tbody = document.getElementById('dg-tbody');
    if (tbody) tbody.innerHTML = DG_CAMPOS.map(([c,k]) => `<tr><td>${c}</td><td>${vals[k] || '—'}</td></tr>`).join('');
    // Pre-llenar form edición
    const sv = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ''; };
    sv('dg-ap1', vals.ap1); sv('dg-ap2', vals.ap2); sv('dg-nombre-c', vals.nombre_corto);
    sv('dg-genero', vals.genero); sv('dg-fecha-nac', d.fecha_nac || '');
    sv('dg-curp', vals.curp !== 'PENDIENTE' ? vals.curp : '');
    sv('dg-email', vals.email !== 'PENDIENTE' ? vals.email : '');
    sv('dg-municipio-nac', vals.municipio_nac); sv('dg-sangre', vals.sangre !== '—' ? vals.sangre : '');
    sv('dg-tutor', vals.tutor !== '—' ? vals.tutor : '');
    if (d.indigena)      document.getElementById('dg-indigena').checked      = true;
    if (d.dialecto)      document.getElementById('dg-dialecto').checked      = true;
    if (d.madre_soltera) document.getElementById('dg-madre-soltera').checked = true;
    if (d.discapacidad)  document.getElementById('dg-discapacidad').checked  = true;
    if (d.debil_visual)  document.getElementById('dg-debil-visual').checked  = true;
}

function toggleEditDG() {
    const v = document.getElementById('dg-view');
    const e = document.getElementById('dg-edit');
    const showing = e.style.display !== 'none';
    v.style.display = showing ? 'block' : 'none';
    e.style.display = showing ? 'none'  : 'block';
}

async function guardarDG() {
    if (!SESSION) return;
    const g  = id => document.getElementById(id)?.value.trim() || '';
    const gc = id => document.getElementById(id)?.checked || false;
    const a = await dbGet('alumnos', SESSION.usuario);
    if (!a) return;
    if (!a.datos_generales) a.datos_generales = {};
    const d = a.datos_generales;
    d.ap1=g('dg-ap1'); d.ap2=g('dg-ap2'); d.nombre_corto=g('dg-nombre-c');
    d.genero=g('dg-genero'); d.fecha_nac=g('dg-fecha-nac'); d.curp=g('dg-curp').toUpperCase();
    d.email=g('dg-email'); d.municipio_nac=g('dg-municipio-nac'); d.sangre=g('dg-sangre');
    d.tutor=g('dg-tutor');
    d.indigena=gc('dg-indigena'); d.dialecto=gc('dg-dialecto');
    d.madre_soltera=gc('dg-madre-soltera'); d.discapacidad=gc('dg-discapacidad');
    d.debil_visual=gc('dg-debil-visual');
    await dbPut('alumnos', a);
    await renderDatosGenerales();
    toggleEditDG();
    showAlert('✅ Datos generales actualizados.');
}

/* ── Domicilio ── */
async function renderDomicilio() {
    if (!SESSION) return;
    const a = await dbGet('alumnos', SESSION.usuario);
    const d = a?.domicilio;
    const tbody = document.getElementById('dom-tbody');
    if (!tbody) return;
    const campos = [
        ['Calle*', d?.calle||'—'], ['Colonia', d?.colonia||'—'],
        ['Población', d?.poblacion||'—'], ['Código postal', d?.cp||'—'],
        ['Teléfono', d?.tel||'—'], ['País*', d?.pais||'MÉXICO'],
        ['Estado*', d?.estado||'MÉXICO'], ['Municipio*', d?.municipio||'—'],
    ];
    tbody.innerHTML = campos.map(([c,v]) => `<tr><td>${c}</td><td>${v}</td></tr>`).join('');
    if (d) {
        const sv = (el, val) => { const e = document.getElementById(el); if (e && val) e.value = val; };
        sv('dom-calle',d.calle); sv('dom-colonia',d.colonia); sv('dom-poblacion',d.poblacion);
        sv('dom-cp',d.cp); sv('dom-tel',d.tel); sv('dom-pais',d.pais||'MÉXICO');
        sv('dom-estado',d.estado||'MÉXICO'); sv('dom-municipio',d.municipio);
    }
}

function toggleEditDom() {
    const v = document.getElementById('dom-view');
    const e = document.getElementById('dom-edit');
    const showing = e.style.display !== 'none';
    v.style.display = showing ? 'block' : 'none';
    e.style.display = showing ? 'none'  : 'block';
}

async function guardarDomicilio() {
    if (!SESSION) return;
    const g = id => document.getElementById(id)?.value.trim() || '';
    if (!g('dom-calle') || !g('dom-municipio')) { showAlert('⚠️ Calle y municipio son obligatorios.'); return; }
    const a = await dbGet('alumnos', SESSION.usuario);
    if (a) {
        a.domicilio = { calle:g('dom-calle'), colonia:g('dom-colonia'), poblacion:g('dom-poblacion'),
            cp:g('dom-cp'), tel:g('dom-tel'), pais:g('dom-pais')||'MÉXICO',
            estado:g('dom-estado')||'MÉXICO', municipio:g('dom-municipio') };
        await dbPut('alumnos', a);
    }
    await renderDomicilio();
    toggleEditDom();
    showAlert('✅ Domicilio guardado.');
}

/* ── Procedencia ── */
async function renderProcedencia() {
    if (!SESSION) return;
    const a = await dbGet('alumnos', SESSION.usuario);
    const p = a?.procedencia;
    const tbody = document.getElementById('proc-tbody');
    const tbl   = document.getElementById('proc-view-table');
    const empty = document.getElementById('proc-view-empty');
    if (!p || !p.nombre) {
        if (tbl)   tbl.style.display   = 'none';
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';
    if (tbl)   tbl.style.display   = 'table';
    const tipoLabel = {secundaria:'🏛️ Secundaria General', telesecundaria:'📡 Telesecundaria', tecnica:'🔧 Secundaria Técnica'}[p.tipo] || p.tipo;
    if (tbody) tbody.innerHTML = [
        ['Tipo de escuela', tipoLabel], ['Nombre', p.nombre],
        ['CCT', p.cct||'—'], ['Municipio', p.municipio||'—'],
        ['Estado', p.estado||'—'], ['Promedio de egreso', p.promEgr||'—'],
        ['Año de egreso', p.anio||'—'], ['Director(a)', p.director||'—'],
    ].map(([c,v]) => `<tr><td>${c}</td><td>${v}</td></tr>`).join('');
    // Pre-llenar form
    if (p.tipo) { const rb = document.getElementById({secundaria:'rb-sec',telesecundaria:'rb-tele',tecnica:'rb-tec'}[p.tipo]); if (rb) rb.checked=true; selecTipo(p.tipo); }
    const sv = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    sv('proc-nombre-esc',p.nombre); sv('proc-cct',p.cct); sv('proc-municipio',p.municipio);
    sv('proc-estado',p.estado); sv('proc-promedio-egreso',p.promEgr); sv('proc-anio-egreso',p.anio); sv('proc-director',p.director);
}

function toggleEditProc() {
    const v = document.getElementById('proc-view');
    const e = document.getElementById('proc-edit');
    const showing = e.style.display !== 'none';
    v.style.display = showing ? 'block' : 'none';
    e.style.display = showing ? 'none'  : 'block';
}

function selecTipo(tipo) {
    ['lbl-sec','lbl-tele','lbl-tec'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.style.borderColor='#e2e8f0'; el.style.background='white'; }
    });
    const map = {secundaria:'lbl-sec',telesecundaria:'lbl-tele',tecnica:'lbl-tec'};
    const active = document.getElementById(map[tipo]);
    if (active) { active.style.borderColor='#8e1b22'; active.style.background='#fff1f2'; }
}

async function guardarProcedencia() {
    if (!SESSION) return;
    const rb   = document.querySelector('input[name="tipo-escuela"]:checked');
    const tipo = rb ? rb.value : '';
    const nombre = document.getElementById('proc-nombre-esc')?.value.trim();
    const municipio = document.getElementById('proc-municipio')?.value.trim();
    if (!tipo || !nombre || !municipio) { showAlert('⚠️ Tipo, nombre y municipio son obligatorios.'); return; }
    const a = await dbGet('alumnos', SESSION.usuario);
    if (a) {
        a.procedencia = {
            tipo, nombre, cct: document.getElementById('proc-cct')?.value.trim(),
            municipio, estado: document.getElementById('proc-estado')?.value.trim(),
            promEgr: parseFloat(document.getElementById('proc-promedio-egreso')?.value)||0,
            anio: parseInt(document.getElementById('proc-anio-egreso')?.value)||0,
            director: document.getElementById('proc-director')?.value.trim(),
        };
        await dbPut('alumnos', a);
    }
    await renderProcedencia();
    toggleEditProc();
    showAlert('✅ Datos de procedencia guardados.');
}

/* ── Calificaciones ── */
function renderCalTable(cals) {
    const tbody = document.getElementById('tabla-calificaciones');
    if (!tbody || !cals.length) return;
    const thStyle = 'padding:12px 18px;text-align:left;font-size:.77rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;';
    const thead = document.getElementById('cal-thead-row');
    if (thead) thead.innerHTML = `<th style="${thStyle}">Materia</th><th style="${thStyle}">Parcial 1</th><th style="${thStyle}">Parcial 2</th><th style="${thStyle}">Parcial 3</th><th style="${thStyle}">Promedio Final</th>`;
    tbody.innerHTML = cals.map(c => {
        const col = c.final >= 7 ? '#22c55e' : c.final >= 6 ? '#f59e0b' : '#ef4444';
        return `<tr><td>${c.materia}</td><td>${c.p1}</td><td>${c.p2}</td><td>${c.p3}</td><td><span style="background:${col};color:#fff;padding:4px 14px;border-radius:20px;font-weight:800;">${c.final}</span></td></tr>`;
    }).join('');
}

async function filtrarCalificaciones() {
    if (!SESSION) return;
    const semF = document.getElementById('cal-filtro-semestre')?.value || 'all';
    const parF = document.getElementById('cal-filtro-parcial')?.value  || 'all';
    let cals = (await dbGetAll('calificaciones')).filter(c => c.matricula === SESSION.usuario);
    if (semF !== 'all') cals = cals.filter(c => String(c.semestre) === semF);
    const thS  = 'padding:12px 18px;text-align:left;font-size:.77rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;';
    const thead = document.getElementById('cal-thead-row');
    const tbody = document.getElementById('tabla-calificaciones');
    if (!tbody) return;
    if (parF === 'all') {
        if (thead) thead.innerHTML = `<th style="${thS}">Materia</th><th style="${thS}">Parcial 1</th><th style="${thS}">Parcial 2</th><th style="${thS}">Parcial 3</th><th style="${thS}">Promedio Final</th>`;
        renderCalTable(cals);
        document.getElementById('cal-resumen-parcial').style.display = 'none';
    } else {
        const pLabel = {p1:'Parcial 1',p2:'Parcial 2',p3:'Parcial 3'}[parF];
        if (thead) thead.innerHTML = `<th style="${thS}">Materia</th><th style="${thS}">${pLabel}</th><th style="${thS}">Estatus</th>`;
        tbody.innerHTML = cals.map(c => {
            const val = c[parF] || 0;
            const col = val >= 7 ? '#22c55e' : val >= 6 ? '#f59e0b' : '#ef4444';
            const est = val >= 6 ? '<span style="color:#15803d;font-weight:700;">✓ Aprobado</span>' : '<span style="color:#b91c1c;font-weight:700;">✗ Reprobado</span>';
            return `<tr><td>${c.materia}</td><td><span style="background:${col};color:#fff;padding:4px 14px;border-radius:20px;font-weight:800;">${val}</span></td><td>${est}</td></tr>`;
        }).join('');
        const vals = cals.map(c => c[parF]||0);
        const prom = vals.length ? +(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2) : 0;
        document.getElementById('cal-resumen-parcial').style.display = 'block';
        document.getElementById('cal-resumen-titulo').innerText = `Resumen — ${pLabel}`;
        document.getElementById('cal-res-prom').innerText  = prom;
        document.getElementById('cal-res-aprov').innerText = vals.filter(v=>v>=6).length;
        document.getElementById('cal-res-rep').innerText   = vals.filter(v=>v<6).length;
    }
}

/* ── Boleta ── */
function renderBoleta(id, a, cals, prom) {
    const si = (elId, val) => { const el = document.getElementById(elId); if (el) el.innerText = val; };
    const situaciones = ['BAJA','RIESGO ALTO','RIESGO MEDIO','RIESGO BAJO','REGULAR'];
    const riskLevel = a ? (4-(a.riesgo>4?4:a.riesgo<0?0:a.riesgo)) : 4;
    const hoy = new Date();
    si('bol-fecha-gen', 'Generada: ' + hoy.toLocaleDateString('es-MX'));
    si('bol-nombre',   a ? a.nombre : id);
    si('bol-id',       id);
    si('bol-sem',      a ? `${a.semestre}° — Grupo ${a.grupo}` : '—');
    si('bol-sit',      situaciones[riskLevel] || 'REGULAR');
    si('bol-prom',     prom);
    si('bol-prom-final', prom);
    const tb = document.getElementById('bol-tbody');
    if (tb) tb.innerHTML = cals.map(c => {
        const col = c.final >= 6 ? '#16a34a' : '#dc2626';
        return `<tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:8px 14px;text-align:left;">${c.materia}</td>
            <td style="padding:8px 14px;text-align:center;">${c.p1}</td>
            <td style="padding:8px 14px;text-align:center;">${c.p2}</td>
            <td style="padding:8px 14px;text-align:center;">${c.p3}</td>
            <td style="padding:8px 14px;text-align:center;font-weight:800;color:${col};">${c.final}</td>
            <td style="padding:8px 14px;text-align:center;">${c.final>=6?'✓':'✗'}</td>
        </tr>`;
    }).join('');
}

function imprimirBoleta() {
    const content = document.getElementById('boleta-content')?.innerHTML;
    if (!content) return;
    const win = window.open('', '_blank', 'width=860,height=720');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Boleta EPO 381</title>
    <style>body{font-family:'Segoe UI',sans-serif;margin:24px;background:white;}
    table{width:100%;border-collapse:collapse;} th,td{padding:7px 12px;}
    @media print{button{display:none!important;}}</style></head>
    <body>${content}
    <br><button onclick="window.print()" style="padding:10px 24px;background:#1e293b;color:white;border:none;border-radius:8px;cursor:pointer;font-size:.9rem;">🖨️ Imprimir</button>
    </body></html>`);
    win.document.close();
}

function exportarBoleta() {
    const content = document.getElementById('boleta-content')?.innerHTML;
    if (!content) return;
    const win = document.getElementById('boleta-print-window');
    const exp = document.getElementById('boleta-export-content');
    if (win && exp) { exp.innerHTML = content; win.style.display = 'block'; }
}
function cerrarVentanaBoleta() {
    const win = document.getElementById('boleta-print-window');
    if (win) win.style.display = 'none';
}

/* ── Reportes de conducta ── */
async function renderReportesConducta() {
    if (!SESSION) return;
    const a = await dbGet('alumnos', SESSION.usuario);
    const reportes = a?.reportes_conducta || [];
    const si = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    si('rp-total',     reportes.length);
    si('rp-pendientes', reportes.filter(r => r.estado === 'PENDIENTE').length);
    si('rp-resueltos',  reportes.filter(r => r.estado === 'ATENDIDO').length);
    const tbody = document.getElementById('rp-tbody');
    if (!tbody) return;
    if (!reportes.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px;">No hay reportes de conducta registrados.</td></tr>';
        return;
    }
    tbody.innerHTML = reportes.map(r => {
        const estCol = r.estado === 'ATENDIDO' ? '#16a34a' : '#f59e0b';
        return `<tr>
            <td style="padding:11px 16px;border-bottom:1px solid #f1f5f9;">${r.fecha}</td>
            <td style="padding:11px 16px;border-bottom:1px solid #f1f5f9;">${r.tipo}</td>
            <td style="padding:11px 16px;border-bottom:1px solid #f1f5f9;max-width:240px;">${r.descripcion}</td>
            <td style="padding:11px 16px;border-bottom:1px solid #f1f5f9;">${r.quien||'—'}</td>
            <td style="padding:11px 16px;border-bottom:1px solid #f1f5f9;text-align:center;"><span style="background:${estCol};color:#fff;padding:3px 10px;border-radius:20px;font-size:.74rem;font-weight:700;">${r.estado}</span></td>
        </tr>`;
    }).join('');
}

function toggleFormReporte() {
    const f = document.getElementById('form-reporte-conducta');
    if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

async function guardarReporteConducfa() {
    if (!SESSION) return;
    const g = id => document.getElementById(id)?.value.trim() || '';
    const tipo = g('rep-tipo-conducta');
    const desc = g('rep-descripcion');
    if (!tipo || !desc) { showAlert('⚠️ Tipo de falta y descripción son obligatorios.'); return; }
    const hoy = new Date();
    const fecha = String(hoy.getDate()).padStart(2,'0') + '/' + String(hoy.getMonth()+1).padStart(2,'0') + '/' + hoy.getFullYear();
    const reporte = { tipo, descripcion: desc, quien: g('rep-quien'), medida: g('rep-medida'), fecha_inc: g('rep-fecha-inc')||fecha, fecha, estado: 'PENDIENTE' };
    const a = await dbGet('alumnos', SESSION.usuario);
    if (a) { if (!a.reportes_conducta) a.reportes_conducta = []; a.reportes_conducta.push(reporte); await dbPut('alumnos', a); }
    document.getElementById('form-reporte-conducta').style.display = 'none';
    // Limpiar form
    ['rep-tipo-conducta','rep-descripcion','rep-quien','rep-medida','rep-fecha-inc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    await renderReportesConducta();
    showAlert('✅ Reporte de conducta registrado.');
}

/* ── showTabAlumno (compatibilidad tabs anteriores → no se usa, pero se mantiene) ── */
function showTabAlumno(btn, id) { sideGo(btn, id); }

/* ═══════════════════════════════════════════
/* ═══════════════════════════════════════════
   PORTAL DOCENTE
═══════════════════════════════════════════ */
async function renderPortalDocente(id, user) {
    const titleEl = document.getElementById('staff-title');
    if (titleEl) titleEl.innerText = 'Portal Docente — ' + user.nombre;

    const oriTools  = document.getElementById('orientador-tools');
    const docSec    = document.getElementById('docente-section');
    const oriSec    = document.getElementById('orientador-section');
    if (oriTools) oriTools.style.display = 'none';
    if (docSec)   docSec.style.display   = 'block';
    if (oriSec)   oriSec.style.display   = 'none';

    // Mostrar tabs de docente, ocultar tabs solo-orientador
    document.querySelectorAll('.ori-only').forEach(el => el.style.display = 'none');

    // Tabla captura calificaciones
    const alumnos = await dbGetAll('alumnos');
    const cals    = await dbGetAll('calificaciones');
    const tbody   = document.getElementById('docente-tabla');
    if (tbody) {
        tbody.innerHTML = alumnos.map(a => {
            const row = cals.find(c => c.matricula === a.matricula && c.materia === user.materia);
            const p1 = row ? row.p1 : '';
            const p2 = row ? row.p2 : '';
            const p3 = row ? row.p3 : '';
            return `<tr>
                <td>${a.matricula}</td>
                <td>${a.nombre}</td>
                <td>${a.semestre}° — Gpo ${a.grupo}</td>
                <td><input class="cal-input" type="number" min="0" max="10" step="0.1" value="${p1}" data-mat="${a.matricula}" data-p="p1" placeholder="—"></td>
                <td><input class="cal-input" type="number" min="0" max="10" step="0.1" value="${p2}" data-mat="${a.matricula}" data-p="p2" placeholder="—"></td>
                <td><input class="cal-input" type="number" min="0" max="10" step="0.1" value="${p3}" data-mat="${a.matricula}" data-p="p3" placeholder="—"></td>
            </tr>`;
        }).join('');
    }

    // Tabla asistencias
    const asistencias = await dbGetAll('asistencias');
    const atabody = document.getElementById('docente-asistencia');
    if (atabody) {
        atabody.innerHTML = alumnos.map(a => {
            const asis = asistencias.find(x => x.matricula === a.matricula) || { asistidas: '—', faltas: '—', porcentaje: '—' };
            return `<tr>
                <td>${a.matricula}</td><td>${a.nombre}</td><td>${a.semestre}° Gpo ${a.grupo}</td>
                <td>${asis.asistidas}</td><td>${asis.faltas}</td><td>${asis.porcentaje}%</td>
            </tr>`;
        }).join('');
    }
}

async function guardarCalificaciones() {
    if (!SESSION || SESSION.rol !== 'docente') return;
    const inputs = document.querySelectorAll('.cal-input[data-mat]');
    const updates = {};
    inputs.forEach(inp => {
        const mat = inp.dataset.mat, p = inp.dataset.p;
        if (!updates[mat]) updates[mat] = {};
        updates[mat][p] = parseFloat(inp.value) || 0;
    });
    const materia = SESSION.materia || 'Matemáticas';
    for (const [mat, vals] of Object.entries(updates)) {
        const id = `${mat}_${materia}`;
        let cal = await dbGet('calificaciones', id);
        if (!cal) {
            const alumno = await dbGet('alumnos', mat);
            cal = { id, matricula: mat, materia, semestre: alumno?.semestre, grupo: alumno?.grupo, p1: 0, p2: 0, p3: 0, final: 0 };
        }
        Object.assign(cal, vals);
        cal.final = +((cal.p1 + cal.p2 + cal.p3) / 3).toFixed(1);
        await dbPut('calificaciones', cal);
    }
    showAlert('✅ Calificaciones guardadas correctamente.');
}

/* ═══════════════════════════════════════════
   PORTAL ORIENTADOR
═══════════════════════════════════════════ */
async function renderPortalOrientador(id, user) {
    const titleEl = document.getElementById('staff-title');
    if (titleEl) titleEl.innerText = 'Portal Orientador — ' + user.nombre;

    const oriTools = document.getElementById('orientador-tools');
    const docSec   = document.getElementById('docente-section');
    const oriSec   = document.getElementById('orientador-section');
    if (oriTools) oriTools.style.display = 'grid';
    if (docSec)   docSec.style.display   = 'none';
    if (oriSec)   oriSec.style.display   = 'block';

    // Mostrar tabs de orientador
    document.querySelectorAll('.ori-only').forEach(el => el.style.display = 'inline-flex');

    // Activar primer tab visible para orientador
    showStaffTabSilent('alumnos-ori');

    await renderTablaAlumnos();
    renderEventosEnLista('avisos-orientador');
    await renderReportesLista();
    await renderIndicadores();
    await renderConcentrado();
    await renderSeguimiento();

    // Actualizar stats rápidas
    const alumnos = await dbGetAll('alumnos');
    const sinRiesgo  = alumnos.filter(a => a.riesgo === 0).length;
    const riesgoMed  = alumnos.filter(a => a.riesgo === 1 || a.riesgo === 2).length;
    const riesgoAlto = alumnos.filter(a => a.riesgo >= 3).length;
    const totalEl = document.querySelector('.ori-stat-card .big');
    if (totalEl) totalEl.innerText = alumnos.length;
    const statBigs = document.querySelectorAll('.ori-stat-card .big');
    if (statBigs[1]) statBigs[1].innerText = sinRiesgo;
    if (statBigs[2]) statBigs[2].innerText = riesgoMed;
    if (statBigs[3]) statBigs[3].innerText = riesgoAlto;
}

function showStaffTabSilent(tabId) {
    document.querySelectorAll('.staff-tab-content').forEach(t => t.style.display = 'none');
    const tab = document.getElementById('stab-' + tabId);
    if (tab) tab.style.display = 'block';
}

async function renderTablaAlumnos(lista) {
    if (!lista) lista = await dbGetAll('alumnos');
    const cals = await dbGetAll('calificaciones');
    const tbody = document.getElementById('orientador-tabla');
    if (!tbody) return;
    const rColores = ['#22c55e', '#86efac', '#f59e0b', '#ef4444', '#7f1d1d'];
    const rLabels  = ['Sin riesgo', 'Bajo', 'Medio', 'Alto', 'Crítico'];
    tbody.innerHTML = lista.map(a => {
        const cs = cals.filter(c => c.matricula === a.matricula);
        const prom = cs.length ? +(cs.reduce((s, c) => s + c.final, 0) / cs.length).toFixed(1) : '—';
        const ri = a.riesgo > 4 ? 4 : a.riesgo < 0 ? 0 : a.riesgo;
        return `<tr>
            <td>${a.matricula}</td>
            <td><strong>${a.nombre}</strong></td>
            <td>${a.semestre}° — Gpo ${a.grupo}</td>
            <td>${prom}</td>
            <td><span style="background:${rColores[ri]};color:#fff;padding:4px 12px;border-radius:20px;font-size:0.8rem;font-weight:700;">${rLabels[ri]}</span></td>
            <td><button class="btn btn-blue" style="padding:8px 16px;font-size:0.8rem;" onclick="verAlumno('${a.matricula}')">Ver perfil</button></td>
        </tr>`;
    }).join('');
}

async function buscarAlumno() {
    const q = document.getElementById('search-input')?.value.trim().toLowerCase() || '';
    const all = await dbGetAll('alumnos');
    const filtrados = all.filter(a =>
        a.nombre.toLowerCase().includes(q) ||
        String(a.semestre).includes(q) ||
        a.matricula.toLowerCase().includes(q)
    );
    await renderTablaAlumnos(filtrados);
}

async function verAlumno(mat) {
    const a = await dbGet('alumnos', mat);
    if (!a) return;
    const cals = (await dbGetAll('calificaciones')).filter(c => c.matricula === mat);
    const asis = await dbGet('asistencias', mat) || {};
    const prom = cals.length ? +(cals.reduce((s, c) => s + c.final, 0) / cals.length).toFixed(2) : '—';

    const rColores = ['#22c55e', '#86efac', '#f59e0b', '#ef4444', '#7f1d1d'];
    const rLabels  = ['Sin riesgo', 'Bajo', 'Medio', 'Alto', 'Crítico'];
    const ri = a.riesgo > 4 ? 4 : a.riesgo < 0 ? 0 : a.riesgo;

    const modal = document.getElementById('modal-alumno');
    document.getElementById('modal-nombre').innerText    = a.nombre;
    document.getElementById('modal-semestre').innerText  = `${a.semestre}° Semestre — Grupo ${a.grupo}`;
    document.getElementById('modal-id').innerText        = a.matricula;
    document.getElementById('modal-promedio').innerText  = prom;
    document.getElementById('modal-riesgo').innerText    = rLabels[ri];
    document.getElementById('modal-riesgo').style.background = rColores[ri];
    document.getElementById('modal-asis').innerText = asis.porcentaje ? asis.porcentaje + '%' : '—';

    const tbody = document.getElementById('modal-cals');
    tbody.innerHTML = cals.map(c =>
        `<tr><td>${c.materia}</td><td>${c.p1}</td><td>${c.p2}</td><td>${c.p3}</td><td><strong>${c.final}</strong></td></tr>`
    ).join('');

    if (modal) modal.style.display = 'flex';
}

function cerrarModal() {
    const modal = document.getElementById('modal-alumno');
    if (modal) modal.style.display = 'none';
}

/* ── Avisos / Eventos ── */
async function renderEventosEnLista(containerId) {
    const ev = await dbGetAll('eventos');
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!ev.length) { el.innerHTML = '<p style="color:#94a3b8;">No hay avisos registrados.</p>'; return; }
    el.innerHTML = ev.map(e => `
        <div class="aviso-card">
            <span class="aviso-fecha">${e.fecha || ''}</span>
            <h4>${e.titulo}</h4>
            <p>${e.desc || e.cuerpo || ''}</p>
        </div>`).join('');
}

async function publicarAviso() {
    const titulo = document.getElementById('nuevo-aviso-titulo')?.value.trim();
    const cuerpo = document.getElementById('nuevo-aviso-cuerpo')?.value.trim();
    if (!titulo || !cuerpo) { showAlert('Completa título y contenido del aviso.'); return; }
    const hoy = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    await dbAdd('eventos', { titulo, desc: cuerpo, fecha: hoy });
    renderEventosEnLista('avisos-orientador');
    document.getElementById('nuevo-aviso-titulo').value = '';
    document.getElementById('nuevo-aviso-cuerpo').value = '';
    showAlert('✅ Aviso publicado correctamente.');
}

/* ── Reportes ── */
async function renderReportesLista() {
    const reps = await dbGetAll('reportes');
    const el = document.getElementById('reportes-content');
    if (!el) return;
    if (!reps.length) { el.innerHTML = '<p style="color:#94a3b8;">No hay reportes registrados.</p>'; return; }
    el.innerHTML = `<div class="tabla-wrapper"><table>
        <thead><tr><th>Fecha</th><th>Alumno</th><th>Docente</th><th>Motivo</th></tr></thead>
        <tbody>${reps.map(r => `<tr><td>${r.fecha}</td><td>${r.matricula}</td><td>${r.docente || '—'}</td><td>${r.motivo}</td></tr>`).join('')}</tbody>
    </table></div>`;
}

/* ── Indicadores (Orientador — Reportes tab) ── */
let chartInstances = {};
function destroyChart(id) { if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; } }

function calcStats(cals) {
    const byMat = {};
    cals.forEach(c => {
        if (!byMat[c.materia]) byMat[c.materia] = { total: 0, sum: 0, rep: 0 };
        byMat[c.materia].total++;
        byMat[c.materia].sum += c.final;
        if (c.final < 6) byMat[c.materia].rep++;
    });
    return Object.entries(byMat).map(([mat, d]) => ({
        mat, prom: +(d.sum / d.total).toFixed(2), rep: d.rep, total: d.total,
        pctRep:   +((d.rep / d.total) * 100).toFixed(1),
        pctAprov: +(((d.total - d.rep) / d.total) * 100).toFixed(1)
    }));
}

async function renderIndicadores() {
    const cals = await dbGetAll('calificaciones');
    const stats = calcStats(cals);
    if (!stats.length) return;

    const totalProm  = +(stats.reduce((a, s) => a + s.prom, 0) / stats.length).toFixed(2);
    const totalRep   = stats.reduce((a, s) => a + s.rep, 0);
    const totalAlum  = await dbGetAll('alumnos');
    const aprobados  = totalAlum.length - (await dbGetAll('calificaciones')).filter(c => c.final < 6).length;

    // Actualizar stats cards del tab de reportes
    const statBigs = document.querySelectorAll('#stab-reportes .ori-stat-card .big');
    if (statBigs[0]) statBigs[0].innerText = totalProm;
    if (statBigs[1]) statBigs[1].innerText = totalAlum.length - totalRep;
    if (statBigs[2]) statBigs[2].innerText = totalRep;

    // Tabla semestres actualizada con datos reales
    const byGrupo = {};
    (await dbGetAll('calificaciones')).forEach(c => {
        const key = `${c.semestre}°${c.grupo}`;
        if (!byGrupo[key]) byGrupo[key] = { count: 0, sum: 0, rep: 0, asisSum: 0, asisCount: 0 };
        byGrupo[key].count++;
        byGrupo[key].sum += c.final;
        if (c.final < 6) byGrupo[key].rep++;
    });
    const semTable = document.querySelector('#stab-reportes .tabla-wrapper table tbody');
    if (semTable) {
        semTable.innerHTML = Object.entries(byGrupo).map(([gpo, d]) => {
            const prom = +(d.sum / d.count).toFixed(1);
            const repColor = d.rep > 0 ? '#ef4444' : '#22c55e';
            return `<tr><td>${gpo}</td><td>—</td><td>${prom}</td><td>—</td>
                <td><span style="background:${repColor};color:#fff;padding:3px 10px;border-radius:20px;font-size:0.8rem;">${d.rep}</span></td></tr>`;
        }).join('');
    }

    // Dibujar gráficas si Chart.js está disponible
    if (typeof Chart !== 'undefined') {
        drawIndicadoresCharts(stats);
    }
}

function drawIndicadoresCharts(stats) {
    const labels = stats.map(s => s.mat.length > 12 ? s.mat.slice(0, 12) + '…' : s.mat);
    const cfgBase = { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { font: { size: 9 }, maxRotation: 60 } }, y: { beginAtZero: true } } };

    const chartDefs = [
        { id: 'chart-rep',   data: stats.map(s => s.pctRep),   bg: 'rgba(220,38,38,.65)' },
        { id: 'chart-prom',  data: stats.map(s => s.prom),     bg: 'rgba(37,99,235,.65)' },
        { id: 'chart-num',   data: stats.map(s => s.rep),      bg: 'rgba(13,148,136,.65)' },
        { id: 'chart-aprov', data: stats.map(s => s.pctAprov), bg: 'rgba(22,163,74,.65)' },
    ];
    chartDefs.forEach(c => {
        destroyChart(c.id);
        const ctx = document.getElementById(c.id)?.getContext('2d');
        if (!ctx) return;
        chartInstances[c.id] = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ data: c.data, backgroundColor: c.bg, borderRadius: 3 }] }, options: { ...cfgBase } });
    });
}

async function renderConcentrado() {
    // Usa los mismos datos que indicadores pero en el tab de concentrado si existe
    const cals = await dbGetAll('calificaciones');
    const stats = calcStats(cals);
    const el = document.getElementById('stab-concentrado');
    if (!el) return;
    // Mantener el diseño original del tab de subir concentrado
}

/* ── Seguimiento Reprobados ── */
async function renderSeguimiento() {
    const alumnos = await dbGetAll('alumnos');
    const cals    = await dbGetAll('calificaciones');
    const reprobados = [];
    alumnos.forEach(a => {
        const cs = cals.filter(c => c.matricula === a.matricula && c.final < 6);
        cs.forEach(c => reprobados.push({ a, c }));
    });
    const agrupados = {};
    let np = 1;
    reprobados.forEach(({ a, c }) => {
        const key = a.matricula;
        if (!agrupados[key]) agrupados[key] = { a, materias: [], np: np++ };
        agrupados[key].materias.push(c.materia);
    });

    // Si existe un tbody de seguimiento, popularlo
    const tb = document.getElementById('seg-tbody');
    if (tb) {
        if (!Object.keys(agrupados).length) {
            tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:24px;">No hay alumnos reprobados.</td></tr>';
        } else {
            tb.innerHTML = Object.values(agrupados).flatMap(({ a, materias, np }) =>
                materias.map((mat, i) => `<tr>
                    ${i === 0 ? `<td rowspan="${materias.length}">${np}</td><td rowspan="${materias.length}">${a.nombre}</td><td rowspan="${materias.length}">${materias.length}</td>` : ''}
                    <td>${mat}</td>
                    <td><input type="number" min="0" max="10" step="0.1" style="width:55px;padding:4px;border:1px solid #e2e8f0;border-radius:4px;font-size:.78rem;text-align:center;" placeholder="—"></td>
                    <td><input type="number" min="0" max="10" step="0.1" style="width:55px;padding:4px;border:1px solid #e2e8f0;border-radius:4px;font-size:.78rem;text-align:center;" placeholder="—"></td>
                    <td><input type="number" min="0" max="10" step="0.1" style="width:55px;padding:4px;border:1px solid #e2e8f0;border-radius:4px;font-size:.78rem;text-align:center;" placeholder="—"></td>
                    <td><input type="date" style="padding:4px;border:1px solid #e2e8f0;border-radius:4px;font-size:.75rem;"></td>
                </tr>`)
            ).join('');
        }
    }
}

/* ── Generar Boleta ── */
async function generarBoleta(mat) {
    const alumnoSel = mat || (SESSION?.rol === 'alumno' ? SESSION.usuario : null);
    if (!alumnoSel) { showAlert('Selecciona un alumno.'); return; }
    const a = await dbGet('alumnos', alumnoSel);
    const cals = (await dbGetAll('calificaciones')).filter(c => c.matricula === alumnoSel);
    if (!a || !cals.length) { showAlert('No hay datos para este alumno.'); return; }
    const prom = +(cals.reduce((s, c) => s + c.final, 0) / cals.length).toFixed(2);

    const boletaHTML = `
        <div style="font-family:inherit;max-width:700px;margin:0 auto;padding:20px;background:white;border:1px solid #e2e8f0;border-radius:12px;">
            <div style="display:flex;align-items:center;gap:16px;border-bottom:2px solid #1e293b;padding-bottom:14px;margin-bottom:18px;">
                <img src="img/Logo.png" style="height:54px;border-radius:50%;">
                <div>
                    <h3 style="color:#1e293b;font-family:'Outfit';margin:0;">EPO 381 Tenancingo</h3>
                    <p style="font-size:.78rem;color:#64748b;margin:2px 0;">Esc. Preparatoria Oficial Núm. 381 · C.C.T. 15EBP0025F</p>
                    <p style="font-size:.78rem;color:#64748b;margin:0;">Tenancingo, Estado de México</p>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:18px;font-size:.85rem;">
                <div><strong>Alumno:</strong> ${a.nombre}</div>
                <div><strong>Matrícula:</strong> ${a.matricula}</div>
                <div><strong>Semestre:</strong> ${a.semestre}°</div>
                <div><strong>Grupo:</strong> ${a.grupo}</div>
                <div><strong>Ciclo:</strong> 2025-2026</div>
                <div><strong>Turno:</strong> Matutino</div>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:.82rem;margin-bottom:14px;">
                <thead>
                    <tr style="background:#1e293b;color:white;">
                        <th style="padding:9px 12px;text-align:left;">Asignatura</th>
                        <th style="padding:9px 12px;text-align:center;">P1</th>
                        <th style="padding:9px 12px;text-align:center;">P2</th>
                        <th style="padding:9px 12px;text-align:center;">P3</th>
                        <th style="padding:9px 12px;text-align:center;">Final</th>
                        <th style="padding:9px 12px;text-align:center;">Estatus</th>
                    </tr>
                </thead>
                <tbody>
                    ${cals.map(c => `<tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:8px 12px;">${c.materia}</td>
                        <td style="padding:8px 12px;text-align:center;">${c.p1}</td>
                        <td style="padding:8px 12px;text-align:center;">${c.p2}</td>
                        <td style="padding:8px 12px;text-align:center;">${c.p3}</td>
                        <td style="padding:8px 12px;text-align:center;font-weight:700;color:${c.final >= 6 ? '#15803d' : '#b91c1c'}">${c.final}</td>
                        <td style="padding:8px 12px;text-align:center;">${c.final >= 6 ? '✓' : '✗'}</td>
                    </tr>`).join('')}
                </tbody>
                <tfoot>
                    <tr style="background:#111d33;color:white;">
                        <td colspan="4" style="padding:9px 12px;text-align:right;font-weight:700;">PROMEDIO GENERAL</td>
                        <td colspan="2" style="padding:9px 12px;text-align:center;font-weight:700;">${prom}</td>
                    </tr>
                </tfoot>
            </table>
            <div style="display:flex;justify-content:space-around;margin-top:28px;flex-wrap:wrap;gap:16px;">
                <div style="text-align:center;font-size:.78rem;color:#64748b;">
                    <div style="width:160px;border-top:1px solid #1e293b;margin:0 auto 6px;"></div>Director General
                </div>
                <div style="text-align:center;font-size:.78rem;color:#64748b;">
                    <div style="width:160px;border-top:1px solid #1e293b;margin:0 auto 6px;"></div>Control Escolar
                </div>
                <div style="text-align:center;font-size:.78rem;color:#64748b;">
                    <div style="width:160px;border-top:1px solid #1e293b;margin:0 auto 6px;"></div>Orientadora Educativa
                </div>
            </div>
        </div>`;

    // Mostrar en el modal del alumno o abrir ventana de impresión
    const win = window.open('', '_blank', 'width=800,height=700');
    if (win) {
        win.document.write(`<!DOCTYPE html><html><head><title>Boleta — ${a.nombre}</title></head><body style="margin:20px;">${boletaHTML}<br><button onclick="window.print()" style="padding:10px 24px;background:#1e293b;color:white;border:none;border-radius:8px;cursor:pointer;font-size:1rem;">Imprimir</button></body></html>`);
        win.document.close();
    } else {
        showAlert('Boleta generada. Permite ventanas emergentes para imprimir.');
    }
}

/* ── Exportar CSV ── */
async function exportarReportes() {
    const cals  = await dbGetAll('calificaciones');
    const stats = calcStats(cals);
    const headers = 'Asignatura,Promedio,Reprobados,% Reprobación,% Aprovechamiento';
    const rows = stats.map(s => `${s.mat},${s.prom},${s.rep},${s.pctRep}%,${s.pctAprov}%`);
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_academico_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showAlert('✅ Reporte exportado como CSV.');
}

/* ═══════════════════════════════════════════
   UTILIDADES
═══════════════════════════════════════════ */
function showAlert(msg) {
    // Toast personalizado si existe, si no, alert nativo
    const toast = document.getElementById('toast-msg');
    if (toast) {
        toast.innerText = msg;
        toast.style.opacity = '1';
        setTimeout(() => toast.style.opacity = '0', 3000);
    } else {
        alert(msg);
    }
}

/* ═══════════════════════════════════════════
   CERRAR MODAL AL HACER CLICK FUERA
═══════════════════════════════════════════ */
window.addEventListener('click', function(e) {
    const modal = document.getElementById('modal-alumno');
    if (modal && e.target === modal) cerrarModal();
});

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
async function init() {
    await openDB();
    await seedDB();
    // Mostrar primer tab de alumno oculto
    document.querySelectorAll('.alumno-tab-content').forEach((t, i) => {
        t.style.display = i === 0 ? 'block' : 'none';
    });
    showPage('home');
}

document.addEventListener('DOMContentLoaded', init);

/* ══════════════════════════════════════════════════════
   MODO PORTAL — activar / desactivar
══════════════════════════════════════════════════════ */
function activarPortal(nombreUsuario) {
    document.body.classList.add('portal-mode');
    const el = document.getElementById('ptb-nombre');
    if (el) el.textContent = nombreUsuario || '';
}
function desactivarPortal() {
    document.body.classList.remove('portal-mode');
}
function irAlInicio() {
    SESSION = null;
    desactivarPortal();
    showPage('home');
}

/* ══════════════════════════════════════════════════════
   PORTAL ALUMNO — Nav horizontal
══════════════════════════════════════════════════════ */
function aluNav(el, section) {
    // Marcar item activo
    document.querySelectorAll('.ahnav-item').forEach(i => i.classList.remove('ahnav-active'));
    if (el) el.classList.add('ahnav-active');

    // Mostrar panel correcto
    document.querySelectorAll('#alu-panels-wrap .al-panel').forEach(p => {
        p.classList.remove('al-active');
    });
    const target = document.getElementById('al-' + section);
    if (target) target.classList.add('al-active');
}

function aluInicializarPanels() {
    // Ocultar todos, mostrar solo inicio
    document.querySelectorAll('#alu-panels-wrap .al-panel').forEach((p, i) => {
        p.classList.toggle('al-active', i === 0);
    });
    document.querySelectorAll('.ahnav-item').forEach((item, i) => {
        item.classList.toggle('ahnav-active', i === 0);
    });
    // Llenar barra de bienvenida
    const nombre = document.getElementById('alumno-nombre');
    const semestre = document.getElementById('alumno-semestre');
    const prom = document.getElementById('alumno-promedio');
    const fecha = document.getElementById('side-fecha');
    if (nombre) { const el2 = document.getElementById('alu-nombre2'); if(el2) el2.textContent = nombre.textContent; }
    if (semestre) { const el2 = document.getElementById('alu-semestre2'); if(el2) el2.textContent = semestre.textContent; }
    if (prom) { const el2 = document.getElementById('alu-prom2'); if(el2) el2.textContent = prom.textContent; }
    if (fecha) { const el2 = document.getElementById('alu-fecha2'); if(el2) el2.textContent = fecha.textContent; }
}

// Override sideGo para compatibilidad (sidebar original llama a sideGo)
function sideGo(el, section) {
    aluNav(document.querySelector('.ahnav-item[data-section="' + section + '"]'), section);
}

/* ══════════════════════════════════════════════════════
   PORTAL DOCENTE — Solo consulta (sin edición)
══════════════════════════════════════════════════════ */
let _docAlumnos = [];
let _docCals    = [];
let _docUser    = null;

async function renderPortalDocenteNuevo(id, user) {
    _docUser = user;

    // Encabezado
    const setTxt = (elId, val) => { const e = document.getElementById(elId); if(e) e.textContent = val; };
    setTxt('doc-nombre', user.nombre);
    setTxt('doc-materia-badge', user.materia || 'Materia');
    setTxt('doc-mat-label', user.materia || 'Materia');

    // Cargar datos
    _docAlumnos = await dbGetAll('alumnos');
    _docCals    = await dbGetAll('calificaciones');

    docFiltrar();
}

function docFiltrar() {
    const semestre = (document.getElementById('df-semestre')?.value || '').trim();
    const grupo    = (document.getElementById('df-grupo')?.value    || '').trim();
    const nombre   = (document.getElementById('df-nombre')?.value   || '').toLowerCase().trim();

    let lista = [..._docAlumnos];
    if (semestre) lista = lista.filter(a => String(a.semestre) === semestre);
    if (grupo)    lista = lista.filter(a => a.grupo === grupo);
    if (nombre)   lista = lista.filter(a => a.nombre.toLowerCase().includes(nombre));

    _docRenderTabla(lista);
    _docStats(lista);

    // Subtítulo
    const partes = [];
    if (semestre) partes.push(semestre + '° Semestre');
    if (grupo)    partes.push('Grupo ' + grupo);
    if (nombre)   partes.push('"' + nombre + '"');
    const sub = document.getElementById('doc-subtitulo');
    if (sub) sub.textContent = partes.length ? partes.join(' · ') : 'Todos los alumnos';
}

function _docRenderTabla(lista) {
    const tbody   = document.getElementById('doc-tbody');
    const countEl = document.getElementById('doc-count');
    const materia = _docUser?.materia || 'Matemáticas';
    const tfoot   = document.getElementById('doc-tfoot');

    if (countEl) countEl.textContent = lista.length + ' alumno' + (lista.length !== 1 ? 's' : '');

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="doc-empty">
            <div class="doc-empty-ico">🔍</div>
            <p>Sin resultados para los filtros seleccionados.</p>
        </td></tr>`;
        if (tfoot) tfoot.style.display = 'none';
        return;
    }

    const GNOM = { A:'Grupo A', B:'Grupo B', C:'Grupo C' };

    tbody.innerHTML = lista.map((a, idx) => {
        const cal = _docCals.find(c => c.matricula === a.matricula && c.materia === materia);
        const fmt = v => v !== undefined && v !== '' && v !== null
            ? `<span class="cal-num ${v >= 6 ? 'cal-aprov' : 'cal-repro'}">${v}</span>`
            : `<span class="cal-num cal-nd">—</span>`;
        const fmtFinal = v => v !== undefined && v !== '' && v !== null
            ? `<strong style="font-size:1rem;color:${v >= 6 ? '#15803d' : '#dc2626'};">${v}</strong>`
            : `<span style="color:#94a3b8;font-weight:600;">—</span>`;
        return `<tr>
            <td>${idx + 1}</td>
            <td style="font-weight:700;">${a.nombre}</td>
            <td style="font-size:.8rem;color:#64748b;">${a.matricula}</td>
            <td><span class="sem-badge">${a.semestre}°</span><span class="grp-badge">${GNOM[a.grupo] || a.grupo}</span></td>
            <td>${fmt(cal?.p1)}</td>
            <td>${fmt(cal?.p2)}</td>
            <td>${fmt(cal?.p3)}</td>
            <td>${fmtFinal(cal?.final)}</td>
        </tr>`;
    }).join('');

    // Promedio general en footer
    const cals = lista.map(a => _docCals.find(c => c.matricula === a.matricula && c.materia === materia)).filter(c => c && c.final !== undefined);
    if (cals.length && tfoot) {
        const promGen = (cals.reduce((s,c) => s + c.final, 0) / cals.length).toFixed(1);
        const el = document.getElementById('doc-prom-general');
        if (el) el.textContent = promGen;
        tfoot.style.display = '';
    } else if (tfoot) {
        tfoot.style.display = 'none';
    }
}

function _docStats(lista) {
    const materia = _docUser?.materia || 'Matemáticas';
    const setTxt  = (id, v) => { const e = document.getElementById(id); if(e) e.textContent = v; };
    const cals    = lista.map(a => _docCals.find(c => c.matricula === a.matricula && c.materia === materia)).filter(c => c && c.final !== undefined);
    const aprov   = cals.filter(c => c.final >= 6).length;
    const repro   = cals.filter(c => c.final < 6).length;
    const prom    = cals.length ? (cals.reduce((s,c) => s + c.final, 0) / cals.length).toFixed(1) : '—';
    setTxt('ds-total', lista.length);
    setTxt('ds-aprov', aprov);
    setTxt('ds-repro', repro);
    setTxt('ds-prom',  prom);
}

function docLimpiar() {
    const s = document.getElementById('df-semestre');
    const g = document.getElementById('df-grupo');
    const n = document.getElementById('df-nombre');
    if (s) s.value = '';
    if (g) g.value = '';
    if (n) n.value = '';
    docFiltrar();
}
