const { GoogleGenAI } = require('@google/genai');
const { requireFirebaseAuth, enforceRateLimit, writeAuditLog, assertAllowedKeys } = require('../lib/security.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const context = await requireFirebaseAuth(req, res, { roles: ['HRD', 'SUPERADMIN', 'GM', 'MANAGER'] });
  if (!context) return;
  if (!enforceRateLimit(req, res, { namespace: 'gemini', key: context.user.uid, limit: 20, windowMs: 60 * 60_000 })) return;
  try { assertAllowedKeys(req.body || {}, ['prompt', 'model']); } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  const { prompt, model } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ success: false, error: 'Prompt is required' });
  }
  if (typeof prompt !== 'string' || prompt.length > 50_000) {
    return res.status(413).json({ success: false, error: 'Prompt melebihi batas keamanan.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: 'GEMINI_API_KEY environment variable is not configured on server.'
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const allowedModels = new Set(['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.6-flash']);
    const selectedModel = allowedModels.has(model) ? model : 'gemini-2.5-flash';
    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: prompt,
    });

    const text = response.text;
    await writeAuditLog(context.db, req, context.user, {
      action: 'AI_REQUEST', module: 'GEMINI', metadata: { model: selectedModel, prompt_length: prompt.length }
    });
    return res.status(200).json({ success: true, text });
  } catch (error) {
    console.error('Gemini Server API Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error generating content from Gemini'
    });
  }
};
