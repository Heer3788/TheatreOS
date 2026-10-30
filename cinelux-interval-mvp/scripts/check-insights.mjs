import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp, createDemoState, MemoryStore } from '../server/core.mjs';
import { buildLiveInsights, buildSampleInsights, validateInsightRange } from '../server/insights.mjs';
import { menu } from '../server/core.mjs';

const state = createDemoState();
const live = buildLiveInsights(state, menu);
assert.equal(live.metadata.source, 'theatreos-live');
assert.equal(live.metadata.dataKind, 'demo');
assert.equal(live.summary.ordersCreated, 14);
assert.equal(live.summary.deliveredOrders, 8);
assert.equal(live.summary.openOrders, 6);
assert.equal(live.summary.createdOrderValue, state.orders.reduce((sum, order) => sum + order.total, 0));
assert.equal(live.summary.deliveredOrderValue, state.orders.filter(order => order.status === 'delivered').reduce((sum, order) => sum + order.total, 0));
assert.equal(live.fulfilment.deliveredCount, 8);
assert.equal(live.fulfilment.preparation.count, 8);
assert.equal(live.inventoryAlerts.alerts.length, state.pantry.filter(item => item.onHand <= item.reorderAt).length);
assert.equal(live.demandByTime.sufficientHistory, false);
assert.match(live.demandByTime.note, /Not enough historical data/);
assert.equal(buildLiveInsights(state, menu, { from: '1999-01-01', to: '1999-12-31' }).summary.ordersCreated, 0);
assert.equal(buildLiveInsights({ orders: [], pantry: [] }, menu).summary.averageCreatedOrderValue, null);
const incomplete = structuredClone(state);
incomplete.orders.find(order => order.status === 'delivered').startedAt = null;
assert.equal(buildLiveInsights(incomplete, menu).fulfilment.preparation.count, 7);
assert.equal(validateInsightRange(new URLSearchParams('from=2023-02-30')).error, 'Use valid YYYY-MM-DD dates');
assert.equal(validateInsightRange(new URLSearchParams('from=2023-03-01&to=2023-02-01')).error, 'Start date must not follow end date');

const sampleRows = [
  { orderId: 'R1', date: '2022-04-01', itemName: 'Coffee', category: 'Beverages', quantity: 2, lineValue: 40, timeOfSale: 'Morning' },
  { orderId: 'R1', date: '2022-04-01', itemName: 'Snack', category: 'Fastfood', quantity: 1, lineValue: 20, timeOfSale: 'Morning' },
  { orderId: 'R2', date: '2022-04-02', itemName: 'Coffee', category: 'Beverages', quantity: 1, lineValue: 20, timeOfSale: 'Evening' }
];
const sample = buildSampleInsights(sampleRows);
assert.equal(sample.metadata.source, 'external-restaurant-sample');
assert.equal(sample.summary.orders, 2);
assert.equal(sample.summary.orderLines, 3);
assert.equal(sample.summary.recordedTransactionValue, 80);
assert.equal(sample.summary.averageRecordedOrderValue, 40);
assert.equal(sample.fulfilment, null);
assert.equal(buildSampleInsights(sampleRows, { from: '2022-04-02' }).summary.orders, 1);

const origin = 'https://theatreos.example';
const env = { MANAGER_PIN: '111111', EMPLOYEE_PIN: '222222', SESSION_SECRET: 'test-secret-longer-than-thirty-two-characters' };
let sampleLoads = 0;
const app = createApp({ store: new MemoryStore(state), assets: { html: await readFile(new URL('../app/index.html', import.meta.url), 'utf8'), css: '', i18n: '', js: '' }, env, loadSampleInsights: async () => { sampleLoads++; return { records: sampleRows, quality: { sourceRows: 3, validRows: 3, rejectedRows: 0 } }; } });
async function call(path, cookie) {
  const response = await app(new Request(`${origin}${path}`, { headers: cookie ? { cookie } : {} }));
  return { status: response.status, data: await response.json().catch(() => null) };
}
assert.equal((await call('/api/insights')).status, 403);
const managerLogin = await app(new Request(`${origin}/api/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ role: 'manager', pin: '111111' }) }));
const managerCookie = managerLogin.headers.get('set-cookie').split(';')[0];
const employeeLogin = await app(new Request(`${origin}/api/login`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ role: 'employee', pin: '222222' }) }));
assert.equal((await call('/api/insights', employeeLogin.headers.get('set-cookie').split(';')[0])).status, 403);
assert.equal((await call('/api/insights?source=bad', managerCookie)).status, 400);
assert.equal((await call('/api/insights?from=bad', managerCookie)).status, 400);
const liveApi = await call('/api/insights?source=live', managerCookie);
assert.equal(liveApi.status, 200);
assert.equal(liveApi.data.metadata.source, 'theatreos-live');
assert.equal(sampleLoads, 0);
const sampleApi = await call('/api/insights?source=sample', managerCookie);
assert.equal(sampleApi.status, 200);
assert.equal(sampleApi.data.metadata.source, 'external-restaurant-sample');
assert.equal(sampleApi.data.summary.orders, 2);
assert.equal(sampleLoads, 1);
assert.equal((await call('/api/insights?source=sample&from=2030-01-01', managerCookie)).data.metadata.recordsUsed, 0);
assert.match(await (await app(new Request(`${origin}/`))).text(), /Business Insights/);
const noSampleApp = createApp({ store: new MemoryStore(state), assets: { html: '', css: '', i18n: '', js: '' }, env });
const missing = await noSampleApp(new Request(`${origin}/api/insights?source=sample`, { headers: { cookie: managerCookie } }));
assert.equal((await missing.json()).metadata.available, false);
console.log('Business Insights calculations, source isolation, filters, and access verified');
