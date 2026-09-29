import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { newRequestId } from '../services/offlineQueue';
import { useTheme } from 'react-native-paper';
import { CaylikButton, CaylikScreenHeader, CaylikSurface } from '../components/caylik-ui';
import { AppIcon } from '../components/app-icon';
import DatePickerField from '../components/date-picker-field';
import type { AuthFetch } from '../services/aiAssistant';
import { shareRequest, type ShareLink, type ShareDelivery, type ShareSummary, type ShareEvent, type PendingSharedDelivery, type ShareOverview } from '../services/sharecropping';
import { deliveryInput, shareAmounts } from '../../shared/sharecropping';
import { formatTL, todayDisplayDate, toServerDate, formatDisplayDate } from '../utils/format';

type Props = { userId: string; authFetch: AuthFetch; enablePush: () => Promise<string>; onPageChange?: () => void; onAddHarvest?: (linkId: string) => void; onOpenHarvest?: (id: string) => void; refreshKey?: unknown };
const emptyDraft = () => ({ kg: '', price: '', factory: '', date: todayDisplayDate(), dueDate: '' });
const storageKey = (id: string) => '@caylik_shared_delivery_v1:' + id;
export default function SharecroppingScreen({ userId, authFetch, enablePush, onPageChange, onAddHarvest, onOpenHarvest, refreshKey }: Props) {
  const theme = useTheme();
  const [page, setPage] = useState<'overview' | 'create' | 'join' | 'detail' | 'delivery'>('overview');
  const [showDetails, setShowDetails] = useState(false), [showEvents, setShowEvents] = useState(false);
  useEffect(() => { onPageChange?.(); }, [page, onPageChange]);
  const [links, setLinks] = useState<ShareLink[]>([]), [selected, setSelected] = useState('');
  const [records, setRecords] = useState<ShareDelivery[]>([]), [totals, setTotals] = useState<ShareSummary | null>(null), [next, setNext] = useState<string | null>(null);
  const [events, setEvents] = useState<ShareEvent[]>([]);
  const [overview, setOverview] = useState<ShareOverview[]>([]), [historyId, setHistoryId] = useState('');
  const [label, setLabel] = useState(''), [denominator, setDenominator] = useState<2 | 3>(2), [createdCode, setCreatedCode] = useState('');
  const [code, setCode] = useState(''), [preview, setPreview] = useState<{ cropperName: string; denominator: number; label: string } | null>(null);
  const [draft, setDraft] = useState(emptyDraft), [edit, setEdit] = useState<ShareDelivery | null>(null), [confirmVoid, setConfirmVoid] = useState('');
  const [pending, setPending] = useState<PendingSharedDelivery | null>(null), [storageReady, setStorageReady] = useState(false);
  const [rejectedPending, setRejectedPending] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [closeConfirm, setCloseConfirm] = useState(false);
  const alive = useRef(true), lock = useRef(false), readVersion = useRef({ list: 0, records: 0 });
  const selectLink = (id: string) => {
    setPage('detail'); setShowDetails(false); setMessage('');
    if (id === selected) return;
    readVersion.current.records++;
    setSelected(id); setRecords([]); setTotals(null); setNext(null);
    setEdit(null); setDraft(emptyDraft()); setCloseConfirm(false); setConfirmVoid('');
  };
  const link = links.find(item => item._id === selected);
  const refresh = useCallback(async () => {
    const version = ++readVersion.current.list;
    const [a, b, c] = await Promise.all([
      shareRequest<{ links: ShareLink[] }>(authFetch, '/sharecropping'),
      shareRequest<{ events: ShareEvent[] }>(authFetch, '/sharecropping-events'),
      shareRequest<{ links: ShareOverview[] }>(authFetch, '/sharecropping-summary').catch(() => ({ links: [] })),
    ]);
    if (alive.current && version === readVersion.current.list) { setLinks(a.links); setEvents(b.events); setOverview(c.links); }
  }, [authFetch]);
  const loadRecords = useCallback(async (id: string, before?: string) => {
    const version = ++readVersion.current.records;
    const result = await shareRequest<{ records: ShareDelivery[]; totals: ShareSummary; next: string | null }>(authFetch, `/sharecropping/${id}/deliveries${before ? '?before=' + before : ''}`);
    if (alive.current && version === readVersion.current.records) { setRecords(old => before ? [...old, ...result.records] : result.records); setTotals(result.totals); setNext(result.next); }
  }, [authFetch]);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    const versions = readVersion.current;
    void AsyncStorage.getItem(storageKey(userId)).then(raw => {
      if (cancelled) return;
      if (raw) {
        const item = JSON.parse(raw);
        if (!item || !/^[a-f0-9]{24}$/i.test(item.linkId || '') || !/^[a-z0-9-]{16,80}$/i.test(item.requestId || '')) throw Error('Invalid pending delivery');
        deliveryInput(item, 2);
        setPending(item);
      }
      setStorageReady(true);
    }).catch(() => { if (!cancelled) setMessage('Bekleyen teslimat okunamadı. Yeni kayıt açmadan uygulamayı yeniden başlatın.'); });
    void refresh().catch(e => { if (alive.current) setMessage(e.message); });
    return () => { cancelled = true; alive.current = false; versions.list++; versions.records++; };
  }, [refresh, userId]);
  useEffect(() => {
    const versions = readVersion.current;
    void refresh().catch(e => { if (alive.current) setMessage(e.message); });
    if (selected) void loadRecords(selected).catch(e => { if (alive.current) setMessage(e.message); });
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active' && !lock.current) void (async () => { await refresh(); if (selected) await loadRecords(selected); })().catch(() => undefined);
    });
    return () => { versions.records++; listener.remove(); };
  }, [selected, loadRecords, refresh, refreshKey]);
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try { await fn(); } catch (e) { if (alive.current) setMessage(e instanceof Error ? e.message : 'İşlem tamamlanamadı.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const sendPending = async (item: PendingSharedDelivery) => {
    setRejectedPending(false);
    try { await shareRequest(authFetch, `/sharecropping/${item.linkId}/deliveries`, 'POST', item); }
    catch (e) {
      const status = (e as { status?: number }).status;
      if ([400, 403, 404, 409].includes(status || 0) && alive.current) setRejectedPending(true);
      throw e;
    }
    await AsyncStorage.removeItem(storageKey(userId));
    if (!alive.current) return;
    selectLink(item.linkId); setPending(null); setDraft(emptyDraft()); setMessage('Teslimat kaydedildi.');
    await refresh(); await loadRecords(item.linkId);
  };
  const save = () => run(async () => {
    if (!link || pending || !storageReady) return;
    const input = { ...draft, date: toServerDate(draft.date), dueDate: draft.dueDate ? toServerDate(draft.dueDate) : '' };
    if (draft.dueDate && !input.dueDate) throw Error('Vade tarihini kontrol edin.');
    deliveryInput(input, link.denominator);
    if (edit) {
      await shareRequest(authFetch, `/sharecropping/${link._id}/deliveries/${edit._id}`, 'PATCH', { ...input, revision: edit.revision });
      if (!alive.current) return;
      setEdit(null); setDraft(emptyDraft()); setPage('detail'); await loadRecords(link._id); setMessage('Teslimat güncellendi.');
    } else {
      const item = { ...input, requestId: newRequestId(), linkId: link._id };
      await AsyncStorage.setItem(storageKey(userId), JSON.stringify(item));
      if (!alive.current) return;
      setPending(item); await sendPending(item);
    }
  });
  const text = { color: theme.colors.onSurface }, muted = { color: theme.colors.onSurfaceVariant };
  const field = (title: string, value: string, change: (v: string) => void, numeric = false) => <View style={s.field}><Text style={text}>{title}</Text><TextInput accessibilityLabel={title} value={value} onChangeText={change} editable={!busy && !pending} keyboardType={numeric ? 'decimal-pad' : 'default'} maxLength={numeric ? 18 : 100} style={[s.input, text, { borderColor: theme.colors.outline }]} /></View>;
  let estimate; try { if (draft.kg.trim() && draft.price.trim()) estimate = shareAmounts(Number(draft.kg.replace(',', '.')), Number(draft.price.replace(',', '.')), link?.denominator || 2); } catch { /* Incomplete draft. */ }
  const goBack = () => { setMessage(''); setCloseConfirm(false); setPage(page === 'delivery' ? 'detail' : 'overview'); };
  const statusLabel = (status: ShareLink['status']) => status === 'active' ? 'Aktif' : status === 'pending' ? 'Onay bekliyor' : 'Kapalı';
  const partnerName = (item: ShareLink) => item.myRole === 'cropper' ? item.ownerName || 'Davet bekleniyor' : item.cropperName;
  const openCreate = () => { setPage('create'); setMessage(''); };
  const openJoin = () => { setPage('join'); setMessage(''); };
  const inviteText = `Çaylık · ${label}\nYarıcı payım: 1/${denominator}, müstahsil payı: ${denominator - 1}/${denominator} (%2 kesinti sonrası).\nDavet kodu: ${createdCode}\nPay Takibi → Davet koduyla katıl. Onaylamadan önce adımı ve payları kontrol et.`;
  const myTotal = overview.reduce((sum, row) => sum + row.myShareCents, 0);
  const totalKg = overview.reduce((sum, row) => sum + row.kg, 0);
  const heading = page === 'create' ? 'Yeni anlaşma' : page === 'join' ? 'Davete katıl' : page === 'delivery' ? edit ? 'Teslimatı düzenle' : 'Teslimat ekle' : page === 'detail' ? link?.label || 'Anlaşma' : 'Pay Takibi';
  return <View style={s.root}>
    <View style={s.toolbar}>
      {page !== 'overview' && <Pressable accessibilityRole="button" accessibilityLabel="Geri" disabled={busy} onPress={goBack} style={s.iconButton}><AppIcon name="arrow-left" color={theme.colors.primary} /></Pressable>}
      <View style={s.flex}><CaylikScreenHeader icon="account-group-outline" title={heading} /></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Kayıtları yenile" disabled={busy} onPress={() => void run(async () => { await refresh(); if (selected) await loadRecords(selected); })} style={s.iconButton}><AppIcon name="refresh" color={theme.colors.primary} /></Pressable>
    </View>
    {!!message && <Text accessibilityLiveRegion="polite" style={[s.notice, text, { backgroundColor: theme.colors.surfaceVariant }]}>{message}</Text>}

    {page === 'overview' && <>
      {!!overview.length && <View style={[s.hero, { backgroundColor: theme.colors.primary }]}>
        <View style={s.valueRow}><Text style={[s.eyebrow, { color: theme.colors.onPrimary }]}>BİRLİKTE ÜRETİYORUZ</Text><AppIcon name="sprout-outline" color={theme.colors.onPrimary} size={28} /></View>
        <Text style={{ color: theme.colors.onPrimary }}>Satıştan payın</Text>
        <Text style={[s.heroNumber, { color: theme.colors.onPrimary }]}>{formatTL(myTotal / 100)}</Text>
        <View style={s.valueRow}><Text style={{ color: theme.colors.onPrimary }}>{totalKg.toLocaleString('tr-TR')} kg teslimat</Text><Text style={{ color: theme.colors.onPrimary }}>{links.filter(item => item.status === 'active').length} aktif anlaşma</Text></View>
        <Text style={[s.caption, { color: theme.colors.onPrimary, opacity: 0.8 }]}>%2 kesinti sonrası · Tahsilat değildir</Text>
      </View>}
      <View style={s.actions}>
        <CaylikButton style={s.action} icon="plus" disabled={busy} onPress={openCreate}>Yeni anlaşma</CaylikButton>
        <CaylikButton style={s.action} mode="outlined" disabled={busy} onPress={openJoin}>Davet koduyla katıl</CaylikButton>
      </View>
      {!links.length ? <CaylikSurface style={s.empty}>
        <AppIcon name="sprout-outline" size={36} color={theme.colors.primary} />
        <Text style={[s.title, text]}>Birlikte takip edin</Text>
        <Text style={[muted, s.center]}>İlk anlaşmanızı oluşturun veya gelen davete katılın.</Text>
      </CaylikSurface> : <>
        <Text style={[s.sectionLabel, muted]}>ANLAŞMALARIM · {links.length}</Text>
        {links.map(item => <Pressable key={item._id} accessibilityRole="button" accessibilityLabel={item.label + ', ' + partnerName(item) + ', ' + statusLabel(item.status)} disabled={busy} onPress={() => selectLink(item._id)}
          style={({ pressed }) => [s.agreement, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }, pressed && s.pressed]}>
          <View style={[s.agreementIcon, { backgroundColor: theme.colors.surfaceVariant }]}><AppIcon name="sprout-outline" size={26} color={theme.colors.primary} /></View>
          <View style={s.flex}><Text style={[s.title, text]}>{item.label}</Text><Text style={[s.partner, muted]}>{partnerName(item)}</Text><Text style={[s.status, { color: theme.colors.primary }]}>{statusLabel(item.status)} · Payınız {item.myRole === 'cropper' ? 1 : item.denominator - 1}/{item.denominator}</Text>
            {overview.find(row => row._id === item._id) && <Text style={[s.cardTotal, text]}>{overview.find(row => row._id === item._id)!.kg.toLocaleString('tr-TR')} kg · {formatTL(overview.find(row => row._id === item._id)!.myShareCents / 100)}</Text>}
          </View>
          <AppIcon name="chevron-right" color={theme.colors.onSurfaceVariant} />
        </Pressable>)}
      </>}
      <CaylikButton mode="text" icon="bell-outline" disabled={busy} onPress={() => void run(async () => { setMessage(await enablePush()); })}>Bildirimleri aç</CaylikButton>
      {!!events.length && <>
        <CaylikButton mode="text" onPress={() => setShowEvents(value => !value)}>{showEvents ? 'Son hareketleri gizle' : 'Son hareketler'}</CaylikButton>
        {showEvents && <CaylikSurface style={s.card}>{events.map(event => <Pressable key={event._id} accessibilityRole="button" accessibilityLabel={event.message + ', anlaşmayı aç'} disabled={busy} onPress={() => selectLink(event.linkId)} style={s.event}><Text style={[text, s.flex]}>{event.message}</Text><AppIcon name="chevron-right" color={theme.colors.onSurfaceVariant} /></Pressable>)}</CaylikSurface>}
      </>}
    </>}

    {page === 'create' && <CaylikSurface style={s.card}>
      {!createdCode ? <>
        {field('Bahçe / anlaşma adı', label, setLabel)}
        <Text style={[s.title, text]}>Yarıcı olarak payınız</Text>
        <View style={s.row}>{([2, 3] as const).map(d => <Pressable key={d} accessibilityRole="radio" accessibilityState={{ checked: denominator === d, disabled: busy }} accessibilityLabel={'Yarıcı payı 1/' + d} disabled={busy} onPress={() => setDenominator(d)}
          style={[s.shareOption, { borderColor: denominator === d ? theme.colors.primary : theme.colors.outlineVariant, backgroundColor: denominator === d ? theme.colors.primary : theme.colors.surface }]}>
          <Text style={[s.shareFraction, { color: denominator === d ? theme.colors.onPrimary : theme.colors.onSurface }]}>1/{d}</Text>
          <Text style={{ color: denominator === d ? theme.colors.onPrimary : theme.colors.onSurfaceVariant }}>{d === 2 ? 'Yarısı' : 'Üçte biri'}</Text>
        </Pressable>)}</View>
        <Text style={muted}>%2 kesinti sonrası pay. Müstahsilin onayıyla başlar.</Text>
        <CaylikButton disabled={busy || !!pending || !label.trim()} onPress={() => void run(async () => {
          const result = await shareRequest<{ code: string }>(authFetch, '/sharecropping/invites', 'POST', { label, denominator });
          if (!alive.current) return;
          setCreatedCode(result.code); await refresh();
        })}>Davet oluştur</CaylikButton>
      </> : <>
        <Text style={[s.title, text]}>Davetiniz hazır</Text>
        <Text selectable style={[s.code, text, { backgroundColor: theme.colors.surfaceVariant }]}>{createdCode}</Text>
        <Text style={muted}>Koda basılı tutarak kopyalayın · 72 saat geçerli</Text>
        <View style={[s.summary, { backgroundColor: theme.colors.surfaceVariant }]}><Text style={[s.title, text]}>{label}</Text><Text style={text}>Sizin payınız 1/{denominator} · Müstahsil {denominator - 1}/{denominator}</Text><Text style={muted}>%2 kesinti sonrası</Text></View>
        <CaylikButton onPress={() => void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(inviteText)}`).catch(() => setMessage('WhatsApp açılamadı. Daveti paylaş seçeneğini kullanabilirsiniz.'))}>WhatsApp ile gönder</CaylikButton>
        <CaylikButton mode="outlined" icon="share-variant-outline" onPress={() => void Share.share({ message: inviteText }).catch(() => setMessage('Kodu seçip kopyalayabilirsiniz.'))}>Daveti paylaş</CaylikButton>
        <CaylikButton mode="outlined" onPress={() => { setPage('overview'); setMessage(''); }}>Anlaşmalarıma dön</CaylikButton>
        <CaylikButton mode="text" onPress={() => { setCreatedCode(''); setLabel(''); }}>Başka anlaşma oluştur</CaylikButton>
      </>}
    </CaylikSurface>}

    {page === 'join' && <CaylikSurface style={s.card}>
      {field('Davet kodu', code, value => { setCode(value); setPreview(null); })}
      {!preview && <CaylikButton disabled={busy || !!pending || !code.trim()} onPress={() => void run(async () => { setPreview(await shareRequest(authFetch, '/sharecropping/invites/preview', 'POST', { code })); })}>Devam et</CaylikButton>}
      {preview && <>
        <Text style={[s.title, text]}>{preview.label}</Text>
        <Text style={text}>{preview.cropperName} · Yarıcı</Text>
        <View style={[s.summary, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Text style={text}>Yarıcı payı: 1/{preview.denominator}</Text>
          <Text style={text}>Sizin payınız: {preview.denominator - 1}/{preview.denominator}</Text>
          <Text style={muted}>%2 kesinti sonrası net satıştan</Text>
        </View>
        <Text style={muted}>Onaylayınca adınız ve bu anlaşmanın teslimatları paylaşılır. Hesap silinirse ortak kayıtlar da silinir.</Text>
        <CaylikButton disabled={busy || !!pending} onPress={() => void run(async () => {
          const result = await shareRequest<{ link: ShareLink }>(authFetch, '/sharecropping/invites/accept', 'POST', { code, accept: true });
          if (!alive.current) return;
          setPreview(null); setCode(''); await refresh(); selectLink(result.link._id);
        })}>Anlaşmayı onayla</CaylikButton>
      </>}
    </CaylikSurface>}

    {pending && <CaylikSurface style={s.card}>
      <Text style={[s.title, text]}>Gönderim bekliyor</Text>
      <Text style={text}>{pending.factory} · {pending.kg} kg</Text>
      <CaylikButton disabled={busy} onPress={() => void run(() => sendPending(pending))}>Tekrar dene</CaylikButton>
      {rejectedPending && <CaylikButton mode="text" disabled={busy} onPress={() => void run(async () => { await AsyncStorage.removeItem(storageKey(userId)); setPending(null); setRejectedPending(false); setMessage('Bekleyen istek kaldırıldı. Yeni kayıt öncesi teslimatları kontrol edin.'); })}>Reddedilen isteği kaldır</CaylikButton>}
    </CaylikSurface>}

    {page === 'detail' && link && <>
      <Text style={[s.partner, muted]}>{partnerName(link)} · {statusLabel(link.status)}</Text>
      {totals && <CaylikSurface style={s.card}>
        <Text style={muted}>Toplam teslimat</Text>
        <Text style={[s.heroNumber, { color: theme.colors.primary }]}>{totals.kg.toLocaleString('tr-TR')} <Text style={s.unit}>KG</Text></Text>
        <View style={[s.summaryDivider, { borderColor: theme.colors.outlineVariant }]} />
        <View style={s.row}>
          <View style={s.metric}><Text style={muted}>Yarıcı · 1/{link.denominator}</Text><Text style={[s.amount, text]}>{formatTL(totals.cropperCents / 100)}</Text></View>
          <View style={s.metric}><Text style={muted}>Müstahsil · {link.denominator - 1}/{link.denominator}</Text><Text style={[s.amount, text]}>{formatTL(totals.ownerCents / 100)}</Text></View>
        </View>
        <Text style={[s.caption, muted]}>%2 kesinti sonrası satış payları</Text>
      </CaylikSurface>}
      {link.status === 'pending' && <Text style={muted}>Müstahsil daveti onayladığında teslimat ekleyebilirsiniz.</Text>}
      {link.myRole === 'cropper' && link.status === 'active' && <CaylikButton icon="plus" disabled={busy || !!pending} onPress={() => { if (onAddHarvest) { onAddHarvest(link._id); return; } setEdit(null); setDraft(emptyDraft()); setMessage(''); setPage('delivery'); }}>Teslimat ekle</CaylikButton>}
      <View style={s.sectionHeader}><Text style={[s.title, text]}>Teslimatlar</Text><CaylikButton mode="text" onPress={() => setShowDetails(value => !value)}>{showDetails ? 'Detayları gizle' : 'Anlaşma detayları'}</CaylikButton></View>
      {showDetails && <CaylikSurface style={s.card}>
        <Text style={muted}>Yeni teslimatlar Hasat Ekle’den tek kez kaydedilir. Eski bağımsız kayıtlar normal hasat ve kota toplamlarından ayrıdır. Tutarlar tahsilatı değil, satış payını gösterir.</Text>
        {link.status !== 'closed' && <CaylikButton mode="text" disabled={busy} onPress={() => setCloseConfirm(true)}>Anlaşmayı kapat</CaylikButton>}
        {closeConfirm && <>
          <Text style={text}>Yeni teslimatlar durdurulsun mu? Eski kayıtlar korunur.</Text>
          <CaylikButton disabled={busy} onPress={() => void run(async () => { await shareRequest(authFetch, `/sharecropping/${link._id}/close`, 'POST'); setCloseConfirm(false); await refresh(); })}>Kapatmayı onayla</CaylikButton>
          <CaylikButton mode="text" onPress={() => setCloseConfirm(false)}>Vazgeç</CaylikButton>
        </>}
      </CaylikSurface>}
      {!records.length && totals && <Text style={muted}>Henüz teslimat yok.</Text>}
      {records.map(record => <CaylikSurface key={record._id} style={s.card}>
        <View style={s.recordHeader}>
          <View style={s.flex}><Text style={[s.title, text]}>{record.data.factory}</Text><Text style={[s.caption, muted]}>{formatDisplayDate(record.data.date)}{record.voided ? ' · İptal edildi' : record.revision > 0 ? ' · Düzenlendi' : ''}</Text></View>
          <Text style={[s.amount, { color: record.voided ? theme.colors.onSurfaceVariant : theme.colors.primary }]}>{record.data.kg} kg</Text>
        </View>
        <View style={[s.recordBadge, { backgroundColor: record.voided ? theme.colors.errorContainer : theme.colors.primaryContainer }]}><Text style={{ color: record.voided ? theme.colors.onErrorContainer : theme.colors.onPrimaryContainer, fontSize: 12, fontWeight: '600' }}>{record.voided ? 'İptal edildi · Toplama dahil değil' : record.harvestId ? 'Hasat kaydıyla bağlı' : 'Eski bağımsız teslimat'}</Text></View>
        {!!record.data.dueDate && <Text style={muted}>Vade · {formatDisplayDate(record.data.dueDate)}</Text>}
        <View style={[s.summary, { backgroundColor: theme.colors.surfaceVariant }]}>
          <View style={s.valueRow}><Text style={muted}>Net satış</Text><Text style={text}>{formatTL(record.data.netCents / 100)}</Text></View>
          <View style={s.valueRow}><Text style={muted}>Yarıcı</Text><Text style={text}>{formatTL(record.data.cropperCents / 100)}</Text></View>
          <View style={s.valueRow}><Text style={muted}>Müstahsil</Text><Text style={text}>{formatTL(record.data.ownerCents / 100)}</Text></View>
        </View>
        {!!record.changes?.length && <>
          <CaylikButton mode="text" onPress={() => setHistoryId(historyId === record._id ? '' : record._id)}>{historyId === record._id ? 'Geçmişi gizle' : `Değişiklik geçmişi · ${record.changes.length}`}</CaylikButton>
          {historyId === record._id && <View style={[s.history, { borderColor: theme.colors.outlineVariant }]}>{record.changes.map(change => <View key={change.revision} style={s.historyEntry}><Text style={[s.caption, muted]}>{new Date(change.at).toLocaleString('tr-TR')} · #{change.revision}</Text>{change.details.map((detail, index) => <Text key={index} style={text}>{detail}</Text>)}</View>)}</View>}
        </>}
        {link.myRole === 'cropper' && record.harvestId && !record.voided && <CaylikButton mode="outlined" onPress={() => onOpenHarvest?.(record.harvestId!)}>Bağlı hasadı düzenle</CaylikButton>}
        {link.myRole === 'cropper' && !record.harvestId && link.status === 'active' && !record.voided && <>
          <View style={s.row}>
            <CaylikButton mode="text" disabled={busy || !!pending} onPress={() => { setEdit(record); setDraft({ kg: String(record.data.kg), price: String(record.data.price), factory: record.data.factory, date: formatDisplayDate(record.data.date), dueDate: record.data.dueDate ? formatDisplayDate(record.data.dueDate) : '' }); setMessage(''); setPage('delivery'); }}>Düzenle</CaylikButton>
            <CaylikButton mode="text" disabled={busy || !!pending} onPress={() => setConfirmVoid(record._id)}>İptal et</CaylikButton>
          </View>
          {confirmVoid === record._id && <>
            <Text style={text}>Teslimat toplamdan çıkarılsın mı?</Text>
            <CaylikButton disabled={busy} onPress={() => void run(async () => { await shareRequest(authFetch, `/sharecropping/${link._id}/deliveries/${record._id}`, 'PATCH', { revision: record.revision, voided: true }); setConfirmVoid(''); await loadRecords(link._id); })}>İptali onayla</CaylikButton>
            <CaylikButton mode="text" onPress={() => setConfirmVoid('')}>Vazgeç</CaylikButton>
          </>}
        </>}
      </CaylikSurface>)}
      {next && <CaylikButton mode="outlined" disabled={busy} onPress={() => void run(() => loadRecords(link._id, next))}>Önceki teslimatlar</CaylikButton>}
    </>}

    {page === 'delivery' && link?.myRole === 'cropper' && link.status === 'active' && <CaylikSurface style={s.card}>
      <Text style={muted}>{link.label} · {partnerName(link)}</Text>
      {field('Fabrika / alım yeri', draft.factory, factory => setDraft(d => ({ ...d, factory })))}
      <View style={s.row}>
        <View style={s.metric}>{field('Teslim edilen KG', draft.kg, kg => setDraft(d => ({ ...d, kg })), true)}</View>
        <View style={s.metric}>{field('KG fiyatı (TL)', draft.price, price => setDraft(d => ({ ...d, price })), true)}</View>
      </View>
      <DatePickerField label="Teslimat tarihi" value={draft.date} onChange={date => { if (!busy && !pending) setDraft(d => ({ ...d, date })); }} />
      <DatePickerField label="Vade tarihi (isteğe bağlı)" value={draft.dueDate} onChange={dueDate => { if (!busy && !pending) setDraft(d => ({ ...d, dueDate })); }} />
      {!!draft.dueDate && <CaylikButton mode="text" disabled={busy || !!pending} onPress={() => setDraft(d => ({ ...d, dueDate: '' }))}>Vadeyi temizle</CaylikButton>}
      {estimate && <View style={[s.summary, { backgroundColor: theme.colors.surfaceVariant }]}>
        <View style={s.valueRow}><Text style={muted}>%2 kesinti</Text><Text style={text}>{formatTL(estimate.taxCents / 100)}</Text></View>
        <View style={s.valueRow}><Text style={text}>Yarıcı payı</Text><Text style={[s.amount, text]}>{formatTL(estimate.cropperCents / 100)}</Text></View>
        <View style={s.valueRow}><Text style={text}>Müstahsil payı</Text><Text style={[s.amount, text]}>{formatTL(estimate.ownerCents / 100)}</Text></View>
      </View>}
      <CaylikButton disabled={busy || !!pending || !storageReady} onPress={() => void save()}>{busy ? 'Kaydediliyor…' : edit ? 'Değişiklikleri kaydet' : 'Teslimatı kaydet'}</CaylikButton>
    </CaylikSurface>}
  </View>;
}
const s = StyleSheet.create({
  hero: { borderRadius: 26, padding: 22, gap: 12 }, eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  cardTotal: { fontSize: 14, fontWeight: '700', marginTop: 10 },
  recordBadge: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  history: { borderLeftWidth: 2, paddingLeft: 14, gap: 14 }, historyEntry: { gap: 5 },
  root: { gap: 14, paddingBottom: 12 }, toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 0 }, iconButton: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 18, gap: 14 }, empty: { padding: 28, gap: 12, alignItems: 'center', marginVertical: 8 },
  center: { textAlign: 'center', lineHeight: 22 }, title: { fontSize: 17, fontWeight: '700', lineHeight: 24 },
  sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 12 },
  field: { gap: 8 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actions: { gap: 10 }, action: { minHeight: 52 },
  input: { borderWidth: 1, borderRadius: 14, padding: 12, minHeight: 50, fontSize: 16 },
  notice: { padding: 14, borderRadius: 14, fontSize: 14, lineHeight: 21 },
  agreement: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderWidth: 1, borderRadius: 22 },
  agreementIcon: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  partner: { fontSize: 15, marginTop: 4 }, status: { fontSize: 12, marginTop: 8, fontWeight: '600' }, pressed: { opacity: 0.8 },
  shareOption: { flex: 1, minWidth: 110, alignItems: 'center', gap: 5, padding: 20, borderWidth: 1, borderRadius: 18 },
  shareFraction: { fontSize: 32, fontWeight: '700' }, code: { fontSize: 18, fontWeight: '600', padding: 16, borderRadius: 14, textAlign: 'center' },
  summary: { padding: 14, borderRadius: 14, gap: 10 }, heroNumber: { fontSize: 38, fontWeight: '800' }, unit: { fontSize: 18, fontWeight: '500' },
  summaryDivider: { borderTopWidth: 1, marginVertical: 2 }, metric: { flex: 1, minWidth: 120, gap: 6 },
  amount: { fontSize: 18, fontWeight: '700' }, caption: { fontSize: 12, lineHeight: 18 },
  sectionHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  recordHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  valueRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  event: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10, minHeight: 48 },
});
