const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');
const cfg = require('./gameconfig');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3888;
const JWT_SECRET = process.env.JWT_SECRET || 'chickenfarm-demo-secret-change-me';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cluckadmin2026';

// ---------- Database ----------
const db = new Database(path.join(__dirname, 'farm.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    coins INTEGER NOT NULL DEFAULT 0,
    slots INTEGER NOT NULL DEFAULT ${cfg.BASE_SLOTS},
    eggs TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chickens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    breed TEXT NOT NULL,
    last_collected INTEGER NOT NULL
  );
`);

// ---------- Migration: add referral columns to existing DBs ----------
const userCols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
if (!userCols.includes('ref_code')) db.exec("ALTER TABLE users ADD COLUMN ref_code TEXT");
if (!userCols.includes('referred_by')) db.exec("ALTER TABLE users ADD COLUMN referred_by INTEGER");
if (!userCols.includes('referrals')) db.exec("ALTER TABLE users ADD COLUMN referrals INTEGER NOT NULL DEFAULT 0");

const now = () => Date.now();

// Generate a short, human-friendly, unique referral code (no confusing chars like 0/O/1/I).
function genRefCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    const taken = db.prepare('SELECT id FROM users WHERE ref_code = ?').get(code);
    if (!taken) return code;
  }
  return 'C' + now().toString(36).toUpperCase().slice(-5);
}

// Backfill referral codes for any users created before this feature existed.
db.prepare("SELECT id FROM users WHERE ref_code IS NULL OR ref_code = ''").all().forEach((u) => {
  db.prepare('UPDATE users SET ref_code = ? WHERE id = ?').run(genRefCode(), u.id);
});

// ---------- Auth helpers ----------
function makeToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
}
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

// ---------- Game state ----------
// Compute pending (uncollected) eggs for a chicken based on elapsed time.
function pendingEggs(chicken) {
  const elapsed = now() - chicken.last_collected;
  const laid = Math.floor(elapsed / cfg.LAY_INTERVAL_MS);
  return Math.min(laid, cfg.MAX_EGGS_PER_CHICKEN);
}

function getState(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  const chickens = db.prepare('SELECT * FROM chickens WHERE user_id = ?').all(userId);
  const eggInv = JSON.parse(user.eggs || '{}');

  const chickenState = chickens.map((c) => {
    const breed = cfg.BREEDS[c.breed];
    const pending = pendingEggs(c);
    const nextMs = cfg.LAY_INTERVAL_MS - ((now() - c.last_collected) % cfg.LAY_INTERVAL_MS);
    return {
      id: c.id,
      breed: c.breed,
      name: breed.name,
      emoji: breed.emoji,
      eggEmoji: breed.eggEmoji,
      pending,
      full: pending >= cfg.MAX_EGGS_PER_CHICKEN,
      nextEggMs: pending >= cfg.MAX_EGGS_PER_CHICKEN ? 0 : nextMs,
    };
  });

  // Total uncollected eggs by type (for the "collect all" button)
  const uncollected = {};
  chickens.forEach((c) => {
    const breed = cfg.BREEDS[c.breed];
    uncollected[breed.eggType] = (uncollected[breed.eggType] || 0) + pendingEggs(c);
  });

  return {
    username: user.username,
    coins: user.coins,
    slots: user.slots,
    usedSlots: chickens.length,
    nextSlotPrice: user.slots < cfg.MAX_SLOTS ? cfg.slotPrice(user.slots) : null,
    eggs: eggInv,
    uncollected,
    chickens: chickenState,
    breeds: cfg.BREEDS,
    coinPacks: cfg.COIN_PACKS,
    layIntervalMs: cfg.LAY_INTERVAL_MS,
    maxEggsPerChicken: cfg.MAX_EGGS_PER_CHICKEN,
    referral: {
      code: user.ref_code,
      count: user.referrals || 0,
      earned: (user.referrals || 0) * cfg.REFERRAL_BONUS_REFERRER,
      rewardReferrer: cfg.REFERRAL_BONUS_REFERRER,
      rewardNew: cfg.REFERRAL_BONUS_NEW,
    },
  };
}

// ---------- Routes ----------
app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  const refCode = (req.body && req.body.refCode ? String(req.body.refCode) : '').trim().toUpperCase();
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(400).json({ error: 'Username already taken' });

  // If a referral code was entered, it must be valid.
  let referrer = null;
  if (refCode) {
    referrer = db.prepare('SELECT * FROM users WHERE ref_code = ?').get(refCode);
    if (!referrer) return res.status(400).json({ error: 'Invalid referral code' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const startCoins = cfg.STARTING_COINS + (referrer ? cfg.REFERRAL_BONUS_NEW : 0);
  const myCode = genRefCode();

  const tx = db.transaction(() => {
    const info = db.prepare('INSERT INTO users (username, password, coins, slots, eggs, created_at, ref_code, referred_by) VALUES (?,?,?,?,?,?,?,?)')
      .run(username, hash, startCoins, cfg.BASE_SLOTS, '{}', now(), myCode, referrer ? referrer.id : null);
    // Free starter chicken
    db.prepare('INSERT INTO chickens (user_id, breed, last_collected) VALUES (?,?,?)')
      .run(info.lastInsertRowid, cfg.STARTING_CHICKEN, now());
    if (referrer) {
      db.prepare('UPDATE users SET coins = coins + ?, referrals = referrals + 1 WHERE id = ?')
        .run(cfg.REFERRAL_BONUS_REFERRER, referrer.id);
    }
    return info.lastInsertRowid;
  });
  const newId = tx();

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(newId);
  res.json({ token: makeToken(user), state: getState(user.id), referralApplied: !!referrer });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username || '');
  if (!user || !bcrypt.compareSync(password || '', user.password)) {
    return res.status(400).json({ error: 'Wrong username or password' });
  }
  res.json({ token: makeToken(user), state: getState(user.id) });
});

app.get('/api/state', auth, (req, res) => {
  const state = getState(req.user.id);
  if (!state) return res.status(404).json({ error: 'User not found' });
  res.json({ state });
});

// Collect all pending eggs into the player's inventory.
app.post('/api/collect', auth, (req, res) => {
  const userId = req.user.id;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const chickens = db.prepare('SELECT * FROM chickens WHERE user_id = ?').all(userId);
  const eggInv = JSON.parse(user.eggs || '{}');
  let collected = 0;

  const tx = db.transaction(() => {
    for (const c of chickens) {
      const p = pendingEggs(c);
      if (p <= 0) continue;
      const breed = cfg.BREEDS[c.breed];
      eggInv[breed.eggType] = (eggInv[breed.eggType] || 0) + p;
      collected += p;
      // Advance the timer by exactly the eggs collected, preserving partial progress.
      const newLast = c.last_collected + p * cfg.LAY_INTERVAL_MS;
      db.prepare('UPDATE chickens SET last_collected = ? WHERE id = ?').run(newLast, c.id);
    }
    db.prepare('UPDATE users SET eggs = ? WHERE id = ?').run(JSON.stringify(eggInv), userId);
  });
  tx();

  res.json({ collected, state: getState(userId) });
});

// Sell eggs at the NPC market. Sells everything by default, or a specific eggType.
app.post('/api/sell', auth, (req, res) => {
  const userId = req.user.id;
  const { eggType } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const eggInv = JSON.parse(user.eggs || '{}');

  // Build a lookup of eggType -> value
  const valueByType = {};
  Object.values(cfg.BREEDS).forEach((b) => { valueByType[b.eggType] = b.eggValue; });

  let earned = 0;
  const typesToSell = eggType ? [eggType] : Object.keys(eggInv);
  for (const t of typesToSell) {
    const count = eggInv[t] || 0;
    if (count > 0 && valueByType[t]) {
      earned += count * valueByType[t];
      eggInv[t] = 0;
    }
  }

  db.prepare('UPDATE users SET coins = coins + ?, eggs = ? WHERE id = ?')
    .run(earned, JSON.stringify(eggInv), userId);

  res.json({ earned, state: getState(userId) });
});

// Buy a chicken of a given breed.
app.post('/api/buy-chicken', auth, (req, res) => {
  const userId = req.user.id;
  const { breed } = req.body || {};
  const b = cfg.BREEDS[breed];
  if (!b) return res.status(400).json({ error: 'Unknown breed' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const count = db.prepare('SELECT COUNT(*) c FROM chickens WHERE user_id = ?').get(userId).c;
  if (count >= user.slots) return res.status(400).json({ error: 'No free chicken slots - buy more space first' });
  if (user.coins < b.price) return res.status(400).json({ error: 'Not enough coins' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(b.price, userId);
    db.prepare('INSERT INTO chickens (user_id, breed, last_collected) VALUES (?,?,?)')
      .run(userId, breed, now());
  });
  tx();

  res.json({ state: getState(userId) });
});

// Buy an extra chicken slot.
app.post('/api/buy-slot', auth, (req, res) => {
  const userId = req.user.id;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (user.slots >= cfg.MAX_SLOTS) return res.status(400).json({ error: 'Farm is at max size' });
  const price = cfg.slotPrice(user.slots);
  if (user.coins < price) return res.status(400).json({ error: 'Not enough coins' });

  db.prepare('UPDATE users SET coins = coins - ?, slots = slots + 1 WHERE id = ?').run(price, userId);
  res.json({ state: getState(userId) });
});

// Buy a coin pack (in-app purchase). DEMO: credits coins instantly, no real payment.
app.post('/api/buy-coins', auth, (req, res) => {
  const userId = req.user.id;
  const { packId } = req.body || {};
  const pack = cfg.COIN_PACKS.find((p) => p.id === packId);
  if (!pack) return res.status(400).json({ error: 'Unknown pack' });

  const total = pack.coins + pack.bonus;
  db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(total, userId);
  res.json({ credited: total, state: getState(userId) });
});

// ---------- Admin ----------
function adminAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.admin) return res.status(403).json({ error: 'Not an admin' });
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(400).json({ error: 'Wrong admin password' });
  }
  const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

app.get('/api/admin/stats', adminAuth, (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY id DESC').all();
  const chickenCounts = {};
  db.prepare('SELECT user_id, COUNT(*) c FROM chickens GROUP BY user_id').all()
    .forEach((r) => { chickenCounts[r.user_id] = r.c; });

  const nameById = {};
  users.forEach((u) => { nameById[u.id] = u.username; });

  const rows = users.map((u) => ({
    id: u.id,
    username: u.username,
    coins: u.coins,
    slots: u.slots,
    chickens: chickenCounts[u.id] || 0,
    refCode: u.ref_code,
    referrals: u.referrals || 0,
    referredBy: u.referred_by ? (nameById[u.referred_by] || ('#' + u.referred_by)) : null,
    joined: u.created_at,
  }));

  const totals = {
    users: users.length,
    coins: users.reduce((a, u) => a + u.coins, 0),
    chickens: db.prepare('SELECT COUNT(*) c FROM chickens').get().c,
    referrals: users.reduce((a, u) => a + (u.referrals || 0), 0),
  };

  res.json({ totals, users: rows });
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Chicken Farm running on port ${PORT}`));
