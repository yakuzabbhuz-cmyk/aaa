// ============================================
// DL Chat Mobile - Design System
// ============================================

export const COLORS = {
  // Background
  background: '#0D0D0D',
  surface: '#1A1A2E',
  surfaceElevated: '#16213E',
  surfaceHighlight: '#1E2A4A',

  // Brand
  primary: '#6C63FF',
  primaryLight: '#8A84FF',
  primaryDark: '#5549E0',
  accent: '#00D4AA',

  // Text
  text: '#FFFFFF',
  textSecondary: '#ACACAC',
  textMuted: '#666666',
  textOnPrimary: '#FFFFFF',

  // Status
  online: '#25D366',
  away: '#F5A623',
  offline: '#999999',
  error: '#FF4B4B',
  warning: '#FFD166',
  success: '#06D6A0',

  // Chat
  messageSent: '#6C63FF',
  messageReceived: '#1E2A4A',
  messageText: '#FFFFFF',
  replyBg: 'rgba(108, 99, 255, 0.15)',

  // Borders
  border: '#2A2A3E',
  borderLight: '#333355',

  // Tab Bar
  tabBar: '#0A0A14',
  tabBarActive: '#6C63FF',
  tabBarInactive: '#666',
};

export const FONTS = {
  regular: 'System',
  medium: 'System',
  semibold: 'System',
  bold: 'System',
};

export const SIZES = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,

  borderRadius: 12,
  borderRadiusLarge: 20,
  borderRadiusSmall: 6,
  borderRadiusFull: 999,

  avatarSm: 36,
  avatarMd: 48,
  avatarLg: 64,
  avatarXl: 96,

  inputHeight: 52,
  buttonHeight: 52,
  navBarHeight: 60,
  tabBarHeight: 64,

  maxWidth: 428,
};

export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20,
    shadowRadius: 8,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
};

export const TYPOGRAPHY = {
  h1: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.5 },
  h2: { fontSize: 26, fontWeight: '700' as const },
  h3: { fontSize: 22, fontWeight: '700' as const },
  h4: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodySmall: { fontSize: 14, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '500' as const },
  button: { fontSize: 16, fontWeight: '700' as const },
};

export const AVATAR_COLORS = [
  '#6C63FF', '#FF6B6B', '#4ECDC4', '#45B7D1', '#F7B731',
  '#5F27CD', '#00D2D3', '#FF9F43', '#EE5A24', '#009432',
];
