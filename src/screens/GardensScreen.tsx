import React from 'react';
import { FlatList, RefreshControl, StyleProp, Text, TextInput, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from 'react-native-paper';

import { AppIcon } from '../components/app-icon';
import { IconHeading } from '../components/icon-heading';
import { styles } from '../styles/styles';
import { formatTL } from '../utils/format';

export default function GardensScreen(props: any) {
  const {
    gForm,
    gardens,
    calculatedGardenSummaries,
    handleDelete,
    handleSaveGarden,
    setGForm,
    refreshing = false,
    onRefresh,
    contentContainerStyle
  } = props;
  const theme = useTheme();
  const containerStyle = contentContainerStyle as StyleProp<ViewStyle>;

  const header = (
    <View>
      <IconHeading icon="tree" title="BAHÇE BAZLI TOPLAM TOPLAMA VE KAZANÇ" />
      {calculatedGardenSummaries.length === 0 ? (
        <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>Henüz bahçelerden yapılmış bir hasat verisi bulunamadı.</Text>
      ) : (
        calculatedGardenSummaries.map((garden: any, index: number) => (
          <View
            key={`${garden.name}-${index}`}
            style={[styles.listItem, { borderLeftWidth: 4, borderLeftColor: theme.colors.primary, backgroundColor: theme.colors.surface }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.listTitle, { color: theme.colors.onSurface }]}>{garden.name}</Text>
              <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Toplam Hasat: {garden.toplamKg.toLocaleString('tr-TR')} KG</Text>
              <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Net Satış: {formatTL(garden.toplamKazanc)}</Text>
              <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Toplam Tahsilat: {formatTL(garden.toplamTahsilat)}</Text>
              <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Gider: {formatTL(garden.toplamGider)}</Text>
              <Text style={[styles.listTitle, { marginTop: 6, color: garden.netKar < 0 ? theme.colors.error : theme.colors.primary }]}>Net Kazanç: {formatTL(garden.netKar)}</Text>
            </View>
          </View>
        ))
      )}

      <View style={[styles.formCard, { marginTop: 20, backgroundColor: theme.colors.surface }]}>
        <IconHeading icon="tree" title="YENİ BAHÇE TANIMLA" compact />

        <Text style={[styles.label, { color: theme.colors.onSurface }]}>Bahçe Adı</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]}
          value={gForm.name}
          onChangeText={(value) => setGForm({ ...gForm, name: value })}
          placeholder="Örn: Arka Bahçe"
          placeholderTextColor={theme.colors.onSurfaceVariant}
        />

        <Text style={[styles.label, { color: theme.colors.onSurface }]}>Ada / Parsel</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]}
          value={gForm.adaParsel}
          onChangeText={(value) => setGForm({ ...gForm, adaParsel: value })}
          placeholder="Örn: 101/12"
          placeholderTextColor={theme.colors.onSurfaceVariant}
        />

        <Text style={[styles.label, { color: theme.colors.onSurface }]}>Alan (Dönüm / m²)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline, color: theme.colors.onSurface }]}
          value={gForm.alan}
          onChangeText={(value) => setGForm({ ...gForm, alan: value })}
          placeholder="Örn: 5 Dönüm"
          placeholderTextColor={theme.colors.onSurfaceVariant}
        />

        <TouchableOpacity style={styles.submitBtn} onPress={handleSaveGarden}>
          <View style={styles.submitBtnContent}>
            <AppIcon name="content-save" size={20} color="#FFFFFF" />
            <Text style={styles.submitBtnText}>BAHÇEYİ KAYDET</Text>
          </View>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 20, color: theme.colors.onSurface }]}>KAYITLI BAHÇE LİSTESİ</Text>
    </View>
  );

  return (
    <FlatList
      data={gardens || []}
      keyExtractor={(item, index) => String(item._id || index)}
      ListHeaderComponent={header}
      ListEmptyComponent={<Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>Henüz kaydedilmiş bir bahçe yok.</Text>}
      renderItem={({ item }) => (
        <View style={[styles.listItem, { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.outline }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.listTitle, { color: theme.colors.onSurface }]}>{item.name || 'İsimsiz Bahçe'}</Text>
            {item.adaParsel ? <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Ada/Parsel: {item.adaParsel}</Text> : null}
            {item.alan ? <Text style={[styles.listSubText, { color: theme.colors.onSurfaceVariant }]}>Alan: {item.alan}</Text> : null}
          </View>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete('gardens', item._id, 'Bahçe')}>
            <View style={styles.actionBtnContent}>
              <AppIcon name="trash-can-outline" size={15} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>Sil</Text>
            </View>
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
