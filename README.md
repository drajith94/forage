# Forage — setup walkthrough

This is the accurate version of your restaurant finder. It pulls **real Google ratings, review counts, prices and live open/closed status**, and installs on your iPhone like a normal app.

You'll do three things, once each:

1. **Get a Google Places API key** (free tier is generous)
2. **Deploy the app to Vercel** (free, no terminal needed)
3. **Add it to your iPhone home screen**

Total time: about 15 minutes. No coding required.

---

## Why it's built this way (30-second version)

Your Google key is like a credit card — if it's visible in the app, anyone can copy it and run up charges. So the app has two parts:

- **`/api/search.js`** — a tiny backend that keeps your key *secret* and is the only thing that talks to Google.
- **`index.html`** — the app your phone loads. It calls your backend, never Google directly.

Vercel runs both for free. You never touch a server.

---

## Step 1 — Get your Google Places API key

1. Go to **https://console.cloud.google.com/** and sign in.
2. Top bar → **Select a project** → **New Project** → name it `forage` → **Create**.
3. In the search bar at top, type **Places API (New)** → open it → click **Enable**.
4. Left menu → **APIs & Services → Credentials**.
5. **+ Create credentials → API key.** Copy the key that appears (you'll paste it in Step 2).
6. **Enable billing** when prompted. Google requires a card on file, but gives a recurring **free monthly credit** that covers thousands of searches — personal use almost never costs anything. *(You can set a budget alert under Billing → Budgets to be safe.)*
7. **Restrict the key** (recommended) — click the key → under **API restrictions**, choose **Restrict key** → tick **Places API (New)** → **Save**. This means even if leaked, the key only works for Places.

Keep that key handy for Step 2.

---

## Step 2 — Deploy to Vercel (the easy, no-terminal path)

### 2a. Put the files on GitHub
1. Make a free account at **https://github.com**.
2. Click **+ → New repository** → name it `forage` → **Create repository**.
3. On the new repo page click **uploading an existing file**.
4. Drag in **everything inside the `forage-app` folder** — that is: `index.html`, `manifest.json`, `sw.js`, the four `.png` icons, **and the `api` folder** (drag the whole `api` folder so `api/search.js` keeps its place).
5. Click **Commit changes**.

### 2b. Connect Vercel
1. Make a free account at **https://vercel.com** — choose **Continue with GitHub**.
2. Click **Add New… → Project**, find your `forage` repo, click **Import**.
3. **Before deploying**, expand **Environment Variables** and add:
   - **Name:** `GOOGLE_PLACES_KEY`
   - **Value:** *(paste your Google key from Step 1)*
   - Click **Add**.
4. Click **Deploy**. Wait ~30 seconds.
5. You'll get a live URL like **`https://forage-xxxx.vercel.app`**. That's your app. Open it in any browser to test.

> If you ever change the key, update it under **Vercel → your project → Settings → Environment Variables**, then **Redeploy**.

---

## Step 3 — Put it on your iPhone

1. Open **Safari** on your iPhone (it must be Safari, not Chrome, for install to work).
2. Go to your Vercel URL (`https://forage-xxxx.vercel.app`).
3. Tap the **Share** button (the square with the up-arrow).
4. Scroll down → **Add to Home Screen** → **Add**.
5. You now have a **Forage** icon on your home screen. Tapping it opens full-screen, no Safari bars — just like a native app.

The first time you tap **Use my location**, iOS asks permission — tap **Allow**.

---

## Using it

- Tap **Use my location** (or type a neighborhood).
- Pick a **meal**, a **cuisine**, and a **price range**.
- **More options** → distance radius, dietary filters, open-now, ranking, and the **Learn from my favorites** toggle.
- Tap **Find my top 5**, or hit **🎲 Surprise me** for a random pick.

Results come with three views (tabs at the top):

- **List** — ranked cards with real ratings, review counts, a review snippet, **today's hours**, distance, live open/closed, estimated **walk/drive time**, plus Directions, Call, and Site.
- **Map** — all 5 spots as numbered pins on an interactive map, with your location marked. Tap a pin for details + directions.
- **♥ Saved** — your favorites, kept on your device.

### The five new features, briefly

1. **Map view** — uses free OpenStreetMap tiles (no extra key), pins your top 5 + your location, fits them all in view.
2. **Timings** — each card shows today's opening hours (live from Google) and an estimated walk/drive time from your location.
3. **Save favorites** — tap the ♡ on any card. Saved spots live in the **♥ Saved** tab, stored privately on your phone (nothing leaves your device).
4. **🎲 Surprise me** — picks a cuisine + meal for you and searches instantly. Once you have favorites, it leans toward what you like (with the occasional wildcard).
5. **Learn from my favorites** — after you save 2+ spots, Forage builds a quiet taste profile (your most-saved cuisines and usual price) and gently re-ranks "Best match" results toward it. A note tells you what it learned. Toggle it off any time under More options.

> **About travel times:** these are estimates from straight-line distance (walking ~3 mph, driving ~22 mph with a detour factor), not live traffic. If you want exact, traffic-aware times, the upgrade is Google's **Routes API** — ask and I'll wire it in as a second backend route.

> **About favorites data:** it's saved with your browser's local storage on that one device/app. It isn't synced across devices and isn't sent anywhere. Clearing Safari data or removing the home-screen app clears it. (Cross-device sync would need a small database — also an easy add later.)

---

## Test it locally first (optional, needs terminal)

If you want to try it on your computer before deploying:

```bash
npm i -g vercel          # one-time
cd forage-app
echo "GOOGLE_PLACES_KEY=your_key_here" > .env
vercel dev               # opens http://localhost:3000
```

---

## Troubleshooting

- **"string did not match the expected pattern"** → you're opening the raw `index.html` file (or a preview) instead of your deployed `https://…vercel.app` URL. The search backend only exists on the deployed site. Open the Vercel URL. (The app now shows a plain-English message when this happens.)
- **"Backend not found (404)"** → the `api` folder wasn't uploaded, or it got flattened. In your GitHub repo, confirm the file lives at exactly `api/search.js`, then redeploy.
- **"Server is missing GOOGLE_PLACES_KEY"** → you didn't add the environment variable in Vercel, or added it after deploying and need to **Redeploy**.
- **"Google Places request failed" / REQUEST_DENIED** → Places API (New) isn't enabled, billing isn't on, or the key restriction is blocking it.
- **"Couldn't reach the server"** → connection issue, or the deploy is still building (wait a minute).
- **No results** → widen the distance slider or add more price levels.

---

## Protecting your API key

Your key is already in the safest spot — **server-side in Vercel**, never in the phone-facing code. These steps harden it further and make it impossible to get a surprise bill.

### 1. Never put the key in the front-end
The key lives only as the `GOOGLE_PLACES_KEY` environment variable in Vercel, read by `api/search.js`. Do **not** paste it into `index.html`, and never commit a real `.env` file (the included `.gitignore` already blocks it). The browser only ever talks to your own `/api/search`, so the key is never sent to anyone's phone.

### 2. Restrict the key to one API
Google Cloud → **APIs & Services → Credentials** → click your key → **API restrictions** → **Restrict key** → tick **Places API (New)** only → **Save**. Now even if the key leaked, it can only call Places — not Maps, Geocoding, billing, etc.

> Note on *Application* restrictions: "HTTP referrer" restrictions don't help here because the call comes from Vercel's servers, not a browser. "IP address" restriction is the technically correct fit, but Vercel's outbound IPs rotate, so it's impractical for a hobby deploy. The API restriction above plus the quota cap below give you strong protection without the IP headache.

### 3. Cap the daily quota → hard $0 guarantee
This is the one that makes overspending *impossible*.
Google Cloud → **APIs & Services** → select **Places API (New)** → **Quotas & System Limits** → find the requests-per-day limit → click the pencil → set it to something like **100/day** → **Save**.
Once you hit the cap, requests simply stop returning until the next day instead of billing. For personal use, 100/day is plenty, and it guarantees you can never be charged.

### 4. Set a budget alert (belt and suspenders)
Google Cloud → **Billing → Budgets & alerts → Create budget** → set the amount to **$1** → finish. You'll get an email the instant anything bills — which, under the free cap, it won't.

### 5. If the key is ever exposed, rotate it
If you accidentally commit it or paste it somewhere public: Credentials → your key → **Regenerate key** (or delete and make a new one), then update `GOOGLE_PLACES_KEY` in Vercel → **Settings → Environment Variables** and **Redeploy**. The old key stops working immediately.

### Quick checklist
- [ ] Key only in Vercel env var, never in `index.html`
- [ ] Real `.env` never committed to GitHub
- [ ] Key restricted to **Places API (New)**
- [ ] Daily quota capped (e.g. 100/day)
- [ ] $1 budget alert set

---

## What it costs

For personal use: effectively **$0**. Google's free monthly credit covers far more searches than one person makes. Set a budget alert if you want zero surprises. Vercel's free tier is plenty for an app like this.

## Want to go further?

I can add: a map view of the 5 spots, save-favorites, a "surprise me" button, photos for each place, or walking/driving time estimates. Just ask.
