// ============================================
// DL Chat Mobile - OTP Verification Screen
// 6-digit OTP entry with auto-focus and paste
// ============================================
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Alert,
  Clipboard,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../../store/auth';
import { apiClient } from '../../api/client';

const OTP_LENGTH = 6;
const RESEND_DELAY = 60; // seconds

export default function OtpScreen() {
  const params = useLocalSearchParams<{
    phone: string;
    isNew?: string;
    name?: string;
    username?: string;
    bio?: string;
  }>();

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(RESEND_DELAY);
  const [resending, setResending] = useState(false);
  const [shakeAnim] = useState(new Animated.Value(0));

  const inputRefs = useRef<(TextInput | null)[]>([]);
  const { login } = useAuthStore();

  const isNew = params.isNew === '1';
  const phone = params.phone || '';

  // ─── Countdown timer for resend ────────────────────────────────────────────
  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setInterval(() => setResendTimer((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendTimer]);

  // ─── Auto-focus first input ─────────────────────────────────────────────────
  useEffect(() => {
    setTimeout(() => inputRefs.current[0]?.focus(), 400);
  }, []);

  // ─── Shake animation on error ───────────────────────────────────────────────
  function shakeError() {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 80, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
    ]).start();
  }

  // ─── Handle OTP digit input ─────────────────────────────────────────────────
  function handleInput(text: string, index: number) {
    // Handle paste (multiple digits)
    if (text.length > 1) {
      const digits = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
      if (digits.length > 0) {
        const newOtp = [...otp];
        digits.split('').forEach((d, i) => {
          if (index + i < OTP_LENGTH) newOtp[index + i] = d;
        });
        setOtp(newOtp);
        const nextIndex = Math.min(index + digits.length, OTP_LENGTH - 1);
        inputRefs.current[nextIndex]?.focus();

        // Auto-verify if complete
        if (newOtp.every((d) => d !== '')) {
          verifyOtp(newOtp.join(''));
        }
        return;
      }
    }

    const digit = text.replace(/\D/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-verify if all filled
    if (digit && newOtp.every((d) => d !== '')) {
      verifyOtp(newOtp.join(''));
    }
  }

  function handleKeyPress(key: string, index: number) {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
      inputRefs.current[index - 1]?.focus();
    }
  }

  // ─── Verify OTP ─────────────────────────────────────────────────────────────
  async function verifyOtp(code?: string) {
    const otpCode = code || otp.join('');
    if (otpCode.length !== OTP_LENGTH) {
      Alert.alert('Incomplete OTP', 'Please enter all 6 digits.');
      return;
    }

    setLoading(true);
    try {
      if (isNew) {
        // Register new account
        const { data } = await apiClient.register({
          phone,
          name: params.name || 'User',
          username: params.username,
          bio: params.bio,
          otp: otpCode,
        });

        await login(data.access_token, data.refresh_token, data.user);
        router.replace('/(main)/chats');
      } else {
        // Login existing account
        const { data } = await apiClient.verifyOtp({ phone, otp: otpCode });
        await login(data.access_token, data.refresh_token, data.user);
        router.replace('/(main)/chats');
      }
    } catch (err: any) {
      shakeError();
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();

      Alert.alert(
        'Verification Failed',
        err?.message || 'Invalid OTP. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  }

  // ─── Resend OTP ─────────────────────────────────────────────────────────────
  async function handleResend() {
    if (resendTimer > 0 || resending) return;
    setResending(true);
    try {
      await apiClient.sendOtp(phone);
      setResendTimer(RESEND_DELAY);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
      Alert.alert('Code Sent', `A new OTP has been sent to ${phone}.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to resend OTP.');
    } finally {
      setResending(false);
    }
  }

  const otpFilled = otp.every((d) => d !== '');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Back button */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backBtnText}>← Back</Text>
      </TouchableOpacity>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.phoneIcon}>
          <Text style={styles.phoneIconText}>📱</Text>
        </View>
        <Text style={styles.title}>Verify Phone</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit code sent to
        </Text>
        <View style={styles.phoneDisplay}>
          <Text style={styles.phoneNumber}>{phone}</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.editPhone}>Edit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* OTP Inputs */}
      <Animated.View
        style={[styles.otpContainer, { transform: [{ translateX: shakeAnim }] }]}
      >
        {otp.map((digit, index) => (
          <TextInput
            key={index}
            ref={(ref) => (inputRefs.current[index] = ref)}
            style={[
              styles.otpInput,
              digit && styles.otpInputFilled,
            ]}
            value={digit}
            onChangeText={(text) => handleInput(text, index)}
            onKeyPress={({ nativeEvent: { key } }) => handleKeyPress(key, index)}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH} // allow paste
            selectTextOnFocus
            caretHidden
            textAlign="center"
          />
        ))}
      </Animated.View>

      {/* Separator */}
      <View style={styles.separator}>
        <View style={styles.separatorLine} />
        <Text style={styles.separatorText}>or paste from clipboard</Text>
        <View style={styles.separatorLine} />
      </View>

      {/* Paste OTP button */}
      <TouchableOpacity
        style={styles.pasteBtn}
        onPress={async () => {
          try {
            const text = await Clipboard.getString();
            if (text) handleInput(text, 0);
          } catch {
            // ignore
          }
        }}
      >
        <Text style={styles.pasteBtnText}>📋 Paste Code</Text>
      </TouchableOpacity>

      {/* Verify Button */}
      <TouchableOpacity
        style={[styles.verifyBtn, (!otpFilled || loading) && styles.verifyBtnDisabled]}
        onPress={() => verifyOtp()}
        disabled={!otpFilled || loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.verifyBtnText}>Verify & Continue</Text>
        )}
      </TouchableOpacity>

      {/* Resend */}
      <View style={styles.resendContainer}>
        <Text style={styles.resendText}>Didn't receive the code? </Text>
        <TouchableOpacity
          onPress={handleResend}
          disabled={resendTimer > 0 || resending}
        >
          {resending ? (
            <ActivityIndicator color="#6c63ff" size="small" />
          ) : resendTimer > 0 ? (
            <Text style={styles.resendTimer}>Resend in {resendTimer}s</Text>
          ) : (
            <Text style={styles.resendActive}>Resend OTP</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Security note */}
      <Text style={styles.securityNote}>
        🔒 Your number is verified once, then encrypted and never shared.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    paddingHorizontal: 28,
  },
  backBtn: {
    marginTop: 8,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  backBtnText: {
    color: '#6c63ff',
    fontSize: 15,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  phoneIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  phoneIconText: { fontSize: 32 },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#a0a0a0',
    fontSize: 14,
    marginBottom: 8,
  },
  phoneDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  phoneNumber: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  editPhone: {
    color: '#6c63ff',
    fontSize: 14,
    fontWeight: '600',
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 28,
  },
  otpInput: {
    width: 46,
    height: 56,
    backgroundColor: '#1a1a1a',
    borderWidth: 1.5,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  otpInputFilled: {
    borderColor: '#6c63ff',
    backgroundColor: '#1a1a2e',
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  separatorLine: { flex: 1, height: 1, backgroundColor: '#2a2a2a' },
  separatorText: { color: '#555', fontSize: 12 },
  pasteBtn: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginBottom: 28,
  },
  pasteBtnText: { color: '#a0a0a0', fontSize: 14 },
  verifyBtn: {
    backgroundColor: '#6c63ff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#6c63ff',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  verifyBtnDisabled: {
    backgroundColor: '#2a2a2a',
    shadowOpacity: 0,
    elevation: 0,
  },
  verifyBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  resendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  resendText: { color: '#666', fontSize: 13 },
  resendTimer: { color: '#555', fontSize: 13 },
  resendActive: { color: '#6c63ff', fontSize: 13, fontWeight: '600' },
  securityNote: {
    color: '#444',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 20,
  },
});
