require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── MySQL ───────────────────────────────────────────────────────────────────
const pool = mysql.createPool(process.env.DATABASE_URL);

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS streamers (
      id           VARCHAR(50) PRIMARY KEY,
      username     VARCHAR(100) NOT NULL UNIQUE,
      display_name VARCHAR(100),
      added_at     DATETIME DEFAULT NOW(),
      tags         TEXT DEFAULT '[]',
      featured     TINYINT(1) DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS candidates (
      id       VARCHAR(50) PRIMARY KEY,
      nom      VARCHAR(100),
      prenom   VARCHAR(100),
      pseudo   VARCHAR(100),
      twitch   VARCHAR(100),
      email    VARCHAR(200),
      date     DATETIME DEFAULT NOW(),
      statut   VARCHAR(50) DEFAULT 'En attente'
    )
  `);
  // Ajouter email si la table existait déjà sans cette colonne
  await pool.query(`
    ALTER TABLE candidates ADD COLUMN IF NOT EXISTS email VARCHAR(200)
  `);
  console.log('✅ Base de données initialisée');
}

// ─── DB Helpers ─────────────────────────────────────────────────────────────
async function loadStreamers() {
  const [rows] = await pool.query('SELECT * FROM streamers ORDER BY added_at ASC');
  return rows.map(dbToStreamer);
}

function dbToStreamer(r) {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    addedAt: r.added_at,
    tags: r.tags ? JSON.parse(r.tags) : [],
    featured: !!r.featured
  };
}

async function insertStreamer(s) {
  await pool.query(
    `INSERT INTO streamers (id, username, display_name, tags, featured)
     VALUES (?, ?, ?, ?, ?)`,
    [s.id, s.username, s.displayName, JSON.stringify(s.tags || []), 0]
  );
}

async function removeStreamer(id) {
  await pool.query('DELETE FROM streamers WHERE id = ?', [id]);
}

async function updateStreamerTags(id, tags) {
  await pool.query('UPDATE streamers SET tags = ? WHERE id = ?', [JSON.stringify(tags), id]);
}

async function updateStreamerFeatured(id, featured) {
  await pool.query('UPDATE streamers SET featured = ? WHERE id = ?', [featured ? 1 : 0, id]);
}

async function loadCandidates() {
  const [rows] = await pool.query('SELECT * FROM candidates ORDER BY date DESC');
  return rows.map(r => ({
    id: r.id, nom: r.nom, prenom: r.prenom,
    pseudo: r.pseudo, twitch: r.twitch, email: r.email,
    date: r.date, statut: r.statut
  }));
}

async function insertCandidate(c) {
  await pool.query(
    `INSERT INTO candidates (id, nom, prenom, pseudo, twitch, email)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [c.id, c.nom, c.prenom, c.pseudo, c.twitch, c.email || null]
  );
}

async function removeCandidate(id) {
  await pool.query('DELETE FROM candidates WHERE id = ?', [id]);
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

// ─── Mailer ──────────────────────────────────────────────────────────────────
function createTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

function buildAcceptEmailHtml(c) {
  const name = c.prenom ? `${c.prenom}` : c.pseudo;
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.15);">

  <!-- Header sombre -->
  <tr>
    <td style="background:#0e0e0e;padding:28px 32px;text-align:center;">
      <div style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;margin-bottom:4px;">
        Rush<span style="color:#FF6B1A;">Stream</span>
        <span style="font-size:14px;font-weight:600;color:#555;margin-left:4px;">974</span>
      </div>
      <div style="font-size:11px;color:#444;letter-spacing:1.5px;text-transform:uppercase;">Île de La Réunion</div>
    </td>
  </tr>

  <!-- Barre orange dégradée -->
  <tr><td style="background:linear-gradient(90deg,#FF6B1A 0%,#ff9a52 100%);height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>

  <!-- Corps blanc -->
  <tr>
    <td style="background:#ffffff;padding:36px 32px 28px;">

      <!-- Icône succès -->
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;width:60px;height:60px;border-radius:50%;background:#fff5ef;border:2px solid #FF6B1A;line-height:60px;font-size:26px;">🎉</div>
      </div>

      <h1 style="margin:0 0 10px;font-size:1.35rem;font-weight:900;color:#0e0e0e;text-align:center;">
        Bienvenue sur RushStream 974 !
      </h1>
      <p style="margin:0 0 24px;font-size:0.88rem;color:#666;text-align:center;line-height:1.6;">
        Salut <strong style="color:#0e0e0e;">${name}</strong>,<br>
        ta candidature a été <strong style="color:#FF6B1A;">acceptée</strong> — tu fais maintenant partie<br>
        de la communauté des streamers réunionnais 🔥
      </p>

      <!-- Badge Twitch -->
      <div style="background:#f7f7f7;border-radius:10px;padding:16px 20px;margin-bottom:28px;text-align:center;">
        <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:6px;">Ta chaîne Twitch</div>
        <div style="font-size:1.05rem;font-weight:800;color:#FF6B1A;">@${c.twitch}</div>
      </div>

      <p style="margin:0 0 28px;font-size:0.83rem;color:#777;line-height:1.7;text-align:center;">
        Ton profil apparaît désormais sur le site en temps réel.<br>
        Quand tu stream, tu seras visible dans la liste <strong style="color:#0e0e0e;">En live</strong> automatiquement.
      </p>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:8px;">
        <a href="https://rushstream.rushxp.fr" style="display:inline-block;background:linear-gradient(135deg,#FF6B1A,#ff8c42);color:#ffffff;text-decoration:none;font-weight:800;font-size:0.9rem;padding:14px 32px;border-radius:10px;letter-spacing:0.2px;">
          Voir ma chaîne sur le site →
        </a>
      </div>

    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#f9f9f9;border-top:1px solid #eee;padding:18px 32px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;">
        RushStream 974 · Île de La Réunion · <a href="https://rushstream.rushxp.fr" style="color:#FF6B1A;text-decoration:none;">rushstream.rushxp.fr</a>
      </p>
      <p style="margin:6px 0 0;font-size:11px;color:#ccc;">Fait avec ❤️ pour la communauté réunionnaise</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body></html>`;
}

function buildRejectEmailHtml(c) {
  const name = c.prenom ? `${c.prenom}` : c.pseudo;
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.15);">

  <!-- Header sombre -->
  <tr>
    <td style="background:#0e0e0e;padding:28px 32px;text-align:center;">
      <div style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;margin-bottom:4px;">
        Rush<span style="color:#FF6B1A;">Stream</span>
        <span style="font-size:14px;font-weight:600;color:#555;margin-left:4px;">974</span>
      </div>
      <div style="font-size:11px;color:#444;letter-spacing:1.5px;text-transform:uppercase;">Île de La Réunion</div>
    </td>
  </tr>

  <!-- Barre orange -->
  <tr><td style="background:linear-gradient(90deg,#FF6B1A 0%,#ff9a52 100%);height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>

  <!-- Corps blanc -->
  <tr>
    <td style="background:#ffffff;padding:36px 32px 28px;">

      <!-- Icône -->
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;width:60px;height:60px;border-radius:50%;background:#fafafa;border:2px solid #ddd;line-height:60px;font-size:24px;">📋</div>
      </div>

      <h1 style="margin:0 0 10px;font-size:1.25rem;font-weight:900;color:#0e0e0e;text-align:center;">
        Merci pour ta candidature
      </h1>
      <p style="margin:0 0 24px;font-size:0.88rem;color:#666;text-align:center;line-height:1.6;">
        Salut <strong style="color:#0e0e0e;">${name}</strong>,<br>
        après examen, ta candidature pour <strong style="color:#FF6B1A;">@${c.twitch}</strong><br>
        n'a pas pu être retenue pour le moment.
      </p>

      <!-- Encart info -->
      <div style="background:#f7f7f7;border-left:3px solid #FF6B1A;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:28px;">
        <p style="margin:0;font-size:0.82rem;color:#555;line-height:1.6;">
          Cela ne signifie pas que ta chaîne n'est pas intéressante —
          il peut s'agir d'un critère de zone géographique ou d'activité récente sur Twitch.
          N'hésite pas à repostuler plus tard !
        </p>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:8px;">
        <a href="https://rushstream.rushxp.fr" style="display:inline-block;background:#0e0e0e;color:#ffffff;text-decoration:none;font-weight:700;font-size:0.88rem;padding:13px 28px;border-radius:10px;">
          Voir le site →
        </a>
      </div>

    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#f9f9f9;border-top:1px solid #eee;padding:18px 32px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#aaa;">
        RushStream 974 · Île de La Réunion · <a href="https://rushstream.rushxp.fr" style="color:#FF6B1A;text-decoration:none;">rushstream.rushxp.fr</a>
      </p>
      <p style="margin:6px 0 0;font-size:11px;color:#ccc;">Fait avec ❤️ pour la communauté réunionnaise</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body></html>`;
}

async function sendCandidateNotification(candidateId, action) {
  const [rows] = await pool.query('SELECT * FROM candidates WHERE id = ?', [candidateId]);
  if (rows.length === 0) return { sent: false, reason: 'not-found' };
  const c = rows[0];
  if (!c.email) return { sent: false, reason: 'no-email' };

  const transporter = createTransporter();
  if (!transporter) return { sent: false, reason: 'no-smtp' };

  const subject = action === 'accept'
    ? '🎉 Ta chaîne est sur RushStream 974 !'
    : 'Suite à ta candidature RushStream 974';
  const html = action === 'accept' ? buildAcceptEmailHtml(c) : buildRejectEmailHtml(c);

  try {
    await transporter.sendMail({
      from: `RushStream 974 <${process.env.MAIL_FROM || process.env.SMTP_USER}>`,
      to: c.email,
      subject,
      html
    });
    return { sent: true };
  } catch (err) {
    console.error('Erreur envoi mail:', err.message);
    return { sent: false, reason: 'smtp-error', error: err.message };
  }
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
  const { nom, prenom, pseudo, twitch, email } = req.body;
  if (!nom || !prenom || !pseudo || !twitch)
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  await insertCandidate({
    id: Date.now().toString(),
    nom: nom.trim(), prenom: prenom.trim(),
    pseudo: pseudo.trim(), twitch: twitch.trim().toLowerCase(),
    email: email ? email.trim().toLowerCase() : null
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

// POST /api/candidates/:id/notify — envoie email + supprime la candidature
app.post('/api/candidates/:id/notify', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const { action } = req.body; // 'accept' | 'reject'
  if (!['accept', 'reject'].includes(action))
    return res.status(400).json({ error: 'action invalide' });
  try {
    const mailResult = await sendCandidateNotification(req.params.id, action);
    await removeCandidate(req.params.id);
    res.json({ success: true, ...mailResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
