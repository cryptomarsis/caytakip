import React, { useMemo, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { styles } from '../styles/styles';
import { deductionTotalOf, formatDisplayDate, formatTL, grossTotalOf, netTotalOf, remainingTotalOf } from '../utils/format';
import { HarvestRecord } from '../types';

type Props = {
  harvests: HarvestRecord[];
  openHarvestEditModal: (harvest: HarvestRecord) => void;
  openPaymentForHarvest: (harvest: HarvestRecord) => void;
  handleDelete: (endpoint: string, id: string, title: string) => void;
};

const searchText = (harvest: HarvestRecord) => [
  harvest.firma,
  harvest.bahce || harvest.garden,
  harvest.tarih,
  harvest.surum,
  harvest.kg || harvest.weight,
  harvest.uretici || harvest.producerName,
].join(' ').toLocaleLowerCase('tr-TR');

export default function HarvestHistoryScreen({ harvests, openHarvestEditModal, openPaymentForHarvest, handleDelete }: Props) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('tr-TR');
    return normalized ? harvests.filter((harvest) => searchText(harvest).includes(normalized)) : harvests;
  }, [harvests, query]);

  return <View>
    <Text style={styles.sectionTitle}>Hasat Geçmişi</Text>
    <Text style={styles.formHelp}>Eski kayıtları firma, bahçe, tarih veya kilo yazarak bulun. Her kaydı buradan düzenleyebilirsiniz.</Text>
    <TextInput
      style={styles.input}
      value={query}
      onChangeText={setQuery}
      placeholder="Örn: ÇAYKUR, Arka Bahçe, 12.08.2026"
    />
    <Text style={styles.historyCount}>{filtered.length} kayıt gösteriliyor</Text>

    {filtered.length === 0 ? <Text style={styles.emptyText}>Aramanıza uygun hasat kaydı bulunamadı.</Text> : filtered.map((harvest) => {
      const gross = grossTotalOf(harvest);
      const deduction = deductionTotalOf(harvest);
      const net = netTotalOf(harvest);
      const paid = Number(harvest.tahsilat) || 0;
      const remaining = remainingTotalOf(harvest);
      return <View key={harvest._id} style={styles.listItem}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={styles.listTitle}>{harvest.firma || 'Firma belirtilmedi'} · {harvest.surum || 'Sürüm belirtilmedi'}</Text>
          <Text style={styles.listSubText}>{formatDisplayDate(harvest.tarih)} · {harvest.kg || harvest.weight || 0} KG · {harvest.fiyat || 0} TL/KG</Text>
          <Text style={styles.listSubText}>Bahçe: {harvest.bahce || harvest.garden || 'Belirtilmedi'}</Text>
          <Text style={styles.listSubText}>Brüt: {formatTL(gross)} · %2 kesinti: {formatTL(deduction)}</Text>
          <Text style={styles.listSubText}>Net: {formatTL(net)} · Ödenen: {formatTL(paid)}</Text>
          <Text style={[styles.historyRemaining, { color: remaining > 0.01 ? '#B54444' : '#237044' }]}>{remaining > 0.01 ? `Kalan alacak: ${formatTL(remaining)}` : 'Ödeme tamamlandı'}</Text>
        </View>
        <View style={styles.historyActions}>
          <TouchableOpacity style={styles.editBtn} onPress={() => openHarvestEditModal(harvest)}><Text style={styles.actionBtnText}>Düzenle</Text></TouchableOpacity>
          {remaining > 0.01 && <TouchableOpacity style={styles.historyPayBtn} onPress={() => openPaymentForHarvest(harvest)}><Text style={styles.actionBtnText}>Ödeme</Text></TouchableOpacity>}
          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete('harvests', harvest._id, 'Hasat')}><Text style={styles.actionBtnText}>Sil</Text></TouchableOpacity>
        </View>
      </View>;
    })}
  </View>;
}
