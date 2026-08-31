# Ruwan AI (100% Free Setup)

Ek simple, mindful, Hindi/English/Hinglish chat website — **Google Gemini ke FREE API** se powered,
aur **Render.com ke free hosting** par public kiya ja sakta hai. Poora setup free hai — koi credit
card ya paid subscription nahi chahiye (free tier ki daily/rate limits hoti hain, jo normal
personal/small-scale use ke liye kaafi hain).

## Ismein kya hai
- `public/index.html`, `style.css`, `script.js` — website ka frontend (jo user dekhta hai)
- `server.js` — backend jo aapki AI API key ko safe rakhta hai aur Gemini AI ko call karta hai
- `package.json` — zaroori dependencies ki list

**Zaroori:** API key hamesha backend (`server.js`/environment variable) mein hi rehni chahiye. Isse
kabhi frontend code (`script.js`/`index.html`) mein mat daalna — warna koi bhi website kholke aapki
key chura sakta hai.

---

## Step 1 — FREE Gemini API Key lo (2 minute mein)

1. https://aistudio.google.com/apikey par jaao.
2. Apne Google account se sign in karo.
3. "Create API Key" par click karo.
4. Jo key milegi (jaise `AIzaSy...`), use copy kar lo — ye bilkul FREE hai, koi card nahi maanga jayega.

## Step 2 — Local par test karo (optional par recommended)

Apne computer par [Node.js](https://nodejs.org) install karo (version 18+), phir:

```bash
cd ruwan-ai
npm install
cp .env.example .env
```

`.env` file kholo aur apni free key daal do:
```
GEMINI_API_KEY=AIzaSy_yahan_apni_asli_key_daalo
```

Phir server chalao:
```bash
npm start
```

Browser mein kholo: `http://localhost:3000`

## Step 3 — Code ko GitHub par daalo

(Agar aapne already GitHub repo bana liya hai, to bas is updated code se files replace/upload kar do.)

1. https://github.com par free account banao.
2. "New repository" → Public → naam do (jaise `ruwan-ai`) → Create.
3. "Add file" → "Upload files" → is project ki saari files/folders (public folder sahit) upload karo.
   **`.env` file kabhi upload mat karna** — sirf `.env.example` jaana chahiye.

## Step 4 — Website ko PUBLIC/LIVE karo (Render.com — FREE)

1. https://render.com par jaake GitHub se sign in karo.
2. "New +" → "Web Service" → apna `ruwan-ai` GitHub repo select karo.
3. Settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: **Free**
4. "Environment" section mein jaake naya variable add karo:
   - Key: `GEMINI_API_KEY`
   - Value: apni free Gemini key
5. "Create Web Service" dabao — kuch minute mein deploy ho jayega.
6. Aapko ek public URL milega jaise: `https://ruwan-ai.onrender.com`

Ye URL kisi ke saath bhi share kar sakte ho — yahi aapki live, public, free website hai.

**Note:** Render ka free tier thodi der inactive rehne ke baad "sleep" ho jaata hai — pehla request
aane par usse wake hone mein 20-30 second lag sakte hain. Ye normal hai, free plan ki limitation hai.

---

## Customize karna

- **Naam badalna:** `server.js` mein `BRAND_NAME` variable change karo.
- **Persona/rules badalna:** `server.js` ke andar `BASE_SYSTEM_PROMPT` string edit karo.
- **Design badalna:** `public/style.css` mein colors/fonts change kar sakte ho.
- **Language/Mode dropdown:** Header mein already Language (Auto/English/Hindi) aur Mode
  (General/Professional/College Student) selectors hain — user khud choose kar sakta hai.

## Free tier limits (jaanna zaroori)

- Gemini free tier: kaafi generous hai roz ke normal use ke liye, lekin bahut zyada messages/minute
  bhejne par temporary rate-limit error aa sakta hai — user thodi der baad try kare.
- Render free tier: website free hai lekin inactivity ke baad "sleep" hoti hai (upar dekho).
- Agar future mein traffic zyada badh jaaye, tab paid tier consider kar sakte ho — abhi ke liye ye
  setup bilkul free hai.

## Safety note

Is system prompt mein jaan-boojh kar ek cheez nahi rakhi gayi: koi "18+ confirm karo aur reason
batao to restricted content unlock ho jayega" wala mechanism. Aisa self-reported age-check asal mein
kaam nahi karta aur AI safety ko weak karta hai. Agar future mein koi is code ko modify kare, please
is hisse ko wapas add na karein.
