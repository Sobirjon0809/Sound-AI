import type { AgentState } from '../types';

/** Every user-facing string lives here so the UI stays fully in Uzbek. */
export const UZ = {
  appName: 'Vicolin',
  tagline: "Real vaqtli O'zbekcha ovozli AI yordamchi",

  status: {
    idle: 'Tayyor',
    listening: 'Eshitmoqdaman...',
    thinking: "O'ylamoqdaman...",
    speaking: 'Gapirmoqdaman...',
  } satisfies Record<AgentState, string>,

  connection: {
    connecting: 'Ulanmoqda...',
    connected: 'Ulandi',
    disconnected: 'Aloqa uzildi',
  },

  mic: {
    start: 'Gapirish uchun bosing',
    stop: "To'xtatish uchun bosing",
    listening: 'Tinglayapman...',
  },

  emptyState: {
    title: 'Salom! Men Vicolinman',
    subtitle: "Mikrofon tugmasini bosing va men bilan O'zbek tilida suhbatlashing.",
  },

  labels: {
    you: 'Siz',
    assistant: 'Vicolin',
    clear: 'Suhbatni tozalash',
    typePlaceholder: 'Yoki bu yerga yozing...',
    send: 'Yuborish',
  },

  errors: {
    micDenied: "Mikrofondan foydalanishga ruxsat berilmadi. Brauzer sozlamalarini tekshiring.",
    micUnavailable: "Mikrofon topilmadi yoki brauzeringiz qo'llab-quvvatlamaydi.",
    connectionLost: "Server bilan aloqa uzildi. Qayta ulanmoqda...",
    noKey: "Diqqat: GEMINI_API_KEY serverda sozlanmagan. Javoblar ishlamaydi.",
    generic: 'Xatolik yuz berdi. Iltimos qayta urinib ko‘ring.',
  },
} as const;
