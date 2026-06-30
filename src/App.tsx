import React, { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Volume2,
  Sparkles,
  Download,
  Play,
  Pause,
  RefreshCw,
  Clock,
  Trash2,
  FileText,
  Sliders,
  Type,
  Disc,
  Info,
  Check,
  AlertCircle,
} from 'lucide-react';

declare global {
  interface Window {
    lamejs?: any;
  }
}

type HistoryItem = {
  id: string;
  text: string;
  voiceName: string;
  style: string;
  speed: number;
  timestamp: number;
  audioBase64: string;
};

const MAX_CHARS = 1200;
const PRESSETS = [
  {
    label: "Salomlashish",
    text: "Assalomu alaykum! O'zbek ovoz sun'iy intellekt xizmatiga xush kelibsiz. Bugun siz uchun aniq va tabiiy nutq yarataman.",
  },
  {
    label: "Yangiliklar",
    text: "Xayrli kun, hurmatli tinglovchilar! Bugun poytaxtimizda eng so'nggi yangiliklar bilan tanishamiz.",
  },
  {
    label: "She'riyat",
    text: "O'zbekiston, ey ona vatan, sening tuprog'ing muqaddas. Dilimda sening qadring abadiy aks etadi.",
  },
  {
    label: "Ilmiy ma'ruza",
    text: "Inson miyasi neyronlari faoliyati va ularning matematik modellar orqali tahlili bugungi muhokama mavzusidir.",
  },
];

const VOICES = [
  { name: 'Dilnoza', label: 'Dilnoza (Ayol)', description: 'Mayin va ifodali ovoz (Tavsiya etiladi!)' },
  { name: 'Madina', label: 'Madina (Ayol)', description: "Aniq va ravon ma'ruzachi ovozi." },
  { name: 'Sardor', label: 'Sardor (Erkak)', description: "Yoqimli, samimiy va do'stona ovoz." },
  { name: 'Jasur', label: 'Jasur (Erkak)', description: 'Shiddatli, chuqur va vazmin ovoz.' },
  { name: 'Farrux', label: 'Farrux (Erkak)', description: 'Muloyim va iliq nutq ohangi.' },
];

const STYLES = [
  'Tabiiy / Oddiy',
  'Xushchaqchaq',
  'Sokin va muloyim',
  'Jiddiy / Rasmiy',
  'Hayajonli / Dramatik',
];

const VOICE_MAP: Record<string, string> = {
  Dilnoza: 'Zephyr',
  Madina: 'Kore',
  Sardor: 'Puck',
  Jasur: 'Charon',
  Farrux: 'Fenrir',
};

function formatDuration(value: number) {
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function createWav(samples: Int16Array, sampleRate: number, numChannels: number) {
  const blockAlign = numChannels * 2;
  const byteRate = sampleRate * blockAlign;
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1, offset += 2) {
    view.setInt16(offset, samples[i], true);
  }

  return buffer;
}

function decodeBase64ToInt16(base64: string) {
  const binary = atob(base64);
  const length = binary.length / 2;
  const buffer = new Int16Array(length);
  for (let i = 0, j = 0; i < binary.length; i += 2, j += 1) {
    buffer[j] = binary.charCodeAt(i) | (binary.charCodeAt(i + 1) << 8);
  }
  return buffer;
}

function buildWaveform(base64: string) {
  const samples = decodeBase64ToInt16(base64);
  const bars = 64;
  const chunkSize = Math.max(1, Math.floor(samples.length / bars));
  return Array.from({ length: bars }, (_, index) => {
    const start = index * chunkSize;
    const end = Math.min(samples.length, start + chunkSize);
    let sum = 0;
    for (let i = start; i < end; i += 1) {
      sum += Math.abs(samples[i]);
    }
    return end > start ? Math.min(1, sum / (end - start) / 32768) : 0;
  });
}

const App = () => {
  const [text, setText] = useState('');
  const [voiceName, setVoiceName] = useState('Dilnoza');
  const [style, setStyle] = useState('Tabiiy / Oddiy');
  const [speed, setSpeed] = useState(1);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mp3Url, setMp3Url] = useState<string | null>(null);
  const [mp3Ready, setMp3Ready] = useState(false);
  const [lastTrackName, setLastTrackName] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioBase64Ref = useRef<string | null>(null);
  const [lameReady, setLameReady] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem('ozbek-ovoz-history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch {
        setHistory([]);
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('ozbek-ovoz-history', JSON.stringify(history.slice(0, 6)));
  }, [history]);

  useEffect(() => {
    if (!audioRef.current) {
      const audio = document.createElement('audio');
      audio.crossOrigin = 'anonymous';
      audioRef.current = audio;
      audio.onended = () => setIsPlaying(false);
      audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
      audio.onpause = () => setIsPlaying(false);
      audio.onplay = () => setIsPlaying(true);
    }
  }, []);

  useEffect(() => {
    setLameReady(Boolean(window.lamejs && window.lamejs.Mp3Encoder));
  }, []);

  useEffect(() => {
    if (!audioUrl || !audioRef.current) {
      return;
    }

    const audio = audioRef.current;
    audio.src = audioUrl;
    audio.load();

    const onLoaded = () => {
      setDuration(audio.duration || 0);
    };

    audio.addEventListener('loadedmetadata', onLoaded);

    if (audioContextRef.current && analyserRef.current) {
      audioContextRef.current.resume().catch(() => undefined);
    } else {
      try {
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        const source = context.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(context.destination);
        audioContextRef.current = context;
        analyserRef.current = analyser;
      } catch {
        // ignore audio context errors until user interaction
      }
    }

    audio.play().catch(() => undefined);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
    };
  }, [audioUrl]);

  useEffect(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#spectrum-canvas');
    const analyser = analyserRef.current;
    if (!canvas || !analyser) {
      return () => undefined;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return () => undefined;
    }

    const render = () => {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = canvas.width / data.length;
      data.forEach((value, index) => {
        const height = (value / 255) * canvas.height;
        const x = index * barWidth;
        ctx.fillStyle = `hsl(${180 - (value / 255) * 80}, 100%, 65%)`;
        ctx.fillRect(x, canvas.height - height, barWidth * 0.85, height);
      });
      rafRef.current = requestAnimationFrame(render);
    };

    render();
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [audioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  const waveformProgress = useMemo(() => {
    if (!duration || !currentTime) return 0;
    return Math.min(1, currentTime / duration);
  }, [currentTime, duration]);

  const handleTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    if (value.length <= MAX_CHARS) {
      setText(value);
    }
  };

  const createWaveBlob = (base64: string) => {
    const samples = decodeBase64ToInt16(base64);
    const wavBuffer = createWav(samples, 24000, 1);
    return new Blob([wavBuffer], { type: 'audio/wav' });
  };

  const createMp3 = async () => {
    if (!audioBase64Ref.current || !window.lamejs?.Mp3Encoder) {
      return;
    }
    const samples = decodeBase64ToInt16(audioBase64Ref.current);
    const encoder = new window.lamejs.Mp3Encoder(1, 24000, 128);
    const chunk = 1152;
    const mp3Data: Uint8Array[] = [];
    for (let i = 0; i < samples.length; i += chunk) {
      const sub = samples.subarray(i, i + chunk);
      const mp3buf = encoder.encodeBuffer(sub, sub);
      if (mp3buf.length > 0) mp3Data.push(mp3buf);
    }
    const flush = encoder.flush();
    if (flush.length > 0) mp3Data.push(flush);
    const blob = new Blob(mp3Data as BlobPart[], { type: 'audio/mp3' });
    const url = URL.createObjectURL(blob);
    setMp3Url(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setMp3Ready(true);
  };

  const handleSynthesize = async () => {
    if (!text.trim()) {
      setErrorMessage('Matn bo\'sh bo\'lmasligi kerak.');
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);
    setIsSynthesizing(true);

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceName, style, speed }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.message || 'Sintez so‘rovida xatolik yuz berdi.');
      }

      const base64 = body.audioBase64 as string;
      if (!base64) {
        throw new Error('Noto‘g‘ri audio maʼlumot olindi.');
      }

      audioBase64Ref.current = base64;
      const blob = createWaveBlob(base64);
      const url = URL.createObjectURL(blob);
      setAudioUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setWaveform(buildWaveform(base64));
      setLastTrackName(`${voiceName} ovozi`);
      setDuration(body.metadata?.duration || 0);
      setStatusMessage('Ovoz muvaffaqiyatli sintez qilindi.');
      setMp3Ready(false);
      setMp3Url(null);
      setHistory(prev => [
        {
          id: crypto.randomUUID(),
          text,
          voiceName,
          style,
          speed,
          timestamp: Date.now(),
          audioBase64: base64,
        },
        ...prev,
      ].slice(0, 6));

      window.setTimeout(() => {
        createMp3();
      }, 200);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Sintez xatosi.');
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleEnhanceText = async () => {
    if (!text.trim()) {
      setErrorMessage('Matn bo\'sh bo\'lmasligi kerak.');
      return;
    }

    setErrorMessage(null);
    setIsEnhancing(true);

    try {
      const response = await fetch('/api/enhance-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.message || 'Imlo to\'g\'rilash xatosi.');
      }

      if (body.correctedText) {
        setText(body.correctedText);
        setStatusMessage('Matn imlo va uslub bo\'yicha yangilandi.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Imlo to\'g\'rilashda xato.');
    } finally {
      setIsEnhancing(false);
    }
  };

  const handlePreset = (value: string) => {
    setText(value);
    setStatusMessage('Andoza matn tanlandi.');
  };

  const handlePlayPause = async () => {
    if (!audioRef.current) return;
    try {
      if (audioRef.current.paused) {
        if (audioContextRef.current?.state === 'suspended') {
          await audioContextRef.current.resume();
        }
        await audioRef.current.play();
        setIsPlaying(true);
      } else {
        audioRef.current.pause();
      }
    } catch {
      // ignore
    }
  };

  const handleSeek = (index: number) => {
    if (!audioRef.current || !duration) return;
    const position = (index / waveform.length) * duration;
    audioRef.current.currentTime = position;
    setCurrentTime(position);
  };

  const handleHistorySelect = (item: HistoryItem) => {
    setText(item.text);
    setVoiceName(item.voiceName);
    setStyle(item.style);
    setSpeed(item.speed);
    audioBase64Ref.current = item.audioBase64;
    const blob = createWaveBlob(item.audioBase64);
    const url = URL.createObjectURL(blob);
    setAudioUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setWaveform(buildWaveform(item.audioBase64));
    setLastTrackName(`${item.voiceName} ovozi`);
    setMp3Ready(false);
    setMp3Url(null);
    setStatusMessage('Tarixdan ovoz qayta yuklandi.');
  };

  const handleRemoveHistory = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const handleClearHistory = () => {
    setHistory([]);
    setStatusMessage('Tarix tozalandi.');
  };

  const progressIndex = useMemo(() => Math.floor(waveform.length * waveformProgress), [waveform, waveformProgress]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-6 rounded-3xl bg-white/90 p-6 shadow-lg shadow-slate-200/50 ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-gradient-to-br from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/20 pulse-ring">
              <Volume2 className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3 text-slate-900">
                <h1 className="text-2xl font-semibold tracking-tight">O‘zbek Ovoz AI</h1>
                <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white">AI SPEECH</span>
              </div>
              <p className="mt-1 text-sm text-slate-500">Eng ilg'or ovoz sintezlovchi platformasi</p>
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 shadow-sm shadow-slate-100">
            Eng so'nggi <span className="font-semibold text-slate-900">gemini-3.1-flash-tts-preview</span> modeli
          </div>
        </header>

        {(errorMessage || statusMessage) && (
          <div className={`mb-6 rounded-3xl border px-5 py-4 ${errorMessage ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-teal-200 bg-teal-50 text-teal-900'}`}>
            <div className="flex items-center gap-3 text-sm">
              {errorMessage ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              <span>{errorMessage || statusMessage}</span>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-12">
          <section className="lg:col-span-5 space-y-6">
            <div className="rounded-3xl bg-white p-6 shadow-lg shadow-slate-200/50 ring-1 ring-slate-200">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-slate-500" />
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">O'zbekcha matn kiritish</h2>
                    <p className="text-sm text-slate-500">{text.length} / {MAX_CHARS} belgi</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleEnhanceText}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isEnhancing}
                >
                  <Sparkles className="h-4 w-4" />
                  {isEnhancing ? 'Yuklanmoqda...' : 'Tahrirlash va Imlo to‘g‘rilash (Gemini 3.5-Flash)'}
                </button>
              </div>

              <textarea
                value={text}
                onChange={handleTextChange}
                placeholder="O'zbek tilida matn yozing. O' va G' apostroflarini to'g'ri ishlating."
                className="min-h-[220px] w-full resize-none rounded-3xl border border-slate-200 bg-slate-50 p-4 text-slate-900 shadow-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
              <p className="mt-3 text-sm text-slate-500">Imlo to'g'rilash o' va g' harflarini, tinish belgilarini chiroyli tekshiradi.</p>

              <div className="mt-6 grid gap-3">
                {PRESSETS.map(preset => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handlePreset(preset.text)}
                    className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-700 transition hover:border-teal-500 hover:bg-teal-50"
                  >
                    <span className="font-semibold">💬 {preset.label}</span>
                    <p className="mt-1 text-xs text-slate-500">{preset.text}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-lg shadow-slate-200/50 ring-1 ring-slate-200">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-slate-900">
                  <Type className="h-5 w-5 text-slate-500" />
                  <h2 className="text-lg font-semibold">Ovoz sozlamalari va Uslublar</h2>
                </div>
                <Sliders className="h-5 w-5 text-slate-500" />
              </div>

              <div className="grid gap-4">
                {VOICES.map(option => (
                  <label key={option.name} className={`block rounded-3xl border px-4 py-4 transition ${voiceName === option.name ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-slate-50'} cursor-pointer`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-slate-900">{option.label}</span>
                      {voiceName === option.name && <Check className="h-4 w-4 text-teal-500" />}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{option.description}</p>
                    <input
                      type="radio"
                      name="voice"
                      value={option.name}
                      checked={voiceName === option.name}
                      onChange={() => setVoiceName(option.name)}
                      className="sr-only"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {STYLES.map(styleOption => (
                    <button
                      key={styleOption}
                      type="button"
                      onClick={() => setStyle(styleOption)}
                      className={`rounded-3xl px-4 py-3 text-left text-sm font-semibold transition ${style === styleOption ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}
                    >
                      {styleOption}
                    </button>
                  ))}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span className="inline-flex items-center gap-2"><Clock className="h-4 w-4 text-slate-400" /> Sekin (0.5x)</span>
                    <span>Tez (2.0x)</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={speed}
                    onChange={event => setSpeed(Number(event.target.value))}
                    className="mt-3 w-full accent-teal-500"
                  />
                  <p className="mt-3 text-sm text-slate-700">Tezlik: {speed.toFixed(1)}x</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSynthesize}
                disabled={isSynthesizing}
                className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-3xl bg-gradient-to-r from-teal-500 to-cyan-500 px-6 py-4 text-base font-semibold text-white shadow-xl shadow-teal-500/20 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSynthesizing ? 'Sintez qilinmoqda...' : 'Matnni Ovozga Sintez Qilish'}
              </button>
            </div>
          </section>

          <section className="lg:col-span-7 space-y-6">
            <div className="rounded-3xl bg-slate-900 p-6 text-slate-100 shadow-2xl shadow-slate-900/30 ring-1 ring-white/10">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">KUTISH REJIMI</p>
                  <h2 className="mt-3 text-2xl font-semibold text-white">{audioUrl ? `${lastTrackName || 'Aktiv trek'}` : 'Hozircha hech qanday ovoz sintez qilinmadi.'}</h2>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-slate-800 px-4 py-2 text-sm text-slate-300">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  Mono 24kHz • MP3 128kbps
                </div>
              </div>

              {!audioUrl ? (
                <div className="rounded-3xl border border-slate-700 bg-slate-950/70 p-8 text-center text-slate-400">
                  <Disc className="mx-auto mb-4 h-12 w-12 animate-spin text-teal-400" />
                  <p className="text-sm leading-7">
                    Hozircha hech qanday ovoz sintez qilinmadi. Sintez qilish tugmasini bosing yoki tayyor andozalardan birini tanlab ovoz hosil qiling.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-6 rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{voiceName} ovozi</p>
                        <p className="mt-2 text-lg font-semibold text-white">{style}</p>
                      </div>
                      <div className="rounded-3xl bg-slate-900 px-4 py-3 text-sm text-slate-200">
                        Tempo: {speed.toFixed(1)}x
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-slate-400">Aktiv trek uchun to‘liq hajmli SoundCloud uslubida vizual izoh.</p>
                  </div>

                  <div className="mb-6 rounded-3xl bg-slate-950/80 p-4 ring-1 ring-white/10">
                    <div className="mb-4 flex items-center justify-between text-sm text-slate-400">
                      <span>Soundbar Scrubber</span>
                      <span>{formatDuration(currentTime)} / {formatDuration(duration)}</span>
                    </div>
                    <div className="flex h-28 items-end gap-1 overflow-hidden rounded-3xl bg-slate-900 px-2 py-3">
                      {waveform.map((value, index) => {
                        const active = index <= progressIndex;
                        return (
                          <button
                            key={index}
                            type="button"
                            onClick={() => handleSeek(index)}
                            className={`waveform-bar h-full w-full rounded-full ${active ? 'active bg-gradient-to-t from-teal-500 to-cyan-400' : 'bg-slate-700'}`}
                            style={{ transform: `scaleY(${0.4 + value * 1.8})` }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div className="rounded-3xl bg-slate-950/80 p-5 ring-1 ring-white/10">
                      <canvas id="spectrum-canvas" width="800" height="140" className="w-full rounded-3xl bg-slate-900" />
                    </div>
                    <button
                      type="button"
                      onClick={handlePlayPause}
                      className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-400 text-white shadow-xl shadow-teal-500/30 transition hover:scale-[1.03]"
                    >
                      {isPlaying ? <Pause className="h-8 w-8" /> : <Play className="h-8 w-8" />}
                    </button>
                  </div>
                </>
              )}

              {mp3Ready && mp3Url && (
                <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-950/80 p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-2">
                      <Info className="mt-1 h-4 w-4 text-teal-300" />
                      <div>
                        <p className="text-sm uppercase tracking-[0.2em] text-teal-300">MP3 Audio (HD 128kbps)</p>
                        <p className="mt-2 text-sm text-slate-300">LameJS yordamida tezkor MP3 o'tkazish yakunlandi.</p>
                      </div>
                    </div>
                    <a
                      href={mp3Url}
                      download="ozbek-ovoz.mp3"
                      className="inline-flex items-center gap-2 rounded-3xl bg-teal-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/30 transition hover:bg-teal-400"
                    >
                      <Download className="h-4 w-4" />
                      TAYYOR MP3 YUKLASH
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-lg shadow-slate-200/50 ring-1 ring-slate-200">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Oxirgi sintez qilingan ovozlar</h3>
                  <p className="text-sm text-slate-500">Sintez tarixi lokal saqlanadi.</p>
                </div>
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <RefreshCw className="h-4 w-4" />
                  Tarixni tozalash
                </button>
              </div>

              {history.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-slate-500">
                  <p className="text-base font-semibold text-slate-700">Hali ovozlar sintez qilinmadi</p>
                  <p className="mt-2 text-sm">Siz yaratgan ovozlar shu yerda saqlanadi.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map(item => (
                    <div key={item.id} className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <button type="button" onClick={() => handleHistorySelect(item)} className="text-left">
                        <p className="font-semibold text-slate-900">{item.voiceName} ovozi • {item.style}</p>
                        <p className="mt-1 text-sm text-slate-500">{new Date(item.timestamp).toLocaleString('uz-UZ')} • {item.speed.toFixed(1)}x</p>
                      </button>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => handleHistorySelect(item)} className="rounded-full bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-400">
                          <Play className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => handleRemoveHistory(item.id)} className="rounded-full bg-slate-200 p-2 text-slate-600 transition hover:bg-slate-300">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <footer className="mt-10 rounded-3xl bg-white p-6 text-sm text-slate-500 shadow-lg shadow-slate-200/50 ring-1 ring-slate-200">
          <p>© 2026 O'zbek Ovoz AI. Barcha huquqlar himoyalangan.</p>
          <p className="mt-2">Sintez va audio vizualizatsiya to‘liq brauzerda va serverda xavfsiz boshqariladi.</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
