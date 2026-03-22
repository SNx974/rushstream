// ─── State ────────────────────────────────────────────────────────────────
let allStreamers = [];
let currentFilter = 'all';
let adminPassword = null;
let refreshInterval = null;
let currentFeaturedUsername = null;

// ─── Init ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadStreamers();
  setupFilters();
  refreshInterval = setInterval(loadStreamers, 60000);

  // Resize observer pour recentrer le carrousel
  const viewport = document.getElementById('carousel-viewport');
  if (viewport && window.ResizeObserver) {
    new ResizeObserver(() => updateCarouselPosition()).observe(viewport);
  }
});

// ─── Fetch streamers ──────────────────────────────────────────────────────
async function loadStreamers() {
  try {
    const res = await fetch('/api/streamers');
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    allStreamers = data;
    renderFeatured(data);
    renderGrid(currentFilter);
    updateCounts();
    hideError();
  } catch (err) {
    showError('Impossible de charger les streamers. Vérifiez que le serveur est lancé et que les clés Twitch sont configurées.');
    console.error(err);
  }
}

// ─── Featured Carousel ────────────────────────────────────────────────────
let carouselIndex = 0;
let featuredLive = [];

function renderFeatured(streamers) {
  featuredLive = streamers.filter(s => s.featured && s.isLive);
  const section = document.getElementById('featured-section');
  if (featuredLive.length === 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  if (carouselIndex >= featuredLive.length) carouselIndex = 0;
  buildCarousel();
}

function buildCarouselItemHtml(s, i) {
  const isActive = i === carouselIndex;
  const hostname = window.location.hostname;

  if (isActive) {
    const avatarHtml = s.profileImage
      ? `<img src="${s.profileImage}" alt="${escHtml(s.displayName)}" />`
      : `<div class="feat-av-ph">${(s.displayName||s.username)[0].toUpperCase()}</div>`;

    const tagsHtml = (s.tags && s.tags.length)
      ? s.tags.map(t => `<span class="feat-tag">${escHtml(t)}</span>`).join('')
      : '';

    return `<div class="carousel-item active" data-index="${i}">
      <div class="carr-active-wrap">
        <div class="carr-player">
          <iframe src="https://player.twitch.tv/?channel=${s.username}&parent=${hostname}&muted=false&autoplay=true"
            allowfullscreen allow="autoplay; fullscreen"></iframe>
        </div>
        <div class="carr-info">
          <div class="carr-info-top">
            <div class="carr-avatar">${avatarHtml}</div>
            <div class="carr-meta">
              <div class="carr-name">${escHtml(s.displayName || s.username)}</div>
              ${s.stream?.game ? `<div class="carr-game">${escHtml(s.stream.game)}</div>` : ''}
              <div class="carr-viewers-row">
                <svg viewBox="0 0 16 16" fill="currentColor" width="11" height="11"><path d="M8 2C4.5 2 1.5 4.5 0 8c1.5 3.5 4.5 6 8 6s6.5-2.5 8-6c-1.5-3.5-4.5-6-8-6zm0 10c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                ${formatViewers(s.stream?.viewers || 0)} spectateurs
                ${s.stream?.startedAt ? `<span class="carr-duration" data-started="${s.stream.startedAt}">${formatDuration(s.stream.startedAt)}</span>` : ''}
              </div>
            </div>
          </div>
          ${s.stream?.title ? `<div class="carr-title">${escHtml(s.stream.title)}</div>` : ''}
          ${tagsHtml ? `<div class="carr-tags">${tagsHtml}</div>` : ''}
          <a class="carr-twitch-btn" href="${s.twitchUrl}" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13"><path d="M2.149 0L.537 4.119v16.836h5.731V24h3.224l3.045-3.045h4.657l6.269-6.269V0H2.149zm19.164 13.612l-3.582 3.582H12l-3.045 3.045v-3.045H4.119V2.687h17.194v10.925zM14.328 5.373H16.9v7.164h-2.572V5.373zm-6.716 0h2.567v7.164H7.612V5.373z"/></svg>
            Voir sur Twitch
          </a>
        </div>
      </div>
    </div>`;
  }

  const thumbHtml = s.stream?.thumbnail
    ? `<img src="${s.stream.thumbnail}?t=${Date.now()}" alt="${escHtml(s.displayName)}" loading="lazy" />`
    : '<div class="carr-placeholder"></div>';

  return `<div class="carousel-item" data-index="${i}" onclick="carouselGoTo(${i})">
    <div class="carr-thumb-wrap">
      ${thumbHtml}
      <div class="carr-overlay">
        <div class="carr-live-badge">LIVE</div>
        <div class="carr-viewers-badge">${formatViewers(s.stream?.viewers || 0)}</div>
      </div>
    </div>
  </div>`;
}

function buildCarousel() {
  const track = document.getElementById('carousel-track');
  track.innerHTML = featuredLive.map((s, i) => buildCarouselItemHtml(s, i)).join('');
  updateCarouselPosition();
  updateNavVisibility();
}

function updateCarouselPosition() {
  const viewport = document.getElementById('carousel-viewport');
  const track = document.getElementById('carousel-track');
  if (!viewport || !track) return;

  const vw = viewport.offsetWidth;
  const itemW = vw * 0.72;
  const gap = 10;
  const peekOffset = (vw - itemW) / 2;
  const offset = peekOffset - carouselIndex * (itemW + gap);
  track.style.transform = `translateX(${offset}px)`;
}

function carouselPrev() {
  if (carouselIndex <= 0) return;
  carouselIndex--;
  buildCarousel();
}

function carouselNext() {
  if (carouselIndex >= featuredLive.length - 1) return;
  carouselIndex++;
  buildCarousel();
}

function carouselGoTo(index) {
  if (index === carouselIndex) return;
  carouselIndex = index;
  buildCarousel();
}

function updateNavVisibility() {
  const multi = featuredLive.length > 1;
  const leftBtn = document.getElementById('carr-left');
  const rightBtn = document.getElementById('carr-right');
  const pills = document.getElementById('feat-nav-pills');
  if (leftBtn) { leftBtn.style.display = multi ? 'flex' : 'none'; leftBtn.disabled = carouselIndex === 0; }
  if (rightBtn) { rightBtn.style.display = multi ? 'flex' : 'none'; rightBtn.disabled = carouselIndex === featuredLive.length - 1; }
  if (pills) {
    pills.style.display = multi ? 'flex' : 'none';
    const counter = document.getElementById('feat-counter');
    if (counter) counter.textContent = `${carouselIndex + 1} / ${featuredLive.length}`;
  }
}

// ─── Render ───────────────────────────────────────────────────────────────
function renderGrid(filter) {
  const grid = document.getElementById('streamers-grid');
  let streamers = allStreamers;

  if (filter === 'live') streamers = allStreamers.filter(s => s.isLive);
  if (filter === 'offline') streamers = allStreamers.filter(s => !s.isLive);

  if (streamers.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M2.149 0L.537 4.119v16.836h5.731V24h3.224l3.045-3.045h4.657l6.269-6.269V0H2.149zm19.164 13.612l-3.582 3.582H12l-3.045 3.045v-3.045H4.119V2.687h17.194v10.925zM14.328 5.373H16.9v7.164h-2.572V5.373zm-6.716 0h2.567v7.164H7.612V5.373z"/></svg>
        <h3>${filter === 'live' ? 'Personne en live pour le moment' : filter === 'offline' ? 'Tous les streamers sont en live !' : 'Aucun streamer enregistré'}</h3>
        <p>${filter === 'all' ? 'Demandez à un admin d\'ajouter des streamers.' : ''}</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = streamers.map(s => buildCard(s)).join('');
}

function buildCard(s) {
  const initial = (s.displayName || s.username)[0].toUpperCase();

  const thumbnailHtml = s.isLive && s.stream?.thumbnail
    ? `<img src="${s.stream.thumbnail}?t=${Date.now()}" alt="Live de ${s.displayName}" loading="lazy" />`
    : `<div class="thumbnail-offline">
        <svg viewBox="0 0 24 24"><path d="M2.149 0L.537 4.119v16.836h5.731V24h3.224l3.045-3.045h4.657l6.269-6.269V0H2.149zm19.164 13.612l-3.582 3.582H12l-3.045 3.045v-3.045H4.119V2.687h17.194v10.925zM14.328 5.373H16.9v7.164h-2.572V5.373zm-6.716 0h2.567v7.164H7.612V5.373z"/></svg>
        <span>Hors ligne</span>
      </div>`;

  const liveBadge = s.isLive
    ? `<div class="live-badge"><div class="dot"></div> LIVE</div>` : '';

  const viewersBadge = s.isLive && s.stream?.viewers != null
    ? `<div class="viewers-badge">
        <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
        ${formatViewers(s.stream.viewers)}
      </div>` : '';

  const avatarHtml = s.profileImage
    ? `<img src="${s.profileImage}" alt="${s.displayName}" loading="lazy" />`
    : `<div class="avatar-placeholder">${initial}</div>`;

  const statusDot = s.isLive
    ? `<span class="live-dot"></span>`
    : `<span class="offline-dot"></span>`;

  const liveDuration = s.isLive && s.stream?.startedAt
    ? `<div class="card-duration" data-started="${s.stream.startedAt}">⏱ ${formatDuration(s.stream.startedAt)}</div>`
    : '';

  const subInfo = s.isLive
    ? `${s.stream.game ? `<div class="card-game">${s.stream.game}</div>` : ''}
       ${s.stream.title ? `<div class="card-title">${escHtml(s.stream.title)}</div>` : ''}
       ${liveDuration}`
    : `<div class="card-offline-status">Hors ligne</div>`;

  const tagsHtml = (s.tags && s.tags.length)
    ? `<div class="card-tags">${s.tags.map(t => `<span class="card-tag">${escHtml(t)}</span>`).join('')}</div>`
    : '';

  return `
    <div class="streamer-card ${s.isLive ? 'live' : ''}" onclick="openTwitch('${s.twitchUrl}')">
      <div class="card-thumbnail">
        ${thumbnailHtml}
        ${liveBadge}
        ${viewersBadge}
      </div>
      <div class="card-body">
        <div class="card-avatar">${avatarHtml}</div>
        <div class="card-info">
          <div class="card-name">${statusDot} ${escHtml(s.displayName || s.username)}</div>
          ${subInfo}
          ${tagsHtml}
        </div>
        <a class="card-twitch-link" href="${s.twitchUrl}" target="_blank" rel="noopener"
           onclick="event.stopPropagation()" title="Ouvrir sur Twitch">
          <svg viewBox="0 0 24 24"><path d="M2.149 0L.537 4.119v16.836h5.731V24h3.224l3.045-3.045h4.657l6.269-6.269V0H2.149zm19.164 13.612l-3.582 3.582H12l-3.045 3.045v-3.045H4.119V2.687h17.194v10.925zM14.328 5.373H16.9v7.164h-2.572V5.373zm-6.716 0h2.567v7.164H7.612V5.373z"/></svg>
        </a>
      </div>
    </div>
  `;
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function openTwitch(url) {
  window.open(url, '_blank', 'noopener');
}

function formatDuration(startedAt) {
  const diff = Math.floor((Date.now() - new Date(startedAt)) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`;
  return `${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
}

// Mettre à jour les durées chaque seconde
setInterval(() => {
  document.querySelectorAll('.card-duration[data-started]').forEach(el => {
    el.textContent = '⏱ ' + formatDuration(el.dataset.started);
  });
}, 1000);

function formatViewers(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function updateCounts() {
  const liveCount = allStreamers.filter(s => s.isLive).length;
  document.getElementById('live-count').textContent =
    liveCount === 0 ? '0 en live'
    : liveCount === 1 ? '1 en live'
    : `${liveCount} en live`;
  document.getElementById('count-display').textContent = allStreamers.length;
}

function showError(msg) {
  const el = document.getElementById('error-banner');
  el.textContent = '⚠️ ' + msg;
  el.style.display = 'block';
}

function hideError() {
  document.getElementById('error-banner').style.display = 'none';
}

// ─── Filters ──────────────────────────────────────────────────────────────
function setupFilters() {
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderGrid(currentFilter);
    });
  });
}

// ─── Modals ───────────────────────────────────────────────────────────────
function openAdminModal() {
  if (adminPassword) {
    openModal('admin-panel-modal');
    loadAdminList();
    loadCandidates();
  } else {
    openModal('admin-login-modal');
    setTimeout(() => document.getElementById('admin-password-input').focus(), 100);
  }
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Fermer en cliquant sur l'overlay
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});


// ─── Formulaire candidature ───────────────────────────────────────────────
async function submitJoin(e) {
  e.preventDefault();
  const btn = document.getElementById('join-btn');
  const errEl = document.getElementById('join-error');
  const sucEl = document.getElementById('join-success');
  errEl.style.display = 'none';
  sucEl.style.display = 'none';

  const nom = document.getElementById('join-nom').value.trim();
  const prenom = document.getElementById('join-prenom').value.trim();
  const pseudo = document.getElementById('join-pseudo').value.trim();
  const twitch = document.getElementById('join-twitch').value.trim();
  const email = document.getElementById('join-email').value.trim();

  btn.disabled = true;
  btn.textContent = 'Envoi en cours...';

  try {
    const res = await fetch('/api/candidates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom, prenom, pseudo, twitch, email })
    });
    if (!res.ok) throw new Error();
    document.getElementById('join-form').reset();
    sucEl.textContent = 'Candidature envoyée ! Elle sera examinée avant publication.';
    sucEl.style.display = 'block';
  } catch {
    errEl.textContent = 'Erreur lors de l\'envoi. Réessayez.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Envoyer ma candidature';
  }
}

// ─── Admin — Candidatures ─────────────────────────────────────────────────
async function loadCandidates() {
  const container = document.getElementById('admin-candidates-list');
  if (!container) return;
  try {
    const res = await fetch('/api/candidates', {
      headers: { 'x-admin-password': adminPassword }
    });
    const candidates = await res.json();

    if (candidates.length === 0) {
      container.innerHTML = '<p style="color:#555;font-size:0.85rem">Aucune candidature.</p>';
      return;
    }

    container.innerHTML = candidates.map(c => `
      <div class="candidate-item" id="cand-${c.id}">
        <div class="candidate-info">
          <div class="candidate-row">
            <span class="candidate-label">Twitch</span>
            <span class="candidate-value candidate-twitch">@${escHtml(c.twitch)}</span>
          </div>
          <div class="candidate-row">
            <span class="candidate-label">Identité</span>
            <span class="candidate-value">${escHtml(c.prenom)} ${escHtml(c.nom)}</span>
          </div>
          <div class="candidate-row">
            <span class="candidate-label">Pseudo</span>
            <span class="candidate-value">${escHtml(c.pseudo)}</span>
          </div>
          <div class="candidate-row">
            <span class="candidate-label">Date</span>
            <span class="candidate-value">${new Date(c.date).toLocaleDateString('fr-FR')}</span>
          </div>
        </div>
        <div class="candidate-actions">
          <button class="btn-approve" onclick="approveCandidate('${c.id}', '${escHtml(c.twitch)}')">+ Ajouter</button>
          <button class="btn-delete" onclick="deleteCandidate('${c.id}')">Refuser</button>
        </div>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<p style="color:#ff6b6b;font-size:0.85rem">Erreur de chargement.</p>';
  }
}

async function approveCandidate(id, twitch) {
  const btn = document.querySelector(`#cand-${id} .btn-approve`);
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const res = await fetch('/api/streamers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword },
      body: JSON.stringify({ username: twitch })
    });
    const data = await res.json();
    if (res.ok) {
      await deleteCandidate(id);
      await loadStreamers();
      await loadAdminList();
    } else {
      alert(data.error || 'Erreur lors de l\'ajout.');
      if (btn) { btn.disabled = false; btn.textContent = '+ Ajouter'; }
    }
  } catch {
    alert('Erreur serveur.');
    if (btn) { btn.disabled = false; btn.textContent = '+ Ajouter'; }
  }
}

async function deleteCandidate(id) {
  await fetch(`/api/candidates/${id}`, {
    method: 'DELETE',
    headers: { 'x-admin-password': adminPassword }
  });
  document.getElementById(`cand-${id}`)?.remove();
  const container = document.getElementById('admin-candidates-list');
  if (container && container.children.length === 0) {
    container.innerHTML = '<p style="color:#555;font-size:0.85rem">Aucune candidature.</p>';
  }
}

// ─── Admin Login ──────────────────────────────────────────────────────────
async function loginAdmin() {
  const pwd = document.getElementById('admin-password-input').value;
  if (!pwd) return;

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });

    if (res.ok) {
      adminPassword = pwd;
      document.getElementById('admin-password-input').value = '';
      document.getElementById('login-error').style.display = 'none';
      closeModal('admin-login-modal');
      openModal('admin-panel-modal');
      loadAdminList();
    } else {
      const err = document.getElementById('login-error');
      err.textContent = 'Mot de passe incorrect.';
      err.style.display = 'block';
    }
  } catch {
    const err = document.getElementById('login-error');
    err.textContent = 'Erreur de connexion au serveur.';
    err.style.display = 'block';
  }
}

// ─── Admin — Charger la liste ─────────────────────────────────────────────
async function loadAdminList() {
  const container = document.getElementById('admin-streamers-list');
  try {
    const res = await fetch('/api/streamers/raw', {
      headers: { 'x-admin-password': adminPassword }
    });
    const streamers = await res.json();

    if (streamers.length === 0) {
      container.innerHTML = '<p style="color:#555;font-size:0.85rem">Aucun streamer enregistré.</p>';
      return;
    }

    // Enrichir avec le statut live depuis allStreamers
    const liveMap = {};
    allStreamers.forEach(s => { liveMap[s.id] = s.isLive; });

    container.innerHTML = streamers.map(s => `
      <div class="admin-streamer-item" id="item-${s.id}">
        <div class="admin-streamer-info">
          <div class="${liveMap[s.id] ? 'live-indicator' : 'offline-indicator'}"></div>
          <span class="admin-streamer-name">${escHtml(s.displayName || s.username)}</span>
          <span style="color:#555;font-size:0.78rem">(@${escHtml(s.username)})</span>
        </div>
        <button class="btn-delete" onclick="deleteStreamer('${s.id}', '${escHtml(s.displayName || s.username)}')">
          Supprimer
        </button>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<p style="color:#ff6b6b;font-size:0.85rem">Erreur lors du chargement.</p>';
  }
}

// ─── Admin — Ajouter ──────────────────────────────────────────────────────
async function addStreamer() {
  const input = document.getElementById('new-streamer-input');
  const username = input.value.trim();
  const errEl = document.getElementById('add-error');
  const sucEl = document.getElementById('add-success');
  const btn = document.getElementById('add-btn');

  errEl.style.display = 'none';
  sucEl.style.display = 'none';

  if (!username) return;

  btn.disabled = true;
  btn.textContent = 'Vérification...';

  try {
    const res = await fetch('/api/streamers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': adminPassword
      },
      body: JSON.stringify({ username })
    });

    const data = await res.json();

    if (res.ok) {
      input.value = '';
      sucEl.textContent = `✓ ${data.streamer.displayName} ajouté avec succès !`;
      sucEl.style.display = 'block';
      setTimeout(() => { sucEl.style.display = 'none'; }, 3000);
      await loadStreamers();
      await loadAdminList();
    } else {
      errEl.textContent = data.error || 'Erreur lors de l\'ajout.';
      errEl.style.display = 'block';
    }
  } catch {
    errEl.textContent = 'Erreur de connexion au serveur.';
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '+ Ajouter le streamer';
  }
}

// ─── Admin — Supprimer ────────────────────────────────────────────────────
async function deleteStreamer(id, name) {
  if (!confirm(`Supprimer ${name} de la liste ?`)) return;

  try {
    const res = await fetch(`/api/streamers/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-password': adminPassword }
    });

    if (res.ok) {
      document.getElementById(`item-${id}`)?.remove();
      await loadStreamers();
    } else {
      alert('Erreur lors de la suppression.');
    }
  } catch {
    alert('Erreur de connexion au serveur.');
  }
}
