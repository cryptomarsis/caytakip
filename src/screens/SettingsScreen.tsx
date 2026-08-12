import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Text, TouchableOpacity, View } from 'react-native';
import { API_ORIGIN, API_URL, fetchWithTimeout } from '../services/api';
import { styles } from '../styles/styles';

type Props = {
  currentUser: { token?: string } | null;
  onDeleteAccount: () => Promise<void>;
};

export default function SettingsScreen({ currentUser, onDeleteAccount }: Props) {
  const [privacy, setPrivacy] = useState<any>(null);
  const [loadingPrivacy, setLoadingPrivacy] = useState(true);

  useEffect(() => {
    fetchWithTimeout(`${API_URL}/legal/privacy`)
      .then((response) => response.json())
      .then(setPrivacy)
      .catch(() => setPrivacy(null))
      .finally(() => setLoadingPrivacy(false));
  }, []);

  const confirmDelete = () => {
    Alert.alert(
      'Hesap silinsin mi?',
      'Hasat, gider, ödeme ve bahçe kayıtlarınız kalıcı olarak silinecek. Bu işlem geri alınamaz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Hesabı Sil', style: 'destructive', onPress: () => onDeleteAccount().catch(() => undefined) }
      ]
    );
  };

  return <View>
    <Text style={styles.sectionTitle}>Ayarlar ve Gizlilik</Text>
    <View style={styles.formCard}>
      <Text style={styles.formTitle}>Gizlilik</Text>
      {loadingPrivacy ? <ActivityIndicator color="#246548" /> : privacy?.sections?.map((section: any) => (
        <View key={section.heading} style={styles.legalSection}>
          <Text style={styles.legalTitle}>{section.heading}</Text>
          <Text style={styles.legalText}>{section.body}</Text>
        </View>
      ))}
      <TouchableOpacity style={styles.secondaryBtn} onPress={() => Linking.openURL(`${API_ORIGIN}/privacy`)}>
        <Text style={styles.secondaryBtnText}>Gizlilik politikasını tarayıcıda aç</Text>
      </TouchableOpacity>
      {privacy?.contactEmail && !String(privacy.contactEmail).startsWith('Destek') && <Text style={styles.listSubText}>Destek: {privacy.contactEmail}</Text>}
    </View>

    {currentUser?.token && <View style={styles.dangerCard}>
      <Text style={styles.dangerTitle}>Hesabı sil</Text>
      <Text style={styles.dangerText}>Hesabınız ve ilişkili kayıtlarınız sunucudan kalıcı olarak silinir.</Text>
      <TouchableOpacity style={styles.dangerBtn} onPress={confirmDelete}>
        <Text style={styles.dangerBtnText}>Hesabımı ve kayıtlarımı sil</Text>
      </TouchableOpacity>
    </View>}
  </View>;
}
