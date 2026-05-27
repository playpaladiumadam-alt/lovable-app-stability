# Déploiement — CCCV LiveFoot

Le projet est prêt à être hébergé. Aucune logique métier n'a été modifiée. Les seuls changements :

- `package.json` : nom corrigé (`"/dev-server"` → `"cccv-livefoot"`, invalide pour npm)
- Ajout `Dockerfile` (image officielle Playwright avec Chromium pré-installé)
- Ajout `render.yaml` (déploiement Render 1-clic)
- Ajout `.dockerignore`

Le scraping Playwright, le worker en arrière-plan, le cache en mémoire, les routes `/api/matches` et `/api/match`, et tout le frontend (`public/`) sont **strictement identiques**.

---

## Option 1 — Render (recommandé, gratuit)

1. Pousse ce repo sur GitHub (ou utilise celui existant `playpaladiumadam-alt/cccvcomment`)
2. Va sur https://render.com → **New +** → **Blueprint**
3. Connecte ton repo → Render détecte automatiquement `render.yaml`
4. Clique **Apply** → l'app build et démarre (~5 min la première fois car Chromium)
5. URL publique fournie : `https://cccv-livefoot.onrender.com`

⚠️ **Free tier Render** : l'app s'endort après 15 min d'inactivité. Premier hit après réveil = ~30s (cold start + lancement Chromium). Pour éviter ça, passe au plan **Starter $7/mois** ou ping ton app toutes les 10 min via un cron externe (UptimeRobot gratuit).

---

## Option 2 — Railway

1. https://railway.app → **New Project** → **Deploy from GitHub**
2. Sélectionne le repo
3. Railway détecte le Dockerfile automatiquement
4. Ajoute une variable `PORT=3000`
5. **Settings → Generate Domain**

---

## Option 3 — VPS (Hetzner / OVH, ~4€/mois, le plus stable pour scraping continu)

```bash
# Sur le serveur (Ubuntu 22.04+)
git clone https://github.com/playpaladiumadam-alt/cccvcomment.git
cd cccvcomment
docker build -t cccv .
docker run -d --restart unless-stopped -p 80:3000 --name cccv cccv
```

---

## Test local

```bash
npm install
npx playwright install chromium --with-deps
node server.mjs
# → http://localhost:3000
```
