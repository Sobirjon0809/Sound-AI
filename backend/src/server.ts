import http from 'http';
import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { attachVoiceSocket } from './sockets/voiceSocket.js';

const app = express();

app.use(
  cors({
    origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
  }),
);
app.use(express.json({ limit: '1mb' }));

/** Lightweight health probe used by the frontend + deploy platforms. */
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'vicolin-backend',
    geminiConfigured: config.hasGeminiKey,
    textModel: config.textModel,
    ttsModel: config.ttsModel,
  });
});

const server = http.createServer(app);
attachVoiceSocket(server);

server.listen(config.port, () => {
  console.log(`\n🎙️  Vicolin backend http://localhost:${config.port}`);
  console.log(`    WebSocket: ws://localhost:${config.port}/ws`);
  if (!config.hasGeminiKey) {
    console.warn('    ⚠️  GEMINI_API_KEY topilmadi — .env faylini to‘ldiring.');
  }
});
