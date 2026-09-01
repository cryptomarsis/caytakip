import React from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { styles } from '../styles/styles';

type Feedback = { title: string; message: string; type: 'error' | 'info' } | null;
type Props = { mode: 'login' | 'register'; phone: string; name: string; pin: string; pinConfirm: string; feedback: Feedback; loading: boolean; onModeChange: (mode: 'login' | 'register') => void; onPhoneChange: (value: string) => void; onNameChange: (value: string) => void; onPinChange: (value: string) => void; onPinConfirmChange: (value: string) => void; onClearFeedback: () => void; onSubmit: () => void };

export default function AuthScreen(props: Props) {
  const register = props.mode === 'register';
  return <SafeAreaProvider><SafeAreaView style={[styles.container, styles.authScreen]}><StatusBar barStyle="light-content" backgroundColor="#1b4332" /><KeyboardAvoidingView style={styles.authKeyboardAvoider} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}><ScrollView contentContainerStyle={styles.authScrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}><View style={styles.authCard}>
    <View style={styles.authBrand}><View style={styles.authBrandMark}><Image source={require('../../assets/caylik-icon-v1.png')} style={styles.authBrandImage} accessibilityLabel="Çaylık logosu" /></View><View style={{ flex: 1 }}><Text style={styles.authTitle}>Çaylık</Text><Text style={styles.authEyebrow}>ÜRETİCİ TAKİP SİSTEMİ</Text></View></View>
    <Text style={styles.authSubTitle}>{register ? 'Bilgilerinizi girin, hesabınız hemen hazır olsun.' : 'Telefon numaranız ve 6 haneli şifrenizle güvenle giriş yapın.'}</Text>
    {props.feedback && <View style={{ width: '100%', marginBottom: 14, padding: 12, borderRadius: 10, backgroundColor: props.feedback.type === 'error' ? '#FDECEC' : '#E9F5EE', borderWidth: 1, borderColor: props.feedback.type === 'error' ? '#F2B8B5' : '#B7DCC7' }}><Text style={{ color: props.feedback.type === 'error' ? '#A0221D' : '#1B5E3C', fontWeight: '800', marginBottom: 3 }}>{props.feedback.title}</Text><Text style={{ color: '#39443E', lineHeight: 20 }}>{props.feedback.message}</Text></View>}
    {register && <View style={{ width: '100%' }}><Text style={styles.label}>Ad Soyad</Text><TextInput style={styles.input} placeholder="Ahmet Yılmaz" value={props.name} onChangeText={props.onNameChange} autoCorrect={false} autoCapitalize="words" /></View>}
    <Text style={styles.label}>Telefon Numarası</Text><TextInput style={styles.input} placeholder="05XXXXXXXXX" keyboardType="phone-pad" value={props.phone} onChangeText={props.onPhoneChange} />
    <Text style={styles.label}>6 Haneli Giriş Şifresi</Text><TextInput style={styles.input} placeholder="Örn: 123456" keyboardType="number-pad" secureTextEntry maxLength={6} value={props.pin} onChangeText={props.onPinChange} />
    {register && <><Text style={styles.label}>Giriş Şifresi Tekrar</Text><TextInput style={styles.input} placeholder="6 haneyi tekrar yazın" keyboardType="number-pad" secureTextEntry maxLength={6} value={props.pinConfirm} onChangeText={props.onPinConfirmChange} /><Text style={styles.formHelp}>Bu şifreyi not edin; telefon numaranızla birlikte girişte kullanacaksınız.</Text></>}
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={register ? 'Kaydı tamamla' : 'Giriş yap'} disabled={props.loading} style={[styles.submitBtn, props.loading && { opacity: 0.7 }]} onPress={props.onSubmit}><Text style={styles.submitBtnText}>{props.loading ? 'Lütfen bekleyin…' : register ? 'Kaydı tamamla' : 'Giriş yap'}</Text></TouchableOpacity>
    <TouchableOpacity style={{ marginTop: 15 }} onPress={() => { props.onModeChange(register ? 'login' : 'register'); props.onPinChange(''); props.onPinConfirmChange(''); props.onClearFeedback(); }}><Text style={styles.authModeLink}>{register ? 'Zaten hesabınız var mı? Giriş yapın' : 'Hesabınız yok mu? Telefonla kayıt olun'}</Text></TouchableOpacity>
  </View></ScrollView></KeyboardAvoidingView></SafeAreaView></SafeAreaProvider>;
}
