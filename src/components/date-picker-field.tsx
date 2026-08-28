import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useMemo, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from 'react-native-paper';

import { AppIcon } from './app-icon';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minimumDate?: Date;
};

const parseDisplayDate = (value: string) => {
  const match = String(value || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return new Date();
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12, 0, 0);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const formatDate = (date: Date) =>
  `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;

export default function DatePickerField({ label, value, onChange, minimumDate }: Props) {
  const theme = useTheme();
  const initialDate = useMemo(() => parseDisplayDate(value), [value]);
  const [visible, setVisible] = useState(false);
  const [draftDate, setDraftDate] = useState(initialDate);

  const open = () => {
    setDraftDate(parseDisplayDate(value));
    setVisible(true);
  };

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setVisible(false);
      if (event.type === 'set' && selected) onChange(formatDate(selected));
      return;
    }
    if (selected) setDraftDate(selected);
  };

  return (
    <View style={local.block}>
      <Text style={[local.label, { color: theme.colors.onSurface }]}>{label}</Text>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${label} seç`}
        activeOpacity={0.8}
        onPress={open}
        style={[local.inputShell, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }]}
      >
        <View style={[local.icon, { backgroundColor: theme.colors.primaryContainer }]}>
          <AppIcon name="calendar-clock" size={19} color={theme.colors.primary} />
        </View>
        <Text style={[local.value, { color: value ? theme.colors.onSurface : theme.colors.onSurfaceVariant }]}>{value || 'Tarih seçin'}</Text>
        <AppIcon name="chevron-down" size={22} color={theme.colors.primary} />
      </TouchableOpacity>

      {visible && Platform.OS === 'android' && (
        <DateTimePicker value={draftDate} mode="date" display="calendar" minimumDate={minimumDate} onChange={onPickerChange} />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
          <View style={local.overlay}>
            <View style={[local.modal, { backgroundColor: theme.colors.surface }]}>
              <Text style={[local.modalTitle, { color: theme.colors.onSurface }]}>{label}</Text>
              <DateTimePicker value={draftDate} mode="date" display="inline" locale="tr-TR" minimumDate={minimumDate} onChange={onPickerChange} accentColor={theme.colors.primary} />
              <View style={local.actions}>
                <TouchableOpacity onPress={() => setVisible(false)} style={local.action}><Text style={[local.actionText, { color: theme.colors.onSurfaceVariant }]}>Vazgeç</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => { onChange(formatDate(draftDate)); setVisible(false); }} style={[local.action, { backgroundColor: theme.colors.primary }]}><Text style={[local.actionText, { color: theme.colors.onPrimary }]}>Tarihi Seç</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const local = StyleSheet.create({
  block: { marginBottom: 13 },
  label: { fontSize: 13, fontWeight: '800', marginBottom: 7 },
  inputShell: { minHeight: 58, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  value: { flex: 1, paddingHorizontal: 11, fontSize: 16, fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modal: { borderRadius: 24, padding: 18 },
  modalTitle: { fontSize: 19, fontWeight: '900', marginBottom: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  action: { minHeight: 44, borderRadius: 13, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '900' },
});
