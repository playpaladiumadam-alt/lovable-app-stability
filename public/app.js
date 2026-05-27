/* ===================== PARTICLE ENGINE ===================== */
(function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  const COLORS = ['rgba(0,212,168,', 'rgba(14,165,233,', 'rgba(139,92,246,'];

  function createParticle() {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.4 + 0.3,
      dx: (Math.random() - 0.5) * 0.25,
      dy: (Math.random() - 0.5) * 0.25,
      alpha: Math.random() * 0.5 + 0.1,
      color,
    };
  }

  function initParticlesArr() {
    particles = [];
    const count = Math.min(Math.floor((W * H) / 12000), 120);
    for (let i = 0; i < count; i++) particles.push(createParticle());
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color + p.alpha + ')';
      ctx.fill();

      p.x += p.dx;
      p.y += p.dy;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;
    }
    requestAnimationFrame(draw);
  }

  resize();
  initParticlesArr();
  draw();
  window.addEventListener('resize', () => { resize(); initParticlesArr(); });
})();

/* ===================== GLOBALS ===================== */
const grid       = document.getElementById('grid');
const empty      = document.getElementById('empty');
const refreshBtn = document.getElementById('refreshBtn');
const modal      = document.getElementById('modal');
const modalClose = modal.querySelector('.modal-close');
const modalBackdrop = modal.querySelector('.modal-backdrop');
const modalHeroBody  = document.getElementById('modalHeroBody');
const modalStatsBody = document.getElementById('modalStatsBody');
const sidebarList    = document.getElementById('sidebarLiveMatchesList');

let MATCHES      = [];
let currentFilter = 'all';
let searchText   = '';
let openMatchUrl = null;

/* ===================== UTILS ===================== */
function hueFrom(str) {
  let h = 0;
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}
function colorPair(home, away) {
  const h1 = hueFrom(home);
  const h2 = (hueFrom(away) + 60) % 360;
  return [`hsl(${h1} 65% 40%)`, `hsl(${h2} 65% 35%)`];
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function getLogoHtml(logoUrl, teamName) {
  const initials = (teamName || '??')
    .split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  const isDefault = !logoUrl || logoUrl.includes('icon_team_def') || !logoUrl.trim();
  if (isDefault) return `<div class="logo-fallback">${initials}</div>`;
  return `
    <img src="${escapeHtml(logoUrl)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
    <div class="logo-fallback" style="display:none;">${initials}</div>
  `;
}

function isFavorited(id) {
  return JSON.parse(localStorage.getItem('fav_matches') || '[]').includes(id);
}
function toggleFavorite(id) {
  let favs = JSON.parse(localStorage.getItem('fav_matches') || '[]');
  favs = favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id];
  localStorage.setItem('fav_matches', JSON.stringify(favs));
}

/* ===================== CARD TEMPLATE ===================== */
function matchCard(m, isFeatured = false) {
  const dateStr = m.time ? `Aujourd'hui · ${escapeHtml(m.time)}` : 'Horaire à définir';
  const statusBadge = m.isLive
    ? `<span class="live-pill">🔴 ${m.minute ? `${escapeHtml(m.minute)}'` : 'Direct'}</span>`
    : `<span class="upcoming-pill">⏰ À venir</span>`;

  const scoreHTML = (m.score.home !== null && m.score.away !== null)
    ? `<div class="score-display"><span class="score-num">${m.score.home}</span><span class="score-colon">:</span><span class="score-num">${m.score.away}</span></div>`
    : `<div class="score-display vs">VS</div>`;

  const isFav = isFavorited(m.id);
  const featuredPill = isFeatured ? `<div class="featured-badge">⚡ Featured</div>` : '';

  return `
  <article class="card ${isFeatured ? 'featured' : ''}" data-id="${escapeHtml(m.id)}">
    <div class="card-header-row">
      <div class="card-league-info">
        ${m.leagueLogo ? `<img src="${escapeHtml(m.leagueLogo)}" class="card-league-logo" onerror="this.style.display='none'"/>` : ''}
        <span class="card-league-name">${escapeHtml(m.league || 'Football')}</span>
      </div>
      <div class="card-header-right">
        ${statusBadge}
        <button class="fav-toggle-btn ${isFav ? 'active' : ''}" type="button" aria-label="Favoris">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </button>
      </div>
    </div>
    <div class="card-date-sub">${dateStr}</div>
    ${featuredPill}
    <div class="card-match-main">
      <div class="card-team left" title="${escapeHtml(m.home.name)}">
        <div class="card-logo-container">${getLogoHtml(m.home.logo, m.home.name)}</div>
        <span class="card-team-name">${escapeHtml(m.home.name)}</span>
      </div>
      ${scoreHTML}
      <div class="card-team right" title="${escapeHtml(m.away.name)}">
        <div class="card-logo-container">${getLogoHtml(m.away.logo, m.away.name)}</div>
        <span class="card-team-name">${escapeHtml(m.away.name)}</span>
      </div>
    </div>
    <div class="card-action-btn-row">
      <button class="open card-watch-btn" type="button">▶ Regarder</button>
    </div>
  </article>`;
}

/* ===================== SKELETON ===================== */
function showSkeletons(n = 8) {
  empty.style.display = 'none';
  grid.innerHTML = Array.from({ length: n })
    .map(() => `<div class="sk sk-card"></div>`).join('');
}

/* ===================== RENDER ===================== */
function renderMatches() {
  let filtered = MATCHES;
  if (currentFilter === 'live')      filtered = filtered.filter(m => m.isLive);
  else if (currentFilter === 'upcoming') filtered = filtered.filter(m => !m.isLive);
  else if (currentFilter === 'favorites') filtered = filtered.filter(m => isFavorited(m.id));

  if (searchText) {
    filtered = filtered.filter(m =>
      (m.home?.name || '').toLowerCase().includes(searchText) ||
      (m.away?.name || '').toLowerCase().includes(searchText) ||
      (m.league || '').toLowerCase().includes(searchText) ||
      (m.country || '').toLowerCase().includes(searchText)
    );
  }

  const featuredMatch = MATCHES.find(m => m.isLive) || MATCHES[0];

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
  } else {
    empty.style.display = 'none';
    grid.innerHTML = filtered.map(m => {
      const isFeatured = featuredMatch && m.id === featuredMatch.id && currentFilter !== 'favorites';
      return matchCard(m, isFeatured);
    }).join('');
  }
}

/* ===================== LOAD MATCHES ===================== */
async function loadMatches() {
  if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.classList.add('loading'); }

  try {
    const res = await fetch('/api/matches', { cache: 'no-store' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Erreur');

    data.matches.sort((a, b) => (b.isLive - a.isLive) || String(a.time).localeCompare(String(b.time)));
    MATCHES = data.matches;

    const live = MATCHES.filter(m => m.isLive).length;
    const liveEl = document.getElementById('liveMatchesCount');
    const totalEl = document.getElementById('totalMatchesCount');
    const headerEl = document.getElementById('headerLiveCount');
    if (liveEl)   liveEl.textContent  = live;
    if (totalEl)  totalEl.textContent = MATCHES.length;
    if (headerEl) headerEl.textContent = live;

    renderMatches();
    updateSidebarLiveMatches();
  } catch (e) {
    console.error('Error loading matches:', e);
  } finally {
    if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.classList.remove('loading'); }
  }
}

/* ===================== MODAL ===================== */
function openModal(m) {
  openMatchUrl = m.url;
  const [c1, c2] = colorPair(m.home.name || 'A', m.away.name || 'B');

  const scoreHTML = (m.score.home !== null && m.score.away !== null)
    ? `<div class="mscore"><span>${m.score.home}</span><i>:</i><span>${m.score.away}</span></div>`
    : `<div class="mscore vs">VS</div>`;

  const statusHTML = m.isLive
    ? `<span class="mstate live"><span class="ldot"></span>LIVE${m.minute ? ` · ${escapeHtml(m.minute)}'` : ''}</span>`
    : `<span class="mstate">${escapeHtml(m.time || 'À venir')}</span>`;

  modalHeroBody.innerHTML = `
    <div class="mhero" style="--c1:${c1};--c2:${c2}">
      <div class="mhero-mesh"></div>
      ${m.league ? `<div class="mleague">${m.leagueLogo ? `<img src="${escapeHtml(m.leagueLogo)}" style="width:14px;height:14px;vertical-align:middle;margin-right:6px;border-radius:2px;" onerror="this.style.display='none'"/>` : ''}${escapeHtml(m.league)}</div>` : ''}
      <div class="mteams">
        <div class="mteam">
          <div class="mlogo">${getLogoHtml(m.home.logo, m.home.name)}</div>
          <div class="mname">${escapeHtml(m.home.name)}</div>
        </div>
        ${scoreHTML}
        <div class="mteam">
          <div class="mlogo">${getLogoHtml(m.away.logo, m.away.name)}</div>
          <div class="mname">${escapeHtml(m.away.name)}</div>
        </div>
      </div>
      <div class="mstatus">${statusHTML}</div>
    </div>
  `;

  modalStatsBody.innerHTML = `
    <div class="msection" id="mDetailLoad">
      <div class="mload"><span></span><span></span><span></span></div>
      <p>Chargement des flux et statistiques…</p>
    </div>
  `;

  const playerWrapper = document.getElementById('mPlayerWrapper');
  if (playerWrapper) {
    playerWrapper.innerHTML = `
      <div style="aspect-ratio:16/9;background:#020617;border-radius:14px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.3);font-size:13px;letter-spacing:0.06em;text-transform:uppercase;gap:10px;">
        <span style="display:inline-block;width:8px;height:8px;background:#00d4a8;border-radius:50%;animation:pulseGreen 1.2s infinite;"></span>
        Chargement du flux…
      </div>`;
  }

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  updateSidebarLiveMatches();

  fetch('/api/match?url=' + encodeURIComponent(m.url))
    .then(r => r.json())
    .then(d => {
      const box = document.getElementById('mDetailLoad');
      if (!d.ok) {
        if (box) box.innerHTML = `<p class="err">Détails indisponibles.</p>`;
        return;
      }
      const det = d.detail || {};
      if (det.streamUrl && playerWrapper) {
        playerWrapper.innerHTML = `
          <div class="mplayer-container">
            <iframe src="/proxy-player?url=${encodeURIComponent(det.streamUrl)}" allow="autoplay; encrypted-media; fullscreen" allowfullscreen="true" referrerpolicy="no-referrer"></iframe>
            <a href="https://discord.gg/Qazbbb7ub9" target="_blank" class="modal-discord-float" title="Discord">
              <img src="/discord_btn.png" alt="Discord" />
            </a>
          </div>`;
      } else if (playerWrapper) {
        playerWrapper.innerHTML = `
          <div style="aspect-ratio:16/9;background:#020617;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:rgba(255,255,255,0.3);font-size:13px;gap:10px;">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity:0.4;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>Aucune diffusion disponible pour ce match.</span>
          </div>`;
      }
      const stats  = (det.stats  || []).map(s => `<li>${escapeHtml(s)}</li>`).join('');
      const events = (det.events || []).map(s => `<li>${escapeHtml(s)}</li>`).join('');
      if (box) {
        box.outerHTML = `
          <div class="mcols">
            <div class="mcol">
              <h3>Statistiques</h3>
              ${stats  ? `<ul class="mlist">${stats}</ul>`  : `<p class="muted">Aucune statistique.</p>`}
            </div>
            <div class="mcol">
              <h3>Événements</h3>
              ${events ? `<ul class="mlist">${events}</ul>` : `<p class="muted">Aucun événement.</p>`}
            </div>
          </div>`;
      }
    })
    .catch(() => {
      const box = document.getElementById('mDetailLoad');
      if (box) box.innerHTML = `<p class="err">Erreur de chargement.</p>`;
    });
}

function updateSidebarLiveMatches() {
  if (!sidebarList) return;
  const live = MATCHES.filter(m => m.isLive);
  if (live.length === 0) {
    sidebarList.innerHTML = `<p class="muted" style="text-align:center;margin-top:20px;font-size:11px;">Aucun match en direct.</p>`;
    return;
  }
  sidebarList.innerHTML = live.map(m => {
    const active = m.url === openMatchUrl ? 'active' : '';
    return `
      <div class="sidebar-item ${active}" data-url="${escapeHtml(m.url)}">
        <div class="sidebar-item-teams">${escapeHtml(m.home.name)} - ${escapeHtml(m.away.name)}</div>
        <div class="sidebar-item-meta">
          <span class="sidebar-item-live"><span class="pulse-dot"></span>LIVE</span>
          <span>${(m.score.home !== null && m.score.away !== null) ? `${m.score.home}:${m.score.away}` : 'VS'}</span>
        </div>
      </div>`;
  }).join('');
}

function closeModal() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  const pw = document.getElementById('mPlayerWrapper');
  if (pw) pw.innerHTML = '';
  openMatchUrl = null;
}

modalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

if (sidebarList) {
  sidebarList.addEventListener('click', e => {
    const item = e.target.closest('.sidebar-item');
    if (!item) return;
    const match = MATCHES.find(x => x.url === item.dataset.url);
    if (match && match.url !== openMatchUrl) openModal(match);
  });
}

/* ===================== GRID CLICK ===================== */
grid.addEventListener('click', e => {
  const favBtn = e.target.closest('.fav-toggle-btn');
  if (favBtn) {
    e.preventDefault(); e.stopPropagation();
    const id = favBtn.closest('.card').dataset.id;
    toggleFavorite(id);
    favBtn.classList.toggle('active');
    if (currentFilter === 'favorites') renderMatches();
    return;
  }
  const card = e.target.closest('.card');
  if (!card) return;
  e.preventDefault();
  const m = MATCHES.find(x => x.id === card.dataset.id);
  if (m) openModal(m);
});

/* ===================== FILTER BUTTONS ===================== */
const filterBtns = document.querySelectorAll('.filter-btn');
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderMatches();
    syncSidebarActive(currentFilter);
  });
});

/* ===================== LEFT SIDEBAR (3 icons) ===================== */
const sidebarIcons = document.querySelectorAll('.app-sidebar .sidebar-icon:not(.logout)');

function syncSidebarActive(filter) {
  sidebarIcons.forEach(i => i.classList.remove('active'));
  if      (filter === 'all')       sidebarIcons[0]?.classList.add('active');
  else if (filter === 'live')      sidebarIcons[1]?.classList.add('active');
  else if (filter === 'favorites') sidebarIcons[2]?.classList.add('active');
}

sidebarIcons.forEach((icon, idx) => {
  icon.addEventListener('click', e => {
    e.preventDefault();
    const filterMap = ['all', 'live', 'favorites'];
    const f = filterMap[idx];
    if (!f) return;
    currentFilter = f;
    renderMatches();
    syncSidebarActive(f);
    filterBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.filter === f);
    });
  });
});

/* ===================== SEARCH ===================== */
const searchInput = document.getElementById('searchInput');
if (searchInput) {
  searchInput.addEventListener('input', e => {
    searchText = e.target.value.toLowerCase().trim();
    renderMatches();
  });
}

if (refreshBtn) refreshBtn.addEventListener('click', loadMatches);

/* ===================== DISCORD POPUP ===================== */
const discordPopup     = document.getElementById('discordPopup');
const closeDiscordBtn  = document.getElementById('closeDiscordPopup');
const joinDiscordBtn   = document.getElementById('joinDiscordBtn');

if (discordPopup && !localStorage.getItem('discord_popup_dismissed')) {
  setTimeout(() => {
    if (!openMatchUrl) {
      discordPopup.classList.add('open');
      discordPopup.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
  }, 1800);
}

function dismissDiscordPopup() {
  if (!discordPopup) return;
  discordPopup.classList.remove('open');
  discordPopup.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  localStorage.setItem('discord_popup_dismissed', 'true');
}

closeDiscordBtn?.addEventListener('click', dismissDiscordPopup);
joinDiscordBtn?.addEventListener('click', dismissDiscordPopup);
discordPopup?.querySelector('.modal-backdrop')?.addEventListener('click', dismissDiscordPopup);

/* ===================== AUTO-REFRESH ===================== */
setInterval(() => { if (!openMatchUrl) loadMatches(); }, 30000);

/* ===================== FAQ ACCORDION ===================== */
function initFaq() {
  document.querySelectorAll('.faq-item').forEach(item => {
    const btn = item.querySelector('.faq-question');
    const ans = item.querySelector('.faq-answer');
    if (!btn || !ans) return;
    btn.addEventListener('click', () => {
      const isOpen = item.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach(x => {
        x.classList.remove('active');
        const a = x.querySelector('.faq-answer');
        if (a) a.style.maxHeight = null;
      });
      if (!isOpen) {
        item.classList.add('active');
        ans.style.maxHeight = ans.scrollHeight + 'px';
      }
    });
  });
}

/* ===================== BOOT ===================== */
showSkeletons();
loadMatches();
initFaq();