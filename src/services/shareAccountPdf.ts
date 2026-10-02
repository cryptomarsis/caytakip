import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

export async function shareAccountPdf(html: string, isCurrent: () => boolean) {
  if (!isCurrent()) return;
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  if (!await Sharing.isAvailableAsync()) throw Error('Bu cihazda dosya paylaşımı kullanılamıyor.');
  const pdf = await Print.printToFileAsync({ html });
  try {
    if (isCurrent()) await Sharing.shareAsync(pdf.uri, { mimeType: 'application/pdf', dialogTitle: 'Çaylık hesap özeti' });
  } finally {
    await FileSystem.deleteAsync(pdf.uri, { idempotent: true }).catch(() => undefined);
  }
}
