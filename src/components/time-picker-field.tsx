import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from 'react-native-paper';

import { AppIcon } from './app-icon';

type Props = {
  label: string;
  hour: number;
  minute: number;
  disabled?: boolean;
  onChange: (hour: number, minute: number) => void;
};

const pickerDate = (hour: number, minute: number) => new Date(2000, 0, 1, hour, minute, 0, 0);

export default function TimePickerField({ label, hour, minute, disabled = false, onChange }: Props) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  const [draftDate, setDraftDate] = useState(() => pickerDate(hour, minute));
  const timeLabel = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const unavailable = disabled || (Platform.OS !== 'android' && Platform.OS !== 'ios');

  // Reset an open picker as soon as its owning form becomes unavailable.
  if (unavailable && visible) setVisible(false);

  const confirm = (selected: Date) => {
    setVisible(false);
    if (!unavailable) onChange(selected.getHours(), selected.getMinutes());
  };

  return (
    <View style={local.block}>
      <Text style={[local.label, { color: theme.colors.onSurface }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${timeLabel}, saat seç`}
        accessibilityState={{ disabled: unavailable }}
        disabled={unavailable}
        onPress={() => { setDraftDate(pickerDate(hour, minute)); setVisible(true); }}
        style={[local.inputShell, { backgroundColor: theme.colors.surfaceVariant, borderColor: theme.colors.outline }, unavailable && local.disabled]}
      >
        <View style={[local.icon, { backgroundColor: theme.colors.primaryContainer }]}>
          <AppIcon name="clock-outline" size={19} color={theme.colors.primary} />
        </View>
        <Text style={[local.value, { color: theme.colors.onSurface }]}>{timeLabel}</Text>
        <AppIcon name="chevron-down" size={22} color={theme.colors.primary} />
      </Pressable>

      {visible && !unavailable && Platform.OS === 'android' && (
        <DateTimePicker
          value={draftDate}
          mode="time"
          display="clock"
          is24Hour
          onValueChange={(_event, selected) => confirm(selected)}
          onDismiss={() => setVisible(false)}
        />
      )}

      {visible && !unavailable && Platform.OS === 'ios' && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setVisible(false)}>
          <ScrollView contentContainerStyle={local.overlay}>
            <View style={[local.modal, { backgroundColor: theme.colors.surface }]} accessibilityViewIsModal>
              <Text style={[local.modalTitle, { color: theme.colors.onSurface }]}>{label}</Text>
              <DateTimePicker
                value={draftDate}
                mode="time"
                display="spinner"
                locale="tr-TR"
                themeVariant={theme.dark ? 'dark' : 'light'}
                textColor={theme.colors.onSurface}
                accentColor={theme.colors.primary}
                onValueChange={(_event, selected) => setDraftDate(selected)}
                style={local.picker}
              />
              <View style={local.actions}>
                <Pressable accessibilityRole="button" onPress={() => setVisible(false)} style={local.action}>
                  <Text style={[local.actionText, { color: theme.colors.onSurfaceVariant }]}>Vazgeç</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => confirm(draftDate)} style={[local.action, { backgroundColor: theme.colors.primary }]}>
                  <Text style={[local.actionText, { color: theme.colors.onPrimary }]}>Saati seç</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
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
  disabled: { opacity: 0.5 },
  overlay: { flexGrow: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modal: { width: '100%', maxWidth: 460, borderRadius: 24, padding: 18 },
  modalTitle: { fontSize: 19, fontWeight: '900', marginBottom: 8 },
  picker: { width: '100%' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  action: { minHeight: 48, minWidth: 48, borderRadius: 13, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '900' },
});
