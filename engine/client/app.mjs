import { Renderer, assetUrl } from './renderer.mjs';
import { snapshotPreview } from './tile-format.mjs';
import { zoneView } from './protocol.mjs';

const $ = id => document.getElementById(id);
const renderer = new Renderer($('world'));
const state = { content: null, snapshot: null, mapId: null, preview: true, socket: null,
  token: sessionStorage.getItem('spaceship-token'), maps: new Map(), seq: 0, panel: null,
  reconnect: 0, reconnectTimer: null, sound: false, bgm: null, loading: 0, sessionGeneration: 0, ready: false, keys: new Set(), pendingDialogue: null };
const requestId = () => crypto.randomUUID();
const cleanText = text => String(text ?? '').replace(/\\[CcIi]\[\d+\]/g, '').replace(/\\[.!|^<>$]/g, '').replace(/\\[Gg]/g, 'G');

function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }

function notice(message, level = 'info') {
  const item = node('li'), time = node('time', '', new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' }));
  item.append(time, document.createTextNode(message)); $('activity-log').prepend(item);
  while ($('activity-log').children.length > 35) $('activity-log').lastElementChild.remove();
  const toast = node('div', `toast ${level === 'error' ? 'error' : ''}`, message);
  $('toast-stack').append(toast); setTimeout(() => toast.remove(), 4200);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options); let result;
  try { result = await response.json(); } catch { throw new Error(`服务返回了非 JSON 响应（HTTP ${response.status}）`); }
  if (!response.ok || result.error) throw new Error(typeof result.error === 'string' ? result.error : result.error?.message || `请求失败（HTTP ${response.status}）`);
  return result;
}

function send(message) {
  if (state.preview) { notice('当前为内容预览。登录后可测试联网玩法。'); return false; }
  if (!state.ready || state.socket?.readyState !== WebSocket.OPEN) { notice('世界状态尚未同步，操作未发送。', 'error'); return false; }
  state.socket.send(JSON.stringify(message)); return true;
}

async function loadMap(id, preview = state.preview) {
  const generation = ++state.loading, sessionGeneration = state.sessionGeneration;
  $('map-loading').hidden = false;
  try {
    if (!state.maps.has(id)) state.maps.set(id, await fetchJson(`/api/maps/${id}`));
    if (generation !== state.loading || sessionGeneration !== state.sessionGeneration) return;
    const map = state.maps.get(id), entry = state.content.maps.find(m => Number(m.id) === Number(id));
    state.mapId = Number(id);
    renderer.setMap(map, state.content.database.Tilesets?.[map.tilesetId], state.content.database);
    $('map-name').textContent = `${entry?.name || `地图 ${id}`} · ${map.width} × ${map.height}`;
    $('map-select').value = String(id);
    if (preview) { state.snapshot = snapshotPreview(map, Number(id)); renderer.accept(state.snapshot); }
    else if (state.snapshot?.mapId === Number(id)) renderer.accept(state.snapshot);
    if (map.autoplayBgm && map.bgm?.name) playAudio('bgm', map.bgm);
  } catch (error) { notice(`地图载入失败：${error.message}`, 'error'); }
  finally { if (generation === state.loading) $('map-loading').hidden = true; }
}

function setConnection(label, online = false) {
  $('connection-label').textContent = label;
  $('status-dot').classList.toggle('online', online);
}

function showSession() {
  $('welcome').hidden = true;
  $('mode-badge').textContent = state.preview ? '内容预览 · 不运行世界模拟' : '在线世界 · 服务端权威状态';
  $('session-description').textContent = state.preview ? '预览地图与素材。登录后进入在线世界。' : '打开菜单时，世界与网络仍持续运行。';
  $('travel-hint').textContent = state.preview ? '方向键移动预览视角。事件仅显示默认页面。' : '开发测试入口：由服务器执行地图传送。';
  $('travel-button').textContent = state.preview ? '预览所选地图' : '测试传送至所选地图';
  $('travel-button').disabled = !state.preview && !state.ready;
  $('logout-button').hidden = false;
  $('logout-button').textContent = state.preview ? '返回登录' : '退出账号';
  $('world').focus();
}

function scheduleReconnect(message = '连接中断') {
  const delay = Math.min(15000, 1000 * 2 ** state.reconnect++);
  notice(`${message}，${Math.round(delay / 1000)} 秒后自动重连。`, 'error');
  clearTimeout(state.reconnectTimer); state.reconnectTimer = setTimeout(connect, delay);
}

async function connect() {
  clearTimeout(state.reconnectTimer);
  if (!state.token) return;
  const token = state.token;
  state.sessionGeneration++; state.ready = false; state.keys.clear(); state.requestedMap = null;
  const generation = state.sessionGeneration;
  $('player-hud').hidden = true;
  state.preview = false;
  showSession(); setConnection(state.reconnect ? '正在重新连接' : '连接世界中');
  // An HTTP 401 WebSocket upgrade is exposed only as close code 1006 in browsers.
  // Validate explicitly so an expired or lost token does not retry forever.
  try {
    const response = await fetch('/api/session', { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (state.token !== token || generation !== state.sessionGeneration) return;
    if (response.status === 401) { logout(); $('login-error').textContent = '登录已失效或服务已重启，请重新登录。'; return; }
    if (!response.ok) throw new Error(response.status === 503 ? '数据库暂不可用' : `服务暂不可用（${response.status}）`);
  } catch (error) {
    if (state.token !== token || generation !== state.sessionGeneration) return;
    setConnection('等待服务恢复'); scheduleReconnect(error.message || '服务暂不可用'); return;
  }
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws?token=${encodeURIComponent(token)}`);
  state.socket = ws;
  ws.onopen = () => { if (state.socket !== ws) return; setConnection('同步世界状态中'); };
  ws.onmessage = event => {
    if (state.socket !== ws) return;
    let message;
    try { message = JSON.parse(event.data); } catch { notice('收到无法读取的服务器消息。', 'error'); return; }
    if (message.type === 'snapshot') {
      if (!state.ready) { state.ready = true; state.reconnect = 0; setConnection('世界已连接', true); }
      const changed = state.snapshot?.mapId !== message.mapId;
      state.snapshot = message;
      if (changed || state.mapId !== message.mapId) {
        if (state.requestedMap !== message.mapId) { state.requestedMap = message.mapId; loadMap(message.mapId, false).finally(() => { if (state.requestedMap === message.mapId) state.requestedMap = null; }); }
      } else renderer.accept(message);
      updateHud();
    } else if (message.type === 'effect') renderer.effect(message);
    else if (message.type === 'dialogue') showDialogue(message);
    else if (message.type === 'audio') playAudio(message.kind, message.audio);
    else if (message.type === 'eventEffect') eventEffect(message);
    else if (message.type === 'openCrafting') openPanel('craft');
    else if (message.type === 'notice' || message.type === 'error') notice(message.message || message.error || '服务器通知', message.level || (message.type === 'error' ? 'error' : 'info'));
  };
  ws.onclose = event => {
    if (state.socket !== ws || state.preview || !state.token) return;
    setConnection('连接已中断'); state.keys.clear(); state.ready = false; closeDialogue();
    if ([1008, 4001, 4003, 4401].includes(event.code)) { logout(); $('login-error').textContent = '登录已失效，请重新登录。'; return; }
    scheduleReconnect();
  };
  ws.onerror = () => { if (state.socket === ws) setConnection('连接失败'); };
}

async function authenticate(mode) {
  if (!$('login-form').reportValidity()) return;
  $('login-error').textContent = ''; $('login-button').disabled = $('register-button').disabled = true;
  try {
    const result = await fetchJson('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, username: $('username').value.trim(), password: $('password').value }) });
    state.token = result.token; sessionStorage.setItem('spaceship-token', state.token); $('password').value = ''; connect();
  } catch (error) { $('login-error').textContent = error.message; }
  finally { $('login-button').disabled = $('register-button').disabled = false; }
}

function logout() {
  clearTimeout(state.reconnectTimer); state.sessionGeneration++; state.ready = false; state.reconnect = 0; state.keys.clear(); state.preview = true; state.token = null; state.snapshot = null;
  sessionStorage.removeItem('spaceship-token'); const socket = state.socket; state.socket = null; socket?.close();
  $('welcome').hidden = false; $('player-hud').hidden = $('death-overlay').hidden = $('dev-section').hidden = true;
  $('logout-button').hidden = true; closePanel(); closeDialogue(); setConnection('未连接');
  renderer.resetPresentation(); updateHud();
  if (state.mapId) loadMap(state.mapId, true);
}

function itemData(kind, id) { return state.content?.database?.[{ item: 'Items', weapon: 'Weapons', armor: 'Armors' }[kind] || 'Items']?.[id]; }
function itemName(kind, id) { return itemData(kind, id)?.name || `${kind || '物品'} #${id}`; }
function me() { return state.snapshot?.players?.find(p => p.id === state.snapshot.playerId); }

function updateHud() {
  const player = me(), self = state.snapshot?.self || {};
  $('player-hud').hidden = !player; $('death-overlay').hidden = !player?.dead;
  $('dev-section').hidden = !state.snapshot?.devTools || state.preview;
  $('travel-button').disabled = !state.preview && !state.snapshot?.devTools;
  const zone = zoneView(state.snapshot?.zone, state.snapshot?.serverTime);
  $('zone-badge').hidden = !zone.visible;
  if (zone.visible) {
    $('zone-badge').textContent = state.snapshot.zone.message || (zone.active ? `本地图已进入禁区${zone.seconds === null ? '' : ` · ${zone.seconds} 秒`}` : `禁区预警 · ${zone.seconds} 秒后生效`);
  }
  if (player) {
    $('player-name').textContent = player.name; $('player-level').textContent = `Lv.${player.level || 1}`;
    for (const stat of ['hp', 'mp']) { const max = player[stat === 'hp' ? 'maxHp' : 'maxMp'] || 0;
      $(`${stat}-bar`).style.width = `${Math.max(0, Math.min(100, (player[stat] || 0) / (max || 1) * 100))}%`;
      $(`${stat}-text`).textContent = `${player[stat] || 0} / ${max}`;
    }
    $('coordinates').textContent = `X ${Math.round(player.x)} · Y ${Math.round(player.y)} · ${state.snapshot.players.length} 人 · TICK ${state.snapshot.tick}`;
  }
  const skillSignature = JSON.stringify(self.skills || []);
  if (state.skillSignature !== skillSignature) {
    state.skillSignature = skillSignature; const selected = $('skill-select').value;
    $('skill-select').replaceChildren(new Option('普通攻击', ''));
    for (const id of self.skills || []) { const skill = state.content.database.Skills?.[id]; if (skill) $('skill-select').add(new Option(`${skill.name} · MP ${skill.mpCost || 0}`, String(id))); }
    if ([...$('skill-select').options].some(o => o.value === selected)) $('skill-select').value = selected;
  }
  $('equipment-summary').textContent = `武器：${self.equips?.weapon ? itemName('weapon', self.equips.weapon) : '未装备'}\n防具：${self.equips?.armor ? itemName('armor', self.equips.armor) : '未装备'} · 金币 ${self.gold || 0}`;
  const signature = JSON.stringify([self.inventory, self.equips, self.gold]);
  if (signature !== state.inventorySignature) {
    state.inventorySignature = signature;
    if (state.panel === 'inventory') renderInventory();
    if (state.panel === 'craft') renderCraft();
  }
}

function openPanel(kind) {
  if (!state.content) { notice('内容仍在载入，请稍候。'); return; }
  state.panel = kind; state.keys.clear(); $('panel-overlay').hidden = false;
  $('panel-title').textContent = { inventory: '随身背包', craft: '合成工作台', report: '内容兼容报告' }[kind];
  $('panel-eyebrow').textContent = { inventory: 'FIELD KIT', craft: 'CRAFTING', report: 'CONTENT INSPECTOR' }[kind];
  $('close-panel').focus();
  if (kind === 'inventory') renderInventory(); if (kind === 'craft') renderCraft(); if (kind === 'report') renderReport();
}
function closePanel() { state.panel = null; $('panel-overlay').hidden = true; $('world').focus(); }
function iconFor(item) {
  const icon = node('span', 'item-icon'); const index = item?.iconIndex || 0;
  icon.style.backgroundPosition = `-${index % 16 * 32}px -${Math.floor(index / 16) * 32}px`; return icon;
}

function renderInventory() {
  const root = $('panel-content'); root.replaceChildren();
  if (state.preview) { root.append(node('p', 'empty-state', '内容预览不包含角色背包。登录进入世界后可拾取、装备和使用物品。')); return; }
  const self = state.snapshot?.self || {}, inventory = self.inventory || [];
  root.append(node('p', '', `持有金币：${self.gold || 0} G · ${inventory.length} 种物品`));
  if (!inventory.length) root.append(node('p', 'empty-state', '背包是空的。靠近掉落物按 E 拾取，或使用开发测试物品。'));
  for (const entry of inventory) {
    const data = itemData(entry.kind, entry.itemId), row = node('div', 'item-row'), description = node('div', 'item-description');
    description.append(node('strong', '', data?.name || itemName(entry.kind, entry.itemId)), node('span', 'quantity', ` ×${entry.quantity}`), node('p', '', cleanText(data?.description || '')));
    row.append(iconFor(data), description);
    const equipment = entry.kind === 'weapon' || entry.kind === 'armor';
    const equipped = self.equips?.[entry.kind] === entry.itemId;
    if (equipment || data?.consumable || data?.effects?.length) {
      const button = node('button', '', equipment ? equipped ? '已装备' : '装备' : '使用'); button.disabled = equipped;
      button.onclick = () => send(equipment ? { type: 'equip', kind: entry.kind, itemId: entry.itemId } : { type: 'useItem', itemId: entry.itemId, requestId: requestId() }); row.append(button);
    }
    root.append(row);
  }
  const player = me();
  if (player) {
    const nearby = (state.snapshot.drops || []).filter(d => Math.hypot(d.x - player.x, d.y - player.y) <= 2);
    if (nearby.length) root.append(node('h3', 'report-section-title', '附近掉落'));
    for (const drop of nearby) {
      const row = node('div', 'item-row'), text = node('div', 'item-description', `${itemName(drop.kind, drop.itemId)} ×${drop.quantity}`), button = node('button', '', '拾取');
      button.onclick = () => send({ type: 'pickup', entityId: drop.id, requestId: requestId() }); row.append(text, button); root.append(row);
    }
  }
}

function renderCraft() {
  const root = $('panel-content'); root.replaceChildren();
  for (const recipe of state.content?.recipes || []) {
    const result = recipe.result || recipe.output || {}, inputs = recipe.ingredients || recipe.inputs || [];
    const row = node('div', 'item-row'), description = node('div', 'item-description');
    description.append(node('strong', '', recipe.name || itemName(result.kind, result.itemId)), node('p', '', inputs.map(i => `${itemName(i.kind, i.itemId)} ×${i.amount ?? i.quantity ?? 1}`).join(' ＋ ')), node('p', '', `产出：${itemName(result.kind, result.itemId)} ×${result.amount ?? result.quantity ?? 1}`));
    const button = node('button', '', '合成'); button.disabled = state.preview;
    button.onclick = () => send({ type: 'craft', recipeId: recipe.id, requestId: requestId() }); row.append(iconFor(itemData(result.kind, result.itemId)), description, button); root.append(row);
  }
  if (!root.children.length) root.append(node('p', 'empty-state', '当前内容包尚未定义合成配方。'));
}

function renderReport() {
  const root = $('panel-content'); root.replaceChildren(); const coverage = state.content.coverage || {};
  const stats = node('div', 'report-stats');
  for (const [number, title] of [[state.content.maps.length, '张地图已索引'], [Object.values(state.content.database).filter(Array.isArray).reduce((sum, a) => sum + a.filter(Boolean).length, 0), '条数据库定义'], [renderer.images.missing.size, '项预览资源缺失']]) {
    const stat = node('div', 'report-stat'); stat.append(node('strong', '', String(number)), node('span', '', title)); stats.append(stat);
  }
  root.append(stats, node('p', '', '使用新的地图渲染、客户端与服务端；未加载原 RPG Maker 运行时或旧插件。内容可读取不代表所有插件行为均已实现。'));
  root.append(node('h3', 'report-section-title', '渲染支持'), node('p', '', 'MV/MZ 标准 48 px 图块：A1 水面与瀑布动画、A2 地板与桌沿、A3/A4 墙面、A5 与 B–E 普通图块、四层地图、阴影、星标遮挡、区域 ID、$ / ! 人物切片、MV 帧动画。MZ Effekseer 特效与插件专用素材布局尚未适配。'));
  if (renderer.images.missing.size) root.append(node('h3', 'report-section-title', '本次预览资源缺失'), node('pre', 'report-pre', [...renderer.images.missing].join('\n')));
  if (state.unhandledEffects?.size) root.append(node('h3', 'report-section-title', '未适配的事件表现命令'), node('pre', 'report-pre', [...state.unhandledEffects].join(', ')));
  root.append(node('h3', 'report-section-title', '导入器检查结果'), node('pre', 'report-pre', JSON.stringify(coverage, null, 2)));
  if (renderer.map) root.append(node('h3', 'report-section-title', '当前地图'), node('pre', 'report-pre', JSON.stringify({ mapId: state.mapId, tilesetId: renderer.map.tilesetId, width: renderer.map.width, height: renderer.map.height, events: renderer.map.events.filter(Boolean).length, scrollType: renderer.map.scrollType }, null, 2)));
}

function closeDialogue() { state.pendingDialogue = null; $('dialogue').hidden = true; }
function showDialogue(message) {
  if (message.close) { closeDialogue(); return; }
  state.pendingDialogue = message; state.keys.clear(); $('dialogue').hidden = false;
  $('dialogue-speaker').textContent = message.speaker || '事件'; $('dialogue-text').textContent = cleanText(Array.isArray(message.text) ? message.text.join('\n') : message.text);
  const choices = $('dialogue-choices'); choices.replaceChildren();
  const options = message.choices?.length ? message.choices : ['继续'];
  options.forEach((text, i) => { const button = node('button', '', cleanText(text)); button.onclick = () => {
    if (send({ type: 'dialogue', choice: message.choices?.length ? i : null })) closeDialogue();
  }; choices.append(button); });
}

function attack() { const id = Number($('skill-select').value); send({ type: 'attack', ...(id > 0 ? { skillId: id } : {}) }); }
function interact() {
  const player = me();
  const near = player && [...(state.snapshot.drops || [])].sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
  if (near && Math.hypot(near.x - player.x, near.y - player.y) <= 1.5) send({ type: 'pickup', entityId: near.id, requestId: requestId() });
  else send({ type: 'interact' });
}

function playAudio(kind, data) {
  if (!data?.name || !state.sound) return;
  const audio = new Audio(assetUrl(`audio/${kind}`, data.name, 'ogg'));
  audio.volume = Math.min(1, Math.max(0, (data.volume ?? 70) / 100 * .5)); audio.playbackRate = (data.pitch || 100) / 100;
  if (kind === 'bgm' || kind === 'bgs') { const key = kind; state[key]?.pause(); state[key] = audio; audio.loop = true; }
  audio.onerror = () => { if (!audio.src.endsWith('.m4a')) { audio.src = assetUrl(`audio/${kind}`, data.name, 'm4a'); audio.play().catch(() => {}); } };
  audio.play().catch(() => {});
}

function eventEffect(message) {
  const p = message.parameters || [];
  if (message.code === 'popup') { notice(cleanText(message.text)); return; }
  if (message.code === 212 || message.code === 213) {
    const target = p[0] === -1 ? me() : state.snapshot?.events?.find(e => e.eventId === (p[0] || message.eventId));
    if (!target) return;
    if (message.code === 212) renderer.effect({ kind: 'attack', animationId: p[1], x: target.x, y: target.y });
    else renderer.effect({ kind: 'balloon', balloonId: p[1], x: target.x, y: target.y });
    return;
  }
  const audioKinds = { 241: 'bgm', 245: 'bgs', 249: 'me', 250: 'se' };
  if (audioKinds[message.code]) { playAudio(audioKinds[message.code], p[0]); return; }
  if (message.code === 242 || message.code === 246) { state[message.code === 242 ? 'bgm' : 'bgs']?.pause(); return; }
  if ([221, 222, 223, 224, 225, 231, 232, 233, 235].includes(message.code)) {
    if ((message.code === 231 || message.code === 232) && p[3] !== 0) {
      notice(`事件 ${message.eventId} 的图片使用变量坐标，需要导入器转换为具体坐标。`); return;
    }
    renderer.presentation(message.code, p); return;
  }
  state.unhandledEffects ||= new Set();
  if (!state.unhandledEffects.has(message.code)) {
    state.unhandledEffects.add(message.code); notice(`事件表现命令 ${message.code} 尚未适配，已记录到兼容报告。`);
  }
}

$('login-form').onsubmit = event => { event.preventDefault(); authenticate('login'); };
$('register-button').onclick = () => authenticate('register');
$('preview-button').onclick = async () => {
  if (!state.content) return;
  state.sessionGeneration++; state.ready = false; state.keys.clear();
  state.preview = true; showSession(); setConnection('内容预览');
  await loadMap(Number($('map-select').value || state.content.maps[0]?.id));
  notice('正在预览原始地图。方向键平移视角，右侧可切换地图。');
};
$('logout-button').onclick = logout;
$('attack-button').onclick = attack; $('interact-button').onclick = interact;
$('inventory-button').onclick = () => openPanel('inventory'); $('craft-button').onclick = () => openPanel('craft');
$('report-button').onclick = () => openPanel('report'); $('close-panel').onclick = closePanel;
$('panel-overlay').onclick = event => { if (event.target === $('panel-overlay')) closePanel(); };
$('travel-button').onclick = () => {
  const id = Number($('map-select').value); closeDialogue();
  if (state.preview) loadMap(id); else send({ type: 'travel', mapId: id });
};
$('grid-toggle').onchange = event => { renderer.showGrid = event.target.checked; };
$('region-toggle').onchange = event => { renderer.showRegions = event.target.checked; };
for (const button of document.querySelectorAll('[data-dev]')) button.onclick = () => send({ type: 'dev', action: button.dataset.dev });
$('respawn-button').onclick = () => send({ type: 'respawn' });
function zoom(value) { renderer.zoom = Math.min(2, Math.max(.5, value)); $('zoom-label').textContent = `${Math.round(renderer.zoom * 100)}%`; }
$('zoom-out').onclick = () => zoom(renderer.zoom - .25); $('zoom-in').onclick = () => zoom(renderer.zoom + .25);
$('sound-button').onclick = () => {
  state.sound = !state.sound; $('sound-button').textContent = `声音：${state.sound ? '开' : '关'}`;
  if (!state.sound) { state.bgm?.pause(); state.bgs?.pause(); }
  else if (renderer.map?.autoplayBgm) playAudio('bgm', renderer.map.bgm);
};
$('world').addEventListener('click', event => {
  $('world').focus(); if (state.preview) return;
  const p = renderer.screenToMap(event.clientX, event.clientY);
  const drop = state.snapshot?.drops?.find(d => Math.hypot(d.x + .5 - p.x, d.y + .5 - p.y) < .65);
  if (drop) send({ type: 'pickup', entityId: drop.id, requestId: requestId() });
});
const directions = { KeyW: 8, ArrowUp: 8, KeyS: 2, ArrowDown: 2, KeyA: 4, ArrowLeft: 4, KeyD: 6, ArrowRight: 6 };
window.addEventListener('keydown', event => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || !$('welcome').hidden) return;
  if (event.code === 'Escape') { closePanel(); state.keys.clear(); return; }
  if (event.code === 'Tab') { event.preventDefault(); if (state.panel) closePanel(); else openPanel('inventory'); return; }
  if (state.panel) return;
  if (state.pendingDialogue) { if ((event.code === 'Enter' || event.code === 'KeyE') && !event.repeat && !state.pendingDialogue.choices?.length) $('dialogue-choices').firstElementChild?.click(); return; }
  if (directions[event.code]) { event.preventDefault(); state.keys.delete(event.code); state.keys.add(event.code); if(!event.repeat)moveFromKeyboard(); }
  if ((event.code === 'KeyJ' || event.code === 'Space') && !event.repeat) { event.preventDefault(); attack(); }
  if (event.code === 'KeyE' && !event.repeat) { event.preventDefault(); interact(); }
});
window.addEventListener('keyup', event => state.keys.delete(event.code));
window.addEventListener('blur', () => state.keys.clear());
document.addEventListener('visibilitychange', () => state.keys.clear());
function moveFromKeyboard() {
  if (state.panel || state.pendingDialogue || !$('welcome').hidden) return;
  const key = [...state.keys].at(-1), direction = directions[key]; if (!direction) return;
  if (state.preview) {
    renderer.pan(direction === 6 ? .6 : direction === 4 ? -.6 : 0, direction === 2 ? .6 : direction === 8 ? -.6 : 0);
    $('coordinates').textContent = `预览 X ${Math.round(renderer.viewCenter?.x || 0)} · Y ${Math.round(renderer.viewCenter?.y || 0)}`;
  } else if (state.ready && state.socket?.readyState === WebSocket.OPEN && !me()?.dead) send({ type: 'move', direction, seq: ++state.seq });
}
setInterval(moveFromKeyboard, 150);

async function initialize() {
  try {
    state.content = await fetchJson('/api/content');
    $('map-select').replaceChildren(...state.content.maps.map(m => new Option(`${String(m.id).padStart(3, '0')} · ${m.name}`, String(m.id))));
    $('map-count').textContent = `${state.content.maps.length} 张`;
    const initial = state.content.database.System?.startMapId || state.content.maps[0]?.id;
    if (initial) await loadMap(initial, true);
    $('preview-button').disabled = $('login-button').disabled = $('register-button').disabled = false;
    if (state.token) connect();
  } catch (error) {
    $('login-error').textContent = `无法读取内容：${error.message}`;
    $('preview-button').disabled = $('login-button').disabled = $('register-button').disabled = true;
    setConnection('内容服务不可用');
  }
}
initialize();
