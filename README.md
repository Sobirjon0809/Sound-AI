# O'zbek Ovoz AI

Full-stack Uzbek TTS synthesis and correction platform built with React 19, Vite, Express, Tailwind CSS and Google Gemini.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Deploy to Render

1. Push this repository to GitHub.
2. Create a new Render Web Service and connect the repository.
3. Use the following values:
   - Build Command: `npm install && npm run build`
   - Start Command: `npm run start`
4. Add the `GEMINI_API_KEY` environment variable in Render.

The included `render.yaml` file can also be used for one-click setup.
