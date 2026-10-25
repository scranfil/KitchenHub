# Kitchen Hub: Requirements (v1)

*Owner: Scott Cranfill (GitHub `scranfil`). Written Oct 21, 2026. Android 14 device plan added Oct 24, 2026 (§14). Builds on `kitchen-hub-guide-2026-10-21.md`.*

## How to use this with Cursor
1. Create `C:\Dev\KitchenHub` and save this file there as `REQUIREMENTS.md`.
2. Open the folder in Cursor and start an Agent chat.
3. Say: **"Read REQUIREMENTS.md and implement milestone M1; ask before deviating."**
4. When M1 passes its acceptance criteria (§11), repeat with M2, M3 and M4.

Agent rules: requirement IDs (FR-x, NFR-x) are binding. If a requirement can't be met as written, stop and ask. Don't substitute a framework, a build step or another API. Reference IDs in commit messages, for example `FR-2: NWS hourly forecast`.

---

## 1. Overview and goals
A glanceable, always-on kitchen display running full screen on a Lenovo Tab M10 FHD Plus. The target OS is Android 14 (§14). It shows the time, weather, alerts, headlines and the next few days of calendar.

**Goals**
- G1. Readable from 6–10 ft at a glance: time, current temp, today's high/low, rain chance, active alerts.
- G2. Runs unattended for weeks. Recovers by itself from Wi-Fi drops, API failures and memory growth.
- G3. Zero ongoing cost. Free APIs, GitHub Pages, Cloudflare Workers free tier.
- G4. Easy to change. Edit on the PC, `git push`, and the tablet picks it up on its next reload.

**Non-goals (v1)**
- No user accounts, logins or server-side database.
- No native Android app or APK. Fully Kiosk Browser is the container. (The Lounge Fire TV app is a separate project. Don't share code with it.)
- No touch-driven workflows beyond optional tap-to-refresh. It is a display, not an app.
- No Home Assistant or smart-home control.

## 2. Target device and environment constraints
| Item | Value |
|---|---|
| Device | Lenovo Tab M10 FHD Plus, 2nd Gen **TB-X606F**, confirmed over USB on Oct 24, 2026. Chipset MediaTek Helio P22. |
| Serial | **HA1AXHMJ** (`ro.serialno`). Lenovo Software Fix matches firmware with this. |
| PSN | **8SSP69A6P84YHA6011T00V8** (`ro.boot.psn`). Use this only if the short serial does not match a package. |
| Screen | **1920×1200** native, landscape, 16:10 |
| OS | Stock is Android 9 or 10. Target is **Android 14** via unofficial LineageOS 21 (§14). |
| Browser | Fully Kiosk Browser, using the system Android WebView (Chrome engine) |
| Power | Plugged in 24/7. On stock, Lenovo **Battery Protection Mode** on. After §14, use the charge-limit method recorded in §14.8. |
| Location | Near 8105 N. Halyard Way, Indianapolis IN 46236 (NE Indy). Lat **39.8947**, Lon **-85.9786** |
| Time zone | `America/New_York` (NWS reports `America/Indiana/Indianapolis`, which is the same rules) |
| Network | Home Wi-Fi. Expect occasional drops. |

**Code constraints (C-)**
- C-1. Vanilla HTML/CSS/JS. **No frameworks, no bundler, no npm runtime dependencies, no build step.** The repo as committed is the deployed site.
- C-2. JavaScript at **ES2017** level: `async/await`, `fetch`, template literals and arrow functions are OK. **Forbidden:** top-level `await`, optional chaining `?.`, nullish `??`, class fields, `Array.prototype.at`, `structuredClone`, ES modules via `<script type="module">` with import maps. Use classic `<script>` tags in a fixed order.
- C-3. CSS: grid, flexbox, custom properties, `clamp()`, `vw/vh` OK. **Forbidden:** `:has()`, container queries, `@layer`, nesting, `dvh/svh`, `aspect-ratio` (use padding fallback if needed).
- C-4. Until §14.8 records a measured WebView, the baseline is WebView **Chrome 95**. Everything must work there. Android 9/10 can update WebView via Play Store, but don't rely on that. After §14.8 is filled in, replace this sentence with that recorded version. Newer syntax stays forbidden until then.
- C-5. Resolutions: **1920×1200 primary**. It must also lay out correctly at **1280×800** and **1024×600** with no scrollbars and no clipped text.
- C-6. Viewing distance 6–10 ft. Clock ≥ 12% of viewport height. Current temp ≥ 9vh. Body text ≥ 2.6vh. No text below 2vh. Contrast ≥ 7:1 for primary data.
- C-7. No external fonts, icon CDNs or analytics. Icons are inline SVG or emoji. Use the system font stack.

## 3. Functional requirements
**FR-1 Clock and date.** Large `h:mm` 12-hour clock (no seconds by default, configurable), AM/PM small, and the full date ("Wednesday, October 21"). Time comes from the device clock formatted in `config.timezone` via `Intl.DateTimeFormat`. It updates on the minute boundary, not on a drifting `setInterval(60000)`.

**FR-2 Current weather.** Shows temperature (°F), condition text and icon, feels-like, wind (direction and mph) and humidity.
- Source: the NWS latest observation from station `KMQJ` (first in the gridpoint station list), plus the first period of `/forecast/hourly` for condition text.
- If the observation is older than 90 min or its temperature is null, use the current hour of `/forecast/hourly`.

**FR-3 Hourly forecast.** The next 12 hours from NWS `/forecast/hourly`: hour, icon, temp and precip %. It's a compact strip or a simple inline-SVG line chart.

**FR-4 5-day forecast.** Five day cards (today plus 4), each with day name, icon, high/low and precip %. They come from NWS `/forecast` periods, pairing each day period with the following night period. Today's card shows "Tonight" low if the day period has passed.

**FR-5 Open-Meteo fallback.** If any NWS call fails (network error, non-2xx or malformed JSON) twice in a row, fetch the equivalent data from Open-Meteo and render it. A small "via Open-Meteo" tag marks this. Return to NWS on its next successful call. WMO weather codes map to the same icon set as NWS.

**FR-6 NWS alerts banner.** Polls active alerts for the point.
- With no alerts, the banner is hidden and takes no space.
- With one or more alerts, a full-width banner shows `event` and `headline` with the expiry time. Colors follow severity: Extreme/Severe red, Moderate orange, Minor/Unknown yellow.
- Multiple alerts rotate every 10 s. Warnings sort above Watches, and Watches above Advisories.

**FR-7 Sunrise/sunset.** Today's sunrise and sunset times from Open-Meteo `daily=sunrise,sunset`. Open-Meteo is called once daily even when NWS is healthy. Show them near the weather.

**FR-8 News headlines.** 6–10 headlines from the Worker `/news` endpoint (§6). One headline is shown at a time, large, with source name and age ("WTHR · 25m"). It rotates every `config.news.rotateSeconds` (default 20). Titles only. No images, summaries or links.
- Feeds: NPR national, `https://feeds.npr.org/1001/rss.xml`. WTHR local, `https://www.wthr.com/feeds/syndication/rss/news`. Optional Google News "Indianapolis", `https://news.google.com/rss/search?q=Indianapolis`, as a local backup.
- IndyStar's public RSS returned HTTP 402 on Oct 21, 2026, so don't use it.

**FR-9 Calendar.** Today plus the next 3 days from the Worker `/calendar` endpoint.
- Group events by day, with headings "Today", "Tomorrow" and weekday names.
- All-day events come first, then timed events sorted by start, as `h:mm` plus title.
- Days with no events show "Nothing scheduled". Show at most `config.calendar.maxEvents` (default 12) and end with "+N more".
- Must handle recurring events (RRULE, DAILY/WEEKLY/MONTHLY with COUNT/UNTIL/BYDAY and EXDATE), all-day `VALUE=DATE` and TZID times. Recurrence is expanded **in the Worker**.

**FR-10 Night mode.** From `config.night.start` (default 22:00) to `config.night.end` (default 06:00), switch to a dark, dimmed theme.
- Black background and dim-gray text. The clock and weather stay. News rotation pauses and the calendar shrinks to today.
- Mode `"dim"` applies CSS dimming. Mode `"dark"` shows only the clock and temp.
- The day theme follows sunrise/sunset if `config.theme.followSun` is true. Otherwise the theme is light by day.

**FR-11 Status indicators.** A small footer shows "Updated 10:42 AM" per data panel (weather, news, calendar).
- When `navigator.onLine` is false or the last 2 fetches failed, show an "Offline, showing cached data" pill. Data older than 2× its refresh interval renders at 60% opacity with its age.

**FR-12 Stretch panels (M4, each behind a config flag, off by default).**
- FR-12a **Trash/recycling day.** Weekly rule from config (e.g. trash every Tue, recycling alternate weeks with an anchor date). It shows "Trash night" the evening before.
- FR-12b **Grocery list.** Read-only list from a URL in config (a Worker route returning JSON or plain text, e.g. a secret Gist).
- FR-12c **Night photo slideshow.** During night mode, if enabled, show a slow (60 s) dim slideshow from a list of image URLs in config, with the clock overlaid.

**FR-13 Tap to refresh.** A tap anywhere triggers an immediate refresh of all panels (debounced to once per 30 s). No other touch interaction.

## 4. Non-functional requirements
**NFR-1 Refresh intervals (defaults, configurable).**

| Data | Interval |
|---|---|
| NWS observation and hourly | 15 min |
| NWS forecast | 30 min |
| Alerts | 5 min |
| Sunrise/sunset | daily at 00:05 |
| News | 15 min |
| Calendar | 30 min |

Add ±10% random jitter. Back off exponentially on failure (1, 2, 4… up to 30 min).

**NFR-2 Last-good cache.** Every successful response is stored in `localStorage` under `kh:<panel>` as `{savedAt, data}`. On boot, the page renders from the cache immediately, then fetches. A failed fetch never blanks a panel. Keys are versioned (`kh:v1:`) so a schema change discards old data.

**NFR-3 Daily reload.** A full `location.reload()` happens at 03:00 local, and once at boot if uptime is over 26 h. This clears leaks and picks up deploys. Fully's own reload settings (§10) are the belt-and-suspenders backup.

**NFR-4 Burn-in protection.** Every 60 min, translate the root container by a random offset within ±8 px (x and y) using `transform`. Never leave a static element at full white for more than 1 hour. The night theme counts.

**NFR-5 Memory stability (1 week uptime).**
- No unbounded arrays or listeners. Re-render by replacing a panel's content, not by appending.
- A single timer scheduler runs all panels. Clear the old timeout before setting a new one.
- No `setInterval` stacking on re-render. Abort stale fetches with `AbortController` and a 15 s timeout.
- Verify that the heap stays flat in DevTools after a 1-hour fast-forward test (§11).

**NFR-6 Performance.**
- First paint from cache in under 1.5 s on the tablet.
- No CSS animations except opacity/transform fades. No `box-shadow` or `filter: blur` on large areas.
- Main-thread work per refresh under 50 ms. Total page weight under 150 KB excluding the photos in FR-12c.

**NFR-7 No secrets in client code.** The repo and the public site never contain the .ics URL, API keys or private feed URLs. Secrets live only in Worker secrets. The Worker URL itself is public.

**NFR-8 Accessibility and contrast.** Use semantic HTML, with `lang="en"` and each panel as a `<section>` with an `aria-label`. Meet the C-6 sizes and contrast. Never use color as the only signal: alerts also carry the event text.

**NFR-9 Resilience to bad data.** Every parser tolerates missing fields, nulls and empty arrays. Wrap each panel's render in try/catch so a crash in one panel never affects the others. Log errors with `console.error('[panel]', err)` only.

**NFR-10 Clock accuracy.** Uses device time. If `Date.now()` jumps by more than 5 min (NTP sync), reschedule all timers.

## 5. Data sources and APIs
**NWS (api.weather.gov).** Free, no key, CORS `*`.
- **Required header:** `User-Agent: KitchenHub/1.0 (github.com/scranfil)`. Browsers can't set User-Agent, so the client must also send `Accept: application/geo+json`. If NWS ever rejects browser calls, route them through the Worker `/nws/*`, which is an optional route.
- Rate limit: unpublished but generous. Stay within NFR-1 and never poll faster than 1 call/min per endpoint.
- Gridpoint for 46236: **IND / 64,75** (Lawrence, IN). Verified Oct 21, 2026 via `GET https://api.weather.gov/points/39.8947,-85.9786`. Forecast zone `INZ047`, county `INC097`.

| Purpose | Endpoint | Fields used |
|---|---|---|
| 7-day | `https://api.weather.gov/gridpoints/IND/64,75/forecast` | `properties.periods[]`: `name, startTime, isDaytime, temperature, temperatureUnit, probabilityOfPrecipitation.value, windSpeed ("2 mph"), windDirection, icon, shortForecast` |
| Hourly | `https://api.weather.gov/gridpoints/IND/64,75/forecast/hourly` | the same `periods[]` fields, one per hour |
| Observation | `https://api.weather.gov/stations/KMQJ/observations/latest` | `properties.timestamp, temperature.value (°C), heatIndex.value, windChill.value, windSpeed.value (km/h), windDirection.value (deg), relativeHumidity.value, textDescription` (**convert units; values may be null**) |
| Alerts | `https://api.weather.gov/alerts/active?point=39.8947,-85.9786` | `features[].properties`: `event, headline, severity, urgency, effective, expires, description` |

Sample period (live, Oct 21, 2026): `{"name":"Today","temperature":70,"temperatureUnit":"F","probabilityOfPrecipitation":{"value":0},"windSpeed":"2 mph","windDirection":"NNW","shortForecast":"Sunny"}`.

Icons: map `shortForecast` keywords (sunny/clear, partly, cloudy, rain, showers, thunder, snow, fog, wind) and `isDaytime` to local inline SVG/emoji. Don't hotlink NWS icon URLs.

**Open-Meteo.** Free, no key, CORS, under 10k calls/day for non-commercial use.
- `https://api.open-meteo.com/v1/forecast?latitude=39.8947&longitude=-85.9786&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York&forecast_days=6`
- Fields: `current.*`, `hourly.time[]/…`, `daily.time[]/…`, `daily.sunrise[]` (`"2026-10-21T08:00"`, already local) and `daily.sunset[]` (`"2026-10-21T18:55"`).

**News RSS** (fetched by the Worker only): NPR, WTHR and Google News (FR-8). All three returned 200 on Oct 21, 2026. Parse `<item><title>`, `<pubDate>` and `<link>`, and strip HTML entities. Google News titles end in " - Source". Split that into title and source.

**Calendar.** A private iCal ("secret address in iCal format") URL from Google Calendar or Outlook. It is stored as a Worker secret and fetched by the Worker only.

## 6. Cloudflare Worker spec (`worker/`)
- Name `kitchen-hub-proxy`, URL `https://kitchen-hub-proxy.<subdomain>.workers.dev`, deployed with `wrangler`. Single file `worker/src/index.js`, no npm dependencies besides `wrangler` (dev).
- **Routes:**
  - `GET /news` returns `{"fetchedAt": ISO, "items":[{"title","source","published": ISO,"link"}]}`. It merges all allowlisted feeds, dedupes by normalized title, sorts by `published` descending, caps at 10 per source and 20 total, and drops items older than 48 h.
  - `GET /calendar?days=4` returns `{"fetchedAt": ISO, "tz":"America/New_York", "events":[{"title","start": ISO,"end": ISO,"allDay": bool}]}`, from now through the end of day+3, with recurrences expanded and EXDATEs applied. Titles only. Locations and descriptions are stripped.
  - `GET /health` returns `{"ok":true}`.
  - Anything else returns 404. Only GET and OPTIONS are allowed. Other methods return 405.
- **Allowlist.** Feed URLs are hard-coded in the Worker in `const FEEDS = {npr: …, wthr: …, gnews: …}`. The Worker never accepts a URL from the client. Clients may pass `?sources=npr,wthr`, filtered against the allowlist keys.
- **Caching.** Use the Cache API (`caches.default`). `/news` has a 10 min TTL and `/calendar` 15 min. Each upstream fetch has an 8 s timeout. If an upstream feed fails, serve the other feeds and include `"errors":["wthr"]`. If everything fails, serve the stale cache with `"stale":true` rather than a 5xx.
- **CORS.** `Access-Control-Allow-Origin` comes from the `ALLOWED_ORIGINS` var (`https://scranfil.github.io`, `http://localhost:8080`, `http://127.0.0.1:8080`), echoing the request origin when it matches. Allow `GET, OPTIONS`. Answer preflight with 204.
- **Secrets and vars.** `wrangler secret put ICS_URL` holds the private calendar URL. Optional `ICS_URL_2` adds a second calendar, merged into the same list. `ALLOWED_ORIGINS` goes in `wrangler.toml` `[vars]`. The Worker sets the `User-Agent: KitchenHub/1.0 (github.com/scranfil)` header on outbound requests.
- **Limits.** Stay well inside the free tier: 100k requests/day, 10 ms CPU per request. ICS parsing must be linear and cap expansion at 500 occurrences.

## 7. Configuration (`config.js`)
Loaded first as a classic script. It defines one global, `window.KH_CONFIG`. Nothing secret goes here.
```js
window.KH_CONFIG = {
  location: { name: "Indianapolis 46236", lat: 39.8947, lon: -85.9786,
              nwsOffice: "IND", nwsGridX: 64, nwsGridY: 75, nwsStation: "KMQJ" },
  timezone: "America/New_York",
  units: "us",                       // °F, mph
  workerUrl: "https://kitchen-hub-proxy.SUBDOMAIN.workers.dev",
  refreshMinutes: { observation: 15, hourly: 15, forecast: 30, alerts: 5, news: 15, calendar: 30 },
  clock: { showSeconds: false, hour12: true },
  news: { sources: ["npr", "wthr"], rotateSeconds: 20, maxItems: 10 },
  calendar: { enabled: true, days: 4, maxEvents: 12 },
  night: { start: "22:00", end: "06:00", mode: "dim" },   // "dim" | "dark"
  theme: { followSun: true },
  burnInShift: { everyMinutes: 60, maxPx: 8 },
  dailyReload: "03:00",
  stretch: {
    trash: { enabled: false, trashDay: "Tue", recycling: { everyWeeks: 2, anchorDate: "2026-11-03" } },
    grocery: { enabled: false, url: "" },
    nightPhotos: { enabled: false, urls: [], intervalSeconds: 60 }
  },
  debug: false                        // ?debug=1 also enables: shows timers, cache ages, fast-forward
};
```
URL overrides for testing: `?debug=1`, `?night=1` (force night mode), `?offline=1` (simulate fetch failures), `?now=2026-10-25T22:30` (fake clock).

## 8. Layout wireframe (landscape)
```
+--------------------------------------------------------------------------------+
| [ALERT BANNER: Wind Advisory until 7:00 PM ...]   (hidden when no alerts)       |
+-------------------------------------+------------------------------------------+
|                                     |  [icon]  56°F   Sunny                    |
|   10:42 AM                          |  Feels 56°  Wind NNW 2 mph  Hum 48%      |
|   Wednesday, October 21             |  High 70° / Low 46°   Rain 0%            |
|                                     |  Sunrise 8:00 AM   Sunset 6:55 PM        |
+-------------------------------------+------------------------------------------+
|  NEXT 12 HOURS  11a 12p  1p  2p  3p  4p  5p  6p  7p  8p  9p 10p                 |
|                 58° 62° 66° 69° 70° 69° 67° 63° 59° 55° 52° 50°   (precip %)    |
+--------------------------------------------------------------------------------+
|  TODAY        TOMORROW      FRI           SAT           SUN                     |
|  [ic] 70/46   [ic] 72/50    [ic] 68/49    [ic] 71/47    [ic] 74/49   (rain %)   |
+------------------------------------------+-------------------------------------+
|  CALENDAR                                |  NEWS                               |
|  Today      6:30 PM  Dinner w/ ...       |  "Headline text in large type that  |
|  Tomorrow   All day  ...                 |   wraps to two lines max..."        |
|  Fri        9:00 AM  ...                 |   WTHR · 25m                  3/10  |
+------------------------------------------+-------------------------------------+
| Weather 10:40 · News 10:35 · Calendar 10:30                  [Offline pill]    |
+--------------------------------------------------------------------------------+
```
CSS grid, with row heights set in `vh` so everything fits at 16:10 and 1024×600 without scrolling. At 1024×600, the hourly strip shows 8 hours and the 5-day strip drops the rain %.

## 9. Project structure
```
C:\Dev\KitchenHub\
  REQUIREMENTS.md        this file
  README.md              preview, deploy, Fully settings (written by agent)
  index.html             markup; loads scripts in order below
  style.css              themes via CSS custom properties (.theme-day/.theme-night)
  config.js              §7
  js/util.js             fetchJson w/ timeout+AbortController, cache, scheduler, time fmt
  js/icons.js            inline SVG/emoji map for NWS keywords + WMO codes
  js/weather.js          NWS + Open-Meteo fallback, FR-2..FR-7
  js/alerts.js           FR-6
  js/news.js             FR-8
  js/calendar.js         FR-9
  js/app.js              boot, night mode, burn-in, daily reload, status (FR-1, FR-10, FR-11)
  worker/wrangler.toml
  worker/src/index.js    §6
  worker/src/ics.js      minimal ICS parser + RRULE expansion
  tests/                 node --test unit tests for parsers (ics, rss, nws mapping)
  tests/fixtures/        saved NWS/Open-Meteo/RSS/ICS samples
  .nojekyll
```
`tests/` uses Node's built-in `node:test`, with no dependencies. It is the only place modern Node is used, and the site code stays ES2017.

## 10. Deployment
**GitHub Pages**
1. Create the repo `scranfil/KitchenHub` (public, which the free Pages tier requires) and push `main`.
2. Settings → Pages → Deploy from branch `main` / root. The site is at `https://scranfil.github.io/KitchenHub/`.
3. Cache busting: `index.html` references `app.js?v=YYYYMMDDHHmm`. The agent bumps it on each release, or `config.js` holds `version` and the scripts load with it.

**Cloudflare Worker**
1. `npm i -g wrangler` then `wrangler login` (Scott does this, in a browser).
2. `cd worker && wrangler secret put ICS_URL` (paste the secret iCal URL).
3. `wrangler deploy`. Copy the `*.workers.dev` URL into `config.js` `workerUrl`.
4. Check: `curl https://kitchen-hub-proxy.<sub>.workers.dev/health` and `/news`.

**Fully Kiosk Browser checklist (on the tablet)**
- [ ] Confirm Android version (Settings → About tablet). Update **Android System WebView / Chrome** in the Play Store.
- [ ] On stock Android: Battery Protection Mode on (Settings → Battery). After §14 that setting is gone; use the charge-limit method in §14.8.
- [ ] Install Fully Kiosk Browser from the Play Store.
- [ ] Web Content → **Start URL** = `https://scranfil.github.io/KitchenHub/`
- [ ] Device Management → **Launch on Boot** on, **Keep Screen On** on, screen brightness ~70%.
- [ ] Web Auto Reload → **Reload on network reconnect** on, **Auto reload on idle** off (the page handles its own reload), **Reload on screen on** on.
- [ ] Web Browsing → disable pull-to-refresh, disable zoom. Toolbars hidden, fullscreen on.
- [ ] Device Management → Orientation = **Landscape** (forced).
- [ ] Test for 24 h, then **Kiosk Mode** on (set a PIN, write it down).
- [ ] *(Fully PLUS, $10.99 one-time, optional)* **Scheduled Sleep** screen off 23:00–06:00, and motion detection to wake.
- [ ] Android: Developer options → USB debugging on (for §11 remote inspect). Fully → Advanced Web Settings → **Enable Remote Admin / WebView debugging** on.

## 11. Acceptance criteria and test plan
**Per-milestone acceptance (each must pass before moving on)**
- AC-1 (M1). At 1920×1200, 1280×800 and 1024×600 in desktop Chrome DevTools, the clock, current weather, hourly, 5-day and sunrise/sunset all render with no scrollbars or clipped text. The values match api.weather.gov for IND/64,75.
- AC-2 (M1). With `?offline=1` after one good load, the panels show cached data, dimmed and with their age, and the Offline pill appears. The console shows no uncaught errors.
- AC-3 (M1). Forcing an NWS failure (bad gridpoint in config) switches to Open-Meteo with the tag. Fixing it returns to NWS.
- AC-4 (M1). Alerts banner: loading `tests/fixtures/alerts-severe.json` via `?debug=1&alertsFixture=1` shows a red banner. With an empty array it is hidden and takes no space.
- AC-5 (M2). `curl` of the Worker `/news` returns at least 6 items from 2 or more sources, and a second call within 10 min is served from cache (`cf-cache-status` or a timing check). `/news` with an `Origin: https://evil.example` header gets no ACAO header.
- AC-6 (M2). `/calendar` returns events for 4 days, including a weekly recurring fixture event and an all-day event. The page groups them correctly. `grep -r` for the ICS host across the repo finds nothing (NFR-7).
- AC-7 (M3). `?now=2026-10-25T22:30` shows night mode, and `?now=…T06:01` shows day mode. With `?debug=1` fast-forward, the burn-in offset changes hourly and the 03:00 reload fires.
- AC-8 (M3). Soak test: in debug fast-forward, simulate 7 days of refresh cycles. After forced GC, the DevTools heap snapshot grows less than 5 MB from start to end, and the DOM node count is stable.
- AC-9 (all). Unit tests pass with `node --test tests/`. These cover the ICS parser (TZID, all-day, RRULE BYDAY/UNTIL/COUNT, EXDATE), RSS parsing (NPR, WTHR and Google News fixtures), NWS period pairing, °C→°F and km/h→mph conversion, and WMO code mapping.

**Old-WebView testing (no BrowserStack)**
1. **Static check.** The agent adds `tests/es2017-check.js`, which parses each `js/*.js` file with `acorn` at `ecmaVersion: 2017` (dev-only, `npx`). Any syntax newer than ES2017 fails it. It also greps `style.css` for `:has(`, `@container`, `@layer` and `dvh`.
2. **Old Chromium on the PC.** Download a Chromium 95 Windows build from the Chromium snapshot archive (`commondatastorage.googleapis.com/chromium-browser-snapshots`, Win_x64, a base position from the 95 branch). Chrome for Testing only goes back to 113. Run it with `--user-data-dir=C:\Temp\chr95` and open `http://localhost:8080` (`npx http-server -p 8080` or `python -m http.server 8080`). Check AC-1 to AC-4 there.
3. **On the device (authoritative).** Connect the tablet over USB, open `chrome://inspect/#devices` on the PC, and inspect the Fully WebView. Note the WebView version in `navigator.userAgent` and record it in README and in §14.8. Check layout, the console and the Memory tab (AC-8 spot check over 1 hour real time).
4. **24-hour burn-in on device.** Leave it running for 24 h, including a Wi-Fi off/on cycle and a router reboot. It must recover with no manual action.

## 12. Milestones
- **M1: Clock and weather.** FR-1 through FR-7, FR-11, FR-13; NFR-1, 2, 6, 8, 9, 10; config.js; layout skeleton for all panels with placeholders; README preview section. Passes AC-1 to AC-4 and AC-9 (weather parts).
- **M2: News and calendar via Worker.** §6 Worker, FR-8, FR-9, NFR-7; README Worker deploy section. Passes AC-5, AC-6 and AC-9.
- **M3: Polish, night mode and resilience.** FR-10, NFR-3, 4 and 5; theme following sunrise/sunset; GitHub Pages deploy; Fully checklist in README; on-device test. Passes AC-7, AC-8 and the §11 device steps.
- **M4: Stretch.** FR-12a, b and c, one at a time, each behind its config flag, on Scott's go-ahead.

## 13. Open questions for Scott
1. **Calendar.** Which calendar: Google personal, Outlook, or a family shared calendar? More than one? (It decides how many ICS secrets the Worker needs.)
2. **Extra panels.** Trash/recycling day (which days?), grocery list (where does it live today?), night photo slideshow (which photos?). Anything else, like the Colts schedule or a countdown?
3. **Mount location.** Which wall or counter, how far from the main viewing spot, and is an outlet nearby? Is it near the stove, a window or direct sun? (This affects font sizes, brightness and heat.)
4. **Night behavior.** Dim or fully dark from 10pm to 6am, or screen off (needs Fully PLUS)?
5. **Android version** is decided in §14: Android 14 via LineageOS 21. C-4 stays at Chrome 95 until §14.8 records the WebView on the flashed tablet.

## 14. Android 14 migration (device)

Added Oct 24, 2026. This changes the tablet. It does not change site code. Leave C-2, C-3, and C-4 alone until §14.8 is filled in.

Lenovo never shipped Android 14 for the Tab M10 FHD Plus. The target system is an unofficial **LineageOS 21** generic system image (Android 14) on this tablet. LineageOS 22 (Android 15) boot-loops here. Do not flash it.

The LineageOS system image replaces Lenovo's Android 9/10 system: the launcher, Lenovo apps, and Battery Protection Mode. The boot logo, bootloader, and vendor partition stay. Those drivers run the screen, touch, Wi-Fi, and camera. No build for this Helio P22 tablet removes them.

### 14.1 Confirm the tablet before downloading images
- Confirmed Oct 24, 2026 over USB: model **TB-X606F**, serial **HA1AXHMJ**, PSN **8SSP69A6P84YHA6011T00V8**. Chipset is MediaTek Helio P22. Enter `HA1AXHMJ` in Software Fix.
- Record RAM. 2 GB and 4 GB choose different images (§14.3).
- Install Lenovo Rescue and Smart Assistant on a Windows PC and confirm it sees the tablet. That tool restores stock if the new system boot-loops, as long as fastboot still works.
- Install the latest stock Lenovo build first. The last cited security patch is 5 June 2022. Flashing from an older build is the path that sticks on the red Lenovo logo.

### 14.2 Backup
Unlocking the bootloader wipes the tablet. Copy off anything that matters. With the stock-capable TWRP (`twrp-X606F_11`, or the matching X606FA build), back up boot, system, and vendor, then copy that backup to the PC.

Stock Android 9/10 uses full-disk encryption. Android 13 and 14 use file-based encryption. The TWRP that can read stock cannot decrypt the new data partition. Flash LineageOS with `twrp-X606F_12.1.fbe` (or the X606FA FBE build). `adb shell getprop ro.crypto.type` returns `block` on stock and `file` after the new system.

### 14.3 Image
- arm64 A/B LineageOS 21 from Andy Yan's TrebleDroid builds: `https://sourceforge.net/projects/andyyan-gsi/files/lineage-21-td/`
- Flash the `.img` to `/system` only.
- Worked-through guides:
  - `https://xdaforums.com/t/guide-tb-x606f-x606fa-x606x-x606xa-x606v-lenovo-m10-plus-fhd-how-to-install-lineage-os-21-gsi-unofficial-android-14.4731020/`
  - `https://xdaforums.com/t/guide-tb-x606f-a-lenovo-m10-plus-fhd-lineage-os-21-gsi-unofficial-android-14.4697538/`
- Several reports needed Android platform-tools **30.0.5**. Newer `fastboot` has mishandled this tablet's `vbmeta`.
- Kitchen display: use the **vanilla** build (no Google apps). On 2 GB models the GApps build (`bgN`) has been sluggish, crashy, and hard on the battery. Sideload Fully Kiosk and Android System WebView as APKs. Play certification is unreliable with an unlocked bootloader, so do not depend on the Play Store for those two packages.
- A 4 GB tablet may use `bgN` (GApps, no root) if sideloading WebView is a problem. Record the filename in §14.8.

### 14.4 Flash order
Follow the XDA guide for the confirmed model. The order that has worked:

1. Enable developer options, OEM unlocking, and USB debugging.
2. Unlock from fastboot (`fastboot flashing unlock`). This wipes the tablet.
3. Let stock boot, set it up once, and turn USB debugging back on.
4. Flash the stock-capable TWRP, disable vbmeta verification, boot recovery, back up boot, system, and vendor, and copy the backup to the PC.
5. Flash the file-based-encryption TWRP, disable vbmeta verification again, and boot recovery.
6. Format data (type `yes`).
7. Install the LineageOS 21 image to `/system`.
8. Reboot. The Lenovo logo can sit for a few minutes, then the Lineage animation.

If it boot-loops, format data in the file-based-encryption TWRP and flash the image again. If it still fails, restore stock with Rescue and Smart Assistant.

### 14.5 First boot
- Dismiss the phone-service crash during setup. That is expected on the Wi-Fi model.
- Phh Treble Settings → Misc → Bluetooth workarounds → Mediatek.
- Phh Treble Settings → Misc → turn on alternate headset detection, and turn on force headset switch (Huawei default).
- Reboot so those settings apply.

### 14.6 Kitchen setup
1. Confirm Android 14 under Settings → About.
2. Install Fully Kiosk. Sideload it, and Android System WebView, when the image has no Play Store. Re-apply the §10 checklist: start URL, launch on boot, keep screen on, forced landscape, JavaScript interface, remote debugging.
3. Retest presence. `js/presence.js` talks to Fully's JavaScript interface. On stock, a fully off panel can suspend the front camera, which is why the page dims the backlight and Fully's screen-off timer stays at 0. Confirm that still holds, or write the new behavior in §14.8.
4. Replace Battery Protection Mode. That charge cap leaves with the Lenovo system, and this display stays plugged in. If the new system exposes a charge limit, use it. Otherwise use a smart plug or charger schedule so the pack is not held at 100%. Root and a charge-control module wait until after the first flash. Record the method in §14.8.
5. Run it for 24 hours, including a Wi-Fi drop, before treating it as the house display.

### 14.7 Site code
Do not change Kitchen Hub source for this migration. The page has to keep running if the tablet is restored to stock. After §14.8 records `navigator.userAgent` from `chrome://inspect`, update the §2 OS row and replace the Chrome 95 sentence in C-4 with that version.

### 14.8 Record after the flash

| Item | Value |
|---|---|
| Model | TB-X606F (confirmed Oct 24, 2026) |
| Serial | HA1AXHMJ |
| PSN | 8SSP69A6P84YHA6011T00V8 |
| RAM | |
| Image filename | |
| Android version shown in Settings | |
| WebView / `navigator.userAgent` | |
| Charge-limit method | |
| Front camera still suspends when the panel is fully off? | |
| 24-hour soak passed | |
