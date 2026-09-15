import React, { useRef, useState } from 'react';
import { Dimensions, Keyboard, Platform, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { TeaLandscape, TeaWordmark } from '../components/tea-brand';
import { caylikDesign } from '../context/app-theme';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../components/app-icon';
import { styles } from '../styles/styles';

type Feedback = { title: string; message: string; type: 'error' | 'info' } | null;
type Props = { mode: 'login' | 'register'; phone: string; name: string; pin: string; pinConfirm: string; feedback: Feedback; loading: boolean; onModeChange: (mode: 'login' | 'register') => void; onPhoneChange: (value: string) => void; onNameChange: (value: string) => void; onPinChange: (value: string) => void; onPinConfirmChange: (value: string) => void; onClearFeedback: () => void; onSubmit: () => void };

export default function AuthScreen(props: Props) {
  const theme = useTheme();
  const register = props.mode === 'register';
  const [showPin, setShowPin] = useState(false);
  const [showPinConfirm, setShowPinConfirm] = useState(false);
  const formScroll = useRef<ScrollView>(null);
  const { width, height, fontScale } = useWindowDimensions();
  // Android resizes the window for the keyboard; screen geometry keeps the brand still.
  const layoutHeight = Platform.OS === 'web' ? height : Dimensions.get('screen').height;
  const compact = layoutHeight < 760 || fontScale > 1.3;
  const landscapeHeight = Math.max(40, Math.min(compact ? 88 : 112, (layoutHeight - 480) * 0.35));
  const landscapeWidth = Math.min(width * 0.66, landscapeHeight * 1.5);

  const switchMode = () => {
    Keyboard.dismiss();
    formScroll.current?.scrollTo({ y: 0, animated: false });
    props.onModeChange(register ? 'login' : 'register');
    props.onPinChange('');
    props.onPinConfirmChange('');
    props.onClearFeedback();
    setShowPin(false);
    setShowPinConfirm(false);
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top', 'right', 'bottom', 'left']}>
        <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
        <Animated.View entering={FadeIn.duration(500)} style={{ width: '100%', maxWidth: 460, alignSelf: 'center', alignItems: 'center', flexShrink: 0, paddingTop: compact ? 4 : 12 }}>
          <TeaWordmark compact />
          {!compact && <Text style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 4, fontSize: 10, marginVertical: 6 }}>DOĞADAN EMEĞE</Text>}
          {!register && <View style={{ width: landscapeWidth, height: landscapeWidth / 1.5, marginTop: 4 }}><TeaLandscape height={landscapeWidth / 1.5} /></View>}
        </Animated.View>

        {/* Only the form scrolls: iOS adjusts its keyboard inset; Android uses adjustResize. */}
        <ScrollView
          ref={formScroll}
          style={styles.authKeyboardAvoider}
          contentContainerStyle={[styles.authScrollContent, { paddingBottom: 12 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
        >

            <Animated.View entering={FadeInDown.delay(180).duration(650)} style={[styles.authCard, { marginTop: 0, backgroundColor: theme.colors.background, borderWidth: 0, shadowOpacity: 0, elevation: 0, padding: caylikDesign.spacing.md }]}>
              <Text style={[styles.authFormTitle, { color: theme.colors.onBackground, fontFamily: caylikDesign.font.editorial, fontWeight: '700', textAlign: 'center', fontSize: caylikDesign.type.headline }]}>{register ? 'Emeğini kayda al.' : 'Emeğin burada kayıtlı.'}</Text>
              <Text style={[styles.authSubTitle, { color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 4, marginBottom: compact ? 8 : 14 }]}>{register ? 'Bilgilerini gir, Çaylık hesabın hazır olsun.' : 'Hasadın, ödemelerin ve alacakların tek yerde.'}</Text>

              {props.feedback && (
                <View style={[styles.authFeedback, props.feedback.type === 'error' ? styles.authFeedbackError : styles.authFeedbackInfo]}>
                  <Text style={[styles.authFeedbackTitle, { color: props.feedback.type === 'error' ? '#A0221D' : '#155E43' }]}>{props.feedback.title}</Text>
                  <Text style={styles.authFeedbackText}>{props.feedback.message}</Text>
                </View>
              )}

              {register && <AuthTextField icon="account-outline" label="Ad Soyad" placeholder="Ahmet Yılmaz" value={props.name} onChangeText={props.onNameChange} autoCapitalize="words" />}
              <AuthTextField icon="phone-outline" label="Telefon numarası" placeholder="05XX XXX XX XX" value={props.phone} onChangeText={props.onPhoneChange} keyboardType="phone-pad" />
              <AuthTextField icon="lock-outline" label="6 haneli giriş şifresi" placeholder="••••••" value={props.pin} onChangeText={props.onPinChange} keyboardType="number-pad" secure={!showPin} onToggleSecure={() => setShowPin((value) => !value)} onSubmitEditing={register ? undefined : props.onSubmit} />
              {register && (
                <>
                  <AuthTextField icon="lock-check-outline" label="Giriş şifresi tekrar" placeholder="••••••" value={props.pinConfirm} onChangeText={props.onPinConfirmChange} keyboardType="number-pad" secure={!showPinConfirm} onToggleSecure={() => setShowPinConfirm((value) => !value)} onSubmitEditing={props.onSubmit} />
                  <Text style={[styles.authHelp, { color: theme.colors.onSurfaceVariant }]}>Bu şifreyi telefon numaranızla birlikte girişte kullanacaksınız.</Text>
                </>
              )}

              <TouchableOpacity accessibilityRole="button" accessibilityLabel={register ? 'Kaydı tamamla' : 'Giriş yap'} disabled={props.loading} activeOpacity={0.86} style={[styles.authSubmitBtn, { backgroundColor: theme.colors.primary, shadowOpacity: 0, elevation: 0, borderRadius: caylikDesign.radius.md }, props.loading && { opacity: 0.65 }]} onPress={props.onSubmit}>
                <Text style={[styles.authSubmitText, { color: theme.colors.onPrimary, fontWeight: '600' }]}>{props.loading ? 'Lütfen bekleyin…' : register ? 'Hesabımı oluştur' : 'Giriş yap'}</Text>
                <AppIcon name="arrow-right" size={22} color={theme.colors.onPrimary} />
              </TouchableOpacity>

              <TouchableOpacity accessibilityRole="button" style={[styles.authModeButton, { minHeight: 48, flexWrap: 'wrap', borderWidth: 0, backgroundColor: 'transparent', marginTop: 4 }]} onPress={switchMode}>
                <Text style={{ color: theme.colors.onSurface }}>{register ? 'Hesabın var mı?' : 'Hesabın yok mu?'}</Text>
                <Text style={[styles.authModeButtonText, { color: theme.colors.primary, fontWeight: '600', textDecorationLine: 'underline' }]}>{register ? 'Giriş yap' : 'Kayıt ol'}</Text>
              </TouchableOpacity>
            </Animated.View>

            <Text style={[styles.authLegal, { color: theme.colors.onSurfaceVariant, marginTop: 0 }]}>{register ? 'Devam ederek Kullanım Koşulları ve Gizlilik Politikası’nı kabul etmiş olursunuz.' : 'Kayıtların hesabınla birlikte korunur.'}</Text>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function AuthTextField(props: { icon: string; label: string; placeholder: string; value: string; onChangeText: (value: string) => void; keyboardType?: 'default' | 'phone-pad' | 'number-pad'; autoCapitalize?: 'none' | 'words'; secure?: boolean; onToggleSecure?: () => void; onSubmitEditing?: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.authField, { marginBottom: 8 }]}>
      <Text style={[styles.authFieldLabel, { color: theme.colors.onSurface, fontWeight: '500' }]}>{props.label}</Text>
      <View style={[styles.authInputShell, { minHeight: 48, backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant, borderRadius: caylikDesign.radius.sm }]}>
        <AppIcon name={props.icon as any} size={22} color={theme.colors.primary} />
        <TextInput accessibilityLabel={props.label} style={[styles.authInput, { minHeight: 48, color: theme.colors.onSurface }]} placeholder={props.placeholder} placeholderTextColor={theme.colors.onSurfaceVariant} value={props.value} onChangeText={props.onChangeText} keyboardType={props.keyboardType} autoCapitalize={props.autoCapitalize || 'none'} autoCorrect={false} secureTextEntry={props.secure} maxLength={props.keyboardType === 'number-pad' ? 6 : undefined} onSubmitEditing={props.onSubmitEditing} />
        {!!props.onToggleSecure && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={props.secure ? 'Şifreyi göster' : 'Şifreyi gizle'} style={{ minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' }} onPress={props.onToggleSecure}>
            <AppIcon name={props.secure ? 'eye-outline' : 'eye-off-outline'} size={23} color={theme.colors.primary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
