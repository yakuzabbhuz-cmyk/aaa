// ============================================
// DL Chat Mobile - Register Screen
// New user registration: Email+Password OR Phone OTP
// ============================================
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '../../constants/theme';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../store/auth';

// Country codes (subset)
const COUNTRIES = [
  { name: 'Sri Lanka', code: 'LK', dial: '+94', flag: '🇱🇰' },
  { name: 'India', code: 'IN', dial: '+91', flag: '🇮🇳' },
  { name: 'United States', code: 'US', dial: '+1', flag: '🇺🇸' },
  { name: 'United Kingdom', code: 'GB', dial: '+44', flag: '🇬🇧' },
  { name: 'Germany', code: 'DE', dial: '+49', flag: '🇩🇪' },
  { name: 'France', code: 'FR', dial: '+33', flag: '🇫🇷' },
  { name: 'Canada', code: 'CA', dial: '+1', flag: '🇨🇦' },
  { name: 'Australia', code: 'AU', dial: '+61', flag: '🇦🇺' },
  { name: 'Japan', code: 'JP', dial: '+81', flag: '🇯🇵' },
  { name: 'China', code: 'CN', dial: '+86', flag: '🇨🇳' },
  { name: 'Singapore', code: 'SG', dial: '+65', flag: '🇸🇬' },
  { name: 'UAE', code: 'AE', dial: '+971', flag: '🇦🇪' },
  { name: 'Pakistan', code: 'PK', dial: '+92', flag: '🇵🇰' },
  { name: 'Bangladesh', code: 'BD', dial: '+880', flag: '🇧🇩' },
];

export default function RegisterScreen() {
  // Registration method
  const [method, setMethod] = useState<'email' | 'phone'>('email');

  // Phone OTP state
  const [step, setStep] = useState<'phone' | 'profile'>('phone');
  const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  // Email+Password state
  const [emailAddr, setEmailAddr] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailName, setEmailName] = useState('');
  const [emailUsername, setEmailUsername] = useState('');
  const [showEmailPassword, setShowEmailPassword] = useState(false);

  const { login } = useAuthStore();
  const phoneRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);

  const filteredCountries = COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
      c.dial.includes(countrySearch)
  );

  async function handleEmailRegister() {
    if (!emailName.trim() || emailName.trim().length < 2) {
      Alert.alert('Error', 'Please enter your display name (min 2 characters).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddr.trim())) {
      Alert.alert('Error', 'Please enter a valid email address.');
      return;
    }
    if (emailPassword.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      const result = await apiClient.registerWithPassword({
        email: emailAddr.trim().toLowerCase(),
        password: emailPassword,
        display_name: emailName.trim(),
        username: emailUsername.trim() || undefined,
      });
      await login(result.user, result.token, result.refresh_token);
      router.replace('/(main)/chats');
    } catch (e: any) {
      if (e.status === 409) {
        Alert.alert('Already Registered', e.message || 'This email or username is already taken.');
      } else {
        Alert.alert('Error', e.message || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp() {
    if (!phone.trim() || phone.length < 7) {
      Alert.alert('Invalid Number', 'Please enter a valid phone number.');
      return;
    }

    setLoading(true);
    try {
      const fullPhone = `${selectedCountry.dial}${phone.replace(/^0+/, '')}`;
      await apiClient.sendOtp(fullPhone);

      router.push({
        pathname: '/(auth)/otp',
        params: {
          phone: fullPhone,
          isNew: '1',
          name: name,
          username: username,
          bio: bio,
        },
      });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (showCountryPicker) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.pickerHeader}>
          <TouchableOpacity onPress={() => setShowCountryPicker(false)} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.pickerTitle}>Select Country</Text>
        </View>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search country..."
            placeholderTextColor="#666"
            value={countrySearch}
            onChangeText={setCountrySearch}
            autoFocus
          />
        </View>
        <ScrollView>
          {filteredCountries.map((country) => (
            <TouchableOpacity
              key={country.code}
              style={[
                styles.countryItem,
                selectedCountry.code === country.code && styles.countryItemSelected,
              ]}
              onPress={() => {
                setSelectedCountry(country);
                setShowCountryPicker(false);
                setCountrySearch('');
              }}
            >
              <Text style={styles.countryFlag}>{country.flag}</Text>
              <Text style={styles.countryName}>{country.name}</Text>
              <Text style={styles.countryDial}>{country.dial}</Text>
              {selectedCountry.code === country.code && (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>

          {/* Logo */}
          <View style={styles.logoContainer}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>DL</Text>
            </View>
            <Text style={styles.appName}>Create Account</Text>
            <Text style={styles.tagline}>Join DEATH LEGION Team's DL Chat</Text>
          </View>

          {/* Method Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, method === 'email' && styles.tabActive]}
              onPress={() => setMethod('email')}
            >
              <Text style={[styles.tabText, method === 'email' && styles.tabTextActive]}>📧 Email</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, method === 'phone' && styles.tabActive]}
              onPress={() => setMethod('phone')}
            >
              <Text style={[styles.tabText, method === 'phone' && styles.tabTextActive]}>📱 Phone</Text>
            </TouchableOpacity>
          </View>

          {/* ─── Email+Password Registration Form ─── */}
          {method === 'email' && (
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Display Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Your full name"
                  placeholderTextColor="#555"
                  value={emailName}
                  onChangeText={setEmailName}
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Username (optional)</Text>
                <View style={styles.usernameContainer}>
                  <Text style={styles.usernamePrefix}>@</Text>
                  <TextInput
                    style={[styles.input, styles.usernameInput]}
                    placeholder="your_username"
                    placeholderTextColor="#555"
                    value={emailUsername}
                    onChangeText={(t) => setEmailUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email Address *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor="#555"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={emailAddr}
                  onChangeText={setEmailAddr}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password *</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Minimum 8 characters"
                    placeholderTextColor="#555"
                    secureTextEntry={!showEmailPassword}
                    value={emailPassword}
                    onChangeText={setEmailPassword}
                  />
                  <TouchableOpacity onPress={() => setShowEmailPassword(v => !v)} style={styles.eyeBtn}>
                    <Text style={{ fontSize: 16 }}>{showEmailPassword ? '🙈' : '👁️'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.terms}>
                By continuing, you agree to DL Chat's{' '}
                <Text style={styles.link}>Terms of Service</Text> and{' '}
                <Text style={styles.link}>Privacy Policy</Text>.
              </Text>

              <TouchableOpacity
                style={[styles.continueBtn, loading && styles.continueBtnDisabled]}
                onPress={handleEmailRegister}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.continueBtnText}>Create Account →</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
                <Text style={styles.loginLink}>
                  Already have an account? <Text style={styles.link}>Sign In</Text>
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ─── Phone OTP Registration Form ─── */}
          {method === 'phone' && (
          <View style={styles.form}>
            {/* Name field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Your Name *</Text>
              <TextInput
                ref={nameRef}
                style={styles.input}
                placeholder="Enter your full name"
                placeholderTextColor="#555"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => phoneRef.current?.focus()}
              />
            </View>

            {/* Username field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Username (optional)</Text>
              <View style={styles.usernameContainer}>
                <Text style={styles.usernamePrefix}>@</Text>
                <TextInput
                  style={[styles.input, styles.usernameInput]}
                  placeholder="your_username"
                  placeholderTextColor="#555"
                  value={username}
                  onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  autoCapitalize="none"
                  returnKeyType="next"
                />
              </View>
            </View>

            {/* Phone field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number *</Text>
              <View style={styles.phoneRow}>
                <TouchableOpacity
                  style={styles.countryPickerBtn}
                  onPress={() => setShowCountryPicker(true)}
                >
                  <Text style={styles.countryFlag}>{selectedCountry.flag}</Text>
                  <Text style={styles.countryDialText}>{selectedCountry.dial}</Text>
                  <Text style={styles.dropArrow}>▾</Text>
                </TouchableOpacity>
                <TextInput
                  ref={phoneRef}
                  style={[styles.input, styles.phoneInput]}
                  placeholder="7X XXX XXXX"
                  placeholderTextColor="#555"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  returnKeyType="done"
                  onSubmitEditing={handleSendOtp}
                />
              </View>
            </View>

            {/* Bio field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Bio (optional)</Text>
              <TextInput
                style={[styles.input, styles.bioInput]}
                placeholder="Tell us about yourself..."
                placeholderTextColor="#555"
                value={bio}
                onChangeText={setBio}
                multiline
                numberOfLines={3}
                maxLength={200}
              />
              <Text style={styles.charCount}>{bio.length}/200</Text>
            </View>

            {/* Terms */}
            <Text style={styles.terms}>
              By continuing, you agree to DL Chat's{' '}
              <Text style={styles.link}>Terms of Service</Text> and{' '}
              <Text style={styles.link}>Privacy Policy</Text>.
            </Text>

            {/* Continue Button */}
            <TouchableOpacity
              style={[
                styles.continueBtn,
                (!phone.trim() || !name.trim() || loading) && styles.continueBtnDisabled,
              ]}
              onPress={handleSendOtp}
              disabled={!phone.trim() || !name.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.continueBtnText}>Send OTP →</Text>
              )}
            </TouchableOpacity>

            {/* Login link */}
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
              <Text style={styles.loginLink}>
                Already have an account?{' '}
                <Text style={styles.link}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          </View>
          )} {/* end method === 'phone' */}

          {/* Security badge */}
          <View style={styles.securityBadge}>
            <Text style={styles.securityIcon}>🔒</Text>
            <Text style={styles.securityText}>
              End-to-end encrypted · X25519 + AES-256-GCM
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  backBtn: {
    marginTop: 8,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  backBtnText: {
    color: '#6c63ff',
    fontSize: 15,
    fontWeight: '600',
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 32,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#6c63ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#6c63ff',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  logoText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
  },
  appName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  tagline: {
    color: '#a0a0a0',
    fontSize: 13,
    textAlign: 'center',
  },
  form: { gap: 16 },
  inputGroup: { gap: 6 },
  label: {
    color: '#a0a0a0',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
  },
  usernameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    overflow: 'hidden',
  },
  usernamePrefix: {
    color: '#6c63ff',
    fontSize: 18,
    paddingLeft: 14,
    fontWeight: '700',
  },
  usernameInput: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingLeft: 4,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 10,
  },
  countryPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 6,
  },
  countryFlag: { fontSize: 20 },
  countryDialText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  dropArrow: { color: '#a0a0a0', fontSize: 10 },
  phoneInput: { flex: 1 },
  bioInput: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  charCount: {
    color: '#555',
    fontSize: 11,
    textAlign: 'right',
    marginTop: -4,
  },
  terms: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  link: { color: '#6c63ff' },
  continueBtn: {
    backgroundColor: '#6c63ff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#6c63ff',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  continueBtnDisabled: {
    backgroundColor: '#3a3a3a',
    shadowOpacity: 0,
    elevation: 0,
  },
  continueBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  loginLink: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
  },
  securityIcon: { fontSize: 14 },
  securityText: { color: '#555', fontSize: 11 },
  // Country picker
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  pickerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    marginRight: 40,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1a1a1a',
    gap: 12,
  },
  countryItemSelected: {
    backgroundColor: 'rgba(108, 99, 255, 0.1)',
  },
  countryName: { color: '#fff', fontSize: 15, flex: 1 },
  countryDial: { color: '#6c63ff', fontSize: 14, fontWeight: '600' },
  checkmark: { color: '#6c63ff', fontSize: 16, fontWeight: '700' },
  // Method tabs
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
    gap: 0,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: { backgroundColor: '#6c63ff' },
  tabText: { color: '#888', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  // Password row
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 12,
    overflow: 'hidden',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
  },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 14 },
});
