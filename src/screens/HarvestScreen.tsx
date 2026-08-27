import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from 'react-native-paper';

import { AppIcon, AppIconName } from '../components/app-icon';
import { CaylikButton, CaylikSurface } from '../components/caylik-ui';
import { styles } from '../styles/styles';
import { calculateAgriculturalDeductions, formatTL } from '../utils/format';

type FormFieldProps = {
  icon: AppIconName;
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'decimal-pad';
};

function FormField({ icon, label, value, placeholder, onChangeText, keyboardType = 'default' }: FormFieldProps) {
  const theme = useTheme();
  return (
    <View style={local.fieldBlock}>
      <Text style={[local.fieldLabel, { color: theme.colors.onSurface }]}>{label}</Text>
      <View style={[local.inputShell, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }]}>
        <View style={[local.inputIcon, { backgroundColor: theme.colors.primaryContainer }]}>
          <AppIcon name={icon} size={19} color={theme.colors.primary} />
        </View>
        <TextInput style={[local.inputControl, { color: theme.colors.onSurface }]} placeholderTextColor={theme.colors.onSurfaceVariant} value={value} onChangeText={onChangeText} placeholder={placeholder} keyboardType={keyboardType} />
      </View>
    </View>
  );
}

export default function HarvestScreen(props: any) {
  const theme = useTheme();
  const { currentUser, hForm, handleSaveHarvest, setHForm, onPickReceipt, receiptBusy, receiptNotice, receiptDraft, onConfirmReceipt, onDismissReceipt } = props;
  const [showDetails, setShowDetails] = useState(false);
  const amounts = calculateAgriculturalDeductions(hForm.kg, hForm.fiyat);

  return (
    <View style={local.screen}>
      <View style={[local.hero, { backgroundColor: theme.colors.primary }]}>
        <View style={[local.heroGlow, { backgroundColor: theme.colors.primaryContainer }]} />
        <View style={local.heroTop}>
          <View style={local.heroIcon}><AppIcon name="leaf" size={28} color={theme.colors.onPrimary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[local.heroEyebrow, { color: theme.colors.onPrimary }]}>YENİ KAYIT</Text>
            <Text style={[local.heroTitle, { color: theme.colors.onPrimary }]}>Hasadını kolayca kaydet</Text>
          </View>
        </View>
        <Text style={[local.heroText, { color: theme.colors.onPrimary }]}>Kilo ve fiyatı gir; kesinti, net alacak ve vade takibini Çaylık hesaplasın.</Text>
      </View>

      <CaylikSurface style={[local.sectionCard, { backgroundColor: theme.colors.surface }]}>
        <View style={local.cardContent}>
          <View style={local.sectionHead}>
            <View style={[local.sectionIcon, { backgroundColor: theme.colors.primaryContainer }]}><AppIcon name="line-scan" size={22} color={theme.colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[local.sectionTitle, { color: theme.colors.onSurface }]}>Fişten hızlı doldur</Text>
              <Text style={[local.sectionDescription, { color: theme.colors.onSurfaceVariant }]}>Fotoğrafı çek veya galeriden seç; onaylamadan kayıt oluşmaz.</Text>
            </View>
          </View>
          <View style={local.receiptActions}>
            <CaylikButton disabled={receiptBusy} onPress={() => onPickReceipt?.('camera')} style={local.receiptButton}>{receiptBusy ? 'Okunuyor...' : 'Fotoğraf Çek'}</CaylikButton>
            <CaylikButton disabled={receiptBusy} onPress={() => onPickReceipt?.('library')} mode="outlined" style={local.receiptButton}>Galeriden Seç</CaylikButton>
          </View>
          {!!receiptNotice && (
            <View style={[local.receiptResult, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }]}>
              <View style={local.receiptResultHead}>
                <AppIcon name={receiptDraft ? 'clipboard-check-outline' : 'check-circle-outline'} size={20} color={theme.colors.primary} />
                <Text style={[local.receiptResultTitle, { color: theme.colors.onSurface }]}>{receiptDraft ? 'Fiş bilgilerini kontrol et' : 'Bilgiler forma aktarıldı'}</Text>
              </View>
              <Text style={[local.receiptResultText, { color: theme.colors.onSurfaceVariant }]}>{receiptNotice}</Text>
              {!!receiptDraft && (
                <View style={{ marginTop: 9 }}>
                  <Text style={[local.receiptResultText, { color: theme.colors.onSurfaceVariant }]}>Firma: {receiptDraft.company || 'Bulunamadı'}</Text>
                  <Text style={[local.receiptResultText, { color: theme.colors.onSurfaceVariant }]}>Net ağırlık: {receiptDraft.netWeightKg ?? 'Bulunamadı'} KG</Text>
                  <Text style={[local.receiptResultText, { color: theme.colors.onSurfaceVariant }]}>Tarih: {receiptDraft.date || 'Bulunamadı'}</Text>
                  {!!receiptDraft.paymentTerm && <Text style={[local.receiptResultText, { color: theme.colors.onSurfaceVariant }]}>Ödeme: {receiptDraft.paymentTerm}</Text>}
                  <View style={local.receiptActions}>
                    <CaylikButton mode="outlined" onPress={onDismissReceipt} style={local.receiptButton}>Vazgeç</CaylikButton>
                    <CaylikButton onPress={onConfirmReceipt} style={[local.receiptButton, { flex: 1.4 }]}>Onayla ve Aktar</CaylikButton>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      </CaylikSurface>

      <CaylikSurface style={[local.sectionCard, { backgroundColor: theme.colors.surface }]}>
        <View style={local.cardContent}>
          <View style={local.sectionHead}>
            <View style={[local.sectionIcon, { backgroundColor: theme.colors.primaryContainer }]}><AppIcon name="sprout" size={22} color={theme.colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={[local.sectionTitle, { color: theme.colors.onSurface }]}>Hasat bilgileri</Text><Text style={[local.sectionDescription, { color: theme.colors.onSurfaceVariant }]}>Kaydın temel satış bilgilerini gir.</Text></View>
          </View>
          <FormField icon="weight-kilogram" label="Miktar (KG) *" value={hForm.kg} onChangeText={(kg) => setHForm({ ...hForm, kg })} placeholder="Örn: 1000" keyboardType="decimal-pad" />
          <FormField icon="factory" label="Firma / Alıcı *" value={hForm.firma} onChangeText={(firma) => setHForm({ ...hForm, firma })} placeholder="Örn: ÇAYKUR veya özel fabrika" />
          <FormField icon="currency-try" label="Brüt Birim Fiyat (TL) *" value={hForm.fiyat} onChangeText={(fiyat) => setHForm({ ...hForm, fiyat })} placeholder="Örn: 35,00" keyboardType="decimal-pad" />
          <View style={[local.moneyCard, { backgroundColor: theme.colors.primaryContainer }]}>
            <View style={local.moneyTop}><Text style={[local.moneyEyebrow, { color: theme.colors.onPrimaryContainer }]}>TAHMİNİ NET ALACAK</Text><AppIcon name="calculator-variant-outline" size={21} color={theme.colors.primary} /></View>
            <Text style={[local.moneyValue, { color: theme.colors.onPrimaryContainer }]}>{formatTL(amounts.netTutar)}</Text>
            <View style={[local.moneyBreakdown, { borderTopColor: theme.colors.outline }]}>
              <View style={{ flex: 1 }}><Text style={[local.moneyLabel, { color: theme.colors.onSurfaceVariant }]}>Brüt tutar</Text><Text style={[local.moneySmallValue, { color: theme.colors.onPrimaryContainer }]}>{formatTL(amounts.brutTutar)}</Text></View>
              <View style={{ flex: 1 }}><Text style={[local.moneyLabel, { color: theme.colors.onSurfaceVariant }]}>%2 kesinti</Text><Text style={[local.moneySmallValue, { color: theme.colors.onPrimaryContainer }]}>{formatTL(amounts.gelirVergisiKesintisi)}</Text></View>
            </View>
          </View>
        </View>
      </CaylikSurface>

      <TouchableOpacity accessibilityRole="button" activeOpacity={0.84} style={[local.detailsBar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]} onPress={() => setShowDetails(!showDetails)}>
        <View style={[local.detailsIcon, { backgroundColor: theme.colors.primaryContainer }]}><AppIcon name="tune-variant" size={21} color={theme.colors.primary} /></View>
        <View style={{ flex: 1 }}><Text style={[local.detailsTitle, { color: theme.colors.onSurface }]}>Ek bilgiler</Text><Text style={[local.detailsText, { color: theme.colors.onSurfaceVariant }]}>Tarih, bahçe, sürüm ve vade</Text></View>
        <AppIcon name={showDetails ? 'chevron-up' : 'chevron-down'} size={24} color={theme.colors.primary} />
      </TouchableOpacity>

      {showDetails && (
        <CaylikSurface style={[local.sectionCard, { backgroundColor: theme.colors.surface }]}>
          <View style={local.cardContent}>
            <FormField icon="calendar-outline" label="Tarih (GG.AA.YYYY)" value={hForm.date} onChangeText={(date) => setHForm({ ...hForm, date })} placeholder="12.08.2026" />
            <Text style={[styles.label, { color: theme.colors.onSurface }]}>Sürüm Seçimi</Text>
            <View style={styles.rowBtnGroup}>{['1. Sürüm', '2. Sürüm', '3. Sürüm', '4. Sürüm'].map((surum) => <TouchableOpacity key={surum} style={[styles.groupBtn, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }, hForm.surum === surum && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]} onPress={() => setHForm({ ...hForm, surum })}><Text style={[styles.groupBtnText, { color: theme.colors.onSurface }, hForm.surum === surum && { color: theme.colors.onPrimary, fontWeight: '800' }]}>{surum}</Text></TouchableOpacity>)}</View>
            {currentUser?.role === 'admin' && <FormField icon="account-outline" label="Üretici Adı" value={hForm.producer} onChangeText={(producer) => setHForm({ ...hForm, producer })} placeholder={currentUser?.name || 'Üretici Adı'} />}
            <FormField icon="cash-check" label="Alınan Ödeme (TL)" value={hForm.tahsilat} onChangeText={(tahsilat) => setHForm({ ...hForm, tahsilat })} placeholder="Ödeme yoksa 0" keyboardType="decimal-pad" />
            <FormField icon="tree-outline" label="Bahçe" value={hForm.garden} onChangeText={(garden) => setHForm({ ...hForm, garden })} placeholder="Örn: Arka Bahçe" />
            <View style={[local.switchBar, { backgroundColor: theme.colors.surfaceVariant }]}><View><Text style={[local.detailsTitle, { color: theme.colors.onSurface }]}>Vadeli satış</Text><Text style={[local.detailsText, { color: theme.colors.onSurfaceVariant }]}>Ödeme tarihini takip et</Text></View><Switch value={hForm.isVadeli} onValueChange={(isVadeli) => setHForm({ ...hForm, isVadeli })} trackColor={{ false: theme.colors.outline, true: theme.colors.primary }} thumbColor={theme.colors.surface} /></View>
            {hForm.isVadeli && <FormField icon="calendar-clock" label="Vade Tarihi (GG.AA.YYYY)" value={hForm.vadeTarihi} onChangeText={(vadeTarihi) => setHForm({ ...hForm, vadeTarihi })} placeholder="15.09.2026" />}
            <FormField icon="note-text-outline" label="Açıklama" value={hForm.aciklama} onChangeText={(aciklama) => setHForm({ ...hForm, aciklama })} placeholder="Notlar..." />
          </View>
        </CaylikSurface>
      )}
      <CaylikButton onPress={handleSaveHarvest} style={local.saveButton}>Hasadı Kaydet</CaylikButton>
      <Text style={[local.saveHint, { color: theme.colors.onSurfaceVariant }]}>Kaydetmeden önce bilgileri kontrol edebilirsin.</Text>
    </View>
  );
}

const local = StyleSheet.create({
  screen: { gap: 14, paddingBottom: 28 },
  hero: { borderRadius: 24, padding: 20, overflow: 'hidden', minHeight: 154, justifyContent: 'center' },
  heroGlow: { position: 'absolute', width: 180, height: 180, borderRadius: 90, opacity: 0.12, right: -45, top: -70 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  heroIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  heroEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4, opacity: 0.8 },
  heroTitle: { fontSize: 23, fontWeight: '900', marginTop: 3, letterSpacing: -0.4 },
  heroText: { fontSize: 13, lineHeight: 19, marginTop: 13, opacity: 0.82, maxWidth: 340 },
  sectionCard: { borderRadius: 22, overflow: 'hidden' },
  cardContent: { padding: 17 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 15 },
  sectionIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: '900', letterSpacing: -0.2 },
  sectionDescription: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  receiptActions: { flexDirection: 'row', gap: 9, marginTop: 5 },
  receiptButton: { flex: 1 },
  receiptResult: { marginTop: 13, borderRadius: 16, padding: 13, borderWidth: 1 },
  receiptResultHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 },
  receiptResultTitle: { fontSize: 13, fontWeight: '900' },
  receiptResultText: { fontSize: 12, lineHeight: 18 },
  fieldBlock: { marginBottom: 13 },
  fieldLabel: { fontSize: 13, fontWeight: '800', marginBottom: 7 },
  inputShell: { minHeight: 58, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  inputIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  inputControl: { flex: 1, minHeight: 56, paddingHorizontal: 11, fontSize: 16, fontWeight: '600' },
  moneyCard: { borderRadius: 18, padding: 15, marginTop: 3 },
  moneyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  moneyEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  moneyValue: { fontSize: 27, fontWeight: '900', marginTop: 5, letterSpacing: -0.7 },
  moneyBreakdown: { flexDirection: 'row', gap: 12, borderTopWidth: 1, paddingTop: 11, marginTop: 12 },
  moneyLabel: { fontSize: 10, fontWeight: '700' },
  moneySmallValue: { fontSize: 13, fontWeight: '800', marginTop: 3 },
  detailsBar: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
  detailsIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  detailsTitle: { fontSize: 14, fontWeight: '900' },
  detailsText: { fontSize: 11, marginTop: 2 },
  switchBar: { minHeight: 66, borderRadius: 16, paddingHorizontal: 14, marginVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  saveButton: { marginTop: 2, borderRadius: 17 },
  saveHint: { textAlign: 'center', fontSize: 11, marginTop: -7 },
});
