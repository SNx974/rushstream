require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'streamers.json');
const CANDIDATES_FILE = path.join(__dirname, 'data', 'candidates.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Twitch Token ──────────────────────────────────────────────────────────
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

// ─── Helpers ───────────────────────────────────────────────────────────────
function loadStreamers() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveStreamers(streamers) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(streamers, null, 2));
}

function checkAdmin(req, res) {
  const password = req.headers['x-admin-password'];
  if (password !== process.env.ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Non autorisé' });
    return false;
  }
  return true;
}

// ─── API Routes ────────────────────────────────────────────────────────────

// GET /api/streamers — liste avec statut live
app.get('/api/streamers', async (req, res) => {
  try {
    const streamers = loadStreamers();
    if (streamers.length === 0) return res.json([]);

    const token = await getTwitchToken();
    const logins = streamers.map(s => s.username.toLowerCase());

    // Récupérer les infos utilisateurs
    const usersQuery = logins.map(l => `login=${l}`).join('&');
    const usersRes = await fetch(
      `https://api.twitch.tv/helix/users?${usersQuery}`,
      {
        headers: {
          'Client-ID': process.env.TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${token}`
        }
      }
    );
    const usersData = await usersRes.json();
    const usersMap = {};
    (usersData.data || []).forEach(u => { usersMap[u.login] = u; });

    // Récupérer les streams live
    const streamsQuery = logins.map(l => `user_login=${l}`).join('&');
    const streamsRes = await fetch(
      `https://api.twitch.tv/helix/streams?${streamsQuery}`,
      {
        headers: {
          'Client-ID': process.env.TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${token}`
        }
      }
    );
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
          thumbnail: stream.thumbnail_url
            .replace('{width}', '640')
            .replace('{height}', '360'),
          startedAt: stream.started_at
        } : null,
        twitchUrl: `https://twitch.tv/${streamer.username}`
      };
    });

    // Live en premier
    result.sort((a, b) => b.isLive - a.isLive);
    res.json(result);

  } catch (err) {
    console.error('Erreur API streamers:', err.message);
    res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
});

// POST /api/streamers — ajouter un streamer (admin)
app.post('/api/streamers', async (req, res) => {
  if (!checkAdmin(req, res)) return;

  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username requis' });

  const clean = username.trim().toLowerCase();

  // Vérifier que le compte Twitch existe
  try {
    const token = await getTwitchToken();
    const userRes = await fetch(
      `https://api.twitch.tv/helix/users?login=${clean}`,
      {
        headers: {
          'Client-ID': process.env.TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${token}`
        }
      }
    );
    const userData = await userRes.json();
    if (!userData.data || userData.data.length === 0) {
      return res.status(404).json({ error: `Compte Twitch "${clean}" introuvable` });
    }

    const twitchUser = userData.data[0];
    const streamers = loadStreamers();

    if (streamers.find(s => s.username.toLowerCase() === clean)) {
      return res.status(409).json({ error: 'Streamer déjà ajouté' });
    }

    const newStreamer = {
      id: twitchUser.id,
      username: twitchUser.login,
      displayName: twitchUser.display_name,
      addedAt: new Date().toISOString()
    };

    streamers.push(newStreamer);
    saveStreamers(streamers);
    res.json({ success: true, streamer: newStreamer });

  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
});

// DELETE /api/streamers/:id — supprimer un streamer (admin)
app.delete('/api/streamers/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;

  const streamers = loadStreamers();
  const filtered = streamers.filter(s => s.id !== req.params.id);

  if (filtered.length === streamers.length) {
    return res.status(404).json({ error: 'Streamer introuvable' });
  }

  saveStreamers(filtered);
  res.json({ success: true });
});

// POST /api/admin/login — vérifier le mot de passe admin
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Mot de passe incorrect' });
  }
});

// POST /api/candidates — soumettre une candidature (public)
app.post('/api/candidates', (req, res) => {
  const { nom, prenom, pseudo, twitch } = req.body;
  if (!nom || !prenom || !pseudo || !twitch) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }
  try {
    const candidates = JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf8'));
    candidates.push({
      id: Date.now().toString(),
      nom: nom.trim(),
      prenom: prenom.trim(),
      pseudo: pseudo.trim(),
      twitch: twitch.trim().toLowerCase(),
      date: new Date().toISOString(),
      statut: 'En attente'
    });
    fs.writeFileSync(CANDIDATES_FILE, JSON.stringify(candidates, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/candidates — liste des candidatures (admin)
app.get('/api/candidates', (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const candidates = JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf8'));
    res.json(candidates);
  } catch {
    res.json([]);
  }
});

// DELETE /api/candidates/:id — supprimer une candidature (admin)
app.delete('/api/candidates/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const candidates = JSON.parse(fs.readFileSync(CANDIDATES_FILE, 'utf8'));
    const filtered = candidates.filter(c => c.id !== req.params.id);
    fs.writeFileSync(CANDIDATES_FILE, JSON.stringify(filtered, null, 2));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/streamers/raw — liste brute sans appel Twitch (admin)
app.get('/api/streamers/raw', (req, res) => {
  if (!checkAdmin(req, res)) return;
  res.json(loadStreamers());
});

// PATCH /api/streamers/:id/featured — mettre en avant (admin)
app.patch('/api/streamers/:id/featured', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const { featured } = req.body;
  const streamers = loadStreamers();
  const idx = streamers.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Streamer introuvable' });
  streamers[idx].featured = !!featured;
  saveStreamers(streamers);
  res.json({ success: true, featured: streamers[idx].featured });
});

// PATCH /api/streamers/:id/tags — mettre à jour les tags (admin)
app.patch('/api/streamers/:id/tags', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const { tags } = req.body;
  if (!Array.isArray(tags)) return res.status(400).json({ error: 'Tags invalides' });

  const streamers = loadStreamers();
  const idx = streamers.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Streamer introuvable' });

  streamers[idx].tags = tags.map(t => String(t).trim().toLowerCase()).filter(Boolean);
  saveStreamers(streamers);
  res.json({ success: true, tags: streamers[idx].tags });
});

// GET /admin — page admin dédiée
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ─── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🟠 RushStream lancé sur http://localhost:${PORT}`);
  if (!process.env.TWITCH_CLIENT_ID || process.env.TWITCH_CLIENT_ID === 'your_client_id_here') {
    console.warn('⚠️  Configurez TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET dans .env');
  }
});
