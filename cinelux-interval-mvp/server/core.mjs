import { buildLiveInsights, buildSampleInsights, validateInsightRange } from './insights.mjs';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sessionCookie = 'theatreos_staff';
const sessionSeconds = 8 * 60 * 60;
const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' };

export const menu = [
  { id: 'popcorn-classic', name: 'Classic Salted Popcorn', category: 'Popcorn', badge: 'Best seller', emoji: '🍿', price: 220, prepMinutes: 3, description: 'Warm, crunchy cinema popcorn with a light salt finish.', ingredients: ['Popcorn kernels', 'Sunflower oil', 'Salt'], allergens: [], recipe: { kernels: 1, oil: 1, salt: 1 }, image: 'popcorn' },
  { id: 'popcorn-cheese', name: 'Cheese Popcorn', category: 'Popcorn', badge: 'Best seller', emoji: '🍿', price: 260, prepMinutes: 4, description: 'Fresh popcorn coated in our rich cheese seasoning.', ingredients: ['Popcorn kernels', 'Sunflower oil', 'Cheese seasoning'], allergens: ['Milk'], recipe: { kernels: 1, oil: 1, cheese: 1 }, image: 'cheese' },
  { id: 'nachos', name: 'Loaded Nachos', category: 'Snacks', badge: 'Popular', emoji: '🧀', price: 280, prepMinutes: 7, description: 'Crisp corn chips with warm cheese sauce and salsa.', ingredients: ['Corn chips', 'Cheese sauce', 'Tomato salsa'], allergens: ['Milk'], recipe: { chips: 1, sauce: 1, salsa: 1 }, image: 'nachos' },
  { id: 'cold-coffee', name: 'Cold Coffee', category: 'Drinks', badge: '', emoji: '🥤', price: 180, prepMinutes: 5, description: 'Chilled coffee with milk and a smooth, creamy finish.', ingredients: ['Coffee', 'Milk', 'Sugar'], allergens: ['Milk'], recipe: { coffee: 1, milk: 1, sugar: 1 }, image: 'coffee' },
  { id: 'cola', name: 'Chilled Cola', category: 'Drinks', badge: '', emoji: '🥤', price: 140, prepMinutes: 1, description: 'Cold 300 ml cola, ready to enjoy with the film.', ingredients: ['Cola'], allergens: [], recipe: { cola: 1 }, image: 'cola' },
  { id: 'interval-combo', name: 'Interval Duo Combo', category: 'Combos', badge: 'Save ₹50', emoji: '✨', price: 310, prepMinutes: 4, description: 'Classic popcorn and one chilled cola, timed for the interval.', ingredients: ['Popcorn kernels', 'Sunflower oil', 'Salt', 'Cola'], allergens: [], recipe: { kernels: 1, oil: 1, salt: 1, cola: 1 }, image: 'combo' },
  { id: 'friends-combo', name: 'Friends Night Combo', category: 'Combos', badge: 'Save ₹90', emoji: '🎬', price: 710, prepMinutes: 7, description: 'Two cheese popcorn tubs and two chilled colas.', ingredients: ['Popcorn kernels', 'Sunflower oil', 'Cheese seasoning', 'Cola'], allergens: ['Milk'], recipe: { kernels: 2, oil: 2, cheese: 2, cola: 2 }, image: 'friends' }
];

const pantrySeed = [
  { id: 'kernels', name: 'Popcorn kernels', unit: 'portions', onHand: 33, reorderAt: 20, target: 60, cost: 24 },
  { id: 'oil', name: 'Sunflower oil', unit: 'portions', onHand: 32, reorderAt: 18, target: 50, cost: 9 },
  { id: 'salt', name: 'Salt', unit: 'portions', onHand: 60, reorderAt: 20, target: 70, cost: 2 },
  { id: 'cheese', name: 'Cheese seasoning', unit: 'portions', onHand: 7, reorderAt: 12, target: 30, cost: 34 },
  { id: 'chips', name: 'Corn chips', unit: 'portions', onHand: 9, reorderAt: 12, target: 30, cost: 42 },
  { id: 'sauce', name: 'Cheese sauce', unit: 'portions', onHand: 9, reorderAt: 12, target: 30, cost: 38 },
  { id: 'salsa', name: 'Tomato salsa', unit: 'portions', onHand: 12, reorderAt: 10, target: 25, cost: 18 },
  { id: 'coffee', name: 'Coffee', unit: 'serves', onHand: 15, reorderAt: 10, target: 30, cost: 20 },
  { id: 'milk', name: 'Milk', unit: 'serves', onHand: 14, reorderAt: 12, target: 35, cost: 24 },
  { id: 'sugar', name: 'Sugar', unit: 'serves', onHand: 45, reorderAt: 15, target: 60, cost: 3 },
  { id: 'cola', name: 'Cola', unit: 'bottles', onHand: 24, reorderAt: 16, target: 50, cost: 52 }
];

function isoAgo(minutes) { return new Date(Date.now() - minutes * 60_000).toISOString(); }
function isoFromNow(minutes) { return new Date(Date.now() + minutes * 60_000).toISOString(); }
function itemPrice(items) { return items.reduce((sum, line) => sum + menu.find(item => item.id === line.id).price * line.qty, 0); }

export function createDemoState() {
  const delivered = [
    ['F4', 'popcorn-cheese', 1, 155, 142], ['G12', 'interval-combo', 1, 135, 121],
    ['B8', 'nachos', 1, 115, 101], ['C2', 'popcorn-classic', 2, 99, 85],
    ['D5', 'friends-combo', 1, 83, 68], ['H9', 'cold-coffee', 2, 65, 49],
    ['A11', 'popcorn-cheese', 2, 51, 36], ['E3', 'interval-combo', 1, 42, 27]
  ].map(([seat, id, qty, placed, delivered], index) => ({ id: `TO-${2201 + index}`, seat, screen: 2, items: [{ id, qty }], subtotal: itemPrice([{ id, qty }]), discount: 0, total: itemPrice([{ id, qty }]), couponCode: null, fulfilment: 'now', createdAt: isoAgo(placed), targetAt: isoAgo(placed - 14), startedAt: isoAgo(placed - 2), readyAt: isoAgo(placed - 9), outAt: isoAgo(placed - 11), deliveredAt: isoAgo(delivered), status: 'delivered', demo: true }));
  delivered[7].couponCode = 'DIRECT10';
  delivered[7].discount = Math.min(80, Math.round(delivered[7].subtotal * 0.10));
  delivered[7].total -= delivered[7].discount;
  const active = [
    ['F7', 'popcorn-cheese', 'new', 5, 11], ['H2', 'nachos', 'preparing', 8, 7],
    ['E11', 'interval-combo', 'ready', 10, 5], ['C9', 'friends-combo', 'new', 2, 14],
    ['A4', 'cola', 'new', 1, 10], ['D6', 'popcorn-classic', 'preparing', 7, 6]
  ].map(([seat, id, status, placed, due], index) => ({ id: `TO-${2209 + index}`, seat, screen: 2, items: [{ id, qty: 1 }], subtotal: itemPrice([{ id, qty: 1 }]), discount: 0, total: itemPrice([{ id, qty: 1 }]), couponCode: null, fulfilment: 'now', createdAt: isoAgo(placed), targetAt: isoFromNow(due), startedAt: status === 'preparing' ? isoAgo(Math.max(1, placed - 2)) : null, readyAt: status === 'ready' ? isoAgo(1) : null, outAt: null, deliveredAt: null, status, demo: true }));
  return { venue: 'Demo Cinema', pantry: pantrySeed.map(item => ({ ...item })), orders: [...active, ...delivered], coupons: [{ code: 'DIRECT10', source: 'direct-website-demo', issuedAt: isoAgo(70), expiresAt: isoFromNow(30 * 24 * 60), redeemedAt: isoAgo(43), orderId: 'TO-2208' }], nextOrder: 2215, runnerCount: 2, createdAt: new Date().toISOString() };
}

export class MemoryStore {
  constructor(initial = createDemoState()) { this.state = initial; this.queue = Promise.resolve(); }
  async read() { return structuredClone(this.state); }
  async update(fn) {
    const task = this.queue.then(async () => { const next = structuredClone(this.state); const result = await fn(next); this.state = next; return result; });
    this.queue = task.catch(() => {});
    return task;
  }
}

function respond(data, status = 200, extra = {}) { return new Response(JSON.stringify(data), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8', ...extra } }); }
function error(message, status = 400) { return respond({ error: message }, status); }
function base64Url(bytes) { let raw = ''; for (const byte of bytes) raw += String.fromCharCode(byte); return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function fromBase64Url(value) { const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')); return Uint8Array.from(raw, c => c.charCodeAt(0)); }
async function signature(value, secret) { const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))); }
function equal(a, b) { if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false; let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i); return difference === 0; }
async function issueSession(role, secret) { const payload = base64Url(encoder.encode(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + sessionSeconds }))); return `${payload}.${await signature(payload, secret)}`; }
async function readSession(request, secret) {
  if (!secret) return null;
  const cookie = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${sessionCookie}=`));
  const token = cookie?.slice(sessionCookie.length + 1);
  if (!token) return null;
  const [payload, proof, extra] = token.split('.');
  if (!payload || !proof || extra || !equal(proof, await signature(payload, secret))) return null;
  try { const data = JSON.parse(decoder.decode(fromBase64Url(payload))); return ['manager', 'employee'].includes(data.role) && Number.isSafeInteger(data.exp) && data.exp > Date.now() / 1000 ? data.role : null; } catch { return null; }
}
function sameOrigin(request) { return request.headers.get('origin') === new URL(request.url).origin; }
function parseBody(request) { return request.json().catch(() => null); }
function cookieHeader(request, token, age) { const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''; return `${sessionCookie}=${token}; Path=/; Max-Age=${age}; HttpOnly; SameSite=Lax${secure}`; }
function requireRole(role, allowed) { return allowed.includes(role) ? null : error('Staff sign-in required', 401); }

function showSlots() {
  const interval = Math.ceil((Date.now() + 12 * 60_000) / (30 * 60_000)) * (30 * 60_000);
  return [
    { id: 'screen-2', screen: 2, movie: 'The Midnight Frame', intervalAt: new Date(interval).toISOString(), label: 'Current show' },
    { id: 'screen-1', screen: 1, movie: 'City Lights', intervalAt: new Date(interval + 60 * 60_000).toISOString(), label: 'Next show' },
    { id: 'screen-3', screen: 3, movie: 'Beyond the Horizon', intervalAt: new Date(interval + 120 * 60_000).toISOString(), label: 'Later show' }
  ];
}
function itemAvailable(item, pantry) { return Object.entries(item.recipe).every(([id, qty]) => (pantry.find(p => p.id === id)?.onHand ?? 0) >= qty); }
function etaFor(item, state) { const active = state.orders.filter(order => !['delivered', 'cancelled'].includes(order.status)).length; return item.prepMinutes + 4 + Math.min(active, 8); }
function publicMenu(state) { return menu.map(({ recipe, ...item }) => ({ ...item, available: itemAvailable({ recipe }, state.pantry), etaMinutes: etaFor(item, state) })); }
function recipeNeeds(lines) { const needs = {}; for (const line of lines) { const item = menu.find(entry => entry.id === line.id); for (const [id, amount] of Object.entries(item.recipe)) needs[id] = (needs[id] || 0) + amount * line.qty; } return needs; }
function orderPriority(order) { const longest = Math.max(...order.items.map(line => menu.find(item => item.id === line.id)?.prepMinutes || 0)); return new Date(order.targetAt).getTime() - longest * 60_000; }
function sortedOrders(orders) { return [...orders].sort((a, b) => { const doneA = a.status === 'delivered' ? 1 : 0; const doneB = b.status === 'delivered' ? 1 : 0; return doneA - doneB || orderPriority(a) - orderPriority(b); }); }
function itemCost(item, pantry) { return Object.entries(item.recipe).reduce((sum, [id, qty]) => sum + (pantry.find(p => p.id === id)?.cost || 0) * qty, 0); }

function managerReport(state) {
  const orders = state.orders;
  const delivered = orders.filter(order => order.status === 'delivered');
  const revenue = orders.reduce((sum, order) => sum + order.total, 0);
  const prepOnTime = delivered.filter(order => order.readyAt && new Date(order.readyAt).getTime() <= new Date(order.targetAt).getTime()).length;
  const deliveryOnTime = delivered.filter(order => order.deliveredAt && new Date(order.deliveredAt).getTime() <= new Date(order.targetAt).getTime() + 6 * 60_000).length;
  const itemStats = menu.map(item => {
    const units = orders.reduce((sum, order) => sum + order.items.filter(line => line.id === item.id).reduce((count, line) => count + line.qty, 0), 0);
    const sales = units * item.price;
    const margin = item.price ? Math.round((item.price - itemCost(item, state.pantry)) / item.price * 100) : 0;
    return { id: item.id, name: item.name, units, sales, estimatedMarginPercent: margin, recommendation: units >= 3 ? 'Promote' : units <= 1 && margin < 65 ? 'Review' : 'Observe' };
  }).sort((a, b) => b.sales - a.sales);
  const activeSoon = orders.filter(order => order.status !== 'delivered' && new Date(order.targetAt).getTime() < Date.now() + 25 * 60_000).length;
  const requiredRunners = Math.max(1, Math.ceil(activeSoon * 6 / 15));
  const coupons = state.coupons;
  const redeemed = coupons.filter(coupon => coupon.redeemedAt).length;
  return { summary: { orders: orders.length, processed: delivered.length, revenue, averageOrder: orders.length ? Math.round(revenue / orders.length) : 0, prepOnTimePercent: delivered.length ? Math.round(prepOnTime / delivered.length * 100) : 0, deliveryOnTimePercent: delivered.length ? Math.round(deliveryOnTime / delivered.length * 100) : 0 }, itemStats, offers: { issued: coupons.length, redeemed, redemptionPercent: coupons.length ? Math.round(redeemed / coupons.length * 100) : 0, discountedRevenue: orders.filter(order => order.couponCode).reduce((sum, order) => sum + order.total, 0) }, staffing: { currentRunners: state.runnerCount, estimatedRunners: requiredRunners, additionalRunners: Math.max(0, requiredRunners - state.runnerCount), dueSoon: activeSoon, assumption: '6 minutes per delivery, 15-minute interval window' }, pantryAlerts: state.pantry.filter(item => item.onHand <= item.reorderAt).length, demo: true };
}

export function createApp({ store, assets, env, loadSampleInsights = async () => null }) {
  const failedLogins = new Map();
  return async function handle(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === '/api/health') return respond({ ok: true, product: 'TheatreOS' });
      if (path === '/api/login' && request.method === 'POST') {
        if (!sameOrigin(request)) return error('Invalid request origin', 403);
        const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || 'local';
        const attempt = failedLogins.get(ip);
        if (attempt && attempt.count >= 5 && attempt.until > Date.now()) return error('Too many attempts. Try again in 10 minutes.', 429);
        const data = await parseBody(request);
        const expected = data?.role === 'manager' ? env.MANAGER_PIN : data?.role === 'employee' ? env.EMPLOYEE_PIN : null;
        if (!expected || !/^\d{6}$/.test(data?.pin || '') || !equal(data.pin, expected)) {
          failedLogins.set(ip, { count: attempt && attempt.until > Date.now() ? attempt.count + 1 : 1, until: Date.now() + 10 * 60_000 });
          return error('Incorrect role or PIN', 401);
        }
        failedLogins.delete(ip);
        const token = await issueSession(data.role, env.SESSION_SECRET);
        return respond({ role: data.role }, 200, { 'set-cookie': cookieHeader(request, token, sessionSeconds) });
      }
      if (path === '/api/session' && request.method === 'GET') return respond({ role: await readSession(request, env.SESSION_SECRET) });
      if (path === '/api/logout' && request.method === 'POST') {
        if (!sameOrigin(request)) return error('Invalid request origin', 403);
        return respond({ ok: true }, 200, { 'set-cookie': cookieHeader(request, '', 0) });
      }
      if (path === '/api/bootstrap' && request.method === 'GET') {
        const state = await store.read();
        return respond({ brand: 'TheatreOS', venue: state.venue, shows: showSlots(), menu: publicMenu(state), demo: true });
      }
      if (path === '/api/orders' && request.method === 'POST') {
        if (!sameOrigin(request)) return error('Invalid request origin', 403);
        const data = await parseBody(request);
        if (!data || !/^[A-Z]\d{1,2}$/.test(data.seat || '') || !Array.isArray(data.items) || data.items.length < 1 || data.items.length > 10) return error('Enter a valid seat and basket');
        const lines = data.items.map(line => ({ id: line.id, qty: Number(line.qty) }));
        if (lines.some(line => !menu.some(item => item.id === line.id) || !Number.isInteger(line.qty) || line.qty < 1 || line.qty > 6)) return error('Invalid item quantity');
        const fulfilment = ['now', 'interval'].includes(data.fulfilment) ? data.fulfilment : null;
        const show = showSlots().find(slot => slot.id === data.showId);
        if (!fulfilment || !show || (fulfilment === 'now' && show.id !== 'screen-2')) return error('Choose a valid delivery time');
        const needs = recipeNeeds(lines);
        const result = await store.update(state => {
          for (const [id, qty] of Object.entries(needs)) if ((state.pantry.find(item => item.id === id)?.onHand || 0) < qty) return { error: 'An item sold out. Refresh the menu and try again.', status: 409 };
          const couponCode = String(data.couponCode || '').trim().toUpperCase();
          const coupon = couponCode ? state.coupons.find(entry => entry.code === couponCode && !entry.redeemedAt && new Date(entry.expiresAt).getTime() > Date.now()) : null;
          if (couponCode && !coupon) return { error: 'Coupon is invalid, used, or expired', status: 400 };
          const subtotal = itemPrice(lines);
          const discount = coupon ? Math.min(80, Math.round(subtotal * 0.10)) : 0;
          const createdAt = new Date().toISOString();
          const targetAt = fulfilment === 'now' ? isoFromNow(12) : show.intervalAt;
          const order = { id: `TO-${state.nextOrder++}`, seat: data.seat, screen: show.screen, show: show.movie, items: lines, subtotal, discount, total: subtotal - discount, couponCode: coupon?.code || null, fulfilment, createdAt, targetAt, startedAt: null, readyAt: null, outAt: null, deliveredAt: null, status: fulfilment === 'interval' && new Date(targetAt).getTime() - Date.now() > 25 * 60_000 ? 'scheduled' : 'new', demo: true };
          for (const [id, qty] of Object.entries(needs)) state.pantry.find(item => item.id === id).onHand -= qty;
          if (coupon) { coupon.redeemedAt = createdAt; coupon.orderId = order.id; }
          state.orders.unshift(order);
          return { order };
        });
        return result.error ? error(result.error, result.status) : respond(result, 201);
      }
      if (path === '/api/staff' && request.method === 'GET') {
        const role = await readSession(request, env.SESSION_SECRET);
        if (!role) return requireRole(role, ['manager', 'employee']);
        const state = await store.read();
        return respond({ orders: sortedOrders(state.orders), pantry: state.pantry.map(item => ({ id: item.id, name: item.name, unit: item.unit, onHand: item.onHand, reorderAt: item.reorderAt, addRequired: Math.max(0, item.target - item.onHand) })), menu: menu.map(item => ({ id: item.id, name: item.name, prepMinutes: item.prepMinutes })), role, demo: true });
      }
      const statusMatch = path.match(/^\/api\/orders\/(TO-\d+)\/status$/);
      if (statusMatch && request.method === 'POST') {
        if (!sameOrigin(request)) return error('Invalid request origin', 403);
        const role = await readSession(request, env.SESSION_SECRET);
        if (!role) return requireRole(role, ['manager', 'employee']);
        const transition = { scheduled: 'preparing', new: 'preparing', preparing: 'ready', ready: 'out_for_delivery', out_for_delivery: 'delivered' };
        const result = await store.update(state => {
          const order = state.orders.find(entry => entry.id === statusMatch[1]);
          if (!order) return { error: 'Order not found', status: 404 };
          const next = transition[order.status];
          if (!next) return { error: 'Order is already complete', status: 409 };
          order.status = next;
          const at = new Date().toISOString();
          if (next === 'preparing') order.startedAt = at;
          if (next === 'ready') order.readyAt = at;
          if (next === 'out_for_delivery') order.outAt = at;
          if (next === 'delivered') order.deliveredAt = at;
          return { order };
        });
        return result.error ? error(result.error, result.status) : respond(result);
      }
      const pantryMatch = path.match(/^\/api\/pantry\/([a-z]+)\/restock$/);
      if (pantryMatch && request.method === 'POST') {
        if (!sameOrigin(request)) return error('Invalid request origin', 403);
        const role = await readSession(request, env.SESSION_SECRET);
        if (!role) return requireRole(role, ['manager', 'employee']);
        const data = await parseBody(request);
        const qty = Number(data?.qty);
        if (!Number.isInteger(qty) || qty < 1 || qty > 500) return error('Enter a restock amount from 1 to 500');
        const result = await store.update(state => { const item = state.pantry.find(entry => entry.id === pantryMatch[1]); if (!item) return { error: 'Ingredient not found', status: 404 }; item.onHand += qty; return { item }; });
        return result.error ? error(result.error, result.status) : respond(result);
      }
      if (path === '/api/manager' && request.method === 'GET') {
        const role = await readSession(request, env.SESSION_SECRET);
        if (role !== 'manager') return error('Manager access required', 403);
        return respond(managerReport(await store.read()));
      }
      if (path === '/api/insights' && request.method === 'GET') {
        const role = await readSession(request, env.SESSION_SECRET);
        if (role !== 'manager') return error('Manager access required', 403);
        const range = validateInsightRange(url.searchParams);
        if (range.error) return error(range.error);
        const source = url.searchParams.get('source') || 'live';
        if (source === 'live') return respond(buildLiveInsights(await store.read(), menu, range));
        if (source !== 'sample') return error('Unknown insights source');
        const sample = await loadSampleInsights();
        if (!sample) return respond({ metadata: { source: 'external-restaurant-sample', label: 'Sample Restaurant Data', available: false }, error: 'Sample dataset is not imported. Run the analytics ETL first.' });
        return respond(buildSampleInsights(sample.records, range, sample.quality));
      }
      if (path === '/api/coupons/issue' && request.method === 'POST') {
        if (!sameOrigin(request)) return error('Invalid request origin', 403);
        const role = await readSession(request, env.SESSION_SECRET);
        if (role !== 'manager') return error('Manager access required', 403);
        const bytes = new Uint8Array(4); crypto.getRandomValues(bytes);
        const code = `DIRECT-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
        const coupon = { code, source: 'direct-website-demo', issuedAt: new Date().toISOString(), expiresAt: isoFromNow(30 * 24 * 60), redeemedAt: null, orderId: null };
        await store.update(state => { state.coupons.push(coupon); return null; });
        return respond({ coupon, note: 'Demo issue only. Connect the cinema ticketing system before offering this to buyers.' }, 201);
      }
      if (path === '/' || path === '/guest') return new Response(assets.html, { headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
      if (path === '/styles.css') return new Response(assets.css, { headers: { ...headers, 'content-type': 'text/css; charset=utf-8' } });
      if (path === '/i18n.js') return new Response(assets.i18n, { headers: { ...headers, 'content-type': 'text/javascript; charset=utf-8' } });
      if (path === '/app.js') return new Response(assets.js, { headers: { ...headers, 'content-type': 'text/javascript; charset=utf-8' } });
      return new Response('Not found', { status: 404, headers });
    } catch (cause) {
      console.error('TheatreOS request failed:', cause);
      return error('Something went wrong. Please retry.', 500);
    }
  };
}
