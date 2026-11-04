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

On the Lenovo tablet, Fully Kiosk PLUS (Advanced Web Settings → Enable JavaScript Interface) lets the page set the backlight from `config.presence`. In Chrome the page cannot move the backlight, so pin that backlight to the day `presence.bright` value, turn auto-brightness off, and the page darkens the panel with a veil. Either way the front camera is on, the page dims after `idleSeconds` with no motion, and a wave, a tap, or a weather alert brings it back up. From `config.night.start` to `config.night.end` it uses the lower `presence.night` levels. A fully off panel suspends the camera, so the screen stays on.

If the camera never reacts, set Fully → Motion Detection → **Camera API** to **Legacy**. Leave Fully’s screensaver timer and screen-off timer at 0. The page owns dimming, and a fully off panel on this tablet can suspend the camera.

### Tests

```
node --test tests/*.js
```
On this Windows/Node setup, `node --test tests/` is treated as a file path. Use the glob above.

Weather-unit, NWS period pairing, WMO mapping, Nest and Hue parsers, and an ES2017/CSS static check (`npx acorn`).

`?sample=1` fills the news list, doorbell, thermostat, and lights with sample data so the layout can be checked without accounts.

## Nest and Hue

The doorbell, thermostat, and lights sit in the row under the forecast. News opens from the icon just to the right of the weather map. With nothing filled in, each tile says **Not connected** and the page keeps running.

Secrets stay off git. Copy `config.local.js.example` to `config.local.js` (that file is gitignored) or use the tablet buttons below. `config.local.js` wins when a value is set. The tablet's saved values are only in that browser.

A missing `config.local.js` is normal. The page asks for it and ignores the 404.

### Nest (Google Device Access)

Scott still needs to register. The console fee is $5, once.

1. Open [Device Access](https://console.nest.google.com/device-access) and create a project. Copy the **project id** (it is not the Google Cloud project id).
2. In [Google Cloud](https://console.cloud.google.com), use the same Google account. Enable **Smart Device Management API**. If you want rings and motion, also enable **Cloud Pub/Sub API**.
3. Configure the OAuth consent screen. On the test-user list, add the Google account that owns the Nest home. Add the scope `https://www.googleapis.com/auth/sdm.service`. For doorbell events, also add `https://www.googleapis.com/auth/pubsub`.
4. Create an OAuth client of type **Web application**. Add the redirect URI `https://www.google.com`. Copy the client id and client secret into `config.local.js` or the tablet form. Do not commit them.
5. In a browser, open this URL after replacing the two placeholders:

   `https://nestservices.google.com/partnerconnections/PROJECT_ID/auth?redirect_uri=https://www.google.com&access_type=offline&prompt=consent&client_id=CLIENT_ID&response_type=code&scope=https://www.googleapis.com/auth/sdm.service%20https://www.googleapis.com/auth/pubsub`

   Approve access. The browser lands on `google.com` with `?code=` in the address bar (the page itself may look empty). Copy that code.

6. Exchange it once (the code expires quickly):

   ```
   curl -X POST https://oauth2.googleapis.com/token \
     -d "client_id=CLIENT_ID" \
     -d "client_secret=CLIENT_SECRET" \
     -d "code=CODE" \
     -d "grant_type=authorization_code" \
     -d "redirect_uri=https://www.google.com"
   ```

   Put `refresh_token` in `nest.refreshToken`. The access token can be ignored; the page refreshes it.

7. On the tablet, tap **Setup** on the doorbell or thermostat tile, paste the four values, and tap **Save on this tablet**. That store never leaves the tablet. Or put the same fields in `config.local.js` and open the page from a copy of this folder that contains that file. GitHub Pages only serves committed files, so it will not see `config.local.js`.

The tiles then show online or offline, indoor temperature, the heat/cool/off/eco setpoint, and whether the system is heating, cooling, or idle. **−** and **+** change the setpoint by 1°F when the mode is heat, cool, or heat/cool. Eco and off stay read-only.

### Doorbell events and live view

Device status comes from the device list. Rings, motion, and person events are published by Google to a Pub/Sub topic you host. Google stops writing to Google-hosted topics after 30 November 2026, so use your own topic.

1. In Cloud Pub/Sub, create a topic, for example `nest-events`.
2. On that topic's permissions, add principal `sdm-publisher@googlegroups.com` with role **Pub/Sub Publisher**.
3. In the Device Access project, enable events and paste the full topic name `projects/GCP_PROJECT/topics/nest-events`.
4. Create a **pull** subscription, for example `nest-events-sub`, on that topic.
5. Put the Google Cloud project id in `pubsubProjectId` and `nest-events-sub` (or the full `projects/.../subscriptions/...` path) in `pubsubSubscription`.

The refresh token has to include the Pub/Sub scope from the authorize URL above, because the page pulls with that same token. After the first device list, Google starts publishing. The tile shows the latest ring and the latest motion or person time. When the doorbell offers an event image, the tile loads that snapshot. **Live view** asks the doorbell for a WebRTC stream and plays it in the browser. Close leaves the stream.

Until the subscription is filled in, the doorbell still shows online or offline and says that rings need Pub/Sub.

### SmartThings hub

The SmartThings cloud API allows this page to call it directly, so a personal access token is enough. No home server is required for the hub.

1. Open [SmartThings tokens](https://account.smartthings.com/tokens) and create a token that can read devices, read locations, and control devices.
2. On the lights tile, paste it and tap **Save**, or put it in `smartthings.token` in `config.local.js`. The token stays on the tablet or in that gitignored file.
3. Hue bulbs that are already connected to the hub show up as the light list, with the same on/off and brightness controls. The hub sends the commands.
4. A lock whose name contains "front" (or the only lock in the home) is the front door. While it is unlocked, the doorbell tile turns red and says the door is unlocked. `smartthings.lockName` changes the match if the lock is named something else.

`?unlocked=1` previews the red tile without a hub.

### Hue

1. The tablet and the bridge need to be on the same Wi-Fi.
2. The Hue bridge's local API does not allow calls from another website, and a public page such as GitHub Pages is not allowed to call a private address. Serve this folder from a computer on the home network:

   ```
   node tools/kitchen-server.js
   ```

   Then set Fully's start URL to `http://<that-computer>:8080`. The server serves the dashboard and forwards `/hue-proxy/...` to the bridge. `python -m http.server` serves the page but cannot reach the bridge.
3. On the lights tile, tap **Find**. The home server asks discovery.meethue.com, which only answers for the network it is called from. If nothing is found, type the bridge IP from the Hue app (Settings, Hue Bridges).
4. Press the round link button on the bridge, then tap **Pair** within about 30 seconds. The app key is saved in the tablet browser. Copy it into `hue.appKey` in `config.local.js` if you want it to survive a cleared site store. `hue.bridgeIp` can be set the same way.
5. The tile lists rooms with on/off and a brightness slider. Lights the bridge marks unreachable are left alone.

`tools/kitchen-server.js` only forwards to private addresses, and only to paths under `/api`. Keep it on the home network. Do not expose it to the internet.

## Milestone status

- **M1 (this folder):** Clock and weather, alerts, cache/offline, tap-to-refresh, layout skeleton.
- **M2:** News and calendar via the Cloudflare Worker.
- **M3:** Night mode, burn-in shift, daily reload, GitHub Pages, Fully Kiosk setup.
- **M4:** Stretch panels behind config flags.

`config.js` `workerUrl` still has a `SUBDOMAIN` placeholder. Weather uses the same sources as the [weather app](https://scranfil.github.io/weather/): NWS points, nearest-station observations, and alerts; sunrise-sunset.org; Open-Meteo when NWS is unavailable. The Worker is not needed until M2.
