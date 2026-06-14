// ============================================
// DL Chat Mobile - Forgot Password Screen
// ============================================
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import api from '../../api/client';

type Step = 'email' | 'reset';

export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSendCode = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      const result = await api.forgotPassword(email.trim().toLowerCase());
      // In dev mode a debug_code may be returned; show it to help testers
      if (result.debug_code) {
        Alert.alert(
          'Code Sent (Dev Mode)',
          `Your reset code is: ${result.debug_code}\n\nIn production this is sent via email.`,
          [{ text: 'OK', onPress: () => setStep('reset') }]
        );
      } else {
        Alert.alert('Code Sent', 'Check your email for the reset code.', [
          { text: 'OK', onPress: () => setStep('reset') },
        ]);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to send reset code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (code.replace(/\D/g, '').length < 6) {
      Alert.alert('Error', 'Please enter the 6-digit code from your email.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword({
        email: email.trim().toLowerCase(),
        code: code.trim(),
        new_password: newPassword,
      });
      Alert.alert('Password Reset!', 'Your password has been updated. Please sign in with your new password.', [
        { text: 'Sign In', onPress: () => router.replace('/(auth)/login') },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to reset password. The code may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={s.container}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>

        {/* Logo */}
        <View style={s.logoIcon}>
          <Text style={s.logoText}>DL</Text>
        </View>
        <Text style={s.title}>Reset Password</Text>

        {step === 'email' && (
          <>
            <Text style={s.subtitle}>
              Enter the email address linked to your account and we'll send you a reset code.
            </Text>

            <Text style={s.label}>EMAIL ADDRESS</Text>
            <TextInput
              style={s.input}
              placeholder="you@example.com"
              placeholderTextColor="#555"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={handleSendCode}
              returnKeyType="done"
            />

            <TouchableOpacity
              style={[s.btn, loading && s.btnDisabled]}
              onPress={handleSendCode}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Send Reset Code</Text>
              }
            </TouchableOpacity>
          </>
        )}

        {step === 'reset' && (
          <>
            <Text style={s.subtitle}>
              Enter the 6-digit code sent to <Text style={s.emailHighlight}>{email}</Text> and choose a new password.
            </Text>

            <Text style={s.label}>RESET CODE</Text>
            <TextInput
              style={s.input}
              placeholder="6-digit code"
              placeholderTextColor="#555"
              keyboardType="number-pad"
              value={code}
              onChangeText={setCode}
              maxLength={6}
            />

            <Text style={s.label}>NEW PASSWORD</Text>
            <View style={s.passwordRow}>
              <TextInput
                style={s.passwordInput}
                placeholder="Minimum 8 characters"
                placeholderTextColor="#555"
                secureTextEntry={!showPassword}
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={s.eyeBtn}>
                <Text>{showPassword ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.label}>CONFIRM PASSWORD</Text>
            <TextInput
              style={s.input}
              placeholder="Repeat new password"
              placeholderTextColor="#555"
              secureTextEntry={!showPassword}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              onSubmitEditing={handleResetPassword}
              returnKeyType="done"
            />

            <TouchableOpacity
              style={[s.btn, loading && s.btnDisabled]}
              onPress={handleResetPassword}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Reset Password</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setStep('email')} style={{ marginTop: 8 }}>
              <Text style={s.resendText}>Didn't receive a code? Send again</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  scroll: { flexGrow: 1, padding: 24, paddingTop: 56 },
  back: { marginBottom: 28 },
  backText: { color: '#6C63FF', fontSize: 15, fontWeight: '600' },
  logoIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  logoText: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: 2 },
  title: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#888', marginBottom: 28, lineHeight: 20 },
  emailHighlight: { color: '#6C63FF', fontWeight: '600' },
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
    marginBottom: 16,
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
    marginBottom: 16,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
  },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 14 },
  btn: {
    backgroundColor: '#6C63FF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 12,
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  btnDisabled: { opacity: 0.7, shadowOpacity: 0 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  resendText: { color: '#6C63FF', fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
