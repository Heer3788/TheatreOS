import assert from 'node:assert/strict';
import { createApp, createDemoState, MemoryStore } from '../server/core.mjs';

const origin = 'https://theatreos.example';
const env = { MANAGER_PIN: '111111', EMPLOYEE_PIN: '222222', SESSION_SECRET: 'test-only-secret-longer-than-32-characters' };
const store = new MemoryStore(createDemoState());
const app = createApp({ store, assets: { html: '<h1>TheatreOS</h1>', css: '', i18n: 'window.TheatreI18n = {};', js: '' }, env });
async function call(path, { method = 'GET', body, cookie, foreignOrigin } = {}) {
  const headers = { ...(body ? { 'content-type': 'application/json', origin: foreignOrigin || origin } : {}), ...(cookie ? { cookie } : {}) };
  const response = await app(new Request(`${origin}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }));
  return { response, data: await response.json().catch(() => null) };
}
async function login(role, pin) {
  const { response } = await call('/api/login', { method: 'POST', body: { role, pin } });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

assert.equal((await call('/api/bootstrap')).data.menu.length, 7);
assert.equal((await call('/i18n.js')).response.status, 200);
assert.equal((await call('/api/staff')).response.status, 401);
assert.equal((await call('/api/manager')).response.status, 403);
assert.equal((await call('/api/login', { method: 'POST', body: { role: 'manager', pin: '222222' } })).response.status, 401);
const managerCookie = await login('manager', '111111');
const employeeCookie = await login('employee', '222222');
assert.equal((await call('/api/manager', { cookie: employeeCookie })).response.status, 403);
assert.equal((await call('/api/coupons/issue', { method: 'POST', cookie: employeeCookie, body: {} })).response.status, 403);
const before = await call('/api/staff', { cookie: employeeCookie });
const originalKernels = before.data.pantry.find(item => item.id === 'kernels').onHand;
const coupon = await call('/api/coupons/issue', { method: 'POST', cookie: managerCookie, body: {} });
assert.equal(coupon.response.status, 201);
const show = (await call('/api/bootstrap')).data.shows[2];
const order = await call('/api/orders', { method: 'POST', body: { seat: 'F7', showId: show.id, fulfilment: 'interval', items: [{ id: 'interval-combo', qty: 1 }], couponCode: coupon.data.coupon.code } });
assert.equal(order.response.status, 201);
assert.equal(order.data.order.status, 'scheduled');
assert.ok(order.data.order.discount > 0);
const after = await call('/api/staff', { cookie: employeeCookie });
assert.equal(after.data.pantry.find(item => item.id === 'kernels').onHand, originalKernels - 1);
assert.ok(after.data.orders.some(item => item.id === order.data.order.id));
const reuse = await call('/api/orders', { method: 'POST', body: { seat: 'F8', showId: show.id, fulfilment: 'interval', items: [{ id: 'cola', qty: 1 }], couponCode: coupon.data.coupon.code } });
assert.equal(reuse.response.status, 400);
for (const status of ['preparing', 'ready', 'out_for_delivery', 'delivered']) {
  const result = await call(`/api/orders/${order.data.order.id}/status`, { method: 'POST', cookie: employeeCookie, body: {} });
  assert.equal(result.data.order.status, status);
}
const report = await call('/api/manager', { cookie: managerCookie });
assert.equal(report.response.status, 200);
assert.equal(report.data.offers.redeemed, 2);
assert.ok(report.data.itemStats.find(item => item.id === 'interval-combo').units > 0);
const restock = await call('/api/pantry/cheese/restock', { method: 'POST', cookie: employeeCookie, body: { qty: 10 } });
assert.equal(restock.data.item.onHand, 17);
assert.equal((await call('/api/login', { method: 'POST', body: { role: 'manager', pin: '111111' }, foreignOrigin: 'https://other.example' })).response.status, 403);
console.log('Customer, staff, manager, coupon, inventory, and order flow verified');
