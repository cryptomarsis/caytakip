import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { styles } from '../styles/styles';
import { deductionTotalOf, formatDisplayDate, formatTL, grossTotalOf, netTotalOf, remainingTotalOf } from '../utils/format';

const recordTime = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

export default function CollectionsScreen(props: any) {
  const { handleSpecificHarvestPayment, harvests, payAmount, payDesc, payHarvestId, setPayAmount, setPayDesc, setPayHarvestId } = props;
  const scrollRef = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const cardWidth = Math.max(280, width - 64);
  const cardStep = cardWidth + 12;

  const pendingHarvests = useMemo(
    () => (harvests || []).filter((harvest: any) => remainingTotalOf(harvest) > 0.01),
    [harvests],
  );

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

  const selectIndex = (index: number, shouldScroll = true) => {
    const safeIndex = Math.max(0, Math.min(index, pendingHarvests.length - 1));
    const harvest = pendingHarvests[safeIndex];
    if (!harvest) return;
    setCurrentIndex(safeIndex);
    setPayHarvestId(harvest._id);
    if (shouldScroll) scrollRef.current?.scrollTo({ x: safeIndex * cardStep, animated: true });
  };

  const handleSwipeEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / cardStep);
    selectIndex(index, false);
  };

  const selected = pendingHarvests[currentIndex];
  const selectedRemaining = selected ? remainingTotalOf(selected) : 0;

  return (
    <View>
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Ödeme Al</Text>
        <Text style={styles.formHelp}>
          Her kart bir hasat kaydıdır. Doğru hasadı bulmak için kartları sağa-sola kaydırın veya Önceki / Sonraki düğmelerini kullanın.
        </Text>

        {pendingHarvests.length === 0 ? (
          <Text style={styles.emptyText}>Bekleyen ödemesi olan hasat kaydı yok.</Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.label}>Hasat Kaydı</Text>
              <Text style={{ color: '#1b4332', fontWeight: '800' }}>Kayıt {currentIndex + 1} / {pendingHarvests.length}</Text>
            </View>

            <ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={cardStep}
              snapToAlignment="start"
              disableIntervalMomentum
              onMomentumScrollEnd={handleSwipeEnd}
              contentContainerStyle={{ paddingRight: 12 }}
              style={{ marginBottom: 10 }}
            >
              {pendingHarvests.map((harvest: any, index: number) => {
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
                      backgroundColor: active ? '#1b4332' : '#f4f8f5',
                      borderColor: active ? '#1b4332' : '#d7e4da',
                      borderWidth: 1,
                      borderRadius: 14,
                      padding: 16,
                      marginRight: 12,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ color: active ? '#fff' : '#183a2a', fontWeight: '800', fontSize: 17 }}>
                          {harvest.firma || 'Firma belirtilmedi'}
                        </Text>
                        <Text style={{ color: active ? '#e5f2e8' : '#57675d', marginTop: 3 }}>
                          {formatDisplayDate(harvest.tarih)} · {harvest.surum || 'Sürüm belirtilmedi'}{createdTime ? ` · ${createdTime}` : ''}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: active ? '#40916c' : '#dceee0', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 }}>
                        <Text style={{ color: active ? '#fff' : '#1b4332', fontWeight: '800', fontSize: 12 }}>#{index + 1}</Text>
                      </View>
                    </View>

                    <View style={{ borderTopWidth: 1, borderTopColor: active ? '#528d70' : '#d7e4da', marginVertical: 12 }} />
                    <Text style={{ color: active ? '#fff' : '#1f3528', fontWeight: '800', fontSize: 16 }}>{harvest.kg || harvest.weight || 0} KG · {harvest.fiyat || 0} TL/KG brüt</Text>
                    <Text style={{ color: active ? '#e5f2e8' : '#57675d', marginTop: 5 }}>Bahçe: {harvest.bahce || harvest.garden || 'Belirtilmedi'}</Text>
                    {harvest.aciklama ? <Text style={{ color: active ? '#e5f2e8' : '#57675d', marginTop: 4 }}>Not: {harvest.aciklama}</Text> : null}

                    <View style={{ backgroundColor: active ? '#24583f' : '#e8f3eb', borderRadius: 10, padding: 10, marginTop: 13 }}>
                      <Text style={{ color: active ? '#e5f2e8' : '#46584d', fontSize: 12 }}>Brüt {formatTL(gross)} · %2 kesinti {formatTL(deduction)}</Text>
                      <Text style={{ color: active ? '#fff' : '#1b4332', fontWeight: '800', marginTop: 3 }}>Net alacak: {formatTL(net)}</Text>
                      <Text style={{ color: active ? '#fff' : '#1b4332', fontWeight: '800', marginTop: 3 }}>Kalan ödeme: {formatTL(remaining)}</Text>
                    </View>
                    <Text style={{ color: active ? '#d1ebd9' : '#748077', fontSize: 11, marginTop: 10 }}>Kayıt kodu: {String(harvest._id || '').slice(-8).toUpperCase()} · Ödenen: {formatTL(paid)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <TouchableOpacity
                style={[styles.groupBtn, { flex: 1, opacity: currentIndex === 0 ? 0.45 : 1 }]}
                disabled={currentIndex === 0}
                onPress={() => selectIndex(currentIndex - 1)}
              >
                <Text style={styles.groupBtnText}>‹ Önceki Kayıt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.groupBtn, { flex: 1, opacity: currentIndex === pendingHarvests.length - 1 ? 0.45 : 1 }]}
                disabled={currentIndex === pendingHarvests.length - 1}
                onPress={() => selectIndex(currentIndex + 1)}
              >
                <Text style={styles.groupBtnText}>Sonraki Kayıt ›</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.formHelp, { color: '#1b4332', fontWeight: '700' }]}>Seçilen kaydın kalan ödemesi: {formatTL(selectedRemaining)}</Text>
          </>
        )}

        <Text style={styles.label}>Alınan Tutar (TL)</Text>
        <TextInput
          style={styles.input}
          placeholder="Örn: 5000"
          keyboardType="decimal-pad"
          value={payAmount}
          onChangeText={setPayAmount}
        />

        <Text style={styles.label}>Not (İsteğe Bağlı)</Text>
        <TextInput
          style={styles.input}
          placeholder="Örn: Banka havalesi"
          value={payDesc}
          onChangeText={setPayDesc}
          autoCorrect={false}
        />

        <TouchableOpacity style={[styles.submitBtn, { opacity: pendingHarvests.length === 0 ? 0.5 : 1 }]} disabled={pendingHarvests.length === 0} onPress={handleSpecificHarvestPayment}>
          <Text style={styles.submitBtnText}>Ödemeyi Kaydet</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
