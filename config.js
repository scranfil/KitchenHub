window.KH_CONFIG = {
  location: { name: "Indianapolis 46236", lat: 39.8947, lon: -85.9786,
              nwsOffice: "IND", nwsGridX: 64, nwsGridY: 75, nwsStation: "KMQJ" },
  timezone: "America/New_York",
  units: "us",                       // °F, mph
  workerUrl: "https://kitchen-hub-proxy.SUBDOMAIN.workers.dev",
  refreshMinutes: { observation: 15, hourly: 15, forecast: 30, alerts: 5, news: 15, calendar: 30 },
  clock: { showSeconds: false, hour12: true },
  news: {
    sources: ["ap-top", "reuters", "npr", "pbs", "bbc-us", "usa-today", "the-hill", "politico", "cbs", "nbc", "abc", "nyt", "cnn", "guardian-us", "wsj", "fox", "washington-examiner", "techcrunch", "the-verge", "ars", "wired", "espn-top", "espn-nfl", "espn-nba", "si", "cbs-sports", "variety", "hollywood-reporter", "rolling-stone", "ign"],
    rotateSeconds: 20,
    maxItems: 15
  },
  calendar: { enabled: true, days: 4, maxEvents: 12 },
  night: { start: "22:00", end: "06:00", mode: "dim" },   // "dim" | "dark"
  presence: {
    enabled: true,
    idleSeconds: 90,             // quiet this long, then dim the backlight
    bright: 180,                 // 0–255 while someone is in view
    dim: 12,
    sensitivity: 92,             // Fully camera motion, 0–100
    frameRate: 5,                // frames per second sent to the detector
    night: { bright: 64, dim: 4 }
  },
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
