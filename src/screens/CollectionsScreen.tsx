import React, { useMemo, useState } from 'react';
import { Text, View, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { styles } from '../styles/styles';
import { deductionTotalOf, formatDisplayDate, formatTL, grossTotalOf, netTotalOf, remainingTotalOf } from '../utils/format';

export default function CollectionsScreen(props: any) {
  const { handleSpecificHarvestPayment, harvests, payAmount, payDesc, payHarvestId, setPayAmount, setPayDesc, setPayHarvestId } = props;
  const [search, setSearch] = useState('');

  const pendingHarvests = useMemo(
    () => (harvests || []).filter((harvest: any) => remainingTotalOf(harvest) > 0.01),
    [harvests],
  );
  const filteredHarvests = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('tr-TR');
    if (!query) return pendingHarvests;
    return pendingHarvests.filter((harvest: any) => [
      formatDisplayDate(harvest.tarih), harvest.firma, harvest.bahce || harvest.garden,
      harvest.surum, harvest.kg || harvest.weight, harvest.fiyat,
    ].join(' ').toLocaleLowerCase('tr-TR').includes(query));
  }, [pendingHarvests, search]);

  return (
    <View>
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Ödeme Al</Text>
        <Text style={styles.formHelp}>
          Bekleyen ödemesi olan {pendingHarvests.length} hasat kaydı var. Tarih, fabrika veya bahçe adıyla arayın ve doğru kaydı seçin.
        </Text>

        <Text style={styles.label}>Satışı Seçin</Text>
        <TextInput
          style={styles.input}
          value={search}
          onChangeText={setSearch}
          placeholder="Tarih, fabrika veya bahçe ara"
          autoCorrect={false}
        />
        <ScrollView style={{ maxHeight: 350, borderWidth: 1, borderColor: '#c9d8cd', borderRadius: 10, padding: 6, marginBottom: 12 }} keyboardShouldPersistTaps="handled">
          {pendingHarvests.length === 0 ? (
            <Text style={{ padding: 12, color: '#68766d' }}>Bekleyen ödemesi olan satış yok.</Text>
          ) : filteredHarvests.length === 0 ? (
            <Text style={{ padding: 12, color: '#68766d' }}>Bu aramaya uygun hasat kaydı bulunamadı.</Text>
          ) : filteredHarvests.map((harvest: any) => {
            const isSelected = payHarvestId === harvest._id;
            const gross = grossTotalOf(harvest);
            const deduction = deductionTotalOf(harvest);
            const net = netTotalOf(harvest);
            const paid = Number(harvest.tahsilat) || 0;
            const remaining = remainingTotalOf(harvest);
            return (
              <TouchableOpacity
                key={harvest._id}
                style={{
                  padding: 12,
                  backgroundColor: isSelected ? '#1b4332' : '#f7faf8',
                  borderWidth: 1,
                  borderColor: isSelected ? '#1b4332' : '#e1e9e3',
                  borderRadius: 8,
                  marginBottom: 7,
                }}
                onPress={() => setPayHarvestId(harvest._id)}
              >
                <Text style={{ color: isSelected ? '#fff' : '#1d3427', fontWeight: '800' }}>
                  #{String(harvest._id || '').slice(-6).toUpperCase()} · {formatDisplayDate(harvest.tarih)} · {harvest.surum || 'Sürüm yok'}
                </Text>
                <Text style={{ color: isSelected ? '#e5f0e8' : '#516057', marginTop: 3, fontSize: 12 }}>
                  {harvest.firma || 'Firma belirtilmedi'} · {harvest.bahce || harvest.garden || 'Bahçe belirtilmedi'} · {harvest.kg || harvest.weight || 0} KG
                </Text>
                <Text style={{ color: isSelected ? '#e5f0e8' : '#516057', marginTop: 3, fontSize: 12 }}>
                  Brüt: {formatTL(gross)} · %2 kesinti: {formatTL(deduction)} · Net: {formatTL(net)}
                </Text>
                <Text style={{ color: isSelected ? '#fff' : '#1b4332', fontWeight: '800', marginTop: 4 }}>
                  Ödenen: {formatTL(paid)} · Kalan alacak: {formatTL(remaining)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {payHarvestId ? <Text style={[styles.formHelp, { color: '#1b4332', fontWeight: '700' }]}>Seçilen hasat için tahsilat tutarını girin.</Text> : null}

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

        <TouchableOpacity style={styles.submitBtn} onPress={handleSpecificHarvestPayment}>
          <Text style={styles.submitBtnText}>Ödemeyi Kaydet</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
