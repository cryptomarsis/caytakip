import React from 'react';
import { FlatList, RefreshControl, ScrollView, StyleProp, Text, TextInput, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from 'react-native-paper';

import { styles } from '../styles/styles';
import { formatTL, formatDisplayDate } from '../utils/format';
import { AppIcon } from '../components/app-icon';
import { IconHeading } from '../components/icon-heading';
import { CaylikScreenHeader } from '../components/caylik-ui';

export default function ExpenseScreen(props: any) {
  const { eForm, expenses, gardens, handleDelete, handleSaveExpense, setEForm, refreshing = false, onRefresh, contentContainerStyle } = props;
  const theme = useTheme();
  const containerStyle = contentContainerStyle as StyleProp<ViewStyle>;

  const header = (
    <View>
      <CaylikScreenHeader icon="receipt-text-outline" eyebrow="MASRAF TAKİBİ" title="Giderler" description="Sezon masraflarınızı kategori ve bahçeye göre kaydedin." />
      <View style={[styles.formCard, { backgroundColor: theme.colors.surface }]}>
        <IconHeading icon="plus-circle-outline" title="Yeni gider" compact />
        <Text style={[styles.formHelp, { color: theme.colors.onSurfaceVariant }]}>Gider türünü ve tutarı yazıp kaydedin.</Text>

        <Text style={[styles.label, { color: theme.colors.onSurface }]}>Tarih (GG.AA.YYYY)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]}
          value={eForm.date}
          onChangeText={(value) => setEForm({ ...eForm, date: value })}
          placeholder="12.08.2026"
          placeholderTextColor={theme.colors.onSurfaceVariant}
        />

        <Text style={[styles.label, { color: theme.colors.onSurface }]}>Kategori</Text>
        <View style={styles.rowBtnGroup}>
          {['İşçilik', 'Gübre', 'Nakliye', 'Diğer'].map((category) => (
            <TouchableOpacity
              key={category}
              style={[styles.groupBtn, eForm.kategori === category && styles.groupBtnActive]}
              onPress={() => setEForm({ ...eForm, kategori: category })}
            >
              <Text style={[styles.groupBtnText, eForm.kategori === category && styles.groupBtnTextActive]}>{category}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { color: theme.colors.onSurface }]}>Bahçe (İsteğe Bağlı)</Text>
        <Text style={[styles.formHelp, { color: theme.colors.onSurfaceVariant }]}>Bu gider belirli bir bahçeye aitse seçin. Seçmezseniz genel gider olarak kaydedilir.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowBtnGroup}>
          {[{ _id: '', name: 'Genel Gider' }, ...(gardens || [])].map((garden: any, index: number) => {
            const gardenName = String(garden.name || '').trim();
            const selected = (eForm.garden || '') === (gardenName === 'Genel Gider' && index === 0 ? '' : gardenName);
            const value = index === 0 ? '' : gardenName;
            return (
              <TouchableOpacity
                key={String(garden._id || `general-${index}`)}
                style={[styles.groupBtn, selected && styles.groupBtnActive]}
                onPress={() => setEForm({ ...eForm, garden: value })}
              >
                <Text style={[styles.groupBtnText, selected && styles.groupBtnTextActive]}>{index === 0 ? 'Genel Gider' : gardenName || 'İsimsiz Bahçe'}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={[styles.label, { color: theme.colors.onSurface }]}>Tutar (TL) *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]}
          value={eForm.tutar}
          onChangeText={(value) => setEForm({ ...eForm, tutar: value })}
          placeholder="Örn: 1500"
          placeholderTextColor={theme.colors.onSurfaceVariant}
          keyboardType="numeric"
        />

        <Text style={[styles.label, { color: theme.colors.onSurface }]}>Açıklama</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]}
          value={eForm.aciklama}
          onChangeText={(value) => setEForm({ ...eForm, aciklama: value })}
          placeholder="Gider detayları..."
          placeholderTextColor={theme.colors.onSurfaceVariant}
        />

        <TouchableOpacity style={styles.submitBtn} onPress={handleSaveExpense}>
          <View style={styles.submitBtnContent}><AppIcon name="content-save" size={20} color="#FFFFFF" /><Text style={styles.submitBtnText}>GİDERİ KAYDET</Text></View>
        </TouchableOpacity>
      </View>
      <Text style={[styles.sectionTitle, { marginTop: 20, color: theme.colors.onSurface }]}>Gider geçmişi</Text>
    </View>
  );

  return (
    <FlatList
      data={expenses || []}
      keyExtractor={(item, index) => String(item._id || index)}
      ListHeaderComponent={header}
      ListEmptyComponent={<Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>Henüz kaydedilmiş bir gider yok.</Text>}
      renderItem={({ item }) => (
        <View style={[styles.listItem, { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.outline }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.listTitle, { color: theme.colors.onSurface }]}>{item.kategori || 'Diğer'} - {formatTL(item.tutar)}</Text>
            <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Tarih: {formatDisplayDate(item.tarih)}</Text>
            <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Bahçe: {item.bahce || item.garden || 'Genel Gider'}</Text>
            {item.aciklama ? <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Not: {item.aciklama}</Text> : null}
          </View>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete('expenses', item._id, 'Gider')}>
            <View style={styles.actionBtnContent}><AppIcon name="trash-can-outline" size={15} color="#FFFFFF" /><Text style={styles.actionBtnText}>Sil</Text></View>
          </TouchableOpacity>
        </View>
      )}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      removeClippedSubviews
      contentContainerStyle={containerStyle}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} /> : undefined}
    />
  );
}
