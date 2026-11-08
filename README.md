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

`?sample=1` fills the news list, doors, thermostat, and lights with sample data so the layout can be checked without accounts. The sample front door is locked and the sample garage is closed.

## Nest and Hue

The doors, thermostat, and lights sit in the row under the forecast. News opens from the icon just to the right of the weather map. With nothing filled in, each tile says **Not connected** and the page keeps running.

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

7. On the tablet, tap **Setup** on the doors or thermostat tile, paste the four values, and tap **Save on this tablet**. That store never leaves the tablet. Or put the same fields in `config.local.js` and open the page from a copy of this folder that contains that file. GitHub Pages only serves committed files, so it will not see `config.local.js`.

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

Personal tokens from [account.smartthings.com/tokens](https://account.smartthings.com/tokens) expire after 24 hours. The lasting login is an OAuth-In app. The home server keeps the client secret and refresh token in gitignored `smartthings.oauth.json`, refreshes the access token before it expires, and proxies SmartThings so the tablet never sees those secrets.

Run the server on a computer that stays on the home network, and point Fully at it:

```
node tools/kitchen-server.js
```

Fully start URL: `http://<that-computer>:8080`.

Create the app once, on that computer:

1. Install the CLI and sign in (a browser window opens):

   ```
   npm install -g @smartthings/cli
   smartthings login
   smartthings apps:create
   ```

   If that command is missing, run `smartthings smartapps:create` instead. It is the same step.
2. Choose **OAuth-In App** (some CLI versions say **API Access Smart App**).
3. Display name: `Kitchen Hub`. Description: anything short. Leave the icon blank.
4. Target URL: leave it blank if the prompt allows. This dashboard does not receive webhooks.
5. Scopes: `r:devices:*`, `x:devices:*`, and `r:locations:*`.
6. Add this redirect URI exactly, then finish editing redirect URIs:

   `http://127.0.0.1:8080/smartthings/callback`

7. Choose **Finish and create**. Copy the **OAuth Client Id** and **OAuth Client Secret** immediately. SmartThings shows the secret only once. Do not commit them.
8. On that same computer, open `http://127.0.0.1:8080/smartthings/connect`. Paste the client id and secret, then **Save and connect**. Approve Kitchen Hub in the SmartThings page that opens. The server stores the refresh token in `smartthings.oauth.json`.
9. If you open the connect page from the tablet instead, register a second redirect URI for that host, for example `http://192.168.1.20:8080/smartthings/callback`, because SmartThings requires the redirect to match the address in the browser.

The lights tile lists each Hue label once. When the same name appears twice, the Hue integration device is the one that stays. `smartthings.lockName` is used only when a door's source is set to `smartthings`.

The lights tile still has a personal-token box labeled as expiring in 24 hours. That is only a fallback. The OAuth login above is the one that keeps working.

### Doors

`config.doors` is the list on the doors tile. Each entry has a name, a kind (`lock` or `garage`), and a source, so a door can later use a different reader without changing the tile.

The front door and the garage both read Home Assistant through the home server. The front door `entityId` defaults to `lock.entryway_entryway_lock` (Entryway Lock). Locked stays quiet. Unlocked, open, and jammed turn that row red. Locking, unlocking, and opening show those words and stay quiet. Set the garage `entityId` (for example `cover.garage_door`) in `config.js` or `config.local.js`. Open turns that row red. Closed stays quiet. A door whose source is `smartthings` can still use the hub lock; that is not the front door's default.

Copy `homeassistant.json.example` to `homeassistant.json` on the computer that runs `node tools/kitchen-server.js`. Put the Home Assistant base URL and a long-lived token in that file. It is gitignored. The page never sees the URL or the token; the tablet only asks the home server for the state. With no source, or when the state cannot be read, the row says **Not connected** or **Unknown**. It does not show a lock or garage control, and it does not guess locked or closed.

Ring, motion, the snapshot, **Live view**, and **Setup** stay attached to the front door. `?unlocked=1` highlights the front door. `?garage=open` highlights the garage.

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
