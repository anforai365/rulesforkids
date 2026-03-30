// ============================================================
// app.js - Lógica principal de la App de Tareas Infantiles
// ============================================================

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- Estado global ----
let currentUser = null;
let hijos = [];
let hijoActivo = null;
let tareasConfig = [];
let registroSemana = [];
let recompensas = [];
let vistaActual = 'dashboard';
let semanaSeleccionada = null; // null = semana actual

// ---- Estado estadísticas ----
let statsPeriodo = 'semana'; // 'semana' | 'mes' | 'anio'
let statsMesSeleccionado  = null; // Date con año+mes, null = mes actual
let statsAnioSeleccionado = null; // número de año, null = año actual
let registroStats = []; // datos cargados para el período de estadísticas

// ---- Días de la semana ----
// Nota: Las semanas siguen el estilo español, empezando el lunes y terminando el domingo
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// ============================================================
// CARITAS SVG
// ============================================================

function svgCarita(tipo) {
  // tipo: 'feliz' | 'triste' | 'neutra'
  const archivos = {
    feliz:  'img/carita_feliz.svg',
    triste: 'img/carita_triste.svg',
    neutra: 'img/carita_neutra.svg',
  };
  return `<img src="${archivos[tipo]}" alt="${tipo}" width="48" height="48" style="display:block;pointer-events:none;"/>`;
}

// ============================================================
// SISTEMA DE AUDIO — mp3 desde /sounds/
// ============================================================

// Caché de objetos Audio para reutilizarlos sin recargar
const _sfx = {};
function getSfx(nombre) {
  if (!_sfx[nombre]) {
    _sfx[nombre] = new Audio(`sounds/${nombre}`);
    _sfx[nombre].volume = 0.85;
  }
  return _sfx[nombre];
}

function tocarSonidoFeliz()   { try { const a = getSfx('bien.mp3');    a.currentTime = 0; a.play(); } catch(e) {} }
function tocarSonidoTriste()  { try { const a = getSfx('mal.mp3');     a.currentTime = 0; a.play(); } catch(e) {} }
function tocarSonidoNeutro()  { try { const a = getSfx('regular.mp3'); a.currentTime = 0; a.play(); } catch(e) {} }
function tocarSonidoTada()    { try { const a = getSfx('tada.mp3');    a.currentTime = 0; a.play(); } catch(e) {} }

// ---- Música de fondo ----
let _musicaFondo = null;
let _musicaActiva = false;  // estado actual (on/off)

function initMusicaFondo() {
  if (_musicaFondo) return;
  _musicaFondo = new Audio('sounds/fondo.mp3');
  _musicaFondo.loop   = true;
  _musicaFondo.volume = 0.25;  // discreta para no tapar los efectos
}

function arrancarMusicaFondo() {
  initMusicaFondo();
  _musicaFondo.play().catch(() => {
    // El navegador bloqueó el autoplay; esperamos la primera interacción del usuario
    document.addEventListener('click', () => {
      if (_musicaActiva) _musicaFondo.play().catch(() => {});
    }, { once: true });
  });
}

function toggleMusica() {
  initMusicaFondo();
  _musicaActiva = !_musicaActiva;
  if (_musicaActiva) {
    _musicaFondo.play().catch(() => {});
  } else {
    _musicaFondo.pause();
  }
  // Actualizar icono del botón en el sidebar
  const btn = document.getElementById('btn-musica');
  if (btn) {
    btn.textContent = _musicaActiva ? '🔊 Música' : '🔇 Música';
    btn.classList.toggle('musica-activa', _musicaActiva);
  }
}

function getLunesDeEstaSemana() {
  // Calcula el lunes de la semana actual (estilo español: semana del lunes al domingo)
  const hoy = new Date();
  const dia = hoy.getDay(); // 0=Dom, 1=Lun...
  const diff = (dia === 0 ? -6 : 1 - dia);
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() + diff);
  lunes.setHours(0, 0, 0, 0);
  return lunes;
}

function getFechasSemana() {
  // Devuelve las fechas de la semana seleccionada, empezando por lunes
  // Usa fecha LOCAL para evitar el desfase de zona horaria que produce toISOString() (UTC)
  const lunes = semanaSeleccionada || getLunesDeEstaSemana();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
}

function formatFecha(isoStr) {
  const [y, m, d] = isoStr.split('-');
  return `${d}/${m}`;
}

// Devuelve una cadena como "2026 · Lun 23 Mar — Dom 29 Mar"
// Las semanas van del lunes al domingo, estilo español
function formatSemana(fechas) {
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const DIAS_LARGO = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

  const inicio = new Date(fechas[0] + 'T12:00:00');
  const fin    = new Date(fechas[6] + 'T12:00:00');

  const anio      = inicio.getFullYear();
  const diaIni    = DIAS_LARGO[inicio.getDay()];
  const numIni    = inicio.getDate();
  const mesIni    = MESES[inicio.getMonth()];
  const diaFin    = DIAS_LARGO[fin.getDay()];
  const numFin    = fin.getDate();
  const mesFin    = MESES[fin.getMonth()];

  // Si la semana no cruza de mes: "2026 · Lun 23 — Dom 29 Mar"
  // Si cruza de mes:              "2026 · Lun 30 Mar — Dom 5 Abr"
  const rangoIni = inicio.getMonth() === fin.getMonth()
    ? `${diaIni} ${numIni}`
    : `${diaIni} ${numIni} ${mesIni}`;

  return `${anio} · ${rangoIni} — ${diaFin} ${numFin} ${mesFin}`;
}

// Formatea una fecha ISO como "23 Mar 2026"
function formatFechaLarga(isoStr) {
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  // Parsear como fecha local añadiendo T12:00:00 para evitar desfase de zona horaria
  const d = new Date(isoStr.split('T')[0] + 'T12:00:00');
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

// ============================================================
// AUTH - Magic Link
// ============================================================

async function login() {
  const emailInput = document.getElementById('email-input');
  const email = emailInput.value.trim();

  if (!email || !email.includes('@')) {
    return showToast('Ingresa un email válido', 'error');
  }

  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
      shouldCreateUser: true
    }
  });

  btn.disabled = false;
  btn.textContent = '📧 Enviar Magic Link';

  if (error) {
    showToast('Error: ' + error.message, 'error');
  } else {
    showToast('✅ Revisa tu email para el enlace mágico! 📧', 'success');
    emailInput.value = '';
  }
}

async function logout() {
  await sb.auth.signOut();
  // El listener onAuthStateChange se encarga del resto
}

// ============================================================
// CARGA DE DATOS
// ============================================================

async function cargarHijos() {
  const { data, error } = await sb.from('perfiles_hijos').select('*').order('nombre');
  if (error) {
    console.error('Error cargando hijos:', error);
    return;
  }
  hijos = data || [];
}

async function cargarTareas(hijoId) {
  const { data, error } = await sb.from('tareas_config').select('*').eq('hijo_id', hijoId).order('nombre_tarea');
  if (error) {
    console.error('Error cargando tareas:', error);
    return;
  }
  tareasConfig = data || [];
}

async function cargarRegistroSemana(hijoId) {
  const fechas = getFechasSemana();
  const { data, error } = await sb.from('registro_diario')
    .select('*')
    .eq('hijo_id', hijoId)
    .gte('fecha', fechas[0])
    .lte('fecha', fechas[6]);
  if (error) {
    console.error('Error cargando registro:', error);
    return;
  }
  registroSemana = data || [];
}

async function cargarRecompensas(hijoId) {
  const { data, error } = await sb.from('recompensas').select('*').eq('hijo_id', hijoId).order('puntos_necesarios');
  if (error) {
    console.error('Error cargando recompensas:', error);
    return;
  }
  recompensas = data || [];
}

// ============================================================
// ACCIONES
// ============================================================

async function handleToggleTarea(tareaId, fecha, estadoActual, btn) {
  // Calcular el estado siguiente para saber qué sonido tocar
  let nuevoEstado;
  if (estadoActual === null || estadoActual === undefined) nuevoEstado = true;
  else if (estadoActual === true) nuevoEstado = false;
  else nuevoEstado = null;

  // Sonido según el nuevo estado
  if (nuevoEstado === true) tocarSonidoFeliz();
  else if (nuevoEstado === false) tocarSonidoTriste();
  else tocarSonidoNeutro();

  // Animación de rebote
  if (btn) {
    btn.classList.remove('bounce');
    void btn.offsetWidth; // reflow para reiniciar animación
    btn.classList.add('bounce');
  }

  await toggleTarea(tareaId, fecha, estadoActual);
}

async function toggleTarea(tareaId, fecha, estadoActual) {
  // Ciclo de estados: null → true → false → null
  let nuevoEstado;
  if (estadoActual === null || estadoActual === undefined) nuevoEstado = true;
  else if (estadoActual === true) nuevoEstado = false;
  else nuevoEstado = null;

  const existente = registroSemana.find(r => r.tarea_id === tareaId && r.fecha === fecha);
  const tarea = tareasConfig.find(t => t.id === tareaId);

  if (nuevoEstado === null && existente) {
    // Borrar el registro
    await sb.from('registro_diario').delete().eq('id', existente.id);
    if (existente.completado === true && tarea) {
      await actualizarPuntos(hijoActivo.id, -tarea.puntos_valor);
    }
  } else if (existente) {
    // Actualizar registro existente
    await sb.from('registro_diario').update({ completado: nuevoEstado }).eq('id', existente.id);
    if (tarea) {
      if (nuevoEstado === true && !existente.completado) await actualizarPuntos(hijoActivo.id, tarea.puntos_valor);
      if (nuevoEstado === false && existente.completado === true) await actualizarPuntos(hijoActivo.id, -tarea.puntos_valor);
    }
  } else {
    // Crear nuevo registro
    await sb.from('registro_diario').insert({ tarea_id: tareaId, fecha, completado: nuevoEstado, hijo_id: hijoActivo.id });
    if (nuevoEstado === true && tarea) {
      await actualizarPuntos(hijoActivo.id, tarea.puntos_valor);
    }
  }

  // Recargar datos y redibujar
  await cargarRegistroSemana(hijoActivo.id);
  await cargarHijos();
  hijoActivo = hijos.find(h => h.id === hijoActivo.id);
  renderDashboard();
}

async function actualizarPuntos(hijoId, delta) {
  const hijo = hijos.find(h => h.id === hijoId);
  if (!hijo) return;
  const nuevos = Math.max(0, (hijo.puntos_acumulados || 0) + delta);
  await sb.from('perfiles_hijos').update({ puntos_acumulados: nuevos }).eq('id', hijoId);
}

// ============================================================
// EMOJI PICKER UNIVERSAL
// ============================================================

// Categorías de emojis disponibles en el picker
const EMOJI_CATEGORIAS = [
  {
    // Unicode 6-9: soporte universal en todos los sistemas
    titulo: '👦 Niños y niñas',
    emojis: [
      '👦','👧','🧒',
      '👦🏻','👧🏻','🧒🏻',
      '👦🏼','👧🏼','🧒🏼',
      '👦🏽','👧🏽','🧒🏽',
      '👦🏾','👧🏾','🧒🏾',
      '👦🏿','👧🏿','🧒🏿',
    ]
  },
  {
    // Unicode 10-11: amplio soporte desde Win10 1903+
    titulo: '🧑 Personajes',
    emojis: [
      '🧙','🧙🏻','🧙🏽','🧙🏿',
      '🧚','🧚🏻','🧚🏽','🧚🏿',
      '🧜','🧜🏻','🧜🏽','🧜🏿',
      '🦸','🦸🏻','🦸🏽','🦸🏿',
      '🦹','🦹🏻','🦹🏽','🦹🏿',
      '🤖','👾','🎭','🧸',
    ]
  },
  {
    // Animales: todos Unicode 6-11, soporte universal
    titulo: '🐾 Animales',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼',
      '🐨','🐯','🦁','🐸','🐵','🦄','🐲','🦋',
      '🐙','🦈','🐳','🦖','🦕','🐧','🦉','🐺',
    ]
  },
  {
    // Aventura: sustituidos 🪄(U+1FA84) y 🧲(U+1F9F2) por 🔮 y ⚙️
    titulo: '🚀 Aventura',
    emojis: [
      '🚀','🛸','⚡','🌟','🔥','🌈','🎮','🏆',
      '⚔️','🛡️','🎯','🧩','🎪','🎠','💎','🗺️',
      '🔭','🧪','🎲','🏹','🔮','⚙️','🔑','🎸',
    ]
  },
  {
    // Comida: sustituido 🧃(U+1F9C3) por 🥤, ya existente
    titulo: '🍕 Comida',
    emojis: [
      '🍕','🍦','🍩','🍪','🎂','🍭','🍫','🍬',
      '🧁','🍿','🍔','🌮','🍣','🍜','🍎','🍓',
      '🥑','🍉','🍋','🍇','🥤','🍧','🥞','🍱',
    ]
  },
  {
    // Hogar: sustituidos 🪥🪣🪴🪞🪟(Unicode 13) por 🪒🪤→🧴🌿🪑→🔧
    // 🪥 → 🦷 (diente, Universal), 🪣 → 🚰, 🪴 → 🌿, 🪞 → 🪒→ 🧴, 🪟 → 🏠
    titulo: '🛏️ Tareas del hogar',
    emojis: [
      '🛏️','🧹','🧺','🧼','🦷','🚿','🛁','🚰',
      '🍽️','🥄','🧴','🌿','🌱','🐕','🐈','🧽',
      '🚪','👕','👟','🎒','🗑️','🔧','💧','🏠',
    ]
  },
  {
    // Rutinas: 🪥 → 🦷, 🩺 → ❤️, sustituidos Unicode 13+
    titulo: '📚 Colegio y rutinas',
    emojis: [
      '📚','✏️','📖','📝','🖊️','📐','📏','🎨',
      '🖍️','📓','🔬','🎵','🎹','⚽','🏊','🚴',
      '🧘','🏃','🌅','😴','🦷','❤️','💊','🥗',
    ]
  },
  {
    // Símbolos: todos Unicode 6-11, soporte universal
    titulo: '⭐ Símbolos',
    emojis: [
      '⭐','🌙','☀️','❄️','🌊','🌸','🌺','🍀',
      '🎵','🎨','💡','🏅','🎀','🌈','💎','🔥',
      '💜','❤️','💙','💚','🧡','💛','🖤','🤍',
    ]
  },
  {
    // Premios: sustituidos 🪙(U+1FA99) → 💰, 🪅(U+1FA85) → 🎊
    titulo: '🎁 Premios y regalos',
    emojis: [
      '🎁','🎀','🏆','🥇','🥈','🥉','🎖️','🏅',
      '👑','💎','🌟','✨','🎊','🎉','🎈','🎗️',
      '💰','💵','🎟️','🎫','🗝️','🔓','🎊','🎠',
    ]
  },
  {
    // Ocio: sustituido 🪗(U+1FA97) → 🥁, 🤳 → 📷
    titulo: '🎮 Ocio y entretenimiento',
    emojis: [
      '🎮','🕹️','🎲','🎯','🎳','🃏','🎬','🍿',
      '🎥','📺','🎧','🎵','🎤','🎸','🎹','🎺',
      '🎻','🥁','📱','💻','🖥️','📷','🎨','🖌️',
    ]
  },
  {
    // Salidas: sustituidos 🧗(U+1F9D7)→🏋️, 🛹(U+1F6F9)→🛴, 🧋(U+1F9CB)→🥤
    titulo: '🏖️ Salidas y experiencias',
    emojis: [
      '🏖️','🎡','🎢','🎪','🏊','⛷️','🏄','🏋️',
      '🚴','🛴','🏇','🎠','🏕️','🌄','🎆','🎇',
      '🍔','🍕','🍦','🧁','🎂','🥤','🍰','🍭',
    ]
  },
  {
    // Juguetes: sustituidos 🪆(U+1FA86)→🎎, 🪁(U+1FA80)→🏹, 🪃(U+1FA83)→🥏, 🛼(U+1F6FC)→🛹→🛴, 🪀(U+1FA80)→🎯
    titulo: '🧸 Juguetes y deportes',
    emojis: [
      '🧸','🎎','🎏','🏹','🥏','🎯',
      '⚽','🏀','🎾','🏈','⚾','🥊',
      '🚗','🚀','✈️','🚂','⛵','🏎️','🚁','🛸',
      '🎳','🏐','🏉','🎱',
    ]
  },
  {
    // Tiempo especial: sustituidos 🫂(U+1FAC2)→🤗, 🫖(U+1FAD6)→☕, 🧇(U+1F9C7)→🍳
    titulo: '💛 Tiempo especial',
    emojis: [
      '🛋️','😴','🛁','🧖','💅','🔮','📖','🎨',
      '🌙','🏠','👨‍👩‍👧','👨‍👩‍👦','🤗','🤝','💌','📸',
      '🌮','🥞','🍳','🍳','☕','🥛','🥤','🍵',
    ]
  },
];

// Campo oculto que recibe el emoji — se fija al abrir el picker
let pickerTargetId = null;

// Abre el picker universal apuntando al campo con id `targetInputId`
// y mostrando `emojiActual` como previsualización inicial
function abrirPicker(targetInputId, emojiActual) {
  pickerTargetId = targetInputId;
  document.getElementById('picker-preview').textContent = emojiActual || '😊';
  document.querySelectorAll('.picker-opcion').forEach(btn => {
    btn.classList.toggle('seleccionado', btn.dataset.emoji === (emojiActual || ''));
  });
  document.getElementById('modal-picker').classList.remove('hidden');
}

// Se llama al hacer click en un emoji del picker
function elegirEmoji(emoji, btn) {
  document.querySelectorAll('.picker-opcion').forEach(el => el.classList.remove('seleccionado'));
  btn.classList.add('seleccionado');
  document.getElementById('picker-preview').textContent = emoji;

  // Actualizar el campo destino y su botón de previsualización en el modal de origen
  if (pickerTargetId) {
    document.getElementById(pickerTargetId).value = emoji;
    const previewBtn = document.getElementById(pickerTargetId + '-preview-btn');
    if (previewBtn) previewBtn.textContent = emoji;
  }
}

// Construye el HTML del picker (se llama una sola vez al montar la app)
function modalPicker() {
  const categoriasHTML = EMOJI_CATEGORIAS.map(cat => `
    <div class="picker-cat-titulo">${cat.titulo}</div>
    <div class="picker-grid">
      ${cat.emojis.map(e => `
        <button class="picker-opcion" data-emoji="${e}" onclick="elegirEmoji('${e}', this)" type="button">${e}</button>
      `).join('')}
    </div>
  `).join('');

  return `
    <div id="modal-picker" class="modal-overlay hidden">
      <div class="modal-card modal-card-picker">
        <button class="modal-close" onclick="closeModal('modal-picker')">✕</button>
        <h3 class="modal-title">🎨 Elige un emoji</h3>
        <div class="picker-preview-wrap">
          <div id="picker-preview" class="picker-preview">😊</div>
          <button class="btn-primary picker-confirmar" onclick="closeModal('modal-picker')">✅ Confirmar</button>
        </div>
        <div class="picker-scroll">
          ${categoriasHTML}
        </div>
      </div>
    </div>`;
}

async function agregarHijo() {
  const nombre = document.getElementById('nuevo-hijo-nombre').value.trim();
  const avatar = document.getElementById("nuevo-hijo-avatar").value || "🧒";

  if (!nombre) return showToast('Escribe un nombre', 'error');

  const btn = document.querySelector('#modal-hijo .btn-primary');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  const { data, error } = await sb
    .from('perfiles_hijos')
    .insert({ nombre, avatar, user_id: currentUser.id })
    .select()
    .single();

  btn.disabled = false;
  btn.textContent = '✅ Guardar';

  if (error) {
    return showToast('Error: ' + error.message, 'error');
  }

  hijos.push(data);
  document.getElementById('nuevo-hijo-nombre').value = '';
  document.getElementById('nuevo-hijo-avatar').value = '🧒';
  document.getElementById('nuevo-hijo-avatar-preview-btn').textContent = '🧒';
  showToast('¡Hijo agregado! 🎉', 'success');
  closeModal('modal-hijo');
  renderSelectorHijos();
  seleccionarHijo(data.id);
}

async function agregarTarea() {
  const nombre = document.getElementById('nueva-tarea-nombre').value.trim();
  const icono = document.getElementById('nueva-tarea-icono').value || '⭐';
  const puntos = parseInt(document.getElementById('nueva-tarea-puntos').value) || 10;

  if (!nombre) return showToast('Escribe el nombre de la tarea', 'error');

  const btn = document.querySelector('#modal-tarea .btn-primary');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  const { data, error } = await sb.from('tareas_config').insert({
    nombre_tarea: nombre,
    icono,
    puntos_valor: puntos,
    hijo_id: hijoActivo.id,
    user_id: currentUser.id
  }).select().single();

  btn.disabled = false;
  btn.textContent = '✅ Guardar';

  if (error) {
    return showToast('Error al guardar tarea', 'error');
  }

  tareasConfig.push(data);
  document.getElementById('nueva-tarea-nombre').value = '';
  document.getElementById('nueva-tarea-icono').value = '⭐';
  document.getElementById('nueva-tarea-icono-preview-btn').textContent = '⭐';
  document.getElementById('nueva-tarea-puntos').value = '10';
  showToast('¡Tarea creada! ✅', 'success');
  closeModal('modal-tarea');
  renderDashboard();
}

async function agregarRecompensa() {
  const nombre = document.getElementById('nueva-recompensa-nombre').value.trim();
  const puntos = parseInt(document.getElementById('nueva-recompensa-puntos').value) || 50;
  const icono = document.getElementById('nueva-recompensa-icono').value || '🎁';

  if (!nombre) return showToast('Escribe el nombre del premio', 'error');

  const btn = document.querySelector('#modal-recompensa .btn-primary');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  const { data, error } = await sb.from('recompensas').insert({
    nombre_premio: nombre,
    puntos_necesarios: puntos,
    icono,
    hijo_id: hijoActivo.id,
    user_id: currentUser.id
  }).select().single();

  btn.disabled = false;
  btn.textContent = '✅ Guardar';

  if (error) {
    return showToast('Error al guardar', 'error');
  }

  recompensas.push(data);
  document.getElementById('nueva-recompensa-nombre').value = '';
  document.getElementById('nueva-recompensa-icono').value = '🎁';
  document.getElementById('nueva-recompensa-icono-preview-btn').textContent = '🎁';
  document.getElementById('nueva-recompensa-puntos').value = '50';
  showToast('¡Premio agregado! 🏆', 'success');
  closeModal('modal-recompensa');
  renderTienda();
}

async function canjearRecompensa(recompensaId) {
  const r = recompensas.find(x => x.id === recompensaId);
  if (!r || !hijoActivo) return;
  if (hijoActivo.puntos_acumulados < r.puntos_necesarios) return showToast('¡No tienes suficientes puntos! 😢', 'error');
  if (r.canjeado) return showToast('Este premio ya fue canjeado', 'error');

  await sb.from('recompensas').update({ canjeado: true }).eq('id', recompensaId);
  await actualizarPuntos(hijoActivo.id, -r.puntos_necesarios);
  await cargarHijos();
  await cargarRecompensas(hijoActivo.id);
  hijoActivo = hijos.find(h => h.id === hijoActivo.id);
  tocarSonidoTada();
  showToast('¡Premio canjeado! 🎉🎊', 'success');
  renderTienda();
}

async function eliminarTarea(tareaId) {
  if (!confirm('¿Eliminar esta tarea?')) return;
  await sb.from('tareas_config').delete().eq('id', tareaId);
  tareasConfig = tareasConfig.filter(t => t.id !== tareaId);
  await cargarRegistroSemana(hijoActivo.id);
  renderDashboard();
}

async function eliminarHijo(hijoId) {
  const hijo = hijos.find(h => h.id === hijoId);
  if (!hijo) return;
  if (!confirm(`¿Eliminar a ${hijo.nombre} y toda su información? Esta acción NO se puede deshacer.`)) return;

  // Borrar todos sus datos en cascada
  await sb.from('registro_diario').delete().eq('hijo_id', hijoId);
  await sb.from('tareas_config').delete().eq('hijo_id', hijoId);
  await sb.from('recompensas').delete().eq('hijo_id', hijoId);
  await sb.from('perfiles_hijos').delete().eq('id', hijoId);

  hijos = hijos.filter(h => h.id !== hijoId);

  if (hijoActivo?.id === hijoId) {
    hijoActivo = null;
    tareasConfig = [];
    registroSemana = [];
    recompensas = [];
  }

  showToast('¡Hijo eliminado! 🗑️', 'success');
  renderSelectorHijos();
  renderVista();
}

// ============================================================
// SELECCIÓN DE HIJO
// ============================================================

async function seleccionarHijo(hijoId) {
  hijoActivo = hijos.find(h => h.id === hijoId);
  if (!hijoActivo) return;

  await Promise.all([
    cargarTareas(hijoId),
    cargarRegistroSemana(hijoId),
    cargarRecompensas(hijoId)
  ]);

  renderSelectorHijos();
  renderVista();
}

// ============================================================
// RENDERIZADO PRINCIPAL
// ============================================================

function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="login-bg">
      <div class="login-card">
        <div class="login-logo">⭐</div>
        <h1 class="login-title">Normas para Niñ@s</h1>
        <p class="login-subtitle">El tablero de tareas y rutinas de tus peques</p>
        <div class="login-form">
          <input id="email-input" type="email" placeholder="Tu email" class="login-input"/>
          <button id="login-btn" onclick="login()" class="login-btn">
            📧 Enviar Magic Link
          </button>
        </div>
        <p class="login-note">Recibirás un enlace mágico en tu email</p>
      </div>
    </div>
  `;
}

function renderApp() {
  document.getElementById('app').innerHTML = `
    <div class="app-layout">
      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-logo">⭐ <span>Normas para Niñ@s</span></div>
        <nav class="sidebar-nav">
          <button class="nav-btn ${vistaActual === 'dashboard' ? 'active' : ''}" onclick="cambiarVista('dashboard')">📅 Semana</button>
          <button class="nav-btn ${vistaActual === 'estadisticas' ? 'active' : ''}" onclick="cambiarVista('estadisticas')">📊 Estadísticas</button>
          <button class="nav-btn ${vistaActual === 'tienda' ? 'active' : ''}" onclick="cambiarVista('tienda')">🏪 Tienda</button>
        </nav>
        <div class="sidebar-hijos">
          <div class="sidebar-hijos-title">Mis hijos</div>
          <div id="lista-hijos"></div>
          <button class="add-hijo-btn" onclick="openModal('modal-hijo')">+ Agregar hijo</button>
        </div>
        <button id="btn-musica" class="musica-btn musica-activa" onclick="toggleMusica()">🔊 Música</button>
        <button class="logout-btn" onclick="logout()">🚪 Salir</button>
      </aside>
      <!-- Main -->
      <main class="main-content" id="main-content">
        <div class="bienvenida-wrap">
          <div class="bienvenida-header">
            <div class="bienvenida-logo">⭐</div>
            <h2 class="bienvenida-titulo">Normas para Niñ@s</h2>
            <p class="bienvenida-sub">Tu tablero familiar de tareas y rutinas</p>
          </div>

          <div class="instrucciones-grid">

            <div class="instruccion-card">
              <div class="instruccion-num">1</div>
              <div class="instruccion-icono">🧒</div>
              <h3 class="instruccion-titulo">Añade a tus hijos</h3>
              <p class="instruccion-texto">Pulsa <strong>+ Agregar hijo</strong> en el menú izquierdo. Ponle un nombre y elige un avatar. Puedes añadir tantos niños como quieras y cambiar entre ellos en cualquier momento.</p>
            </div>

            <div class="instruccion-card">
              <div class="instruccion-num">2</div>
              <div class="instruccion-icono">📝</div>
              <h3 class="instruccion-titulo">Crea las tareas</h3>
              <p class="instruccion-texto">Desde la vista <strong>Semana</strong>, pulsa <strong>+ Nueva tarea</strong>. Dale un nombre, elige un icono y asígnale puntos. Por ejemplo: "Hacer la cama · 🛏️ · 10 puntos".</p>
            </div>

            <div class="instruccion-card">
              <div class="instruccion-num">3</div>
              <div class="instruccion-icono">😊</div>
              <h3 class="instruccion-titulo">Registra el cumplimiento</h3>
              <p class="instruccion-texto">Cada día pulsa la carita de cada tarea para marcar cómo ha ido: <strong>😊 bien</strong>, <strong>😐 regular</strong> o <strong>🙁 mal</strong>. Las caritas felices suman puntos automáticamente.</p>
            </div>

            <div class="instruccion-card">
              <div class="instruccion-num">4</div>
              <div class="instruccion-icono">🏆</div>
              <h3 class="instruccion-titulo">Crea premios</h3>
              <p class="instruccion-texto">En la <strong>Tienda</strong> puedes añadir premios con su coste en puntos. Cuando el niño acumule suficientes, pulsa <strong>¡Canjear!</strong> para reclamar su recompensa.</p>
            </div>

            <div class="instruccion-card">
              <div class="instruccion-num">5</div>
              <div class="instruccion-icono">📊</div>
              <h3 class="instruccion-titulo">Consulta las estadísticas</h3>
              <p class="instruccion-texto">En <strong>Estadísticas</strong> puedes ver el porcentaje de cumplimiento por semana, mes o año, con un gráfico de barras para ver la evolución a lo largo del tiempo.</p>
            </div>

            <div class="instruccion-card">
              <div class="instruccion-num">6</div>
              <div class="instruccion-icono">💡</div>
              <h3 class="instruccion-titulo">Consejos</h3>
              <p class="instruccion-texto">Implica al niño en crear las tareas y los premios — así se motiva más. Revisad juntos las estadísticas cada semana para celebrar los progresos. ¡La constancia es la clave!</p>
            </div>

          </div>

          <p class="bienvenida-flecha">👈 Selecciona un niño en el menú para empezar</p>
        </div>
      </main>
    </div>
    ${modalHijo()}
    ${modalTarea()}
    ${modalRecompensa()}
    ${modalPicker()}
  `;
  renderSelectorHijos();
  if (hijoActivo) renderVista();
  // Arrancar música de fondo (encendida por defecto)
  _musicaActiva = true;
  arrancarMusicaFondo();
}

function renderSelectorHijos() {
  const el = document.getElementById('lista-hijos');
  if (!el) return;
  el.innerHTML = hijos.map(h => `
    <div class="hijo-item ${hijoActivo?.id === h.id ? 'active' : ''}" onclick="seleccionarHijo('${h.id}')">
      <span class="hijo-avatar">${h.avatar || '🧒'}</span>
      <span class="hijo-nombre">${h.nombre}</span>
      <span class="hijo-puntos">${h.puntos_acumulados || 0}⭐</span>
      <button class="delete-hijo-btn" onclick="event.stopPropagation(); eliminarHijo('${h.id}')" title="Eliminar hijo">🗑️</button>
    </div>
  `).join('');
}

function cambiarVista(vista) {
  vistaActual = vista;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-btn[onclick="cambiarVista('${vista}')"]`)?.classList.add('active');
  renderVista();
}

function renderVista() {
  if (!hijoActivo) return;
  if (vistaActual === 'dashboard') renderDashboard();
  else if (vistaActual === 'estadisticas') renderEstadisticas();
  else if (vistaActual === 'tienda') renderTienda();
}

// ---- Dashboard Semanal ----
function renderDashboard() {
  const fechas = getFechasSemana();
  const hoy = new Date().toISOString().split('T')[0];
  const semanaStr = formatSemana(fechas);

  const header = `
    <div class="main-header">
      <div>
        <h2 class="main-title">${hijoActivo.avatar || '🧒'} ${hijoActivo.nombre}</h2>
        <p class="main-semana">${semanaStr}</p>
        <div class="semana-nav">
          <button class="btn-secondary" onclick="cambiarSemana(-1)" title="Semana anterior">⬅️</button>
          <button class="btn-secondary" onclick="resetSemana()" title="Semana actual">📅 Hoy</button>
          <button class="btn-secondary" onclick="cambiarSemana(1)" title="Semana siguiente" ${semanaSeleccionada ? '' : 'disabled'}>➡️</button>
        </div>
      </div>
      <div class="puntos-badge">⭐ ${hijoActivo.puntos_acumulados || 0} puntos</div>
    </div>
  `;

  if (tareasConfig.length === 0) {
    document.getElementById('main-content').innerHTML = header + `
      <div class="empty-state">
        <div style="font-size:3rem">📝</div>
        <p>No hay tareas todavía</p>
        <button class="btn-primary" onclick="openModal('modal-tarea')">+ Agregar primera tarea</button>
      </div>
    `;
    return;
  }

  const tabla = `
    <div class="tabla-wrapper">
      <table class="tabla-semanal">
        <thead>
          <tr>
            <th class="th-tarea">Tarea</th>
            ${fechas.map((f, i) => `
              <th class="th-dia ${f === hoy ? 'hoy' : ''}">
                <div class="dia-nombre">${DIAS[i]}</div>
                <div class="dia-fecha">${formatFecha(f)}</div>
              </th>
            `).join('')}
            <th class="th-accion"></th>
          </tr>
        </thead>
        <tbody>
          ${tareasConfig.map(t => `
            <tr class="fila-tarea">
              <td class="td-tarea">
                <span class="tarea-icono">${t.icono}</span>
                <span class="tarea-info">
                  <span class="tarea-nombre">${t.nombre_tarea}</span>
                  <span class="tarea-creada">Desde ${formatFechaLarga(t.created_at)}</span>
                </span>
                <span class="tarea-puntos">+${t.puntos_valor}⭐</span>
              </td>
              ${fechas.map(f => {
                const reg = registroSemana.find(r => r.tarea_id === t.id && r.fecha === f);
                const estado = reg ? reg.completado : null;
                const tipo = estado === true ? 'feliz' : estado === false ? 'triste' : 'neutra';
                const cls = estado === true ? 'celda-feliz' : estado === false ? 'celda-triste' : 'celda-vacia';
                return `<td class="td-dia"><button class="carita-btn ${cls}" onclick="handleToggleTarea('${t.id}','${f}',${JSON.stringify(estado)}, this)" title="${f}">${svgCarita(tipo)}</button></td>`;
              }).join('')}
              <td class="td-accion"><button class="delete-btn" onclick="eliminarTarea('${t.id}')" title="Eliminar">🗑️</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <button class="btn-primary mt-1" onclick="openModal('modal-tarea')">+ Nueva tarea</button>
  `;

  document.getElementById('main-content').innerHTML = header + tabla;
}

// ============================================================
// ESTADÍSTICAS — helpers de período
// ============================================================

function toLocalISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDiasMes(anio, mes) {
  // Devuelve array de strings YYYY-MM-DD para todos los días del mes (mes 0-indexed)
  const total = new Date(anio, mes + 1, 0).getDate();
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(anio, mes, i + 1);
    return toLocalISO(d);
  });
}

function getMesesAnio(anio) {
  // Devuelve array de { label, fechaInicio, fechaFin } para los 12 meses
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return Array.from({ length: 12 }, (_, i) => {
    const inicio = toLocalISO(new Date(anio, i, 1));
    const fin    = toLocalISO(new Date(anio, i + 1, 0));
    return { label: MESES[i], mes: i, inicio, fin };
  });
}

async function cargarRegistroStats() {
  const MESES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  let fechaInicio, fechaFin, tituloperiodo;

  if (statsPeriodo === 'semana') {
    const fechas = getFechasSemana();
    fechaInicio = fechas[0];
    fechaFin    = fechas[6];
    tituloperiodo = formatSemana(fechas);
  } else if (statsPeriodo === 'mes') {
    const hoy = new Date();
    const ref  = statsMesSeleccionado || new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    fechaInicio = toLocalISO(new Date(ref.getFullYear(), ref.getMonth(), 1));
    fechaFin    = toLocalISO(new Date(ref.getFullYear(), ref.getMonth() + 1, 0));
    tituloperiodo = `${MESES_ES[ref.getMonth()]} ${ref.getFullYear()}`;
  } else {
    const anio  = statsAnioSeleccionado || new Date().getFullYear();
    fechaInicio = `${anio}-01-01`;
    fechaFin    = `${anio}-12-31`;
    tituloperiodo = `${anio}`;
  }

  const { data, error } = await sb.from('registro_diario')
    .select('*')
    .eq('hijo_id', hijoActivo.id)
    .gte('fecha', fechaInicio)
    .lte('fecha', fechaFin);

  registroStats = error ? [] : (data || []);
  return { fechaInicio, fechaFin, tituloperiodo };
}

// Genera el HTML del desplegable de período
function htmlSelectPeriodo() {
  const hoy     = new Date();
  const anioAct = hoy.getFullYear();
  const MESES   = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  // Opciones de mes: últimos 24 meses
  let opcionesMes = '';
  for (let i = 0; i < 24; i++) {
    const d    = new Date(anioAct, hoy.getMonth() - i, 1);
    const val  = `mes_${d.getFullYear()}_${d.getMonth()}`;
    const sel  = statsPeriodo === 'mes' &&
                 statsMesSeleccionado &&
                 statsMesSeleccionado.getFullYear() === d.getFullYear() &&
                 statsMesSeleccionado.getMonth()    === d.getMonth() ? 'selected' : '';
    const selAct = statsPeriodo === 'mes' && !statsMesSeleccionado && i === 0 ? 'selected' : '';
    opcionesMes += `<option value="${val}" ${sel || selAct}>${MESES[d.getMonth()]} ${d.getFullYear()}</option>`;
  }

  // Opciones de año: últimos 5 años
  let opcionesAnio = '';
  for (let i = 0; i < 5; i++) {
    const a   = anioAct - i;
    const val = `anio_${a}`;
    const sel = statsPeriodo === 'anio' &&
                ((statsAnioSeleccionado === a) || (!statsAnioSeleccionado && i === 0)) ? 'selected' : '';
    opcionesAnio += `<option value="${val}" ${sel}>${a}</option>`;
  }

  const valSemana = statsPeriodo === 'semana' ? 'selected' : '';

  return `
    <select class="stats-periodo-select" onchange="cambiarPeriodoStats(this.value)">
      <optgroup label="── Semana ──">
        <option value="semana" ${valSemana}>Semana actual</option>
      </optgroup>
      <optgroup label="── Mes ──">
        ${opcionesMes}
      </optgroup>
      <optgroup label="── Año ──">
        ${opcionesAnio}
      </optgroup>
    </select>`;
}

async function cambiarPeriodoStats(valor) {
  if (valor === 'semana') {
    statsPeriodo = 'semana';
    statsMesSeleccionado  = null;
    statsAnioSeleccionado = null;
  } else if (valor.startsWith('mes_')) {
    const [, anio, mes] = valor.split('_');
    statsPeriodo = 'mes';
    statsMesSeleccionado  = new Date(parseInt(anio), parseInt(mes), 1);
    statsAnioSeleccionado = null;
  } else if (valor.startsWith('anio_')) {
    statsPeriodo = 'anio';
    statsAnioSeleccionado = parseInt(valor.split('_')[1]);
    statsMesSeleccionado  = null;
  }
  await renderEstadisticas();
}

// ---- Estadísticas ----
async function renderEstadisticas() {
  // Mostrar spinner mientras carga
  const mc = document.getElementById('main-content');
  const MESES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  const { tituloperiodo } = await cargarRegistroStats();

  const puntos = hijoActivo.puntos_acumulados || 0;
  const totalTareas = tareasConfig.length;

  // ---- Calcular datos según período ----
  let pctGlobal = 0, completadosTotal = 0, posiblesTotal = 0;
  let barsHTML = '';

  if (statsPeriodo === 'semana') {
    const fechas = getFechasSemana();
    posiblesTotal   = totalTareas * 7;
    completadosTotal = registroStats.filter(r => r.completado === true).length;
    pctGlobal = posiblesTotal > 0 ? Math.round((completadosTotal / posiblesTotal) * 100) : 0;

    barsHTML = fechas.map((f, i) => {
      const comp = registroStats.filter(r => r.fecha === f && r.completado === true).length;
      const pct  = totalTareas > 0 ? Math.round((comp / totalTareas) * 100) : 0;
      return `
        <div class="bar-col">
          <div class="bar-label-top">${pct}%</div>
          <div class="bar-wrap"><div class="bar-fill" style="height:${pct}%"></div></div>
          <div class="bar-label">${DIAS[i]}</div>
          <div class="bar-sub">${comp}/${totalTareas}</div>
        </div>`;
    }).join('');

  } else if (statsPeriodo === 'mes') {
    const ref  = statsMesSeleccionado || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const dias = getDiasMes(ref.getFullYear(), ref.getMonth());
    posiblesTotal    = totalTareas * dias.length;
    completadosTotal = registroStats.filter(r => r.completado === true).length;
    pctGlobal = posiblesTotal > 0 ? Math.round((completadosTotal / posiblesTotal) * 100) : 0;

    // Agrupar por semanas ISO dentro del mes para no generar 31 barras
    // Semanas: grupos de 7 días naturales del mes
    const grupos = [];
    for (let i = 0; i < dias.length; i += 7) {
      grupos.push(dias.slice(i, i + 7));
    }

    barsHTML = grupos.map((semana, idx) => {
      const comp = registroStats.filter(r => semana.includes(r.fecha) && r.completado === true).length;
      const pos  = totalTareas * semana.length;
      const pct  = pos > 0 ? Math.round((comp / pos) * 100) : 0;
      const ini  = semana[0].slice(8);         // día inicio
      const fin  = semana[semana.length - 1].slice(8); // día fin
      return `
        <div class="bar-col">
          <div class="bar-label-top">${pct}%</div>
          <div class="bar-wrap"><div class="bar-fill" style="height:${pct}%"></div></div>
          <div class="bar-label">S${idx + 1}</div>
          <div class="bar-sub">${ini}-${fin}</div>
        </div>`;
    }).join('');

  } else {
    // Año
    const anio   = statsAnioSeleccionado || new Date().getFullYear();
    const meses  = getMesesAnio(anio);
    posiblesTotal    = totalTareas * 365;
    completadosTotal = registroStats.filter(r => r.completado === true).length;
    pctGlobal = posiblesTotal > 0 ? Math.round((completadosTotal / posiblesTotal) * 100) : 0;

    barsHTML = meses.map(m => {
      const diasMes = getDiasMes(anio, m.mes);
      const comp    = registroStats.filter(r => diasMes.includes(r.fecha) && r.completado === true).length;
      const pos     = totalTareas * diasMes.length;
      const pct     = pos > 0 ? Math.round((comp / pos) * 100) : 0;
      return `
        <div class="bar-col">
          <div class="bar-label-top">${pct}%</div>
          <div class="bar-wrap"><div class="bar-fill" style="height:${pct}%"></div></div>
          <div class="bar-label">${m.label}</div>
          <div class="bar-sub">${comp}/${pos}</div>
        </div>`;
    }).join('');
  }

  const labelPeriodo = statsPeriodo === 'semana' ? 'Esta semana'
    : statsPeriodo === 'mes' ? 'Este mes' : 'Este año';

  mc.innerHTML = `
    <div class="main-header">
      <div><h2 class="main-title">📊 Estadísticas</h2></div>
    </div>

    <!-- ── Resumen global del niño — protagonista ── -->
    <div class="stats-global-banner">
      <div class="stats-global-avatar">${hijoActivo.avatar || '🧒'}</div>
      <div class="stats-global-nombre">${hijoActivo.nombre}</div>
      <div class="stats-global-datos">
        <div class="stats-global-item">
          <div class="stats-global-valor">${puntos}</div>
          <div class="stats-global-label">⭐ puntos acumulados</div>
        </div>
        <div class="stats-global-sep"></div>
        <div class="stats-global-item">
          <div class="stats-global-valor">${totalTareas}</div>
          <div class="stats-global-label">📝 tareas activas</div>
        </div>
      </div>
    </div>

    <!-- ── Análisis por período ── -->
    <div class="stats-seccion-label" style="margin-top:1.75rem">Análisis por período</div>

    <div class="stats-periodo-wrap">
      ${htmlSelectPeriodo()}
      <span class="stats-periodo-label">${tituloperiodo}</span>
    </div>

    <div class="stats-grid stats-grid-periodo">
      <div class="stat-card accent">
        <div class="stat-icon">${statsPeriodo === 'semana' ? '📅' : statsPeriodo === 'mes' ? '🗓️' : '📆'}</div>
        <div class="stat-label">${labelPeriodo}</div>
        <div class="stat-valor">${pctGlobal}%</div>
        <div class="stat-sub">${completadosTotal} de ${posiblesTotal} completadas</div>
        <div class="stat-bar"><div class="stat-fill" style="width:${pctGlobal}%"></div></div>
      </div>
    </div>

    <div class="chart-card">
      <h3 class="chart-title">
        ${statsPeriodo === 'semana' ? 'Cumplimiento diario' : statsPeriodo === 'mes' ? 'Cumplimiento por semana' : 'Cumplimiento por mes'}
        — ${tituloperiodo}
      </h3>
      <div class="bar-chart ${statsPeriodo === 'anio' ? 'bar-chart-anio' : ''}">
        ${barsHTML}
      </div>
    </div>
  `;
}

// ---- Tienda ----
function renderTienda() {
  const puntos = hijoActivo.puntos_acumulados || 0;
  document.getElementById('main-content').innerHTML = `
    <div class="main-header">
      <div>
        <h2 class="main-title">🏪 Tienda de Premios</h2>
        <p class="main-subtitle">${hijoActivo.avatar || '🧒'} ${hijoActivo.nombre}</p>
      </div>
      <div class="puntos-badge">⭐ ${puntos} puntos disponibles</div>
    </div>

    ${recompensas.length === 0 ? `
      <div class="empty-state">
        <div style="font-size:3rem">🏆</div>
        <p>No hay premios todavía</p>
        <button class="btn-primary" onclick="openModal('modal-recompensa')">+ Agregar primer premio</button>
      </div>
    ` : `
      <div class="tienda-grid">
        ${recompensas.map(r => {
          const puedeComprar = puntos >= r.puntos_necesarios && !r.canjeado;
          return `
            <div class="premio-card ${r.canjeado ? 'canjeado' : ''} ${puedeComprar ? 'disponible' : ''}">
              <div class="premio-icono">${r.icono}</div>
              <div class="premio-nombre">${r.nombre_premio}</div>
              <div class="premio-puntos">⭐ ${r.puntos_necesarios} puntos</div>
              ${r.canjeado
                ? '<div class="premio-badge canjeado-badge">✅ Canjeado</div>'
                : puedeComprar
                  ? `<button class="btn-canjear" onclick="canjearRecompensa('${r.id}')">🎁 ¡Canjear!</button>`
                  : `<div class="premio-falta">Faltan ${r.puntos_necesarios - puntos}⭐</div>`
              }
            </div>
          `;
        }).join('')}
      </div>
      <button class="btn-primary mt-1" onclick="openModal('modal-recompensa')">+ Nuevo premio</button>
    `}
  `;
}

// ============================================================
// MODALES
// ============================================================

function modalHijo() {
  return `
    <div id="modal-hijo" class="modal-overlay hidden">
      <div class="modal-card">
        <button class="modal-close" onclick="closeModal('modal-hijo')">✕</button>
        <h3 class="modal-title">🧒 Agregar hijo</h3>
        <input id="nuevo-hijo-nombre" type="text" placeholder="Nombre del niño/a" class="modal-input"/>
        <div class="emoji-field-wrap">
          <span class="emoji-field-label">Avatar</span>
          <button id="nuevo-hijo-avatar-preview-btn" class="emoji-field-btn" type="button"
            onclick="abrirPicker('nuevo-hijo-avatar', document.getElementById('nuevo-hijo-avatar').value || '🧒')">
            🧒
          </button>
          <input id="nuevo-hijo-avatar" type="hidden" value="🧒"/>
        </div>
        <button class="btn-primary" onclick="agregarHijo()">✅ Guardar</button>
      </div>
    </div>`;
}

function modalTarea() {
  return `
    <div id="modal-tarea" class="modal-overlay hidden">
      <div class="modal-card">
        <button class="modal-close" onclick="closeModal('modal-tarea')">✕</button>
        <h3 class="modal-title">📝 Nueva Tarea</h3>
        <input id="nueva-tarea-nombre" type="text" placeholder="Nombre de la tarea" class="modal-input"/>
        <div class="emoji-field-wrap">
          <span class="emoji-field-label">Icono</span>
          <button id="nueva-tarea-icono-preview-btn" class="emoji-field-btn" type="button"
            onclick="abrirPicker('nueva-tarea-icono', document.getElementById('nueva-tarea-icono').value || '⭐')">
            ⭐
          </button>
          <input id="nueva-tarea-icono" type="hidden" value="⭐"/>
        </div>
        <input id="nueva-tarea-puntos" type="number" placeholder="Puntos (ej: 10)" class="modal-input" min="1" value="10"/>
        <div style="font-size:.8rem;font-weight:700;color:var(--c-muted);margin-top:-.5rem;padding-left:.25rem;">⭐ Puntos que gana el niño al completar esta tarea</div>
        <button class="btn-primary" onclick="agregarTarea()">✅ Guardar</button>
      </div>
    </div>`;
}

function modalRecompensa() {
  return `
    <div id="modal-recompensa" class="modal-overlay hidden">
      <div class="modal-card">
        <button class="modal-close" onclick="closeModal('modal-recompensa')">✕</button>
        <h3 class="modal-title">🏆 Nuevo Premio</h3>
        <input id="nueva-recompensa-nombre" type="text" placeholder="Nombre del premio" class="modal-input"/>
        <div class="emoji-field-wrap">
          <span class="emoji-field-label">Icono</span>
          <button id="nueva-recompensa-icono-preview-btn" class="emoji-field-btn" type="button"
            onclick="abrirPicker('nueva-recompensa-icono', document.getElementById('nueva-recompensa-icono').value || '🎁')">
            🎁
          </button>
          <input id="nueva-recompensa-icono" type="hidden" value="🎁"/>
        </div>
        <input id="nueva-recompensa-puntos" type="number" placeholder="Puntos necesarios" class="modal-input" min="1" value="50"/>
        <button class="btn-primary" onclick="agregarRecompensa()">✅ Guardar</button>
      </div>
    </div>`;
}

function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

// ============================================================
// TOAST
// ============================================================

function showToast(msg, tipo = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${tipo}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

// ============================================================
// NAVEGACIÓN SEMANAL
// ============================================================

async function cambiarSemana(delta) {
  const lunesActual = semanaSeleccionada || getLunesDeEstaSemana();
  const nuevoLunes = new Date(lunesActual);
  nuevoLunes.setDate(lunesActual.getDate() + (delta * 7));

  if (nuevoLunes.getFullYear() < 2000) {
    return showToast('No se puede navegar antes del año 2000', 'error');
  }

  semanaSeleccionada = nuevoLunes;
  await cargarRegistroSemana(hijoActivo.id);
  renderDashboard();
}

async function resetSemana() {
  semanaSeleccionada = null;
  await cargarRegistroSemana(hijoActivo.id);
  renderDashboard();
}

// ============================================================
// INIT
// ============================================================

async function init() {
  // Comprobar si hay una sesión activa al cargar la página
  const { data: { session } } = await sb.auth.getSession();

  if (session?.user) {
    currentUser = session.user;
    await cargarHijos();
    renderApp();
  } else {
    renderLogin();
  }

  // Escuchar cambios de sesión (login con magic link, logout, refresco de token...)
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      // Si ya había un usuario logueado es un refresco de token (ej: volver a la pestaña).
      // En ese caso solo actualizamos currentUser sin redibujar toda la app.
      if (currentUser) {
        currentUser = session.user;
        return;
      }
      // Primera vez que el usuario inicia sesión: cargar datos y renderizar.
      currentUser = session.user;
      await cargarHijos();
      renderApp();
      showToast('✅ ¡Bienvenido!', 'success');
    } else if (event === 'SIGNED_OUT') {
      // Parar música de fondo al cerrar sesión
      if (_musicaFondo) { _musicaFondo.pause(); _musicaFondo.currentTime = 0; }
      _musicaActiva = false;
      currentUser = null;
      hijoActivo = null;
      hijos = [];
      tareasConfig = [];
      registroSemana = [];
      recompensas = [];
      renderLogin();
    }
  });
}

init();