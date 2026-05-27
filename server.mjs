import express from 'express';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TARGET_URL =
  'https://jack79bp.mp7786j2ncsusov57general.ru/fr/football.html';

// ===== Optional proxy (set these in Railway → Variables if the target keeps blocking) =====
// PROXY_SERVER   = http://host:port  (or socks5://host:port)
// PROXY_USERNAME = ...
// PROXY_PASSWORD = ...
const PROXY = process.env.PROXY_SERVER
  ? {
      server: process.env.PROXY_SERVER,
      username: process.env.PROXY_USERNAME || undefined,
      password: process.env.PROXY_PASSWORD || undefined,
    }
  : undefined;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

let browserPromise = null;
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        proxy: PROXY,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--lang=fr-FR',
        ],
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

// === Build a believable browser context (defeats most simple anti-bot checks) ===
async function newStealthContext(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    extraHTTPHeaders: {
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      'Sec-Ch-Ua':
        '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Referer': 'https://www.google.com/',
    },
  });

  // Hide automation flags
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['fr-FR', 'fr', 'en'],
    });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    window.chrome = { runtime: {} };
  });

  return ctx;
}

// In-Memory Cache
let cachedMatches = [];
let cachedDetails = new Map();
let isScraping = false;
let lastScrapedTime = null;
let lastError = null;

async function scrapeMatches() {
  const browser = await getBrowser();
  const ctx = await newStealthContext(browser);

  await ctx.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (type === 'media' || type === 'font' || type === 'image') {
      return route.abort();
    }
    route.continue();
  });

  const page = await ctx.newPage();

  try {
    console.log('[Scrape] Loading main matches page...');
    const response = await page.goto(TARGET_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });

    const status = response ? response.status() : 0;
    console.log(`[Scrape] HTTP status from target: ${status}`);
    if (status >= 400) {
      const bodyPreview = (await page.content()).slice(0, 500);
      throw new Error(
        `Target returned ${status}. Body preview: ${bodyPreview.replace(/\s+/g, ' ')}`
      );
    }

    await page
      .waitForSelector('a[href*="-vs-"]', { timeout: 15000 })
      .catch(() => {});

    const matches = await page.evaluate(() => {
      const baseOrigin = location.origin;
      const results = [];
      const nuxtList = window.__NUXT__?.state?.data?.home?.list || [];
      const anchors = document.querySelectorAll('a[href*="-vs-"]');

      anchors.forEach((a) => {
        try {
          const href = a.getAttribute('href') || '';
          if (!href.includes('-vs-')) return;
          const fullHref = href.startsWith('http') ? href : baseOrigin + href;
          const matchIdMatch = href.match(/-(\d+)\/[^\/]+$/);
          const matchId = matchIdMatch ? parseInt(matchIdMatch[1]) : null;

          let item = null;
          if (matchId) item = nuxtList.find((x) => x.matchId === matchId);
          if (!item) {
            const teamLink = href
              .substring(href.lastIndexOf('/') + 1)
              .replace(/\.html$/, '');
            item = nuxtList.find(
              (x) =>
                x.matchExtra?.teamLink === teamLink ||
                href.includes(x.matchExtra?.teamLink)
            );
          }

          const teamNameEls = a.querySelectorAll('.IfFvJv');
          if (teamNameEls.length < 2 && !item) return;

          const homeName =
            item?.home?.name || teamNameEls[0]?.innerText?.trim() || '';
          const awayName =
            item?.away?.name || teamNameEls[1]?.innerText?.trim() || '';
          const homeLogo =
            item?.home?.logo ||
            'https://statics1.tcrok62jdmd.cfd/img/sp/icon_team_def@sp.svg';
          const awayLogo =
            item?.away?.logo ||
            'https://statics1.tcrok62jdmd.cfd/img/sp/icon_team_def@sp.svg';

          let homeScore = item?.homeScore !== undefined ? item.homeScore : null;
          let awayScore = item?.awayScore !== undefined ? item.awayScore : null;
          if (homeScore === null || awayScore === null) {
            const scoreEls = a.querySelectorAll('.u0r4Yw');
            if (scoreEls.length >= 2) {
              homeScore = parseInt(scoreEls[0].innerText) || 0;
              awayScore = parseInt(scoreEls[1].innerText) || 0;
            }
          }

          const liveIcon =
            a.querySelector('img[src*="live"]') ||
            a.innerHTML.includes('live') ||
            (item && item.status !== 10000 && item.status !== 0);

          let minute = null;
          if (item && item.status !== 10000 && item.status !== 0) {
            const elapsed =
              Date.now() - (item.matchExtra?.firstStartDate || Date.now());
            const mins = Math.floor(elapsed / 60000);
            minute = mins > 0 && mins < 120 ? String(mins) : null;
          }

          results.push({
            id: fullHref,
            url: fullHref,
            home: { name: homeName, logo: homeLogo },
            away: { name: awayName, logo: awayLogo },
            score: { home: homeScore, away: awayScore },
            isLive: !!liveIcon,
            minute,
            time: item?.matchDate
              ? new Date(item.matchDate).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '',
            league: item?.league?.name || '',
            leagueLogo: item?.league?.logo || '',
            country: item?.league?.country?.name || '',
          });
        } catch (e) {}
      });

      return results;
    });

    console.log(`[Scrape] Got ${matches.length} matches.`);
    return matches;
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function scrapeMatchDetails(url) {
  const browser = await getBrowser();
  const ctx = await newStealthContext(browser);

  await ctx.route('**/*', (route) => {
    const type = route.request().resourceType();
    const reqUrl = route.request().url();
    if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
      return route.abort();
    }
    if (
      reqUrl.includes('analytics') ||
      reqUrl.includes('google-analytics') ||
      reqUrl.includes('googletagmanager') ||
      reqUrl.includes('doubleclick') ||
      reqUrl.includes('facebook') ||
      reqUrl.includes('ads') ||
      reqUrl.includes('pixel') ||
      reqUrl.includes('tracking')
    ) {
      return route.abort();
    }
    if (
      reqUrl.includes('player.html') ||
      reqUrl.includes('/player/') ||
      reqUrl.endsWith('.m3u8') ||
      reqUrl.includes('hls')
    ) {
      return route.abort();
    }
    route.continue();
  });

  const page = await ctx.newPage();

  try {
    console.log('[Detail] Loading =>', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page
      .waitForSelector(
        'iframe[src*="player.html"], #iframe-di, #video-iframe, .stat-row, .stat-grid, .timeline-grid',
        { timeout: 3000 }
      )
      .catch(() => {});

    const details = await page.evaluate(() => {
      const stats = [];
      const rows = document.querySelectorAll('.stat-row');
      if (rows.length > 0) {
        rows.forEach((r) => {
          const cells = Array.from(r.querySelectorAll('.stat-cell'));
          if (cells.length === 3) {
            stats.push(
              `${cells[1].innerText.trim()}: ${cells[0].innerText.trim()} - ${cells[2].innerText.trim()}`
            );
          }
        });
      } else {
        const grid = document.querySelector('.stat-grid');
        if (grid) {
          Array.from(grid.children).forEach((child) => {
            const lines = child.innerText
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean);
            if (lines.length >= 3) {
              const label = lines[0];
              const values = lines.slice(1);
              if (values.length === 2) stats.push(`${label}: ${values[0]} - ${values[1]}`);
              else if (values.length === 4)
                stats.push(
                  `${label}: ${values[0]}/${values[1]} - ${values[2]}/${values[3]}`
                );
              else stats.push(`${label}: ${values.join(' ')}`);
            }
          });
        }
      }

      const events = [];
      document.querySelectorAll('.timeline-grid').forEach((grid) => {
        const timeCol = grid.querySelector('.time-col');
        const time = timeCol ? timeCol.innerText.trim() : '';
        const detailCol = grid.querySelector('.detail-col');
        if (!detailCol) return;

        let type = '';
        const svgUse = detailCol.querySelector('svg use');
        const img = detailCol.querySelector('img');
        if (svgUse) {
          const href =
            svgUse.getAttribute('xlink:href') || svgUse.getAttribute('href') || '';
          if (href.toLowerCase().includes('yellow-card')) type = 'Carton Jaune';
          else if (href.toLowerCase().includes('red-card')) type = 'Carton Rouge';
          else if (href.toLowerCase().includes('substitution'))
            type = 'Remplacement';
        } else if (img) {
          const src = img.getAttribute('src') || '';
          if (src.toLowerCase().includes('event_begin')) type = 'Début/Action';
        }

        const textElements = Array.from(
          detailCol.querySelectorAll('p, span, div')
        );
        const textLines = textElements
          .map((el) => el.innerText.trim())
          .filter((t) => t && !t.includes('\n'));
        const uniqueTexts = [];
        textLines.forEach((t) => {
          if (!uniqueTexts.includes(t)) uniqueTexts.push(t);
        });
        let desc = uniqueTexts.join(' - ');
        if (type && desc.toLowerCase().startsWith(type.toLowerCase())) {
          desc = desc.substring(type.length).replace(/^[\s\-]+/, '');
        }
        events.push(
          `${time ? `[${time}] ` : ''}${type ? `(${type}) ` : ''}${desc}`
        );
      });

      const iframe = document.querySelector(
        'iframe[src*="player.html"], #iframe-di, #video-iframe'
      );
      const streamUrl = iframe ? iframe.getAttribute('src') : null;
      return { stats, events, streamUrl };
    });

    if (details.streamUrl && !details.streamUrl.startsWith('http')) {
      const parsedUrl = new URL(url);
      details.streamUrl = parsedUrl.origin + details.streamUrl;
    }
    return details;
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function runBackgroundWorker() {
  if (isScraping) return;
  isScraping = true;
  try {
    console.log('[Worker] Starting scrape...');
    const list = await scrapeMatches();
    lastError = null;
    if (list && list.length > 0) {
      cachedMatches = list;
      lastScrapedTime = Date.now();

      const liveMatches = list.filter((m) => m.isLive);
      const upcomingMatches = list.filter((m) => !m.isLive);
      const queue = [...liveMatches, ...upcomingMatches];

      console.log(
        `[Worker] Pre-scraping ${queue.length} matches (live: ${liveMatches.length})`
      );

      const concurrency = 3;
      const runWorker = async () => {
        while (queue.length > 0) {
          const match = queue.shift();
          if (!match) break;
          const existing = cachedDetails.get(match.url);
          const maxAge = match.isLive ? 60000 : 600000;
          if (!existing || Date.now() - existing.timestamp > maxAge) {
            try {
              const detail = await scrapeMatchDetails(match.url);
              cachedDetails.set(match.url, { detail, timestamp: Date.now() });
            } catch (err) {
              console.error(
                `[Worker] Detail failed (${match.home.name} vs ${match.away.name}): ${err.message}`
              );
            }
          }
        }
      };

      await Promise.all(Array.from({ length: concurrency }, runWorker));
      console.log('[Worker] Done.');
    }
  } catch (err) {
    lastError = String(err?.message || err);
    console.error('[Worker] FATAL:', lastError);
  } finally {
    isScraping = false;
  }
}

console.log('Boot — proxy:', PROXY ? PROXY.server : 'none');
runBackgroundWorker();
setInterval(runBackgroundWorker, 45000);

// Health endpoint that does NOT trigger the scraper (so Railway healthchecks don't kill the dyno)
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    cachedCount: cachedMatches.length,
    lastScraped: lastScrapedTime,
    lastError,
  });
});

app.get('/api/matches', async (req, res) => {
  try {
    if (cachedMatches.length === 0) {
      console.log('Cache empty — on-demand scrape');
      const list = await scrapeMatches();
      if (list && list.length > 0) {
        cachedMatches = list;
        lastScrapedTime = Date.now();
        lastError = null;
      }
    }
    res.json({
      ok: true,
      count: cachedMatches.length,
      matches: cachedMatches,
      lastScraped: lastScrapedTime,
      lastError,
    });
  } catch (err) {
    const msg = String(err?.message || err);
    console.error('[/api/matches]', msg);
    lastError = msg;
    res.status(500).json({ ok: false, error: msg });
  }
});

app.get('/api/match', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url)
      return res
        .status(400)
        .json({ ok: false, error: 'URL parameter is missing' });

    const matchObj = cachedMatches.find((m) => m.url === url);
    const isLive = matchObj ? matchObj.isLive : false;
    const cacheDuration = isLive ? 30000 : 600000;

    const cached = cachedDetails.get(url);
    if (cached && Date.now() - cached.timestamp < cacheDuration) {
      return res.json({ ok: true, detail: cached.detail, cached: true });
    }

    const detail = await scrapeMatchDetails(url);
    cachedDetails.set(url, { detail, timestamp: Date.now() });
    res.json({ ok: true, detail, cached: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Server on http://0.0.0.0:' + PORT);
});
