require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── PostgreSQL ─────────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS streamers (
      id          VARCHAR(50) PRIMARY KEY,
      username    VARCHAR(100) NOT NULL UNIQUE,
      display_name VARCHAR(100),
      added_at    TIMESTAMPTZ DEFAULT NOW(),
      tags        TEXT[]  DEFAULT '{}',
      featured    BOOLEAN DEFAULT FALSE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS candidates (
      id       VARCHAR(50) PRIMARY KEY,
      nom      VARCHAR(100),
      prenom   VARCHAR(100),
      pseudo   VARCHAR(100),
      twitch   VARCHAR(100),
      date     TIMESTAMPTZ DEFAULT NOW(),
      statut   VARCHAR(50) DEFAULT 'En attente'
    )
  `);
  console.log('✅ Base de données initialisée');
}

// ─── DB Helpers ─────────────────────────────────────────────────────────────
async function loadStreamers() {
  const r = await pool.query('SELECT * FROM streamers ORDER BY added_at ASC');
  return r.rows.map(dbToStreamer);
}

function dbToStreamer(r) {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    addedAt: r.added_at,
    tags: r.tags || [],
    featured: r.featured || false
  };
}

async function insertStreamer(s) {
  await pool.query(
    `INSERT INTO streamers (id, username, display_name, tags, featured)
     VALUES ($1, $2, $3, $4, $5)`,
    [s.id, s.username, s.displayName, s.tags || [], false]
  );
}

async function removeStreamer(id) {
  await pool.query('DELETE FROM streamers WHERE id = $1', [id]);
}

async function updateStreamerTags(id, tags) {
  await pool.query('UPDATE streamers SET tags = $1 WHERE id = $2', [tags, id]);
}

async function updateStreamerFeatured(id, featured) {
  await pool.query('UPDATE streamers SET featured = $1 WHERE id = $2', [featured, id]);
}

async function loadCandidates() {
  const r = await pool.query('SELECT * FROM candidates ORDER BY date DESC');
  return r.rows.map(r => ({
    id: r.id, nom: r.nom, prenom: r.prenom,
    pseudo: r.pseudo, twitch: r.twitch,
    date: r.date, statut: r.statut
  }));
}

async function insertCandidate(c) {
  await pool.query(
    `INSERT INTO candidates (id, nom, prenom, pseudo, twitch)
     VALUES ($1, $2, $3, $4, $5)`,
    [c.id, c.nom, c.prenom, c.pseudo, c.twitch]
  );
}

async function removeCandidate(id) {
  await pool.query('DELETE FROM candidates WHERE id = $1', [id]);
}

// ─── Auth ────────────────────────────────────────────────────────────────────
function checkAdmin(req, res) {
  if (req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Non autorisé' });
    return false;
  }
  return true;
}

// ─── Twitch Token ────────────────────────────────────────────────────────────
let twitchToken = null;
let tokenExpiry = 0;

async function getTwitchToken() {
  if (twitchToken && Date.now() < tokenExpiry) return twitchToken;
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: 'POST' }
  );
  const data = await res.json();
  twitchToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  return twitchToken;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /api/streamers
app.get('/api/streamers', async (req, res) => {
  try {
    const streamers = await loadStreamers();
    if (streamers.length === 0) return res.json([]);

    const token = await getTwitchToken();
    const logins = streamers.map(s => s.username.toLowerCase());

    const usersQuery = logins.map(l => `login=${l}`).join('&');
    const usersRes = await fetch(`https://api.twitch.tv/helix/users?${usersQuery}`, {
      headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
    });
    const usersData = await usersRes.json();
    const usersMap = {};
    (usersData.data || []).forEach(u => { usersMap[u.login] = u; });

    const streamsQuery = logins.map(l => `user_login=${l}`).join('&');
    const streamsRes = await fetch(`https://api.twitch.tv/helix/streams?${streamsQuery}`, {
      headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
    });
    const streamsData = await streamsRes.json();
    const streamsMap = {};
    (streamsData.data || []).forEach(s => { streamsMap[s.user_login] = s; });

    const result = streamers.map(streamer => {
      const login = streamer.username.toLowerCase();
      const user = usersMap[login] || {};
      const stream = streamsMap[login] || null;
      return {
        id: streamer.id,
        username: streamer.username,
        displayName: user.display_name || streamer.displayName || streamer.username,
        profileImage: user.profile_image_url || null,
        tags: streamer.tags || [],
        featured: streamer.featured || false,
        isLive: !!stream,
        stream: stream ? {
          title: stream.title,
          game: stream.game_name,
          viewers: stream.viewer_count,
          thumbnail: stream.thumbnail_url.replace('{width}', '640').replace('{height}', '360'),
          startedAt: stream.started_at
        } : null,
        twitchUrl: `https://twitch.tv/${streamer.username}`
      };
    });

    result.sort((a, b) => b.isLive - a.isLive);
    res.json(result);
  } catch (err) {
    console.error('Erreur API streamers:', err.message);
    res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
});

// GET /api/streamers/raw
app.get('/api/streamers/raw', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  res.json(await loadStreamers());
});

// POST /api/streamers
app.post('/api/streamers', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username requis' });
  const clean = username.trim().toLowerCase();

  try {
    const token = await getTwitchToken();
    const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${clean}`, {
      headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
    });
    const userData = await userRes.json();
    if (!userData.data || userData.data.length === 0)
      return res.status(404).json({ error: `Compte Twitch "${clean}" introuvable` });

    const twitchUser = userData.data[0];
    const streamers = await loadStreamers();
    if (streamers.find(s => s.username.toLowerCase() === clean))
      return res.status(409).json({ error: 'Streamer déjà ajouté' });

    const newStreamer = {
      id: twitchUser.id,
      username: twitchUser.login,
      displayName: twitchUser.display_name,
      tags: []
    };
    await insertStreamer(newStreamer);
    res.json({ success: true, streamer: newStreamer });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
});

// DELETE /api/streamers/:id
app.delete('/api/streamers/:id', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  await removeStreamer(req.params.id);
  res.json({ success: true });
});

// PATCH /api/streamers/:id/tags
app.patch('/api/streamers/:id/tags', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const { tags } = req.body;
  if (!Array.isArray(tags)) return res.status(400).json({ error: 'Tags invalides' });
  await updateStreamerTags(req.params.id, tags.map(t => String(t).trim().toLowerCase()).filter(Boolean));
  res.json({ success: true });
});

// PATCH /api/streamers/:id/featured
app.patch('/api/streamers/:id/featured', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const { featured } = req.body;
  await updateStreamerFeatured(req.params.id, !!featured);
  res.json({ success: true, featured: !!featured });
});

// POST /api/admin/login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD)
    res.json({ success: true });
  else
    res.status(401).json({ error: 'Mot de passe incorrect' });
});

// POST /api/candidates
app.post('/api/candidates', async (req, res) => {
  const { nom, prenom, pseudo, twitch } = req.body;
  if (!nom || !prenom || !pseudo || !twitch)
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  await insertCandidate({
    id: Date.now().toString(),
    nom: nom.trim(), prenom: prenom.trim(),
    pseudo: pseudo.trim(), twitch: twitch.trim().toLowerCase()
  });
  res.json({ success: true });
});

// GET /api/candidates
app.get('/api/candidates', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  res.json(await loadCandidates());
});

// DELETE /api/candidates/:id
app.delete('/api/candidates/:id', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  await removeCandidate(req.params.id);
  res.json({ success: true });
});

// GET /admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ─── Start ───────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🟠 RushStream lancé sur http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('❌ Erreur DB:', err.message);
  process.exit(1);
});
