const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

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

// --- Bedrock helpers (shared by multiple routes) ---
function buildBedrockPayload(modelId, promptText) {
  if (modelId.startsWith('anthropic')) {
    return {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 512,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText }
          ]
        }
      ]
    };
  }
  if (modelId.includes('titan-text')) {
    return {
      inputText: promptText,
      textGenerationConfig: {
        maxTokenCount: 512,
        temperature: 0.2,
        topP: 0.9
      }
    };
  }
  return { prompt: promptText, max_tokens: 512, temperature: 0.2 };
}

function extractBedrockText(modelId, payload) {
  if (payload && Array.isArray(payload.output) && payload.output[0] && Array.isArray(payload.output[0].content)) {
    const first = payload.output[0].content.find(c => typeof c.text === 'string');
    if (first && first.text) return first.text;
  }
  if (payload && Array.isArray(payload.content) && payload.content[0] && payload.content[0].text) {
    return payload.content[0].text;
  }
  if (payload && Array.isArray(payload.results) && payload.results[0]) {
    if (payload.results[0].outputText) return payload.results[0].outputText;
    if (payload.results[0].text) return payload.results[0].text;
  }
  if (payload && payload.generation) return payload.generation;
  if (payload && Array.isArray(payload.generations) && payload.generations[0] && payload.generations[0].text) return payload.generations[0].text;
  if (typeof payload === 'string') return payload;
  return null;
}

async function bedrockGenerateText({ text, language, model, region }) {
  const client = new BedrockRuntimeClient({ region });
  const prompt = `You are a helpful assistant. Read the following English input and respond entirely in ${language}. If translation is appropriate, translate; if the input asks for tasks, perform them and provide the answer in ${language}. Keep the response clear and natural.\n\nInput: ${text}`;
  const body = JSON.stringify(buildBedrockPayload(model, prompt));
  const command = new InvokeModelCommand({ modelId: model, contentType: 'application/json', accept: 'application/json', body });
  const response = await client.send(command);
  const responseString = Buffer.from(response.body).toString('utf-8');
  const json = JSON.parse(responseString);
  const outputText = extractBedrockText(model, json);
  if (!outputText) {
    const error = new Error('Unable to parse model response');
    error.raw = json;
    throw error;
  }
  return outputText;
}

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

// Generate text with AWS Bedrock (supports Anthropic Claude 3 and Amazon Titan Text)
app.post('/api/bedrock/generate', async (req, res) => {
  try {
    const { text, language, model } = req.body || {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Parameter "text" (non-empty string) is required.' });
    }
    if (!language || typeof language !== 'string' || !language.trim()) {
      return res.status(400).json({ error: 'Parameter "language" (non-empty string) is required.' });
    }
    if (!model || typeof model !== 'string' || !model.trim()) {
      return res.status(400).json({ error: 'Parameter "model" (non-empty string) is required.' });
    }

    const region = process.env.AWS_REGION || 'us-east-1';
    const outputText = await bedrockGenerateText({ text, language, model, region });
    if (!outputText) {
      return res.status(502).json({ error: 'Unable to parse model response' });
    }

    return res.json({
      outputText,
      model,
      language,
      region
    });
  } catch (err) {
    console.error('Bedrock route error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate with Bedrock in a target language, then translate result to English
app.post('/api/bedrock/generate-translate', async (req, res) => {
  try {
    const { text, language, model } = req.body || {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Parameter "text" (non-empty string) is required.' });
    }
    if (!language || typeof language !== 'string' || !language.trim()) {
      return res.status(400).json({ error: 'Parameter "language" (non-empty string) is required.' });
    }
    if (!model || typeof model !== 'string' || !model.trim()) {
      return res.status(400).json({ error: 'Parameter "model" (non-empty string) is required.' });
    }

    const region = process.env.AWS_REGION || 'us-east-1';
    const generated = await bedrockGenerateText({ text, language, model, region });

    const { default: translate } = await import('google-translate-api-x');
    const translated = await translate(generated, { from: language, to: 'en' });
    if (!translated || !translated.text) {
      return res.status(502).json({ error: 'Invalid response from translation provider.' });
    }

    return res.json({
      generatedText: generated,
      translatedText: translated.text,
      sourceLang: language,
      targetLang: 'en',
      model,
      region
    });
  } catch (err) {
    console.error('Generate-then-translate error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});


