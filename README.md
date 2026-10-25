# Kitchen Hub

Glanceable kitchen display for a Lenovo tablet: clock, weather, alerts, and later news and calendar.

## Preview (M1)

From this folder:

```
python -m http.server 8080
```

or

```
npx --yes http-server -p 8080
```

Open `http://localhost:8080`.

### Acceptance checks

| Query | What to look for |
|---|---|
| (none) | Clock, current weather, hourly, 5-day, sunrise/sunset. Forecast comes from the [NWS points API](https://api.weather.gov/points/39.8947,-85.9786) (IND/64,75). Sunrise and sunset come from sunrise-sunset.org. |
| DevTools 1920×1200, 1280×800, 1024×600 | No scrollbars, no clipped text. At 1024×600 the hourly strip shows 8 hours and rain % hides on the 5-day cards. |
| Load once, then `?offline=1` | Cached weather, dimmed, ages in the footer, **Offline, showing cached data** pill. Console stays clean. |
| Points API down, or bad `nwsGridX` while points is down | After two NWS failures, **via Open-Meteo** appears. A bad grid is ignored while the points API responds. |
| `?debug=1&alertsFixture=1` | Red severe-alert banner. Empty alerts stay hidden and take no space. |
| `?night=1` | Dark theme tokens only. Full night-mode behavior is M3. Night presence levels still apply. |
| `?presenceIdle=5` | Bright at load. After 5 quiet seconds the page dims (a dark overlay in desktop Chrome; the tablet backlight in Fully). A click or tap brightens it again. |
| `?presence=dim` or `?presence=bright` | Lock dim or bright. `?presence=off` leaves the backlight alone. |

### Presence

On the Lenovo tablet this needs **Fully Kiosk PLUS** and, once, **Advanced Web Settings → Enable JavaScript Interface**. The page then turns on the front camera, sets the backlight from `config.presence`, and dims it after `idleSeconds` with no motion. A tap or a weather alert brings it back up. From `config.night.start` to `config.night.end` it uses the lower `presence.night` levels. Desktop Chrome has no backlight control, so the same timer darkens the page with an overlay.

If the camera never reacts, set Fully → Motion Detection → **Camera API** to **Legacy**. Leave Fully’s screensaver timer and screen-off timer at 0. The page owns dimming, and a fully off panel on this tablet can suspend the camera.

### Tests

```
node --test tests/*.js
```
On this Windows/Node setup, `node --test tests/` is treated as a file path. Use the glob above.

Weather-unit, NWS period pairing, WMO mapping, and an ES2017/CSS static check (`npx acorn`).

## Milestone status

- **M1 (this folder):** Clock and weather, alerts, cache/offline, tap-to-refresh, layout skeleton.
- **M2:** News and calendar via the Cloudflare Worker.
- **M3:** Night mode, burn-in shift, daily reload, GitHub Pages, Fully Kiosk setup.
- **M4:** Stretch panels behind config flags.

`config.js` `workerUrl` still has a `SUBDOMAIN` placeholder. Weather uses the same sources as the [weather app](https://scranfil.github.io/weather/): NWS points, nearest-station observations, and alerts; sunrise-sunset.org; Open-Meteo when NWS is unavailable. The Worker is not needed until M2.
