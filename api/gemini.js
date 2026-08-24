const { GoogleGenAI } = require('@google/genai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { prompt, model } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ success: false, error: 'Prompt is required' });
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
    const selectedModel = model || 'gemini-2.5-flash';
    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: prompt,
    });

    const text = response.text;
    return res.status(200).json({ success: true, text });
  } catch (error) {
    console.error('Gemini Server API Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Error generating content from Gemini'
    });
  }
};
