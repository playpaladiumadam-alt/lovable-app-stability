import express from 'express';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TARGET_URL =
  'https://jack79bp.mp7786j2ncsusov57general.ru/fr/football.html';

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
        ],
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }

  return browserPromise;
}

// In-Memory Cache variables
let cachedMatches = [];
let cachedDetails = new Map(); // url -> { detail, timestamp }
let isScraping = false;
let lastScrapedTime = null;

async function scrapeMatches() {
  const browser = await getBrowser();

  const ctx = await browser.newContext({
    viewport: {
      width: 1366,
      height: 900,
    },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  });

  await ctx.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (type === 'media' || type === 'font' || type === 'image') {
      return route.abort();
    }
    route.continue();
  });

  const page = await ctx.newPage();

  try {
    console.log('Background loading main matches page...');
    await page.goto(TARGET_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    });

    await page.waitForSelector('a[href*="-vs-"]', { timeout: 15000 }).catch(() => {});

    const matches = await page.evaluate(() => {
      const baseOrigin = location.origin;
      const results = [];
      const nuxtList = window.__NUXT__?.state?.data?.home?.list || [];
      const anchors = document.querySelectorAll('a[href*="-vs-"]');

      anchors.forEach((a) => {
        try {
          const href = a.getAttribute('href') || '';
          if (!href.includes('-vs-')) return;

          const fullHref = href.startsWith('http')
            ? href
            : baseOrigin + href;

          // Extract match ID from URL like: /football/league-name-ID/home-vs-away.html
          const matchIdMatch = href.match(/-(\d+)\/[^\/]+$/);
          const matchId = matchIdMatch ? parseInt(matchIdMatch[1]) : null;

          let item = null;
          if (matchId) {
            item = nuxtList.find(x => x.matchId === matchId);
          }
          if (!item) {
            const teamLink = href.substring(href.lastIndexOf('/') + 1).replace(/\.html$/, '');
            item = nuxtList.find(x => x.matchExtra?.teamLink === teamLink || href.includes(x.matchExtra?.teamLink));
          }

          const teamNameEls = a.querySelectorAll('.IfFvJv');
          if (teamNameEls.length < 2 && !item) return;

          const homeName = item?.home?.name || teamNameEls[0]?.innerText?.trim() || '';
          const awayName = item?.away?.name || teamNameEls[1]?.innerText?.trim() || '';

          const homeLogo = item?.home?.logo || 'https://statics1.tcrok62jdmd.cfd/img/sp/icon_team_def@sp.svg';
          const awayLogo = item?.away?.logo || 'https://statics1.tcrok62jdmd.cfd/img/sp/icon_team_def@sp.svg';

          let homeScore = item?.homeScore !== undefined ? item.homeScore : null;
          let awayScore = item?.awayScore !== undefined ? item.awayScore : null;

          if (homeScore === null || awayScore === null) {
            const scoreEls = a.querySelectorAll('.u0r4Yw');
            if (scoreEls.length >= 2) {
              homeScore = parseInt(scoreEls[0].innerText) || 0;
              awayScore = parseInt(scoreEls[1].innerText) || 0;
            }
          }

          // Check if live
          const liveIcon =
            a.querySelector('img[src*="live"]') ||
            a.innerHTML.includes('live') ||
            (item && item.status !== 10000 && item.status !== 0);

          let minute = null;
          if (item && item.status !== 10000 && item.status !== 0) {
            const elapsed = Date.now() - (item.matchExtra?.firstStartDate || Date.now());
            const mins = Math.floor(elapsed / 60000);
            minute = mins > 0 && mins < 120 ? String(mins) : null;
          }

          const league = item?.league?.name || '';
          const leagueLogo = item?.league?.logo || '';
          const country = item?.league?.country?.name || '';

          results.push({
            id: fullHref,
            url: fullHref,
            home: {
              name: homeName,
              logo: homeLogo,
            },
            away: {
              name: awayName,
              logo: awayLogo,
            },
            score: {
              home: homeScore,
              away: awayScore,
            },
            isLive: !!liveIcon,
            minute: minute,
            time: item?.matchDate ? new Date(item.matchDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '',
            league: league,
            leagueLogo: leagueLogo,
            country: country
          });
        } catch (e) {}
      });

      return results;
    });

    console.log(`Background scraped ${matches.length} matches.`);
    return matches;
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function scrapeMatchDetails(url) {
  const browser = await getBrowser();

  const ctx = await browser.newContext({
    viewport: {
      width: 1366,
      height: 900,
    },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  });

  // Block images, fonts, media, and stylesheets for lightning speed
  await ctx.route('**/*', (route) => {
    const type = route.request().resourceType();
    const reqUrl = route.request().url();
    
    // Abort media, fonts, stylesheets, images
    if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
      return route.abort();
    }
    
    // Block standard ads, tracking, analytic scripts
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
    
    // Block heavy player scripts and video loading itself. We only need the DOM node
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
    console.log('Loading match detail page =>', url);

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Wait specifically for key stream/stats selectors (reduced wait to 3s)
    await page.waitForSelector('iframe[src*="player.html"], #iframe-di, #video-iframe, .stat-row, .stat-grid, .timeline-grid', { timeout: 3000 }).catch(() => {});

    const details = await page.evaluate(() => {
      const stats = [];

      // Try to find stats
      const rows = document.querySelectorAll('.stat-row');
      if (rows.length > 0) {
        rows.forEach(r => {
          const cells = Array.from(r.querySelectorAll('.stat-cell'));
          if (cells.length === 3) {
            const home = cells[0].innerText.trim();
            const label = cells[1].innerText.trim();
            const away = cells[2].innerText.trim();
            stats.push(`${label}: ${home} - ${away}`);
          }
        });
      } else {
        const grid = document.querySelector('.stat-grid');
        if (grid) {
          const children = Array.from(grid.children);
          children.forEach(child => {
            const lines = child.innerText.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length >= 3) {
              const label = lines[0];
              const values = lines.slice(1);
              if (values.length === 2) {
                stats.push(`${label}: ${values[0]} - ${values[1]}`);
              } else if (values.length === 4) {
                stats.push(`${label}: ${values[0]}/${values[1]} - ${values[2]}/${values[3]}`);
              } else {
                stats.push(`${label}: ${values.join(' ')}`);
              }
            }
          });
        }
      }

      // Try to find events
      const events = [];
      const timelineGrids = document.querySelectorAll('.timeline-grid');
      timelineGrids.forEach(grid => {
        const timeCol = grid.querySelector('.time-col');
        const time = timeCol ? timeCol.innerText.trim() : '';

        const detailCol = grid.querySelector('.detail-col');
        if (!detailCol) return;

        let type = '';
        const svgUse = detailCol.querySelector('svg use');
        const img = detailCol.querySelector('img');

        if (svgUse) {
          const href = svgUse.getAttribute('xlink:href') || svgUse.getAttribute('href') || '';
          if (href.toLowerCase().includes('yellow-card')) type = 'Carton Jaune';
          else if (href.toLowerCase().includes('red-card')) type = 'Carton Rouge';
          else if (href.toLowerCase().includes('substitution')) type = 'Remplacement';
        } else if (img) {
          const src = img.getAttribute('src') || '';
          if (src.toLowerCase().includes('event_begin')) type = 'Début/Action';
        }

        const textElements = Array.from(detailCol.querySelectorAll('p, span, div'));
        const textLines = textElements
          .map(el => el.innerText.trim())
          .filter(t => t && !t.includes('\n'));

        const uniqueTexts = [];
        textLines.forEach(t => {
          if (!uniqueTexts.includes(t)) uniqueTexts.push(t);
        });

        let desc = uniqueTexts.join(' - ');
        if (type && desc.toLowerCase().startsWith(type.toLowerCase())) {
          desc = desc.substring(type.length).replace(/^[\s\-]+/, '');
        }

        const eventText = `${time ? `[${time}] ` : ''}${type ? `(${type}) ` : ''}${desc}`;
        events.push(eventText);
      });

      const iframe = document.querySelector('iframe[src*="player.html"], #iframe-di, #video-iframe');
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

// Background Worker Loop
async function runBackgroundWorker() {
  if (isScraping) return;
  isScraping = true;
  try {
    console.log('[Worker] Starting matches list scrape...');
    const list = await scrapeMatches();
    if (list && list.length > 0) {
      cachedMatches = list;
      lastScrapedTime = Date.now();

      // Pre-scrape details for ALL matches, prioritizing live matches
      const liveMatches = list.filter(m => m.isLive);
      const upcomingMatches = list.filter(m => !m.isLive);
      const queue = [...liveMatches, ...upcomingMatches];

      console.log(`[Worker] Pre-scraping stream details for ${queue.length} matches (Live: ${liveMatches.length}) in parallel...`);

      // Concurrency limited worker pool (3 concurrent Playwright contexts)
      const concurrency = 3;
      
      const runWorker = async () => {
        while (queue.length > 0) {
          const match = queue.shift();
          if (!match) break;

          const existing = cachedDetails.get(match.url);
          // Refresh details: live matches every 60s, upcoming every 10 mins
          const maxAge = match.isLive ? 60000 : 600000;
          if (!existing || (Date.now() - existing.timestamp > maxAge)) {
            try {
              const detail = await scrapeMatchDetails(match.url);
              cachedDetails.set(match.url, { detail, timestamp: Date.now() });
              console.log(`[Worker] Pre-scraped & cached stream: ${match.home.name} vs ${match.away.name} (Live: ${match.isLive})`);
            } catch (err) {
              console.error(`[Worker] Failed to pre-scrape ${match.home.name} vs ${match.away.name}:`, err.message);
            }
          }
        }
      };

      // Launch parallel workers
      const workers = Array.from({ length: concurrency }, runWorker);
      await Promise.all(workers);
      console.log('[Worker] Parallel pre-scraping phase complete.');
    }
  } catch (err) {
    console.error('Error in background scraper worker:', err);
  } finally {
    isScraping = false;
  }
}

// Start background task immediately and run every 45 seconds
console.log('Starting background matches scraper worker...');
runBackgroundWorker();
setInterval(runBackgroundWorker, 45000);

app.get('/api/matches', async (req, res) => {
  try {
    // If cache is empty (server just started), fetch on-demand
    if (cachedMatches.length === 0) {
      console.log('Cache empty, performing initial on-demand matches scrape...');
      const list = await scrapeMatches();
      if (list && list.length > 0) {
        cachedMatches = list;
        lastScrapedTime = Date.now();
      }
    }

    res.json({
      ok: true,
      count: cachedMatches.length,
      matches: cachedMatches,
      lastScraped: lastScrapedTime,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      ok: false,
      error: String(err),
    });
  }
});

app.get('/api/match', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ ok: false, error: 'URL parameter is missing' });
    }

    // Check if live to determine cache duration (30s for live, 10m for non-live)
    const matchObj = cachedMatches.find(m => m.url === url);
    const isLive = matchObj ? matchObj.isLive : false;
    const cacheDuration = isLive ? 30000 : 600000;

    // Check cache first
    const cached = cachedDetails.get(url);
    if (cached && (Date.now() - cached.timestamp < cacheDuration)) {
      console.log(`Serving match details from cache (${isLive ? 'LIVE' : 'UPCOMING/PAST'}):`, url);
      return res.json({
        ok: true,
        detail: cached.detail,
        cached: true,
      });
    }

    // Otherwise, fetch on-demand
    console.log('Cache miss or expired, scraping match details on-demand:', url);
    const detail = await scrapeMatchDetails(url);
    cachedDetails.set(url, { detail, timestamp: Date.now() });

    res.json({
      ok: true,
      detail,
      cached: false,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      ok: false,
      error: String(err),
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log('Server on http://0.0.0.0:' + PORT);
});