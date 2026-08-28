import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { styles } from '../styles/styles';
import { AppIcon } from '../components/app-icon';
import { deductionTotalOf, formatDisplayDate, formatTL, grossTotalOf, netTotalOf, remainingTotalOf } from '../utils/format';
import { PaymentRecord } from '../types';
import { CaylikScreenHeader } from '../components/caylik-ui';

const recordTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

export default function CollectionsScreen(props: any) {
  const theme = useTheme();
  const selectedCardColor = theme.dark ? '#174C38' : theme.colors.primary;
  const { handleSpecificHarvestPayment, harvests, payments, handleDelete, openPaymentEditModal, prepareLegacyPaymentForEdit, payAmount, payDate, payDesc, payHarvestId, setPayAmount, setPayDate, setPayDesc, setPayHarvestId } = props;
  const scrollRef = useRef<FlatList<any>>(null);
  const { width } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const cardWidth = Math.max(280, width - 64);
  const cardStep = cardWidth + 12;

  const pendingHarvests = useMemo(
    () => (harvests || []).filter((harvest: any) => remainingTotalOf(harvest) > 0.01),
    [harvests],
  );

  /* Selection state mirrors the currently available server records. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const selectedIndex = pendingHarvests.findIndex((harvest: any) => harvest._id === payHarvestId);
    if (selectedIndex >= 0) {
      setCurrentIndex(selectedIndex);
      return;
    }
    if (pendingHarvests.length > 0) {
      setCurrentIndex(0);
      setPayHarvestId(pendingHarvests[0]._id);
    } else {
      setCurrentIndex(0);
      if (payHarvestId) setPayHarvestId('');
    }
  }, [pendingHarvests, payHarvestId, setPayHarvestId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectIndex = (index: number, shouldScroll = true) => {
    const safeIndex = Math.max(0, Math.min(index, pendingHarvests.length - 1));
    const harvest = pendingHarvests[safeIndex];
    if (!harvest) return;
    setCurrentIndex(safeIndex);
    setPayHarvestId(harvest._id);
    if (shouldScroll) scrollRef.current?.scrollToIndex({ index: safeIndex, animated: true });
  };

  const handleSwipeEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / cardStep);
    selectIndex(index, false);
  };

  const selected = pendingHarvests[currentIndex];
  const selectedRemaining = selected ? remainingTotalOf(selected) : 0;
  const paymentDate = (payment: PaymentRecord) => formatDisplayDate(String(payment.tarih || payment.createdAt || '').slice(0, 10));
  const paymentHarvest = (payment: PaymentRecord) => payment.harvestId && typeof payment.harvestId === 'object' ? payment.harvestId : null;
  const paymentHarvestId = (payment: PaymentRecord) => {
    const harvest = paymentHarvest(payment);
    return harvest?._id || (typeof payment.harvestId === 'string' ? payment.harvestId : '');
  };
  const legacyPaymentAdjustments = useMemo(() => {
    const paidByHarvest = new Map<string, number>();
    ((payments || []) as PaymentRecord[]).forEach((payment) => {
      const harvestId = paymentHarvestId(payment);
      if (!harvestId) return;
      paidByHarvest.set(harvestId, (paidByHarvest.get(harvestId) || 0) + (Number(payment.tutar) || 0));
    });
    return (harvests || []).map((harvest: any) => {
      const totalPaid = Number(harvest.tahsilat) || 0;
      const detailTotal = paidByHarvest.get(harvest._id) || 0;
      const missingDetail = totalPaid - detailTotal;
      return missingDetail > 0.01 ? { harvest, amount: missingDetail } : null;
    }).filter(Boolean) as { harvest: any; amount: number }[];
  }, [harvests, payments]);

  return (
    <View>
      <CaylikScreenHeader icon="hand-coin-outline" eyebrow="TAHSİLAT YÖNETİMİ" title="Ödeme Al" description="Bekleyen hasadı seçin ve alınan ödemeyi güvenle kaydedin." />
      <View style={[styles.formCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <View style={{ width: 50, height: 50, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primaryContainer }}>
            <AppIcon name="wallet-bifold-outline" size={27} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.formTitle, { color: theme.colors.onSurface, marginBottom: 2 }]}>Ödeme Al</Text>
            <Text style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 12, letterSpacing: 0.7 }}>ALACAĞINI KAYDET</Text>
          </View>
        </View>
        <Text style={[styles.formHelp, { color: theme.colors.onSurfaceVariant }]}>
          Her kart bir hasat kaydıdır. Doğru hasadı bulmak için kartları sağa-sola kaydırın veya Önceki / Sonraki düğmelerini kullanın.
        </Text>

        {pendingHarvests.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>Bekleyen ödemesi olan hasat kaydı yok.</Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={[styles.label, { color: theme.colors.onSurface }]}>Hasat Kaydı</Text>
              <View style={{ backgroundColor: theme.colors.primaryContainer, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 6 }}>
                <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Kayıt {currentIndex + 1} / {pendingHarvests.length}</Text>
              </View>
            </View>

            <FlatList
              ref={scrollRef}
              data={pendingHarvests}
              keyExtractor={(harvest) => String(harvest._id)}
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={cardStep}
              snapToAlignment="start"
              disableIntervalMomentum
              onMomentumScrollEnd={handleSwipeEnd}
              contentContainerStyle={{ paddingRight: 12 }}
              style={{ marginBottom: 10 }}
              getItemLayout={(_, index) => ({ length: cardStep, offset: cardStep * index, index })}
              renderItem={({ item: harvest, index }) => {
                const gross = grossTotalOf(harvest);
                const deduction = deductionTotalOf(harvest);
                const net = netTotalOf(harvest);
                const paid = Number(harvest.tahsilat) || 0;
                const remaining = remainingTotalOf(harvest);
                const active = index === currentIndex;
                const createdTime = recordTime(harvest.createdAt);
                return (
                  <TouchableOpacity
                    key={harvest._id}
                    activeOpacity={0.9}
                    onPress={() => selectIndex(index, false)}
                    style={{
                      width: cardWidth,
                      minHeight: 255,
                      backgroundColor: active ? selectedCardColor : theme.colors.surfaceVariant,
                      borderColor: active ? selectedCardColor : theme.colors.outline,
                      borderWidth: 1,
                      borderRadius: 24,
                      padding: 16,
                      marginRight: 12,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ color: active ? theme.colors.onPrimary : theme.colors.onSurface, fontWeight: '800', fontSize: 17 }}>
                          {harvest.firma || 'Firma belirtilmedi'}
                        </Text>
                        <Text style={{ color: active ? theme.colors.onPrimary : theme.colors.onSurfaceVariant, opacity: active ? 0.86 : 1, marginTop: 3 }}>
                          {formatDisplayDate(harvest.tarih)} · {harvest.surum || 'Sürüm belirtilmedi'}{createdTime ? ` · ${createdTime}` : ''}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: active ? 'rgba(255,255,255,0.18)' : theme.colors.primaryContainer, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 }}>
                        <Text style={{ color: active ? theme.colors.onPrimary : theme.colors.primary, fontWeight: '800', fontSize: 12 }}>#{index + 1}</Text>
                      </View>
                    </View>

                    <View style={{ borderTopWidth: 1, borderTopColor: active ? 'rgba(255,255,255,0.24)' : theme.colors.outline, marginVertical: 12 }} />
                    <Text style={{ color: active ? theme.colors.onPrimary : theme.colors.onSurface, fontWeight: '800', fontSize: 16 }}>{harvest.kg || harvest.weight || 0} KG · {harvest.fiyat || 0} TL/KG brüt</Text>
                    <Text style={{ color: active ? theme.colors.onPrimary : theme.colors.onSurfaceVariant, opacity: active ? 0.86 : 1, marginTop: 5 }}>Bahçe: {harvest.bahce || harvest.garden || 'Belirtilmedi'}</Text>
                    {harvest.aciklama ? <Text style={{ color: active ? theme.colors.onPrimary : theme.colors.onSurfaceVariant, opacity: active ? 0.86 : 1, marginTop: 4 }}>Not: {harvest.aciklama}</Text> : null}

                    <View style={{ backgroundColor: active ? 'rgba(0,0,0,0.16)' : theme.colors.primaryContainer, borderRadius: 12, padding: 11, marginTop: 13 }}>
                      <Text style={{ color: active ? theme.colors.onPrimary : theme.colors.onSurfaceVariant, opacity: active ? 0.86 : 1, fontSize: 12 }}>Brüt {formatTL(gross)} · %2 kesinti {formatTL(deduction)}</Text>
                      <Text style={{ color: active ? theme.colors.onPrimary : theme.colors.primary, fontWeight: '800', marginTop: 3 }}>Net alacak: {formatTL(net)}</Text>
                      <Text style={{ color: active ? theme.colors.onPrimary : theme.colors.primary, fontWeight: '800', marginTop: 3 }}>Kalan ödeme: {formatTL(remaining)}</Text>
                    </View>
                    <Text style={{ color: active ? theme.colors.onPrimary : theme.colors.onSurfaceVariant, opacity: 0.72, fontSize: 11, marginTop: 10 }}>Kayıt kodu: {String(harvest._id || '').slice(-8).toUpperCase()} · Ödenen: {formatTL(paid)}</Text>
                  </TouchableOpacity>
                );
              }}
            />

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <TouchableOpacity
                style={[styles.groupBtn, { flex: 1, opacity: currentIndex === 0 ? 0.45 : 1, backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }]}
                disabled={currentIndex === 0}
                onPress={() => selectIndex(currentIndex - 1)}
              >
                <Text style={[styles.groupBtnText, { color: theme.colors.onSurface }]}>‹ Önceki</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.groupBtn, { flex: 1, opacity: currentIndex === pendingHarvests.length - 1 ? 0.45 : 1, backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }]}
                disabled={currentIndex === pendingHarvests.length - 1}
                onPress={() => selectIndex(currentIndex + 1)}
              >
                <Text style={[styles.groupBtnText, { color: theme.colors.onSurface }]}>Sonraki ›</Text>
              </TouchableOpacity>
            </View>

            <View style={{ backgroundColor: theme.colors.primaryContainer, borderRadius: 14, padding: 13, marginBottom: 12 }}>
              <Text style={{ color: theme.colors.onPrimaryContainer, fontWeight: '900' }}>Kalan ödeme: {formatTL(selectedRemaining)}</Text>
            </View>
          </>
        )}

        <Text style={[styles.label, { color: theme.colors.onSurface }]}>Tahsilat Tarihi (GG.AA.YYYY)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          placeholder="12.08.2026"
          value={payDate}
          onChangeText={setPayDate}
        />

        <Text style={[styles.label, { color: theme.colors.onSurface }]}>Alınan Tutar (TL)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          placeholder="Örn: 5000"
          keyboardType="decimal-pad"
          value={payAmount}
          onChangeText={setPayAmount}
        />

        <Text style={[styles.label, { color: theme.colors.onSurface }]}>Not (İsteğe Bağlı)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]}
          placeholderTextColor={theme.colors.onSurfaceVariant}
          placeholder="Örn: Banka havalesi"
          value={payDesc}
          onChangeText={setPayDesc}
          autoCorrect={false}
        />

        <TouchableOpacity style={[styles.submitBtn, { opacity: pendingHarvests.length === 0 ? 0.5 : 1 }]} disabled={pendingHarvests.length === 0} onPress={handleSpecificHarvestPayment}>
          <View style={styles.submitBtnContent}><AppIcon name="hand-coin-outline" size={21} color="#FFFFFF" /><Text style={styles.submitBtnText}>Ödemeyi Kaydet</Text></View>
        </TouchableOpacity>
      </View>

      <View style={[styles.formCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 5 }}><AppIcon name="history" size={24} color={theme.colors.primary} /><Text style={[styles.formTitle, { color: theme.colors.onSurface, marginBottom: 0 }]}>Tahsilat Geçmişi</Text></View>
        <Text style={[styles.formHelp, { color: theme.colors.onSurfaceVariant }]}>Hangi hasada ne zaman ödeme girdiğinizi buradan takip edebilirsiniz.</Text>
        {(payments || []).length === 0 && legacyPaymentAdjustments.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>Henüz kaydedilmiş tahsilat girişi yok.</Text>
        ) : (
          <>
          {(payments as PaymentRecord[]).map((payment) => {
            const harvest = paymentHarvest(payment);
            const firm = harvest?.firma || 'Hasat kaydı bulunamadı';
            const harvestDate = harvest?.tarih ? formatDisplayDate(harvest.tarih) : '';
            const harvestKg = harvest?.kg ?? harvest?.weight;
            const createdTime = recordTime(payment.createdAt);
            return (
              <View key={payment._id} style={[styles.paymentHistoryCard, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }]}>
                <View style={styles.paymentHistoryHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.paymentHistoryTitle, { color: theme.colors.onSurface }]}>{firm}</Text>
                    <Text style={[styles.paymentHistoryMeta, { color: theme.colors.onSurfaceVariant }]}>
                      Tahsilat: {paymentDate(payment)}{createdTime ? ` · ${createdTime}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.paymentHistoryAmount, { color: theme.colors.primary }]}>+ {formatTL(Number(payment.tutar) || 0)}</Text>
                </View>
                {harvest ? (
                  <Text style={[styles.paymentHistoryMeta, { color: theme.colors.onSurfaceVariant }]}>
                    Bağlı hasat: {harvestDate || '-'}{harvestKg !== undefined ? ` · ${harvestKg} KG` : ''}{harvest.bahce || harvest.garden ? ` · ${harvest.bahce || harvest.garden}` : ''}
                  </Text>
                ) : <Text style={[styles.paymentHistoryMeta, { color: theme.colors.onSurfaceVariant }]}>Bağlı hasat kaydı silinmiş veya bulunamıyor.</Text>}
                {!!payment.aciklama && <Text style={[styles.paymentHistoryNote, { color: theme.colors.onSurfaceVariant }]}>Not: {payment.aciklama}</Text>}
                <View style={styles.paymentHistoryActions}>
                  <TouchableOpacity style={styles.paymentEditBtn} onPress={() => openPaymentEditModal(payment)}>
                    <Text style={styles.paymentActionText}>Düzenle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.paymentDeleteBtn} onPress={() => handleDelete('payments', payment._id, 'Tahsilat')}>
                    <Text style={styles.paymentActionText}>Sil</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          {legacyPaymentAdjustments.map(({ harvest, amount }) => (
            <View key={`previous-${harvest._id}`} style={[styles.paymentHistoryCard, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }]}>
              <View style={styles.paymentHistoryHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.paymentHistoryTitle, { color: theme.colors.onSurface }]}>{harvest.firma || 'Firma belirtilmedi'}</Text>
                  <Text style={[styles.paymentHistoryMeta, { color: theme.colors.onSurfaceVariant }]}>Önceki tahsilat toplamı · Hasat: {formatDisplayDate(harvest.tarih)}</Text>
                </View>
                <Text style={[styles.paymentHistoryAmount, { color: theme.colors.primary }]}>+ {formatTL(amount)}</Text>
              </View>
              <Text style={[styles.paymentHistoryMeta, { color: theme.colors.onSurfaceVariant }]}>Bu tahsilat eski uygulama kaydında toplam olarak bulunuyor; tek tek ödeme tarihi/notu daha önce saklanmamış.</Text>
              <TouchableOpacity style={styles.legacyPaymentEditBtn} onPress={() => prepareLegacyPaymentForEdit(harvest)}>
                <Text style={styles.legacyPaymentEditText}>Düzenlemeye Aç</Text>
              </TouchableOpacity>
            </View>
          ))}
          </>
        )}
      </View>
    </View>
  );
}
