process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}
const dbPath = path.join(dataDir, 'cs2_stats.db');
const db = new Database(dbPath);

// Ensure main DB has correct table schema (include steamid)
db.prepare(`
  CREATE TABLE IF NOT EXISTS cs2_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    steamid TEXT,
    stat_name TEXT,
    stat_value INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

const API_KEY = "7BC355C9F92176761CD404109A71D1C4";
// Put Steam IDs you want to track in this array
const STEAM_IDS = [
  "76561198930356801",
  "76561198208756329",
  "eversincesnow"
];

const PORT = 3000;
const app = express();

// We'll persist last-stats per-steamid inside the data folder as
// last_stats_<steamid>.txt when new stats are recorded.
const VANITY_CACHE_FILE = path.join(dataDir, 'vanity_cache.json');
let vanityCache = {};
try {
  if (fs.existsSync(VANITY_CACHE_FILE)) {
    vanityCache = JSON.parse(fs.readFileSync(VANITY_CACHE_FILE, 'utf8')) || {};
  }
} catch (e) {
  console.error('Error reading vanity cache:', e);
  vanityCache = {};
}

async function resolveSteamId(inputId) {
  // If it's already numeric, return as-is
  if (/^\d+$/.test(inputId)) return inputId;

  // Check cache
  if (vanityCache[inputId]) return vanityCache[inputId];

  // Call Steam ResolveVanityURL
  try {
    const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${API_KEY}&vanityurl=${encodeURIComponent(inputId)}`;
    const resp = await fetch(url);
    const j = await resp.json();
    if (j && j.response && j.response.success === 1 && j.response.steamid) {
      vanityCache[inputId] = j.response.steamid;
      try { fs.writeFileSync(VANITY_CACHE_FILE, JSON.stringify(vanityCache), 'utf8'); } catch (e) { console.error('Error writing vanity cache:', e); }
      return j.response.steamid;
    }
  } catch (err) {
    console.error(`Error resolving vanity ${inputId}:`, err);
  }
  return null;
}

app.get('/steam-data', (req, res) => {
  const apiUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${API_KEY}&steamids=${STEAM_IDS.join(',')}`;
  
  https.get(apiUrl, (resp) => {
    let data = "";

    resp.on("data", (chunk) => {
      data += chunk;
    });

    resp.on("end", () => {
      try {
        const json = JSON.parse(data);
        console.log("Steam Data:", data);
        res.json(json);
      } catch (err) {
        console.error("Failed to parse Steam data:", err);
        console.error("Response was:", data);
        res.status(500).json({ error: "Failed to parse Steam data" });
      }
    });

  }).on("error", (err) => {
    console.error("Failed to fetch Steam data:", err);
    res.status(500).json({ error: "Failed to fetch Steam data" });
  });
});


app.get('/cs2-stats', async (req, res) => {
  try {
    const aggregated = [];
    for (const steamId of STEAM_IDS) {
      try {
        // Resolve vanity name to numeric SteamID if needed
        const resolved = await resolveSteamId(steamId);
        if (!resolved) {
          aggregated.push({ steamid: steamId, error: 'Could not resolve steam id (vanity?)' });
          continue;
        }

        const response = await fetch(`https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v2/?appid=730&key=${API_KEY}&steamid=${resolved}`);
        const data = await response.json();

        if (!data.playerstats || !data.playerstats.stats) {
          aggregated.push({ steamid: steamId, error: 'No CS2 stats found for this user' });
          continue;
        }

        const currentStatsString = JSON.stringify(data.playerstats.stats);
        // per-steamid last file
  const lastFile = path.join(dataDir, `last_stats_${resolved}.txt`);
        let lastStatsForUser = '';
        try {
          if (fs.existsSync(lastFile)) lastStatsForUser = fs.readFileSync(lastFile, 'utf8');
        } catch (e) {
          console.error(`Error reading ${lastFile}:`, e);
        }

        let dbCreated = null;
        if (currentStatsString !== lastStatsForUser) {
          const timestamp = Date.now();
          const newDbPath = path.join(dataDir, `cs2_stats_${resolved}_${timestamp}.db`);
          const newDb = new Database(newDbPath);

          newDb.prepare(`
            CREATE TABLE IF NOT EXISTS cs2_stats (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              steamid TEXT,
              stat_name TEXT,
              stat_value INTEGER,
              timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `).run();

          saveStats(data.playerstats.stats, newDb, resolved);

          // persist last stats for this user
          try {
            fs.writeFileSync(lastFile, currentStatsString, 'utf8');
          } catch (err) {
            console.error(`Error writing ${lastFile}:`, err);
          }
          dbCreated = newDbPath;
          console.log(`New database created: ${newDbPath}`);
        }

        aggregated.push({ steamid: steamId, resolvedSteamId: resolved, data, dbCreated });
      } catch (innerErr) {
        console.error(`Failed to fetch CS2 stats for ${steamId}:`, innerErr);
        aggregated.push({ steamid: steamId, error: String(innerErr) });
      }
    }

    res.json(aggregated);
  } catch (err) {
    console.error('Failed to fetch CS2 stats:', err);
    res.status(500).send('Error fetching CS2 stats');
  }
});

function saveStats(statsArray, dbInstance, steamid) {
  const stmt = dbInstance.prepare("INSERT INTO cs2_stats (steamid, stat_name, stat_value) VALUES (?, ?, ?)");
  statsArray.forEach(stat => {
    stmt.run(steamid, stat.name, stat.value);
  });
}


app.get('/stats-data', (req, res) => {
  try {
    // Get all .db files in data folder
    const dbFiles = fs.readdirSync(dataDir).filter(f => f.endsWith('.db'));
    if (dbFiles.length === 0) return res.status(404).json({ error: 'No database files found' });

    let allRows = [];
    dbFiles.forEach(dbFile => {
      try {
        const db = new Database(path.join(dataDir, dbFile));
        const rows = db.prepare('SELECT * FROM cs2_stats').all();
        // Optionally, add dbFile info to each row for traceability
        rows.forEach(row => {
          row.dbFile = dbFile;
          // If steamid is missing (older DBs), try to extract it from filename
          if (!row.steamid) {
            // Try patterns: cs2_stats_<steamid>_<timestamp>.db or cs2_stats_<timestamp>.db
            // Accept alphanumeric (and other) steamid values (anything except underscore)
            const m1 = dbFile.match(/^cs2_stats_([^_]+)_(\d+)\.db$/);
            const m2 = dbFile.match(/^cs2_stats_(\d+)\.db$/);
            if (m1) {
              row.steamid = m1[1];
            } else if (m2) {
              // this may be a timestamp-only file; leave steamid null
              row.steamid = null;
            }
          }
        });
        allRows = allRows.concat(rows);
      } catch (dbErr) {
        console.error(`Error reading ${dbFile}:`, dbErr);
      }
    });
    res.json(allRows);
  } catch (err) {
    console.error('Error reading stats:', err);
    res.status(500).json({ error: 'Failed to load stats data' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
