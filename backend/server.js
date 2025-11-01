const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Example API route
app.get('/api/example', (req, res) => {
  res.json({ message: 'API is working' });
});

// Translate text using google-translate-api-x (no API key required)
app.post('/api/translate', async (req, res) => {
  try {
    const { text, targetLang, sourceLang = 'en' } = req.body || {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Parameter "text" (non-empty string) is required.' });
    }
    if (!targetLang || typeof targetLang !== 'string' || !targetLang.trim()) {
      return res.status(400).json({ error: 'Parameter "targetLang" (non-empty string) is required.' });
    }

    const { default: translate } = await import('google-translate-api-x');
    const result = await translate(text, { from: sourceLang || 'en', to: targetLang });
    if (!result || !result.text) {
      return res.status(502).json({ error: 'Invalid response from translation provider.' });
    }

    return res.json({
      translatedText: result.text,
      provider: 'google-translate-api-x',
      targetLang,
      sourceLang: sourceLang || 'en',
    });
  } catch (err) {
    console.error('Translate route error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});


