process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'cs2_stats.db');
const db = new Database(dbPath);

const API_KEY = "7BC355C9F92176761CD404109A71D1C4";
const STEAM_ID = "76561198930356801";

const PORT = 3000;
const app = express();

let lastStatsString = "";

app.get('/steam-data', (req, res) => {
  const apiUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${API_KEY}&steamids=${STEAM_ID}`;
  
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
    const response = await fetch(`https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v2/?appid=730&key=${API_KEY}&steamid=${STEAM_ID}`);
    const data = await response.json();

    if (!data.playerstats || !data.playerstats.stats) {
      return res.status(404).json({ error: "No CS2 stats found for this user. They may not own or have played CS2." });
    }

    const currentStatsString = JSON.stringify(data.playerstats.stats);
    if (currentStatsString !== lastStatsString) {
      const timestamp = Date.now();
      const newDbPath = path.join(__dirname, `cs2_stats_${timestamp}.db`);
      const newDb = new Database(newDbPath);

      newDb.prepare(`
        CREATE TABLE IF NOT EXISTS cs2_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          stat_name TEXT,
          stat_value INTEGER,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      saveStats(data.playerstats.stats, newDb);

      lastStatsString = currentStatsString;
      console.log(`New database created: ${newDbPath}`);
    }

    res.json(data);
  } catch (err) {
    console.error('Failed to fetch CS2 stats:', err);
    res.status(500).send('Error fetching CS2 stats');
  }
});

function saveStats(statsArray, dbInstance) {
  const stmt = dbInstance.prepare("INSERT INTO cs2_stats (stat_name, stat_value) VALUES (?, ?)");
  statsArray.forEach(stat => {
    stmt.run(stat.name, stat.value);
  });
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
