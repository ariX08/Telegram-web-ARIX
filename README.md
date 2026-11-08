## KuchuGRAM

Custom Telegram Web client based on Telegram Web K (tweb / Webogram), GPL v3.

### Developing

```bash
pnpm install
pnpm start
```

Open http://localhost:8080/

### Production build

```bash
pnpm run build:vercel   # Vite build → dist/ (used by Vercel)
# or full pipeline:
pnpm build              # tests + typecheck + vite build + checks
```

### Deploy on Vercel

1. Import this GitHub repo in [Vercel](https://vercel.com/new).
2. Framework Preset: **Other** (vercel.json is already configured).
3. Build Command: `pnpm run build:vercel` (set by vercel.json).
4. Output Directory: `dist`.
5. Install Command: `pnpm install`.
6. Add environment variables (optional overrides; defaults come from `.env`):
   - `VITE_API_ID` — from https://my.telegram.org
   - `VITE_API_HASH` — from https://my.telegram.org

Recommended: create your own API credentials at my.telegram.org and set them in Vercel project settings.

### Licensing

GPL v3. See [LICENSE](/LICENSE).
