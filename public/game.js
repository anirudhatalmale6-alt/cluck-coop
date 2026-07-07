// ---------- API helper ----------
let TOKEN = localStorage.getItem('cc_token') || null;
let STATE = null;
let authMode = 'login';

// Base path works whether the game is served at / (local) or /farm/ (production).
const API_BASE = (location.pathname.replace(/[^/]*$/, '')) + 'api/';
async function api(path, body) {
  const res = await fetch(API_BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

// ---------- Auth ----------
function switchTab(mode) {
  authMode = mode;
  document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
  document.getElementById('tabReg').classList.toggle('active', mode === 'register');
  document.getElementById('authErr').textContent = '';
  // Referral code only makes sense when signing up.
  document.getElementById('refCode').style.display = (mode === 'register') ? '' : 'none';
}

async function doAuth() {
  const username = document.getElementById('uname').value.trim();
  const password = document.getElementById('pass').value;
  const refCode = document.getElementById('refCode').value.trim();
  const errEl = document.getElementById('authErr');
  errEl.textContent = '';
  try {
    const body = { username, password };
    if (authMode === 'register' && refCode) body.refCode = refCode;
    const data = await api(authMode, body);
    TOKEN = data.token;
    localStorage.setItem('cc_token', TOKEN);
    STATE = data.state;
    document.getElementById('auth').style.display = 'none';
    render();
    if (data.referralApplied) setTimeout(() => toast('🎁 Referral bonus added!'), 400);
  } catch (e) {
    errEl.textContent = e.message;
  }
}

function logout() {
  localStorage.removeItem('cc_token');
  TOKEN = null; STATE = null;
  document.getElementById('auth').style.display = 'flex';
  document.getElementById('uname').value = '';
  document.getElementById('pass').value = '';
}

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

// ---------- Formatting ----------
function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}
function clock(ms) {
  if (ms <= 0) return 'Ready!';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${ss}s`;
}

// ---------- Render ----------
function render() {
  if (!STATE) return;
  document.getElementById('coinCount').textContent = fmt(STATE.coins);
  document.getElementById('chickenCount').textContent = STATE.usedSlots + '/' + STATE.slots;
  document.getElementById('playerName').textContent = STATE.username;

  // Total pending across all chickens
  const totalPending = STATE.chickens.reduce((a, c) => a + c.pending, 0);
  const badge = document.getElementById('collectBadge');
  if (totalPending > 0) { badge.style.display = ''; badge.textContent = totalPending; }
  else badge.style.display = 'none';

  // Coop grid
  const grid = document.getElementById('coopGrid');
  grid.innerHTML = '';
  STATE.chickens.forEach((c) => {
    const el = document.createElement('div');
    el.className = 'coop' + (c.pending > 0 ? ' ready' : '');
    const nestEggs = c.pending > 0 ? `<div class="eggs">${c.eggEmoji.repeat(Math.min(c.pending, 4))}</div>` : '';
    el.innerHTML = `
      ${c.pending > 0 ? `<div class="eggbadge">${c.eggEmoji} ${c.pending}</div>` : ''}
      <div class="roof"></div>
      <div class="house">
        <div class="chick">${c.emoji}</div>
        <div class="nest">${nestEggs}</div>
      </div>
      <div class="cname">${c.name}</div>
      <div class="timer" data-next="${c.nextEggMs}" data-full="${c.full}">${c.full ? 'Full!' : clock(c.nextEggMs)}</div>
    `;
    grid.appendChild(el);
  });
  // Empty slots
  for (let i = STATE.usedSlots; i < STATE.slots; i++) {
    const el = document.createElement('div');
    el.className = 'coop empty';
    el.innerHTML = `<div class="plot"><div class="plus">+</div><div class="lbl">Add Chicken</div></div>`;
    el.onclick = () => openSheet('shop');
    grid.appendChild(el);
  }

  // If a sheet is open, re-render it too
  if (currentSheet) renderSheet(currentSheet);
}

// Live tick for timers (visual only, refreshes from server periodically)
setInterval(() => {
  document.querySelectorAll('.coop .timer').forEach((t) => {
    if (t.dataset.full === 'true') return;
    let next = parseInt(t.dataset.next, 10) - 1000;
    if (next <= 0) { t.textContent = 'Ready!'; return; }
    t.dataset.next = next;
    t.textContent = clock(next);
  });
}, 1000);

// Periodic full refresh from server so offline/idle earnings show up
setInterval(async () => {
  if (!TOKEN) return;
  try { const d = await api('state'); STATE = d.state; render(); } catch (e) {}
}, 30000);

// ---------- Actions ----------
async function collectAll() {
  try {
    const d = await api('collect', {});
    STATE = d.state;
    if (d.collected > 0) toast(`🥚 Collected ${d.collected} eggs!`);
    else toast('No eggs ready yet - check back soon!');
    render();
  } catch (e) { toast(e.message); }
}

async function sellEggs(eggType) {
  try {
    const d = await api('sell', eggType ? { eggType } : {});
    STATE = d.state;
    if (d.earned > 0) toast(`🪙 +${fmt(d.earned)} coins!`);
    else toast('No eggs to sell - collect some first!');
    render();
  } catch (e) { toast(e.message); }
}

async function buyChicken(breed) {
  try {
    const d = await api('buy-chicken', { breed });
    STATE = d.state;
    toast('🐣 New chicken added!');
    render();
  } catch (e) { toast(e.message); }
}

async function buySlot() {
  try {
    const d = await api('buy-slot', {});
    STATE = d.state;
    toast('🌾 Farm expanded!');
    render();
  } catch (e) { toast(e.message); }
}

async function buyCoins(packId) {
  try {
    const d = await api('buy-coins', { packId });
    STATE = d.state;
    toast(`🪙 +${fmt(d.credited)} coins added!`);
    render();
  } catch (e) { toast(e.message); }
}

function shareRef(code) {
  if (!code) return;
  const link = location.origin + location.pathname.replace(/[^/]*$/, '');
  const msg = `🐔 Come raise chickens with me on Cluck Coop! Use my referral code ${code} when you sign up and we both get free coins. ${link}`;
  if (navigator.share) {
    navigator.share({ title: 'Cluck Coop', text: msg }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(msg).then(() => toast('📋 Invite copied!')).catch(() => toast('Your code: ' + code));
  } else {
    toast('Your code: ' + code);
  }
}

// ---------- Navigation ----------
function showFarm() {
  closeSheet();
  document.querySelectorAll('.nav button').forEach((b) => b.classList.remove('active'));
  document.getElementById('navFarm').classList.add('active');
}

let currentSheet = null;
function openSheet(which) {
  currentSheet = which;
  document.getElementById('sheetWrap').classList.add('open');
  renderSheet(which);
}
function closeSheet() {
  currentSheet = null;
  document.getElementById('sheetWrap').classList.remove('open');
}

function renderSheet(which) {
  const el = document.getElementById('sheet');
  let html = `<button class="close" onclick="closeSheet()">✕</button>`;

  if (which === 'shop') {
    html += `<h2>🐣 Buy Chickens</h2>`;
    Object.values(STATE.breeds).forEach((b) => {
      const afford = STATE.coins >= b.price;
      const full = STATE.usedSlots >= STATE.slots;
      html += `
        <div class="shop-item">
          <div class="big">${b.emoji}</div>
          <div class="info">
            <div class="t">${b.name}</div>
            <div class="d">Lays ${b.eggEmoji} worth ${fmt(b.eggValue)} coins each</div>
          </div>
          <button class="buybtn ${afford && !full ? '' : 'dim'}" onclick="buyChicken('${b.id}')">🪙 ${fmt(b.price)}</button>
        </div>`;
    });
    // Expand farm
    if (STATE.nextSlotPrice != null) {
      const afford = STATE.coins >= STATE.nextSlotPrice;
      html += `<div class="sectitle" style="color:#3a2a15;text-shadow:none;margin:16px 4px 4px">Expand Your Farm</div>
        <div class="shop-item">
          <div class="big">🏡</div>
          <div class="info"><div class="t">+1 Chicken Slot</div><div class="d">Currently ${STATE.slots} slots</div></div>
          <button class="buybtn ${afford ? '' : 'dim'}" onclick="buySlot()">🪙 ${fmt(STATE.nextSlotPrice)}</button>
        </div>`;
    }
  }

  else if (which === 'market') {
    html += `<h2>🏪 NPC Market</h2><p style="text-align:center;color:#8a7550;font-size:13px;margin-bottom:6px">Sell your eggs for coins</p>`;
    const valueByType = {};
    Object.values(STATE.breeds).forEach((b) => { valueByType[b.eggType] = { value: b.eggValue, emoji: b.eggEmoji, name: b.name }; });
    let any = false;
    Object.keys(STATE.eggs).forEach((type) => {
      const count = STATE.eggs[type];
      if (count > 0 && valueByType[type]) {
        any = true;
        const v = valueByType[type];
        html += `
          <div class="market-egg">
            <div class="big" style="font-size:34px">${v.emoji}</div>
            <div class="info"><div class="t">${count} egg${count > 1 ? 's' : ''}</div>
              <div class="d">${fmt(v.value)} coins each → ${fmt(v.value * count)} total</div></div>
            <button class="buybtn gold" onclick="sellEggs('${type}')">Sell</button>
          </div>`;
      }
    });
    if (!any) html += `<p style="text-align:center;color:#a8905c;padding:24px 0">Your basket is empty.<br>Collect eggs from your chickens first! 🧺</p>`;
    else html += `<div style="margin-top:14px"><button class="buybtn" style="width:100%;padding:14px" onclick="sellEggs()">💰 Sell Everything</button></div>`;
  }

  else if (which === 'invite') {
    const r = STATE.referral || {};
    html += `<h2>🎁 Invite Friends</h2>
      <p style="text-align:center;color:#8a7550;font-size:13px;margin-bottom:12px">
        Share your code. When a friend signs up with it, you get 🪙 ${fmt(r.rewardReferrer)} and they get 🪙 ${fmt(r.rewardNew)}!
      </p>
      <div style="background:#fff;border-radius:16px;padding:16px;box-shadow:0 3px 0 var(--shadow);text-align:center">
        <div style="font-size:12px;color:#8a7550;font-weight:700">YOUR REFERRAL CODE</div>
        <div style="font-size:30px;font-weight:800;letter-spacing:3px;color:#8a5624;margin:6px 0;font-family:monospace">${r.code || '—'}</div>
        <button class="buybtn" style="width:100%;padding:12px" onclick="shareRef('${r.code || ''}')">📤 Share / Copy Code</button>
      </div>
      <div style="display:flex;gap:10px;margin-top:12px">
        <div style="flex:1;background:#fff;border-radius:14px;padding:14px;text-align:center;box-shadow:0 3px 0 var(--shadow)">
          <div style="font-size:24px;font-weight:800;color:#42a91f">${r.count || 0}</div>
          <div style="font-size:11px;color:#8a7550;font-weight:700">Friends Joined</div>
        </div>
        <div style="flex:1;background:#fff;border-radius:14px;padding:14px;text-align:center;box-shadow:0 3px 0 var(--shadow)">
          <div style="font-size:24px;font-weight:800;color:#b8860b">${fmt(r.earned || 0)}</div>
          <div style="font-size:11px;color:#8a7550;font-weight:700">Coins Earned</div>
        </div>
      </div>`;
  }

  else if (which === 'coins') {
    html += `<h2>🪙 Get Coins</h2><p style="text-align:center;color:#8a7550;font-size:13px;margin-bottom:6px">DEMO - packs are free right now (no real payment)</p>`;
    STATE.coinPacks.forEach((p) => {
      html += `
        <div class="shop-item">
          <div class="big">💰</div>
          <div class="info">
            <div class="t">${fmt(p.coins)} Coins ${p.bonus ? `<span style="color:#42a91f">+${fmt(p.bonus)} bonus</span>` : ''}</div>
            <div class="d">Real price would be $${p.price.toFixed(2)}</div>
          </div>
          <button class="buybtn gold" onclick="buyCoins('${p.id}')">Get</button>
        </div>`;
    });
  }

  el.innerHTML = html;
}

// ---------- Boot ----------
(async function boot() {
  if (TOKEN) {
    try {
      const d = await api('state');
      STATE = d.state;
      document.getElementById('auth').style.display = 'none';
      render();
    } catch (e) {
      logout();
    }
  }
})();
