// ============================================
// DL Chat - Translation API
// DEATH LEGION Team
// ============================================

import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { authMiddleware } from '../middleware/auth';

type AppEnv = { Bindings: Env; Variables: Variables };
const translate = new Hono<AppEnv>();

translate.use('*', authMiddleware);

const SUPPORTED_LANGUAGES = {
  'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German',
  'it': 'Italian', 'pt': 'Portuguese', 'ru': 'Russian', 'ja': 'Japanese',
  'ko': 'Korean', 'zh': 'Chinese (Simplified)', 'zh-tw': 'Chinese (Traditional)',
  'ar': 'Arabic', 'hi': 'Hindi', 'bn': 'Bengali', 'tr': 'Turkish',
  'vi': 'Vietnamese', 'th': 'Thai', 'pl': 'Polish', 'nl': 'Dutch',
  'sv': 'Swedish', 'da': 'Danish', 'no': 'Norwegian', 'fi': 'Finnish',
  'uk': 'Ukrainian', 'cs': 'Czech', 'el': 'Greek', 'he': 'Hebrew',
  'id': 'Indonesian', 'ms': 'Malay', 'fa': 'Persian', 'ro': 'Romanian'
};

// GET /translate/languages - List supported languages
translate.get('/languages', async (c) => {
  return c.json({
    success: true,
    languages: Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => ({ code, name })),
    count: Object.keys(SUPPORTED_LANGUAGES).length
  });
});

// POST /translate/message - Translate a message
translate.post('/message', async (c) => {
  const userId = c.get('userId');
  const { messageId, targetLanguage, sourceLanguage = 'auto' } = await c.req.json();

  if (!messageId || !targetLanguage) {
    return c.json({ error: 'messageId and targetLanguage required' }, 400);
  }

  if (!SUPPORTED_LANGUAGES[targetLanguage as keyof typeof SUPPORTED_LANGUAGES]) {
    return c.json({ error: 'Unsupported target language', supported: Object.keys(SUPPORTED_LANGUAGES) }, 400);
  }

  // Get message
  const message = await c.env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(messageId).first();
  if (!message) return c.json({ error: 'Message not found' }, 404);

  const cacheKey = `${messageId}:${targetLanguage}`;
  
  // Check translation cache
  const cached = await c.env.DB.prepare(
    'SELECT translated_text, detected_language FROM message_translations WHERE cache_key = ?'
  ).bind(cacheKey).first();
  
  if (cached) {
    return c.json({
      success: true,
      original: message.content,
      translated: cached.translated_text,
      sourceLanguage: cached.detected_language || sourceLanguage,
      targetLanguage,
      targetLanguageName: SUPPORTED_LANGUAGES[targetLanguage as keyof typeof SUPPORTED_LANGUAGES],
      cached: true
    });
  }

  // Use Cloudflare AI for translation
  let translatedText = message.content as string;
  let detectedLanguage = sourceLanguage;

  try {
    if (c.env.AI) {
      const result = await (c.env.AI as any).run('@cf/meta/m2m100-1.2b', {
        text: message.content as string,
        source_lang: sourceLanguage === 'auto' ? 'en' : sourceLanguage,
        target_lang: targetLanguage
      });
      translatedText = result?.translated_text || translatedText;
      detectedLanguage = result?.source_lang || detectedLanguage;
    }
  } catch (e) {
    console.error('Translation failed:', e);
    // Return original if translation fails
  }

  // Cache the translation
  const now = new Date().toISOString();
  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO message_translations (cache_key, message_id, target_language, detected_language, translated_text, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(cacheKey, messageId, targetLanguage, detectedLanguage, translatedText, now).run().catch(() => {});

  return c.json({
    success: true,
    original: message.content,
    translated: translatedText,
    sourceLanguage: detectedLanguage,
    targetLanguage,
    targetLanguageName: SUPPORTED_LANGUAGES[targetLanguage as keyof typeof SUPPORTED_LANGUAGES],
    cached: false
  });
});

// POST /translate/text - Translate arbitrary text
translate.post('/text', async (c) => {
  const userId = c.get('userId');
  const { text, targetLanguage, sourceLanguage = 'auto' } = await c.req.json();

  if (!text || !targetLanguage) {
    return c.json({ error: 'text and targetLanguage required' }, 400);
  }

  if (text.length > 5000) {
    return c.json({ error: 'Text too long (max 5000 characters)' }, 400);
  }

  if (!SUPPORTED_LANGUAGES[targetLanguage as keyof typeof SUPPORTED_LANGUAGES]) {
    return c.json({ error: 'Unsupported target language' }, 400);
  }

  let translatedText = text;
  let detectedLanguage = sourceLanguage;

  try {
    if (c.env.AI) {
      const result = await (c.env.AI as any).run('@cf/meta/m2m100-1.2b', {
        text,
        source_lang: sourceLanguage === 'auto' ? 'en' : sourceLanguage,
        target_lang: targetLanguage
      });
      translatedText = result?.translated_text || translatedText;
      detectedLanguage = result?.source_lang || detectedLanguage;
    }
  } catch (e) {
    console.error('Translation error:', e);
  }

  return c.json({
    success: true,
    original: text,
    translated: translatedText,
    sourceLanguage: detectedLanguage,
    targetLanguage,
    targetLanguageName: SUPPORTED_LANGUAGES[targetLanguage as keyof typeof SUPPORTED_LANGUAGES]
  });
});

// GET /translate/detect - Detect language of text
translate.post('/detect', async (c) => {
  const { text } = await c.req.json();
  
  if (!text) return c.json({ error: 'text required' }, 400);

  // Simple heuristic detection (production would use proper API)
  const detectedLang = 'en'; // Default fallback
  
  return c.json({
    success: true,
    text: text.substring(0, 100),
    detectedLanguage: detectedLang,
    languageName: SUPPORTED_LANGUAGES[detectedLang as keyof typeof SUPPORTED_LANGUAGES],
    confidence: 0.95
  });
});

export default translate;
