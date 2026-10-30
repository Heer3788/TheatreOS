const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
const validTime = value => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const rounded = value => Math.round(value * 100) / 100;
const sortedCounts = map => [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
const inRange = (value, from, to) => value && (!from || value >= from) && (!to || value <= to);

export function validateInsightRange(params) {
  const from = params.get('from') || null;
  const to = params.get('to') || null;
  for (const value of [from, to]) {
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)) return { error: 'Use valid YYYY-MM-DD dates' };
  }
  if (from && to && from > to) return { error: 'Start date must not follow end date' };
  return { from, to };
}

function duration(start, end) {
  const a = validTime(start), b = validTime(end);
  return a !== null && b !== null && b >= a && b - a <= 24 * 60 * 60_000 ? (b - a) / 60_000 : null;
}

export function buildLiveInsights(state, menu, range = {}) {
  const { from = null, to = null } = range;
  const orders = (state.orders || []).filter(order => inRange(day(order.createdAt), from, to));
  const delivered = orders.filter(order => order.status === 'delivered');
  const open = orders.filter(order => !['delivered', 'cancelled'].includes(order.status));
  const valueOrders = orders.filter(order => order.status !== 'cancelled');
  const createdValue = valueOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  const deliveredValue = delivered.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  const products = new Map(menu.map(item => [item.id, { id: item.id, name: item.name, category: item.category, units: 0, orderCount: 0, estimatedCurrentMenuValue: 0 }]));
  const categories = new Map();
  const dateCounts = new Map();
  const hourCounts = new Map();
  let orderLines = 0;
  for (const order of orders) {
    const date = day(order.createdAt);
    if (date) dateCounts.set(date, (dateCounts.get(date) || 0) + 1);
    const hour = validTime(order.createdAt) === null ? null : new Date(order.createdAt).getUTCHours();
    if (hour !== null) hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    const seen = new Set();
    for (const line of order.items || []) {
      const product = products.get(line.id);
      if (!product || !Number.isInteger(line.qty) || line.qty <= 0) continue;
      orderLines++;
      product.units += line.qty;
      product.estimatedCurrentMenuValue += line.qty * menu.find(item => item.id === line.id).price;
      if (!seen.has(line.id)) { product.orderCount++; seen.add(line.id); }
      categories.set(product.category, (categories.get(product.category) || 0) + line.qty);
    }
  }
  const timing = { preparation: [], readyToDelivery: [], total: [] };
  for (const order of delivered) {
    const prep = duration(order.startedAt, order.readyAt);
    const ready = duration(order.readyAt, order.deliveredAt);
    const total = duration(order.createdAt, order.deliveredAt);
    if (prep !== null) timing.preparation.push(prep);
    if (ready !== null) timing.readyToDelivery.push(ready);
    if (total !== null) timing.total.push(total);
  }
  const average = values => values.length ? rounded(values.reduce((a, b) => a + b, 0) / values.length) : null;
  const pantry = state.pantry || [];
  const alerts = pantry.filter(item => Number(item.onHand) <= Number(item.reorderAt)).map(item => ({ id: item.id, name: item.name, onHand: item.onHand, reorderAt: item.reorderAt, addRequired: Math.max(0, item.target - item.onHand), unit: item.unit })).sort((a, b) => a.onHand - b.onHand);
  const distinctDates = dateCounts.size;
  const productList = [...products.values()].filter(item => item.units > 0).sort((a, b) => b.units - a.units || a.name.localeCompare(b.name));
  const categoryList = sortedCounts(categories);
  const demoCount = orders.filter(order => order.demo === true).length;
  const unknownDemoCount = orders.filter(order => typeof order.demo !== 'boolean').length;
  const recommendations = [];
  if (alerts.length) recommendations.push({ observation: `${alerts.length} pantry ingredient${alerts.length === 1 ? '' : 's'} at or below reorder level.`, evidence: `${alerts.length} of ${pantry.length} ingredients`, action: 'Check physical stock and plan a refill.', caveat: 'Current counts are manually maintained.' });
  if (categoryList.length) recommendations.push({ observation: `${categoryList[0].name} has the most ordered units in this period.`, evidence: `${categoryList[0].count} units`, action: 'Review prep capacity for this category.', caveat: distinctDates < 7 ? 'A short observation period does not establish a recurring pattern.' : null });
  if (delivered.length && timing.preparation.length < delivered.length) recommendations.push({ observation: 'Preparation timing is incomplete.', evidence: `${timing.preparation.length} of ${delivered.length} delivered orders have valid start and ready times`, action: 'Record each kitchen status change consistently.', caveat: 'Incomplete records are excluded from the duration average.' });
  if (distinctDates < 7) recommendations.push({ observation: 'Not enough historical data to identify reliable demand patterns yet.', evidence: `${distinctDates} distinct order date${distinctDates === 1 ? '' : 's'}`, action: 'Collect more operating days before staffing to a recurring peak.', caveat: 'Hourly counts describe only the observed orders.' });
  return {
    metadata: { source: 'theatreos-live', label: 'TheatreOS Live Data', generatedAt: new Date().toISOString(), from, to, dateBasis: 'Order creation date (UTC)', recordsUsed: orders.length, orderLines, distinctDates, dataKind: !orders.length ? 'empty' : demoCount === orders.length ? 'demo' : demoCount === 0 && unknownDemoCount === 0 ? 'operational' : 'mixed-or-unknown' },
    summary: { ordersCreated: orders.length, deliveredOrders: delivered.length, openOrders: open.length, createdOrderValue: rounded(createdValue), deliveredOrderValue: rounded(deliveredValue), averageCreatedOrderValue: valueOrders.length ? rounded(createdValue / valueOrders.length) : null },
    productPerformance: { products: productList, categories: categoryList, valueNote: 'Item values use current menu prices before discounts; they are estimates, not historical net sales.' },
    demandByTime: { byDate: [...dateCounts].sort().map(([date, count]) => ({ date, count })), byHourUtc: [...hourCounts].sort((a, b) => a[0] - b[0]).map(([hour, count]) => ({ hour, count })), sufficientHistory: distinctDates >= 7, note: distinctDates < 7 ? 'Not enough historical data to identify reliable demand patterns yet.' : 'Counts reflect observed orders, not a forecast.' },
    inventoryAlerts: { snapshotOnly: true, totalIngredients: pantry.length, alerts },
    fulfilment: { deliveredCount: delivered.length, preparation: { count: timing.preparation.length, averageMinutes: average(timing.preparation) }, readyToDelivery: { count: timing.readyToDelivery.length, averageMinutes: average(timing.readyToDelivery) }, orderToDelivery: { count: timing.total.length, averageMinutes: average(timing.total) } },
    recommendations,
    dataQuality: { demoOrders: demoCount, unknownDemoFlagOrders: unknownDemoCount, couponLinkedOrders: orders.filter(order => order.couponCode).length, note: 'Order values are recorded without payment verification. Inventory is a current snapshot.' }
  };
}

export function buildSampleInsights(records, range = {}, quality = null) {
  const { from = null, to = null } = range;
  const selected = records.filter(row => inRange(row.date, from, to));
  const orderIds = new Set(selected.map(row => row.orderId));
  const dates = new Map(), periods = new Map(), products = new Map(), categories = new Map();
  let value = 0;
  for (const row of selected) {
    value += row.lineValue;
    dates.set(row.date, (dates.get(row.date) || 0) + 1);
    periods.set(row.timeOfSale, (periods.get(row.timeOfSale) || 0) + 1);
    const key = `${row.itemName}\u0000${row.category}`;
    const product = products.get(key) || { name: row.itemName, category: row.category, units: 0, orderIds: new Set(), recordedLineValue: 0 };
    product.units += row.quantity;
    product.orderIds.add(row.orderId);
    product.recordedLineValue += row.lineValue;
    products.set(key, product);
    categories.set(row.category, (categories.get(row.category) || 0) + row.quantity);
  }
  const byDate = [...dates.keys()].sort().map(date => ({ date, count: new Set(selected.filter(row => row.date === date).map(row => row.orderId)).size, lineCount: dates.get(date), value: rounded(selected.filter(row => row.date === date).reduce((sum, row) => sum + row.lineValue, 0)) }));
  const productList = [...products.values()].map(item => ({ name: item.name, category: item.category, units: item.units, orderCount: item.orderIds.size, recordedLineValue: rounded(item.recordedLineValue) })).sort((a, b) => b.units - a.units || a.name.localeCompare(b.name));
  const recommendations = [];
  if (productList.length) recommendations.push({ observation: `${productList[0].name} has the most units in the selected restaurant sample.`, evidence: `${productList[0].units} units`, action: 'Use this ranking to demonstrate the product analysis workflow.', caveat: 'This is external restaurant data, not TheatreOS cinema demand.' });
  if (!selected.length) recommendations.push({ observation: 'No sample transactions match this date range.', evidence: '0 rows', action: 'Choose a range covered by the imported dataset.', caveat: null });
  return {
    metadata: { source: 'external-restaurant-sample', label: 'Sample Restaurant Data', generatedAt: new Date().toISOString(), from, to, dateBasis: 'Source transaction date; time of sale is a named period, not an hour', recordsUsed: selected.length, orderLines: selected.length, distinctDates: dates.size, dataKind: 'external-sample', currency: 'unspecified' },
    summary: { orders: orderIds.size, orderLines: selected.length, recordedTransactionValue: rounded(value), averageRecordedOrderValue: orderIds.size ? rounded(value / orderIds.size) : null },
    productPerformance: { products: productList, categories: sortedCounts(categories), valueNote: 'Source amount equals item price × quantity; payment is not independently verified. Currency is unspecified.' },
    demandByTime: { byDate, byPeriod: sortedCounts(periods), sufficientHistory: dates.size >= 7, note: dates.size < 7 ? 'Not enough dates in this selection to discuss demand over time.' : 'This describes the external restaurant sample only.' },
    inventoryAlerts: null,
    fulfilment: null,
    recommendations,
    dataQuality: quality || { note: 'Run the Python ETL for a data-quality report.' }
  };
}
