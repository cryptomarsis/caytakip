/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const id = '1'.repeat(24);
const agreement = { _id: id, label: 'Dere bahçesi', cropperName: 'Ali', ownerName: 'Ayşe', denominator: 3, status: 'active', myRole: 'cropper' };
const children = tree => !tree ? [] : Array.isArray(tree) ? tree.flatMap(children) : typeof tree === 'object' ? [tree, ...(tree.children || []).flatMap(children)] : [tree];
const text = tree => children(tree).filter(n => typeof n === 'string' || typeof n === 'number').join(' ');
function harness(myRole = 'cropper', options = {}) {
  const slots = [], effects = [], calls = [], storage = new Map(); let cursor = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef: current => { const i = cursor++; if (!(i in slots)) slots[i] = { current }; return slots[i]; },
    useCallback: (fn, deps) => { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect: (fn, deps) => { const i = cursor++; if (!same(slots[i]?.deps, deps)) { const cleanup = slots[i]?.cleanup; slots[i] = { deps }; effects.push(() => { cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const modules = {
    react,
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) }, Linking: { openURL: async url => calls.push({ url }) }, Share: { share: async payload => calls.push({ share: payload }) }, StyleSheet: { create: x => x }, View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable' },
    '@react-native-async-storage/async-storage': { getItem: async key => storage.get(key) || null, setItem: async (key, value) => storage.set(key, value), removeItem: async key => storage.delete(key) },
    '../services/offlineQueue': { newRequestId: () => 'request-1234567890' },
    'react-native-paper': { useTheme: () => ({ colors: {} }) },
    '../components/caylik-ui': { CaylikButton: 'Button', CaylikSurface: 'Surface', CaylikScreenHeader: 'Header' },
    '../components/app-icon': { AppIcon: 'Icon' }, '../components/date-picker-field': 'DatePicker',
    '../components/SharedAccountPanel': 'SharedAccountPanel',
    '../components/AdMobNativeCard': 'AdMobNativeCard',
    '../components/SharedLegacyCollection': 'SharedLegacyCollection',
    '../../shared/sharecropping': require('../shared/sharecropping'),
    '../utils/format': { todayDisplayDate: () => '29.09.2026', toServerDate: date => date.split('.').reverse().join('-'), formatTL: n => `${n} TL`, formatDisplayDate: date => date.split('-').reverse().join('.'), remainingTotalOf: row => row.sharedNetCents / 100 - Number(row.tahsilat || 0) },
    '../services/sharecropping': { shareRequest: async (_auth, route, method = 'GET', body) => {
      calls.push({ route, method, body });
      if (route === '/sharecropping') return { links: [{ ...agreement, myRole }] };
      if (route === '/sharecropping-summary') return { links: [{ ...agreement, myRole, kg: 100, myShareCents: myRole === 'cropper' ? 98000 : 196000 }] };
      if (route === '/sharecropping-events') return { events: options.events || [] };
      if (route.endsWith('/read')) return { ok: true };
      if (route.endsWith('/preview')) return { label: 'Dere bahçesi', cropperName: 'Ali', denominator: 3 };
      if (route.endsWith('/accept')) return { link: { ...agreement, myRole: 'owner' } };
      if (route === '/sharecropping/invites') return { code: 'a'.repeat(24) };
      if (route.endsWith('/deliveries')) return method === 'POST' ? { record: {} } : { records: options.records || [], totals: { kg: 100, netCents: 294000, cropperCents: 98000, ownerCents: 196000 }, next: null };
      throw Error('unexpected route ' + route);
    } },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/screens/SharecroppingScreen.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {}; vm.runInNewContext(compiled, { exports, console, require: name => { assert(name in modules, name); return modules[name]; } });
  const authFetch = () => {}, props = { userId: 'owner', authFetch, enablePush: async () => 'enabled', ...options };
  let tree;
  async function render() { cursor = 0; tree = exports.default(props); effects.splice(0).forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve)); return tree; }
  async function settle() { await render(); await render(); }
  const find = predicate => children(tree).find(n => n && typeof n === 'object' && predicate(n));
  async function button(label) { const node = find(n => n.type === 'Button' && text(n) === label); assert(node, 'Missing button ' + label); assert(!node.props.disabled, label + ' disabled'); node.props.onPress(); await settle(); }
  async function input(label, value) { const node = find(n => n.type === 'TextInput' && n.props.accessibilityLabel === label); assert(node); node.props.onChangeText(value); await settle(); }
  async function openAgreement() { const node = find(n => n.type === 'Pressable' && n.props.accessibilityLabel?.startsWith('Dere bahçesi,')); assert(node); node.props.onPress(); await settle(); }
  return { settle, button, input, openAgreement, find, calls, storage, get tree() { return tree; } };
}
test('overview lists agreements without role selectors, forms or long explanations', async () => {
  const h = harness(); await h.settle();
  assert.equal(h.find(n => n.type === 'Header').props.title, 'Pay Takibi');
  assert.match(text(h.tree), /Dere bahçesi/); assert.match(text(h.tree), /Yeni anlaşma/);
  assert.doesNotMatch(text(h.tree), /Yarıcıyım|Müstahsilim|Gider ve tahsilat|Kayıtlar normal hasat/);
  assert.equal(h.find(n => n.type === 'TextInput'), undefined);
  await h.button('Yeni anlaşma'); assert(h.find(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'Bahçe / anlaşma adı'));
  assert.equal(h.find(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'Davet kodu'), undefined);
  await h.input('Bahçe / anlaşma adı', 'Yeni bahçe'); await h.button('Davet oluştur');
  assert.equal(h.calls.find(c => c.method === 'POST').body.denominator, 2); assert.match(text(h.tree), /Davetiniz hazır/);
});

test('Pay Takibi primary actions share full-width sizing and secondary actions are compact', async () => {
  const h = harness(); await h.settle();
  const create = h.find(n => n.type === 'Button' && text(n) === 'Yeni anlaşma');
  const join = h.find(n => n.type === 'Button' && text(n) === 'Davet koduyla katıl');
  assert.equal(create.props.size, 'compact');
  assert.equal(join.props.size, 'compact');
  assert.equal(create.props.style, join.props.style);
  assert.equal(create.props.style.width, '100%');
  assert.ok(create.props.style.minHeight >= 48);
  assert.equal(h.find(n => n.type === 'Button' && text(n) === 'Bildirimleri aç').props.size, 'compact');
});

test('Pay Takibi sits immediately after receivables on mobile and retains the same route on desktop', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/navigation.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; vm.runInNewContext(compiled, { exports });
  const items = exports.mobileNavItems;
  const index = items.findIndex(item => item.tab === 'receivables');
  assert.equal(items[index + 1].tab, 'sharecropping');
  assert.equal(items[index + 1].label, 'Pay Takibi');
  assert.equal(items[index + 2].tab, 'more');
  assert.equal(new Set(items.map(item => item.tab)).size, items.length);
  assert.equal(exports.getDesktopMenuItems(false).find(item => item.tab === 'sharecropping').label, 'Pay Takibi');
});
test('joining shows the real agreement and requires explicit approval', async () => {
  const h = harness(); await h.settle(); await h.button('Davet koduyla katıl');
  await h.input('Davet kodu', 'a'.repeat(24)); await h.button('Devam et');
  assert.match(text(h.tree), /Sizin payınız:  2 \/ 3/); assert.match(text(h.tree), /Onaylayınca/);
  assert.equal(h.calls.filter(c => c.route.endsWith('/accept')).length, 0);
  await h.button('Anlaşmayı onayla'); assert.equal(h.calls.find(c => c.route.endsWith('/accept')).body.accept, true);
});

test('unread movement opens its agreement and acknowledges only the clicked event', async () => {
  let refreshed = 0;
  const h = harness('owner', { unread: 2, onEventsChanged: () => { refreshed++; }, events: [
    { _id: 'a'.repeat(24), linkId: id, message: 'Yeni teslimat', createdAt: '2026-09-29' },
    { _id: 'b'.repeat(24), linkId: id, message: 'Düzeltme', createdAt: '2026-09-29' },
  ] });
  await h.settle();
  const event = h.find(n => n.type === 'Pressable' && n.props.accessibilityLabel === 'Yeni teslimat, anlaşmayı aç');
  assert(event); event.props.onPress(); await h.settle();
  assert.equal(h.find(n => n.type === 'Header').props.title, 'Dere bahçesi');
  const ack = h.calls.filter(c => c.route?.endsWith('/read')); assert.equal(ack.length, 1); assert(ack[0].route.includes('a'.repeat(24))); assert.equal(refreshed, 1);
});
test('agreement detail leads to a separate delivery form and preserves safe save', async () => {
  const h = harness(); await h.settle(); await h.openAgreement();
  assert.match(text(h.tree), /980 TL/); assert.match(text(h.tree), /1960 TL/);
  assert.equal(h.find(n => n.type === 'TextInput'), undefined);
  await h.button('Teslimat ekle');
  await h.input('Fabrika / alım yeri', 'ÇAYKUR'); await h.input('Teslim edilen KG', '100'); await h.input('KG fiyatı (TL)', '30');
  await h.button('Teslimatı kaydet');
  const post = h.calls.find(c => c.route.endsWith('/deliveries') && c.method === 'POST');
  assert.equal(post.body.requestId, 'request-1234567890'); assert.equal(post.body.linkId, id);
  assert.equal(h.storage.size, 0); assert.match(text(h.tree), /Teslimat kaydedildi/); assert.equal(h.find(n => n.type === 'TextInput'), undefined);
});
test('owner sees delivery totals but no delivery edit or create controls', async () => {
  const h = harness('owner'); await h.settle(); await h.openAgreement();
  assert.match(text(h.tree), /980 TL/); assert.equal(h.find(n => n.type === 'Button' && text(n) === 'Teslimat ekle'), undefined);
  await h.button('Anlaşma detayları'); assert.match(text(h.tree), /kendi payının alacağını ve tahsilatını/);
});

test('new delivery navigates to canonical harvest form without posting a separate ledger entry', async () => {
  let selected;
  const h = harness('cropper', { onAddHarvest: id => { selected = id; } }); await h.settle();
  assert.match(text(h.tree), /Satıştan payın/); assert.match(text(h.tree), /980 TL/);
  await h.openAgreement(); await h.button('Teslimat ekle');
  assert.equal(selected, id); assert.equal(h.find(n => n.type === 'TextInput'), undefined);
  assert.equal(h.calls.filter(c => c.method === 'POST').length, 0);
});

test('invitation WhatsApp and system share contain agreement, actual ratio and approval instructions', async () => {
  const h = harness(); await h.settle(); await h.button('Yeni anlaşma'); await h.input('Bahçe / anlaşma adı', 'Dere bahçesi'); await h.button('Davet oluştur');
  await h.button('WhatsApp ile gönder');
  const url = new URL(h.calls.find(c => c.url).url); assert.equal(url.hostname, 'wa.me');
  assert.match(url.searchParams.get('text'), /Dere bahçesi/); assert.match(url.searchParams.get('text'), /1\/2/); assert.match(url.searchParams.get('text'), /Onaylamadan/);
  await h.button('Daveti paylaş'); assert.equal(h.calls.find(c => c.share).share.message, url.searchParams.get('text'));
});

test('linked deliveries show history and open source edit, never the independent edit action', async () => {
  let opened;
  const records = [{ _id: 'r1', harvestId: 'h1', data: { factory: 'EFOR', kg: 120, date: '2026-09-29', cropperCents: 98000, ownerCents: 196000, netCents: 294000 }, revision: 1, voided: false, changes: [{ revision: 1, at: '2026-09-29T08:00:00Z', details: ['KG: 100 → 120'] }] }];
  const h = harness('cropper', { records, onOpenHarvest: id => { opened = id; } }); await h.settle(); await h.openAgreement();
  assert.equal(h.find(n => n.type === 'Button' && text(n) === 'Düzenle'), undefined);
  await h.button('Değişiklik geçmişi · 1'); assert.match(text(h.tree), /100 → 120/);
  await h.button('Bağlı hasadı düzenle'); assert.equal(opened, 'h1');
  const owner = harness('owner', { records }); await owner.settle(); await owner.openAgreement();
  assert.equal(owner.find(n => n.type === 'Button' && text(n) === 'Bağlı hasadı düzenle'), undefined);
});

test('Pay Takibi uses the account dashboard and a selected agreement filters it without mixing other partners', async () => {
  const accountHarvests = [{ _id: 'r1', shareLinkId: id, sharedDeliveryId: 'r1', sharedNetCents: 98000 }, { _id: 'r2', shareLinkId: 'other', sharedDeliveryId: 'r2', sharedNetCents: 20000 }];
  const h = harness('owner', { accountHarvests }); await h.settle();
  assert.equal(h.find(n => n.type === 'SharedAccountPanel').props.rows.length, 2);
  assert.doesNotMatch(text(h.tree), /BİRLİKTE ÜRETİYORUZ/);
  await h.openAgreement(); assert.equal(h.find(n => n.type === 'SharedAccountPanel').props.rows.length, 1);
});

test('owner can collect only own projected receivable from delivery detail, while source editing stays unavailable', async () => {
  let selected;
  const row = { _id: 'r1', shareLinkId: id, sharedDeliveryId: 'r1', sharedNetCents: 196000, tahsilat: 100 };
  const h = harness('owner', { initialLinkId: id, accountHarvests: [row], onCollect: item => { selected = item; }, records: [{ _id: 'r1', harvestId: 'source', data: { factory: 'ÇAYKUR', date: '2026-09-29', kg: 100, netCents: 294000, cropperCents: 98000, ownerCents: 196000 } }] });
  await h.settle(); assert.match(text(h.tree), /1860 TL/);
  await h.button('Bu teslimattan ödeme al'); assert.equal(selected, row);
  assert.equal(h.find(n => n.type === 'Button' && text(n) === 'Bağlı hasadı düzenle'), undefined);
});
