import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);
const host = '0.0.0.0';
const apiKey = process.env.GEMINI_API_KEY?.trim() || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
const voiceMap = {
  Dilnoza: 'Zephyr',
  Madina: 'Kore',
  Sardor: 'Puck',
  Jasur: 'Charon',
  Farrux: 'Fenrir',
};

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.resolve(__dirname, 'dist')));

app.post('/api/tts', async (req, res) => {
  if (!apiKey || !ai) {
    return res.status(503).json({ message: 'GEMINI_API_KEY serverda sozlanmagan. Iltimos .env faylini to‘ldiring.' });
  }

  const { text, voiceName, style, speed } = req.body as {
    text?: string;
    voiceName?: string;
    style?: string;
    speed?: number;
  };

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ message: 'Matn bo‘sh bo‘lishi mumkin emas.' });
  }

  if (text.length > 1200) {
    return res.status(400).json({ message: 'Matn 1200 belgidan oshmasligi kerak.' });
  }

  const resolvedVoice = voiceMap[voiceName as keyof typeof voiceMap] || 'Zephyr';
  const prompt = `Sizga quyidagi O'zbekcha matn berildi. Ushbu matnni toza, aniq va tabiiy nutq sifatida ovozga aylantiring. Ovoz Nomi: ${voiceName}. Uslub: ${style}. Tezlik: ${speed}x. Matn: \n${text}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-tts-preview',
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: resolvedVoice,
            },
          },
        },
      },
    });

    const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64 || typeof base64 !== 'string') {
      return res.status(500).json({ message: 'TTS modelidan noto‘g‘ri javob olindi.' });
    }

    const buffer = Buffer.from(base64, 'base64');
    const duration = buffer.length / 2 / 24000;

    return res.json({
      audioBase64: base64,
      metadata: {
        voiceName: resolvedVoice,
        userVoiceName: voiceName,
        style,
        speed,
        sampleRate: 24000,
        channels: 1,
        duration,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'TTS so‘rovida xatolik yuz berdi.' });
  }
});

app.post('/api/enhance-text', async (req, res) => {
  if (!apiKey || !ai) {
    return res.status(503).json({ message: 'GEMINI_API_KEY serverda sozlanmagan. Iltimos .env faylini to‘ldiring.' });
  }

  const { text } = req.body as { text?: string };
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ message: 'Matn bo‘sh bo‘lishi mumkin emas.' });
  }

  const instruction = `Iltimos, quyidagi matndagi imlo, apostrof va uzbekcha so'z shakllarini tekshiring. Faqat to'g'rilangan matnni qaytaring, boshqa hech narsa qo'shmang.\n\n${text}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [{ parts: [{ text: instruction }] }],
    });

    const corrected = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!corrected || typeof corrected !== 'string') {
      return res.status(500).json({ message: 'Matnni qayta ishlashda xatolik yuz berdi.' });
    }

    return res.json({ correctedText: corrected.trim() });
  } catch (error) {
    return res.status(500).json({ message: 'Imlo yangilash so‘rovida xatolik yuz berdi.' });
  }
});

const startServer = async () => {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host,
        port,
      },
      appType: 'custom',
    });

    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      try {
        const indexHtml = await fs.readFile(path.resolve(__dirname, 'index.html'), 'utf-8');
        const html = await vite.transformIndexHtml(req.originalUrl, indexHtml);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (err) {
        next(err);
      }
    });
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.use('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, host, () => {
    console.log(`Server listening at http://${host}:${port}`);
  });
};

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
