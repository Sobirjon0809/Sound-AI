# Vicolin 🎙️ — O'zbekcha Real-Time Ovozli AI Agent

**Vicolin** — bu to'liq O'zbek tilida ishlaydigan, real vaqtli (full-duplex) ovozli AI yordamchi.
Foydalanuvchi mikrofon orqali gapiradi, ovoz WebSocket orqali serverga oqim (stream) sifatida
uzatiladi, Google Gemini javob yaratadi va O'zbekcha nutq (TTS) chunk-lari darhol brauzerga
qaytarilib, uzluksiz ijro etiladi.

Butun interfeys va AI shaxsiyati **O'zbek tilida** (`Eshitmoqdaman...`, `O'ylamoqdaman...`,
`Gapirmoqdaman...`).

## Arxitektura

```
vicolin-agent/
├── backend/            # Node.js + Express + TypeScript + ws
│   └── src/
│       ├── config/     # .env o'quvchi (GEMINI_API_KEY)
│       ├── services/   # Gemini (matn+STT), Uzbek TTS engine, audio yordamchilar
│       ├── sockets/    # WebSocket bi-directional stream coordinator
│       └── server.ts   # Kirish nuqtasi (HTTP + WS)
└── frontend/           # React (Vite) + TypeScript + Tailwind (dark mode)
    └── src/
        ├── components/ # AudioVisualizer, MicButton, ChatHistory, StatusIndicator
        ├── hooks/      # useAudioRecorder, useAudioPlayer, useWebSocket
        └── App.tsx     # Markaziy holat va layout
```

### Ovoz oqimi (pipeline)

1. **Capture** — brauzer Web Audio API (`AudioWorklet`) orqali xom PCM (16kHz, 16-bit, mono)
   ni oladi va WebSocket orqali binary chunk-lar sifatida uzatadi.
2. **STT** — server audio-ni WAV ga o'rab, Gemini multimodal orqali O'zbekcha matnga aylantiradi.
3. **Brain** — Gemini matn modeli javobni **token-by-token** stream qiladi (system instruction
   qat'iy O'zbekcha).
4. **TTS orchestration** — token-lar gaplarga bo'linadi va har bir gap tayyor bo'lishi bilan
   darhol Gemini TTS orqali PCM (24kHz) audio-ga aylantiriladi va clientga yuboriladi — to'liq
   javob tugashini kutmasdan.
5. **Playback** — frontend `useAudioPlayer` dinamik bufer/navbat (queue) yordamida chunk-larni
   ketma-ket, uzluksiz (gapsiz, click-siz, 00:00 ga tushmasdan) ijro etadi.

## Ishga tushirish (local)

Talab: Node.js 18+ va Google Gemini API kaliti — https://aistudio.google.com/apikey

```bash
# 1. Repo ildizida barcha paketlarni o'rnatish (npm workspaces)
npm install

# 2. Backend uchun .env yarating
cp backend/.env.example backend/.env
#   backend/.env ichida GEMINI_API_KEY ni to'ldiring

# 3. (ixtiyoriy) Frontend uchun .env
cp frontend/.env.example frontend/.env

# 4. Backend + frontend ni birga ishga tushirish
npm run dev
```

- Frontend: http://localhost:5173
- Backend (HTTP + WS): http://localhost:8080  •  WebSocket: `ws://localhost:8080/ws`
- Sog'liq tekshiruvi: http://localhost:8080/api/health

> Mikrofon `getUserMedia` faqat `localhost` yoki HTTPS da ishlaydi.

### Alohida ishga tushirish

```bash
npm run dev:backend    # faqat server
npm run dev:frontend   # faqat client
```

## Muhit o'zgaruvchilari

**backend/.env**

| Nomi | Tavsif | Standart |
| --- | --- | --- |
| `GEMINI_API_KEY` | Google Gemini API kaliti (majburiy) | — |
| `PORT` | HTTP/WS porti | `8080` |
| `CORS_ORIGIN` | Ruxsat etilgan origin(lar) | `http://localhost:5173` |
| `GEMINI_TEXT_MODEL` | Matn modeli | `gemini-2.5-flash` |
| `GEMINI_TTS_MODEL` | TTS modeli | `gemini-2.5-flash-preview-tts` |
| `GEMINI_STT_MODEL` | STT (audio) modeli | `gemini-2.5-flash` |
| `GEMINI_TTS_VOICE` | TTS ovozi | `Kore` |

**frontend/.env**

| Nomi | Tavsif | Standart |
| --- | --- | --- |
| `VITE_WS_URL` | Backend WebSocket manzili | `ws://localhost:8080/ws` |

## Texnologiyalar

- **Frontend:** React 18, Vite 6, TypeScript, Tailwind CSS, Web Audio API, lucide-react
- **Backend:** Node.js, Express, TypeScript, `ws`, `@google/genai`
- **AI:** Google Gemini (matn stream + audio STT + native TTS)

## WebSocket protokoli

Client → Server: `{"type":"start"}`, `{"type":"stop"}`, `{"type":"reset"}`,
`{"type":"text","text":"..."}` va binary PCM16 (16kHz) chunk-lar.

Server → Client: `{"type":"status","state":...}`, `{"type":"user_transcript",...}`,
`{"type":"assistant_delta",...}`, `{"type":"assistant_done",...}`, `{"type":"audio_end"}`,
`{"type":"notice"|"error",...}` va binary PCM16 (24kHz) audio chunk-lar.
