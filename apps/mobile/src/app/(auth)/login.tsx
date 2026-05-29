// ============================================
// DL Chat Mobile - Login Screen
// ============================================
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Alert, StatusBar,
} from 'react-native';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth';
import { COLORS, FONTS } from '../../constants/theme';

const COUNTRY_CODES = [
  { code: '+94', country: 'LK', flag: '🇱🇰', name: 'Sri Lanka' },
  { code: '+1', country: 'US', flag: '🇺🇸', name: 'USA' },
  { code: '+44', country: 'GB', flag: '🇬🇧', name: 'UK' },
  { code: '+91', country: 'IN', flag: '🇮🇳', name: 'India' },
  { code: '+61', country: 'AU', flag: '🇦🇺', name: 'Australia' },
];

export default function LoginScreen() {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [selectedCountry, setSelectedCountry] = useState(COUNTRY_CODES[0]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const otpRefs = useRef<TextInput[]>([]);
  const { login } = useAuthStore();

  const handleSendOtp = async () => {
    if (!phoneNumber || phoneNumber.length < 6) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return;
    }

    const fullPhone = `${selectedCountry.code}${phoneNumber}`;
    setIsLoading(true);

    try {
      const result = await api.login({ phone: fullPhone });
      console.log('OTP sent:', result.debug_code); // Remove in production
      setStep('otp');
    } catch (e: any) {
      if (e.status === 404) {
        // User doesn't exist, redirect to register
        router.push({
          pathname: '/(auth)/register',
          params: { phone: fullPhone },
        });
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

    const fullPhone = `${selectedCountry.code}${phoneNumber}`;
    setIsLoading(true);

    try {
      const result = await api.verifyOtp({
        target: fullPhone,
        code,
        type: 'login',
        device_info: {
          platform: Platform.OS,
          os: Platform.OS,
          app_version: '1.0.0',
          device_name: `${Platform.OS} Device`,
        },
      });

      await login(result.user, result.token, result.refresh_token);
      router.replace('/(main)/chats');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Invalid OTP code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      Alert.alert('Not Supported', 'Biometric authentication not available on this device');
      return;
    }

    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      Alert.alert('Not Set Up', 'Please set up Face ID or fingerprint first');
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock DL Chat',
      fallbackLabel: 'Use Passcode',
    });

    if (result.success) {
      // Get stored session token
      const { initialize } = useAuthStore.getState();
      await initialize();
    }
  };

  const handleOtpChange = (text: string, index: number) => {
    const newOtp = [...otp];
    newOtp[index] = text.slice(-1);
    setOtp(newOtp);

    if (text && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    if (newOtp.every(d => d) && !isLoading) {
      handleVerifyOtp();
    }
  };

  const handleOtpKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={styles.logo}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoText}>DL</Text>
          </View>
          <Text style={styles.appName}>DL Chat</Text>
          <Text style={styles.tagline}>By DEATH LEGION Team</Text>
        </View>

        {step === 'phone' ? (
          <View style={styles.form}>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Enter your phone number to continue</Text>

            {/* Phone Input */}
            <View style={styles.phoneRow}>
              <TouchableOpacity style={styles.countryCode} onPress={() => {}}>
                <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
                <Text style={styles.countryCodeText}>{selectedCountry.code}</Text>
              </TouchableOpacity>

              <TextInput
                style={styles.phoneInput}
                placeholder="Phone number"
                placeholderTextColor={COLORS.textMuted}
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
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Continue</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.biometricBtn} onPress={handleBiometricLogin}>
              <Text style={styles.biometricText}>🔒 Login with Biometrics</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={styles.linkText}>Don't have an account? <Text style={styles.link}>Register</Text></Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.title}>Enter OTP</Text>
            <Text style={styles.subtitle}>Code sent to {selectedCountry.code}{phoneNumber}</Text>

            <View style={styles.otpContainer}>
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={ref => { if (ref) otpRefs.current[index] = ref; }}
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
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setStep('phone')}>
              <Text style={styles.linkText}>← Change number</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSendOtp}>
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
  },
  logo: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
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
  form: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#888',
    marginBottom: 32,
    textAlign: 'center',
  },
  phoneRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 16,
    gap: 12,
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
    borderColor: '#333',
  },
  countryFlag: {
    fontSize: 20,
  },
  countryCodeText: {
    color: '#fff',
    fontSize: 16,
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
    borderColor: '#333',
  },
  button: {
    width: '100%',
    backgroundColor: '#6C63FF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  biometricBtn: {
    paddingVertical: 12,
    marginBottom: 16,
  },
  biometricText: {
    color: '#6C63FF',
    fontSize: 15,
    fontWeight: '600',
  },
  linkText: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
  },
  link: {
    color: '#6C63FF',
    fontWeight: '600',
  },
  otpContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  otpInput: {
    width: 48,
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
  },
});
