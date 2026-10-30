const $ = selector => document.querySelector(selector);
const money = amount => `₹${Number(amount || 0).toLocaleString('en-IN')}`;
const time = value => new Intl.DateTimeFormat(window.TheatreI18n?.locale || 'en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value));
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const state = { role: null, tab: 'customer', menu: [], shows: [], venue: '', cart: {}, category: 'All', staff: null, manager: null, filter: 'active', insightSource: 'live', insights: null, insightRequest: 0 };

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function toast(message) { const element = $('#toast'); element.textContent = message; element.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { element.hidden = true; }, 4200); }
function roleAllowed(tab) { return tab === 'customer' || (tab === 'staff' && ['employee', 'manager'].includes(state.role)) || (['manager', 'insights'].includes(tab) && state.role === 'manager'); }
function showGateway() { state.role = null; $('#gateway').hidden = false; $('#app').hidden = true; $('#login-form').reset(); $('input[value="employee"]').checked = true; updateRoleChoices(); window.scrollTo(0, 0); }
function enter(role) { state.role = role; $('#gateway').hidden = true; $('#app').hidden = false; $('#header-role').textContent = role.toUpperCase(); document.body.dataset.role = role; setTab(role === 'manager' ? 'manager' : role === 'employee' ? 'staff' : 'customer'); }
function setTab(tab) {
  if (!roleAllowed(tab)) return;
  state.tab = tab;
  document.querySelectorAll('.panel').forEach(panel => panel.classList.toggle('active', panel.id === `${tab}-panel`));
  document.querySelectorAll('.nav-tab').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
  if (tab === 'staff') loadStaff();
  if (tab === 'manager') loadManager();
  if (tab === 'insights') loadInsights();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateRoleChoices() { document.querySelectorAll('.role-choice').forEach(choice => choice.classList.toggle('selected', choice.querySelector('input').checked)); }
document.querySelectorAll('input[name="role"]').forEach(input => input.addEventListener('change', updateRoleChoices));
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('#login-button');
  const error = $('#login-error');
  error.hidden = true;
  button.disabled = true;
  button.textContent = 'Checking PIN…';
  try {
    const result = await api('/api/login', { method: 'POST', body: JSON.stringify({ role: form.elements.role.value, pin: form.elements.pin.value }) });
    form.elements.pin.value = '';
    enter(result.role);
  } catch (cause) { error.textContent = cause.message; error.hidden = false; }
  finally { button.disabled = false; button.innerHTML = 'Sign in to operations <span>→</span>'; }
});
$('#guest-entry').addEventListener('click', () => { history.pushState(null, '', '/guest'); enter('guest'); });
$('#exit-button').addEventListener('click', async () => { if (state.role !== 'guest') await api('/api/logout', { method: 'POST' }).catch(() => {}); history.pushState(null, '', '/'); showGateway(); });
document.querySelectorAll('.nav-tab').forEach(button => button.addEventListener('click', () => setTab(button.dataset.tab)));

async function loadBootstrap() {
  const data = await api('/api/bootstrap');
  state.menu = data.menu;
  state.shows = data.shows;
  state.venue = data.venue;
  $('#header-venue').innerHTML = `${escapeHtml(data.venue)} <i></i> Ahmedabad`;
  const selectedShow = $('#show-select').value;
  $('#show-select').innerHTML = data.shows.map(show => `<option value="${show.id}">${show.movie} · Screen ${show.screen} · ${time(show.intervalAt)}</option>`).join('');
  if (data.shows.some(show => show.id === selectedShow)) $('#show-select').value = selectedShow;
  renderMenu(); renderCart(); updateDeliveryCopy();
}

const sections = [
  { title: 'Best sellers', sub: 'The crowd favourites in this sample menu', items: items => items.filter(item => item.badge === 'Best seller') },
  { title: 'Combos worth sharing', sub: 'More together, with a clear value', items: items => items.filter(item => item.category === 'Combos') },
  { title: 'Explore the full menu', sub: 'Choose exactly what you want', items: items => items }
];
function renderMenu() {
  const categories = ['All', 'Popcorn', 'Snacks', 'Drinks', 'Combos'];
  $('#category-tabs').innerHTML = categories.map(category => `<button type="button" class="${state.category === category ? 'active' : ''}" data-category="${category}">${category}</button>`).join('');
  const chosen = state.category === 'All' ? sections : [{ title: state.category, sub: 'Prepared for your movie', items: items => items.filter(item => item.category === state.category) }];
  $('#menu-sections').innerHTML = chosen.map(section => `<section class="menu-section"><h3>${section.title}</h3><p class="menu-section-sub">${section.sub}</p><div class="menu-grid">${section.items(state.menu).map(item => menuCard(item)).join('')}</div></section>`).join('');
}
function menuCard(item) {
  return `<article class="menu-card ${item.available ? '' : 'sold-out'}"><div class="food-art ${item.image}"><span>${item.emoji}</span>${item.badge ? `<b class="food-badge">${escapeHtml(item.badge)}</b>` : ''}</div><div class="menu-card-body"><h4>${escapeHtml(item.name)}</h4><p>${escapeHtml(item.description)}</p><div class="menu-card-meta"><strong>${money(item.price)}</strong><span>◷ ${item.etaMinutes} min</span></div><div class="menu-card-actions"><button type="button" data-item="${item.id}">Ingredients &amp; time</button><button type="button" class="add-button" data-add="${item.id}" ${item.available ? '' : 'disabled'}>${item.available ? '+ Add' : 'Sold out'}</button></div></div></article>`;
}
$('#category-tabs').addEventListener('click', event => { const button = event.target.closest('[data-category]'); if (!button) return; state.category = button.dataset.category; renderMenu(); });
$('#menu-sections').addEventListener('click', event => { const details = event.target.closest('[data-item]'); const add = event.target.closest('[data-add]'); if (details) openItem(details.dataset.item); if (add) addItem(add.dataset.add); });
function openItem(id) {
  const item = state.menu.find(entry => entry.id === id);
  if (!item) return;
  $('#modal-content').innerHTML = `<div class="modal-food-art">${item.emoji}</div><span class="eyebrow">${escapeHtml(item.category.toUpperCase())} · ${item.available ? 'AVAILABLE' : 'SOLD OUT'}</span><h2 id="item-modal-title">${escapeHtml(item.name)}</h2><p>${escapeHtml(item.description)}</p><b class="field-label">What's in it</b><div class="modal-list">${item.ingredients.map(ingredient => `<span>${escapeHtml(ingredient)}</span>`).join('')}</div>${item.allergens.length ? `<p><b>Allergens:</b> ${item.allergens.map(escapeHtml).join(', ')}</p>` : '<p>No listed major allergens in this demo recipe.</p>'}<div class="modal-facts"><span>Estimated seat delivery<br><b>${item.etaMinutes} min</b></span><span>Price<br><b>${money(item.price)}</b></span></div><button type="button" class="primary-button wide" data-modal-add="${item.id}" ${item.available ? '' : 'disabled'}>${item.available ? 'Add to order' : 'Currently unavailable'} <span>→</span></button>`;
  $('#item-modal').hidden = false;
}
$('#item-modal').addEventListener('click', event => { if (event.target.closest('[data-close-modal]')) $('#item-modal').hidden = true; const add = event.target.closest('[data-modal-add]'); if (add) { addItem(add.dataset.modalAdd); $('#item-modal').hidden = true; } });
document.addEventListener('keydown', event => { if (event.key === 'Escape') $('#item-modal').hidden = true; });

function addItem(id) { const item = state.menu.find(entry => entry.id === id); if (!item?.available) return; state.cart[id] = Math.min(6, (state.cart[id] || 0) + 1); renderCart(); toast(`${item.name} added to your basket`); }
function changeQty(id, delta) { state.cart[id] = Math.max(0, Math.min(6, (state.cart[id] || 0) + delta)); if (!state.cart[id]) delete state.cart[id]; renderCart(); }
function renderCart() {
  const lines = Object.entries(state.cart);
  $('#basket-items').innerHTML = lines.length ? lines.map(([id, qty]) => { const item = state.menu.find(entry => entry.id === id); return `<div class="basket-line"><div><b>${escapeHtml(item.name)}</b><small>${money(item.price)} each</small></div><div class="qty-controls"><button type="button" data-qty="${id}" data-delta="-1" aria-label="Remove one ${escapeHtml(item.name)}">−</button><span>${qty}</span><button type="button" data-qty="${id}" data-delta="1" aria-label="Add one ${escapeHtml(item.name)}">+</button></div></div>`; }).join('') : '<p class="empty-copy">Your basket is waiting for something delicious.</p>';
  const subtotal = lines.reduce((sum, [id, qty]) => sum + (state.menu.find(item => item.id === id)?.price || 0) * qty, 0);
  $('#basket-subtotal').textContent = money(subtotal);
  $('#basket-total').textContent = money(subtotal);
  $('#place-order').disabled = !lines.length;
}
$('#basket-items').addEventListener('click', event => { const button = event.target.closest('[data-qty]'); if (button) changeQty(button.dataset.qty, Number(button.dataset.delta)); });
function updateDeliveryCopy() {
  const show = state.shows.find(entry => entry.id === $('#show-select').value);
  if (!show) return;
  if (show.id !== 'screen-2' && $('#delivery-select').value === 'now') $('#delivery-select').value = 'interval';
  $('#delivery-select option[value="now"]').disabled = show.id !== 'screen-2';
  $('#delivery-explainer').textContent = $('#delivery-select').value === 'interval' ? `Pre-order now; target delivery around ${time(show.intervalAt)} for ${show.movie}.` : 'Order now; estimated target delivery within 12 minutes.';
}
$('#show-select').addEventListener('change', updateDeliveryCopy);
$('#delivery-select').addEventListener('change', updateDeliveryCopy);
$('#place-order').addEventListener('click', async () => {
  const seat = $('#seat-input').value.trim().toUpperCase();
  const error = $('#basket-error'); error.hidden = true;
  if (!/^[A-Z]\d{1,2}$/.test(seat)) { error.textContent = 'Enter a seat like F7.'; error.hidden = false; return; }
  const button = $('#place-order'); button.disabled = true; button.textContent = 'Placing order…';
  try {
    const result = await api('/api/orders', { method: 'POST', body: JSON.stringify({ seat, showId: $('#show-select').value, fulfilment: $('#delivery-select').value, items: Object.entries(state.cart).map(([id, qty]) => ({ id, qty })), couponCode: $('#coupon-input').value.trim() }) });
    state.cart = {}; $('#coupon-input').value = ''; renderCart();
    $('#success-copy').innerHTML = `<b>${escapeHtml(result.order.id)}</b> · Screen ${result.order.screen}, seat ${escapeHtml(result.order.seat)}<br>Target delivery: ${time(result.order.targetAt)}<br>Total in demo: ${money(result.order.total)}${result.order.discount ? ` (saved ${money(result.order.discount)})` : ''}`;
    $('#order-success').hidden = false;
    await loadBootstrap();
    if (state.role !== 'guest') await loadStaff();
  } catch (cause) { error.textContent = cause.message; error.hidden = false; }
  finally { button.disabled = !Object.keys(state.cart).length; button.innerHTML = 'Place demo order <span>→</span>'; }
});
$('#order-success').addEventListener('click', event => { if (event.target.closest('[data-close-success]')) $('#order-success').hidden = true; });

const statusLabel = { scheduled: 'Scheduled', new: 'New', preparing: 'Preparing', ready: 'Ready', out_for_delivery: 'Out for delivery', delivered: 'Delivered' };
const actionLabel = { scheduled: 'Start prep', new: 'Start prep', preparing: 'Mark ready', ready: 'Send runner', out_for_delivery: 'Mark delivered' };
async function loadStaff() {
  if (!['employee', 'manager'].includes(state.role)) return;
  try { state.staff = await api('/api/staff'); renderStaff(); } catch (cause) { toast(cause.message); }
}
function renderStaff() {
  if (!state.staff) return;
  const orders = state.staff.orders;
  $('#staff-open').textContent = orders.filter(order => !['delivered'].includes(order.status)).length;
  $('#staff-urgent').textContent = orders.filter(order => ['new', 'scheduled'].includes(order.status) && startBy(order) <= Date.now()).length;
  $('#staff-ready').textContent = orders.filter(order => order.status === 'ready').length;
  $('#staff-delivered').textContent = orders.filter(order => order.status === 'delivered').length;
  document.querySelectorAll('[data-status-filter]').forEach(button => button.classList.toggle('active', button.dataset.statusFilter === state.filter));
  const filtered = orders.filter(order => state.filter === 'active' ? !['scheduled', 'delivered'].includes(order.status) : state.filter === 'scheduled' ? order.status === 'scheduled' : order.status === 'delivered');
  $('#order-queue').innerHTML = filtered.length ? filtered.map(order => orderTicket(order)).join('') : '<div class="queue-empty">Nothing in this lane right now.</div>';
  $('#pantry-list').innerHTML = state.staff.pantry.map(item => `<div class="pantry-row"><div><b>${escapeHtml(item.name)}</b><small>Refill to target: +${item.addRequired} ${escapeHtml(item.unit)}</small></div><span class="stock-pill ${item.onHand <= item.reorderAt ? 'low' : ''}">${item.onHand} left</span><button type="button" data-restock="${item.id}" data-suggest="${Math.max(1, item.addRequired)}">+ Log refill</button></div>`).join('');
}
function startBy(order) { return new Date(order.targetAt).getTime() - Math.max(...order.items.map(line => state.staff.menu.find(item => item.id === line.id)?.prepMinutes || 0)) * 60_000; }
function orderTicket(order) {
  const urgent = ['new', 'scheduled'].includes(order.status) && startBy(order) <= Date.now();
  const lines = order.items.map(line => `${line.qty}× ${state.staff.menu.find(item => item.id === line.id)?.name || line.id}`).join(' · ');
  return `<article class="order-ticket ${urgent ? 'urgent' : ''} ${order.status === 'scheduled' ? 'scheduled' : ''}"><div><div class="ticket-head"><strong>${escapeHtml(order.id)}</strong><span class="seat-tag">SCREEN ${order.screen} · ${escapeHtml(order.seat)}</span><span class="ticket-status ${urgent ? 'late' : ''}">${urgent ? 'START NOW' : statusLabel[order.status]}</span></div><p class="ticket-items">${escapeHtml(lines)}</p><div class="ticket-meta">Placed ${time(order.createdAt)} · Target ${time(order.targetAt)}${order.fulfilment === 'interval' ? ' · Interval pre-order' : ''}${order.demo ? ' · Demo order' : ''}</div></div><button type="button" class="ticket-action" data-progress="${escapeHtml(order.id)}" ${actionLabel[order.status] ? '' : 'disabled'}>${actionLabel[order.status] || 'Complete'} →</button></article>`;
}
document.querySelectorAll('[data-status-filter]').forEach(button => button.addEventListener('click', () => { state.filter = button.dataset.statusFilter; renderStaff(); }));
$('#staff-refresh').addEventListener('click', loadStaff);
$('#order-queue').addEventListener('click', async event => { const button = event.target.closest('[data-progress]'); if (!button) return; button.disabled = true; try { await api(`/api/orders/${button.dataset.progress}/status`, { method: 'POST' }); await loadStaff(); toast('Order status updated'); } catch (cause) { toast(cause.message); button.disabled = false; } });
$('#pantry-list').addEventListener('click', async event => { const button = event.target.closest('[data-restock]'); if (!button) return; const value = window.prompt('How many portions or units did you add?', button.dataset.suggest); if (value === null) return; const qty = Number(value); if (!Number.isInteger(qty) || qty < 1 || qty > 500) { toast('Enter a whole number from 1 to 500'); return; } try { await api(`/api/pantry/${button.dataset.restock}/restock`, { method: 'POST', body: JSON.stringify({ qty }) }); await Promise.all([loadStaff(), loadBootstrap()]); toast('Pantry count updated'); } catch (cause) { toast(cause.message); } });

async function loadManager() { if (state.role !== 'manager') return; try { state.manager = await api('/api/manager'); renderManager(); } catch (cause) { toast(cause.message); } }
function renderManager() {
  const report = state.manager; if (!report) return;
  const metrics = [
    ['F&B demo sales', money(report.summary.revenue), 'Gross order value'],
    ['Orders processed', report.summary.processed, `${report.summary.orders} orders created`],
    ['Average order', money(report.summary.averageOrder), 'Per created order'],
    ['Pantry alerts', report.pantryAlerts, 'At or below refill level']
  ];
  $('#manager-metrics').innerHTML = metrics.map(([label, value, sub]) => `<div><span>${label}</span><strong>${value}</strong><small>${sub}</small></div>`).join('');
  $('#item-performance').innerHTML = report.itemStats.map(item => `<div class="performance-row"><div><b>${escapeHtml(item.name)}</b><small>${item.units} sold · est. margin ${item.estimatedMarginPercent}%</small></div><strong>${item.units}</strong><strong>${money(item.sales)}</strong><span class="rec-tag ${item.recommendation.toLowerCase()}">${item.recommendation}</span></div>`).join('');
  $('#offer-performance').innerHTML = `<div class="offer-numbers"><div><strong>${report.offers.issued}</strong><span>Coupons issued</span></div><div><strong>${report.offers.redeemed}</strong><span>Redeemed</span></div></div><div class="offer-progress"><i style="width:${report.offers.redemptionPercent}%"></i></div><p class="offer-desc">${report.offers.redemptionPercent}% redemption · ${money(report.offers.discountedRevenue)} order value with coupons. This is usage, not proof of incremental sales.</p>`;
  $('#service-performance').innerHTML = `<div class="service-numbers"><div class="service-number"><strong>${report.summary.prepOnTimePercent}%</strong><span>Ready by target</span></div><div class="service-number"><strong>${report.summary.deliveryOnTimePercent}%</strong><span>Delivered within 6 min of target</span></div></div><p class="service-desc">Based on ${report.summary.processed} completed demo orders. Check late tickets in the staff queue for a process fix.</p>`;
  const staffing = report.staffing;
  $('#staffing-performance').innerHTML = `<div class="staffing-number"><strong>${staffing.additionalRunners ? `+${staffing.additionalRunners}` : '0'} runner${staffing.additionalRunners === 1 ? '' : 's'}</strong><span>${staffing.additionalRunners ? 'Estimated extra capacity for next interval' : 'Current runner capacity looks sufficient'}</span></div><p class="staffing-desc">${staffing.dueSoon} orders due soon · ${staffing.currentRunners} current runners · estimate ${staffing.estimatedRunners} needed. Assumption: ${staffing.assumption}. Validate with actual staffing and delivery times.</p>`;
}
$('#issue-coupon').addEventListener('click', async () => { try { const result = await api('/api/coupons/issue', { method: 'POST' }); $('#issued-coupon').hidden = false; $('#issued-coupon').innerHTML = `New demo food coupon <strong>${escapeHtml(result.coupon.code)}</strong><small>10% off, up to ₹80 · one use · 30 days</small>`; await loadManager(); toast('Demo direct-booking coupon created'); } catch (cause) { toast(cause.message); } });

const insightNumber = value => Number(value || 0).toLocaleString(window.TheatreI18n?.locale || 'en-IN', { maximumFractionDigits: 2 });
const insightValue = (value, sample) => sample ? `${insightNumber(value)} (currency unspecified)` : money(value);
function insightBars(rows, label, valueKey, limit = 7, detail = null) {
  if (!rows?.length) return '<p class="insights-empty">No records in this date range.</p>';
  const maximum = Math.max(1, ...rows.map(row => Number(row[valueKey]) || 0));
  return rows.slice(0, limit).map(row => `<div class="insight-bar-row"><div><b>${escapeHtml(row[label])}</b><span>${insightNumber(row[valueKey])}</span></div>${detail ? `<small>${escapeHtml(detail(row))}</small>` : ''}<div class="insight-bar-track" role="img" aria-label="${escapeHtml(row[label])}: ${insightNumber(row[valueKey])}"><i style="width:${Math.max(3, (Number(row[valueKey]) || 0) / maximum * 100)}%"></i></div></div>`).join('');
}
function insightMetric(label, value, note) { return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong><small>${escapeHtml(note)}</small></div>`; }
function renderInsights(report) {
  const sample = report.metadata.source === 'external-restaurant-sample';
  const meta = report.metadata;
  $('#insights-source-badge').textContent = meta.label.toUpperCase();
  const kind = sample ? 'External educational restaurant sample. It is not cinema sales.' : meta.dataKind === 'demo' ? 'All selected TheatreOS orders are demo records. No payment is collected.' : meta.dataKind === 'mixed-or-unknown' ? 'Selected orders contain mixed or unknown demo flags. Review before drawing business conclusions.' : 'TheatreOS operational orders; payment is not verified.';
  $('#insights-context').textContent = `${kind} ${meta.recordsUsed} records used · Date basis: ${meta.dateBasis} · Generated ${new Date(meta.generatedAt).toLocaleString(window.TheatreI18n?.locale || 'en-IN')}.`;
  if (!meta.recordsUsed) { $('#insights-state').textContent = 'No records match this date range. Clear the dates or choose a different range.'; $('#insights-state').hidden = false; $('#insights-content').hidden = true; return; }
  $('#insights-state').hidden = true;
  $('#insights-content').hidden = false;
  const s = report.summary;
  $('#insights-summary').innerHTML = sample ? [
    insightMetric('Restaurant orders', insightNumber(s.orders), 'Unique source order IDs'),
    insightMetric('Item rows', insightNumber(s.orderLines), 'Valid source rows'),
    insightMetric('Recorded transaction value', insightValue(s.recordedTransactionValue, true), 'Price × quantity; payment unverified'),
    insightMetric('Average recorded order value', insightValue(s.averageRecordedOrderValue, true), 'Per unique source order')
  ].join('') : [
    insightMetric('Orders created', insightNumber(s.ordersCreated), 'By creation date'),
    insightMetric('Delivered / open', `${s.deliveredOrders} / ${s.openOrders}`, 'Within selected creation cohort'),
    insightMetric('Created order value', insightValue(s.createdOrderValue, false), 'Includes open orders; excludes cancellations'),
    insightMetric('Delivered order value', insightValue(s.deliveredOrderValue, false), 'Delivered orders only'),
    insightMetric('Average created order value', insightValue(s.averageCreatedOrderValue, false), 'Per non-cancelled created order')
  ].join('');
  $('#insights-products').innerHTML = `<h3>Top products · units</h3>${insightBars(report.productPerformance.products, 'name', 'units', 7, row => `${row.orderCount} orders · ${sample ? 'recorded line value' : 'current-menu estimate'} ${insightValue(sample ? row.recordedLineValue : row.estimatedCurrentMenuValue, sample)}`)}<p class="insight-footnote">${escapeHtml(report.productPerformance.valueNote)}</p>`;
  $('#insights-categories').innerHTML = `<h3>Category units</h3>${insightBars(report.productPerformance.categories, 'name', 'count')}`;
  const daily = report.demandByTime.byDate || [];
  const selectedDaily = daily.slice(-21);
  const clockRows = sample ? report.demandByTime.byPeriod : report.demandByTime.byHourUtc.map(row => ({ name: `${String(row.hour).padStart(2, '0')}:00 UTC`, count: row.count }));
  $('#insights-demand').innerHTML = `<h3>Orders by date${daily.length > 21 ? ' · latest 21 dates' : ''}</h3>${insightBars(selectedDaily, 'date', 'count', 21)}<h3>${sample ? 'Time-of-sale period' : 'Hour of creation (UTC)'}</h3>${insightBars(clockRows, 'name', 'count', 24)}<p class="insight-footnote">${escapeHtml(report.demandByTime.note)}</p>`;
  const inventory = report.inventoryAlerts;
  $('#insights-inventory').innerHTML = inventory ? `<p class="insight-intro">${inventory.alerts.length} of ${inventory.totalIngredients} ingredients at or below reorder level. Current pantry snapshot; independent of the date filter.</p>${inventory.alerts.length ? inventory.alerts.map(item => `<div class="insight-alert"><b>${escapeHtml(item.name)}</b><span>${insightNumber(item.onHand)} ${escapeHtml(item.unit)} left · threshold ${insightNumber(item.reorderAt)} · refill to target +${insightNumber(item.addRequired)}</span></div>`).join('') : '<p class="insights-empty">No ingredients currently at or below reorder level.</p>'}` : '<p class="insights-empty">The external restaurant sample has no pantry or restock records.</p>';
  const f = report.fulfilment;
  $('#insights-fulfilment').innerHTML = f ? `<p class="insight-intro">Based on ${f.deliveredCount} delivered orders in the selected creation cohort. Invalid or missing timestamps are excluded.</p><div class="insight-timing"><div><b>${f.preparation.averageMinutes === null ? '—' : `${insightNumber(f.preparation.averageMinutes)} min`}</b><span>Preparation · ${f.preparation.count}/${f.deliveredCount} complete</span></div><div><b>${f.readyToDelivery.averageMinutes === null ? '—' : `${insightNumber(f.readyToDelivery.averageMinutes)} min`}</b><span>Ready to delivered · ${f.readyToDelivery.count}/${f.deliveredCount} complete</span></div><div><b>${f.orderToDelivery.averageMinutes === null ? '—' : `${insightNumber(f.orderToDelivery.averageMinutes)} min`}</b><span>Order to delivered · ${f.orderToDelivery.count}/${f.deliveredCount} complete</span></div></div>` : '<p class="insights-empty">The external restaurant sample has no kitchen or delivery status timestamps.</p>';
  $('#insights-actions').innerHTML = report.recommendations.length ? report.recommendations.map(item => `<div class="insight-action"><b>${escapeHtml(item.observation)}</b><span>Evidence: ${escapeHtml(item.evidence)}</span><p>Action: ${escapeHtml(item.action)}</p>${item.caveat ? `<small>${escapeHtml(item.caveat)}</small>` : ''}</div>`).join('') : '<p class="insights-empty">No action signals are available for this selection.</p>';
  const q = report.dataQuality;
  $('#insights-quality').textContent = sample ? `ETL quality: ${q.validRows ?? '—'} valid of ${q.sourceRows ?? '—'} source rows; ${q.rejectedRows ?? '—'} rejected. ${q.missingTransactionTypeRows ?? '—'} rows lack a payment-method value. ${q.dateFormatAssumption || ''} Currency unspecified.` : `${q.demoOrders} selected orders explicitly marked demo; ${q.unknownDemoFlagOrders} have unknown demo flags. ${q.note}`;
}
async function loadInsights() {
  if (state.role !== 'manager') return;
  const requestNumber = ++state.insightRequest;
  $('#insights-content').hidden = true;
  $('#insights-state').hidden = false;
  $('#insights-state').textContent = 'Loading Business Insights…';
  const params = new URLSearchParams({ source: state.insightSource });
  if ($('#insights-from').value) params.set('from', $('#insights-from').value);
  if ($('#insights-to').value) params.set('to', $('#insights-to').value);
  try {
    const report = await api(`/api/insights?${params}`);
    if (requestNumber !== state.insightRequest) return;
    if (report.metadata?.available === false) { $('#insights-source-badge').textContent = 'SAMPLE RESTAURANT DATA'; $('#insights-context').textContent = 'External restaurant data is separate from TheatreOS orders.'; $('#insights-state').textContent = report.error; return; }
    state.insights = report;
    renderInsights(report);
  } catch (cause) { if (requestNumber === state.insightRequest) $('#insights-state').textContent = `Could not load Business Insights: ${cause.message}`; }
}
document.querySelectorAll('[data-insight-source]').forEach(button => button.addEventListener('click', () => {
  state.insightSource = button.dataset.insightSource;
  document.querySelectorAll('[data-insight-source]').forEach(choice => choice.classList.toggle('active', choice === button));
  $('#insights-from').value = ''; $('#insights-to').value = '';
  loadInsights();
}));
$('#insights-apply').addEventListener('click', loadInsights);
$('#insights-refresh').addEventListener('click', loadInsights);

async function boot() {
  $('#seat-input').value = (new URLSearchParams(location.search).get('seat') || 'F7').toUpperCase();
  try { await loadBootstrap(); } catch (cause) { toast(`Could not load menu: ${cause.message}`); }
  if (location.pathname === '/guest') { enter('guest'); return; }
  try { const session = await api('/api/session'); if (['employee', 'manager'].includes(session.role)) { enter(session.role); return; } } catch { /* Show entry screen. */ }
  showGateway();
}
setInterval(() => { if (state.tab === 'staff') loadStaff(); if (state.tab === 'manager') loadManager(); }, 7000);
window.addEventListener('theatreos:language', async () => {
  try { await loadBootstrap(); } catch (cause) { toast(cause.message); }
  if (state.staff) renderStaff();
  if (state.manager) renderManager();
  if (state.tab === 'insights' && state.insights) renderInsights(state.insights);
});
boot();
