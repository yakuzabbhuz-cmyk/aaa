// ============================================
// DL Chat Mobile - Login Screen
// Supports: Email+Password (instant) & Phone OTP
// ============================================
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert, StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth';

type LoginMethod = 'email' | 'phone';

const COUNTRY_CODES = [
  { code: '+94', flag: '🇱🇰', name: 'Sri Lanka' },
  { code: '+1',  flag: '🇺🇸', name: 'USA' },
  { code: '+44', flag: '🇬🇧', name: 'UK' },
  { code: '+91', flag: '🇮🇳', name: 'India' },
  { code: '+61', flag: '🇦🇺', name: 'Australia' },
  { code: '+49', flag: '🇩🇪', name: 'Germany' },
  { code: '+33', flag: '🇫🇷', name: 'France' },
  { code: '+81', flag: '🇯🇵', name: 'Japan' },
  { code: '+65', flag: '🇸🇬', name: 'Singapore' },
];

export default function LoginScreen() {
  const [method, setMethod] = useState<LoginMethod>('email');

  // Email+Password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Phone+OTP state
  const [phoneStep, setPhoneStep] = useState<'phone' | 'otp'>('phone');
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(TextInput | null)[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuthStore();

  // ─── Email+Password ───────────────────────────────────────
  const handleEmailLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter your email and password');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    setIsLoading(true);
    try {
      const result = await api.loginWithPassword({ email: email.trim().toLowerCase(), password });
      await login(result.user, result.token, result.refresh_token);
      router.replace('/(main)/chats');
    } catch (e: any) {
      const status = e.status ?? 0;
      if (status === 401) {
        Alert.alert('Login Failed', 'Incorrect email or password. Please try again.');
      } else if (status === 400) {
        Alert.alert('Login Method', e.message || 'This account uses phone/OTP login.');
      } else if (status === 403) {
        Alert.alert('Account Banned', e.message);
      } else {
        Alert.alert('Error', e.message || 'Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Phone+OTP ────────────────────────────────────────────
  const handleSendOtp = async () => {
    if (!phoneNumber || phoneNumber.replace(/\D/g, '').length < 6) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return;
    }
    const fullPhone = `${selectedCountry.code}${phoneNumber.replace(/^0+/, '')}`;
    setIsLoading(true);
    try {
      await api.login({ phone: fullPhone });
      setPhoneStep('otp');
    } catch (e: any) {
      if (e.status === 404) {
        router.push({ pathname: '/(auth)/register', params: { phone: fullPhone } });
      } else {
        Alert.alert('Error', e.message || 'Failed to send OTP');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const code = otp.join('');
    if (code.length !== 6) {
      Alert.alert('Error', 'Enter the complete 6-digit code');
      return;
    }
    const fullPhone = `${selectedCountry.code}${phoneNumber.replace(/^0+/, '')}`;
    setIsLoading(true);
    try {
      const result = await api.verifyOtp({
        target: fullPhone,
        code,
        type: 'login',
        device_info: { platform: Platform.OS, app_version: '1.0.0' },
      });
      await login(result.user, result.token, result.refresh_token);
      router.replace('/(main)/chats');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Invalid OTP code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (text: string, index: number) => {
    const digit = text.replace(/\D/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
    if (newOtp.every(d => d) && !isLoading) {
      // Auto-submit when all digits entered
      setTimeout(() => handleVerifyOtp(), 100);
    }
  };

  const handleOtpKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoText}>DL</Text>
          </View>
          <Text style={styles.appName}>DL Chat</Text>
          <Text style={styles.tagline}>By DEATH LEGION Team</Text>
        </View>

        {/* Method Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, method === 'email' && styles.tabActive]}
            onPress={() => { setMethod('email'); setPhoneStep('phone'); }}
          >
            <Text style={[styles.tabText, method === 'email' && styles.tabTextActive]}>
              📧 Email
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, method === 'phone' && styles.tabActive]}
            onPress={() => setMethod('phone')}
          >
            <Text style={[styles.tabText, method === 'phone' && styles.tabTextActive]}>
              📱 Phone
            </Text>
          </TouchableOpacity>
        </View>

        {/* ─── Email + Password Form ─── */}
        {method === 'email' && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>Welcome Back</Text>
            <Text style={styles.formSubtitle}>Sign in with your email and password</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>EMAIL</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#555"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>PASSWORD</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Your password"
                  placeholderTextColor="#555"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleEmailLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(v => !v)}
                  style={styles.eyeBtn}
                >
                  <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => router.push('/(auth)/forgot-password')}
              style={styles.forgotBtn}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleEmailLogin}
              disabled={isLoading}
            >
              {isLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Sign In</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={styles.linkText}>
                Don't have an account? <Text style={styles.link}>Register</Text>
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ─── Phone — Enter Number ─── */}
        {method === 'phone' && phoneStep === 'phone' && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>Phone Login</Text>
            <Text style={styles.formSubtitle}>We'll send you a verification code</Text>

            <View style={styles.phoneRow}>
              <View style={styles.countryCode}>
                <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
                <Text style={styles.countryCodeText}>{selectedCountry.code}</Text>
              </View>
              <TextInput
                style={styles.phoneInput}
                placeholder="Phone number"
                placeholderTextColor="#555"
                keyboardType="phone-pad"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                onSubmitEditing={handleSendOtp}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleSendOtp}
              disabled={isLoading}
            >
              {isLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Send OTP</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={styles.linkText}>
                Don't have an account? <Text style={styles.link}>Register</Text>
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ─── Phone — OTP Verify ─── */}
        {method === 'phone' && phoneStep === 'otp' && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>Enter Code</Text>
            <Text style={styles.formSubtitle}>
              Code sent to {selectedCountry.code} {phoneNumber}
            </Text>

            <View style={styles.otpContainer}>
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={ref => { otpRefs.current[index] = ref; }}
                  style={[styles.otpInput, digit ? styles.otpInputFilled : null]}
                  value={digit}
                  onChangeText={(text) => handleOtpChange(text, index)}
                  onKeyPress={({ nativeEvent }) => handleOtpKeyPress(nativeEvent.key, index)}
                  keyboardType="number-pad"
                  maxLength={1}
                  textAlign="center"
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleVerifyOtp}
              disabled={isLoading}
            >
              {isLoading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Verify</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { setPhoneStep('phone'); setOtp(['','','','','','']); }}>
              <Text style={[styles.linkText, { marginTop: 12 }]}>← Change number</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSendOtp} style={{ marginTop: 8 }}>
              <Text style={styles.linkText}>Resend code</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    paddingTop: 48,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 2,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    padding: 4,
    marginBottom: 28,
    width: '100%',
    maxWidth: 380,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: '#6C63FF',
  },
  tabText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  form: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  formTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  formSubtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 24,
    alignSelf: 'flex-start',
  },
  inputGroup: {
    width: '100%',
    marginBottom: 16,
  },
  label: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    width: '100%',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    overflow: 'hidden',
    width: '100%',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  eyeIcon: {
    fontSize: 18,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: 20,
    marginTop: -6,
  },
  forgotText: {
    color: '#6C63FF',
    fontSize: 13,
    fontWeight: '600',
  },
  button: {
    width: '100%',
    backgroundColor: '#6C63FF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
    shadowOpacity: 0,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  linkText: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  link: {
    color: '#6C63FF',
    fontWeight: '600',
  },
  phoneRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 16,
    gap: 10,
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  countryFlag: {
    fontSize: 20,
  },
  countryCodeText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  phoneInput: {
    flex: 1,
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  otpContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 32,
    marginTop: 8,
  },
  otpInput: {
    width: 46,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#1A1A2E',
    borderWidth: 1,
    borderColor: '#333',
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  otpInputFilled: {
    borderColor: '#6C63FF',
    backgroundColor: '#1a1440',
  },
});
