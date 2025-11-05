let kills = document.getElementById("kills");
let deaths = document.getElementById("deaths");
let steamData;
let cs2Data;
let prevCS2Data = null;
let prevSteamData = null;

function fetchSteamData() {
  fetch('http://localhost:3000/steam-data')
    .then(res => res.json())
    .then(data => {
      steamData = data;
      // console.log(data);
    })
    .catch(err => console.error(err));
}

function fetchCS2Data() {
  fetch('http://localhost:3000/cs2-stats')
    .then(res => res.json())
    .then(data => {
      logChanges(prevCS2Data, data); // logs only differences
      prevCS2Data = JSON.parse(JSON.stringify(data)); // deep copy
      cs2Data = data;
      // console.log(data);
      if (data.playerstats && data.playerstats.stats) {
        const killsStat = data.playerstats.stats.find(stat => stat.name === 'total_kills');
        const deathsStat = data.playerstats.stats.find(stat => stat.name === 'total_deaths');
        kills.textContent = 'Total kills: ' + killsStat.value;
        deaths.textContent = 'Total deaths: ' + deathsStat.value;
      } else {
        kills.textContent = 'No stats available';
      }
    })
    .catch(err => console.error(err));
}

function logChanges(prevData, newData) {
  if (!prevData || !newData) return;

  Object.keys(newData).forEach(key => {
    const oldValue = prevData[key];
    const newValue = newData[key];

    if (oldValue !== newValue) {
      console.log(`Changed: ${key} | Old: ${oldValue ?? 'N/A'} | New: ${newValue}`);
    }
  });
}

// Fetch initially
fetchSteamData();
fetchCS2Data();

// Fetch every 10 seconds

setInterval(fetchSteamData, 60000);
setInterval(fetchCS2Data, 60000);

// Fetch stats data and render kills chart
fetch('http://localhost:3000/stats-data')
  .then(res => res.json())
  .then(data => {
    console.log('Database data:', data);

    // Filter only kill stats
    const killStats = data.filter(stat => stat.stat_name === 'total_kills');

    // Build values and labels. Labels use timestamp from the db filename
    // (files named like cs2_stats_<ms>.db) if present, otherwise fall back
    // to the row.timestamp value, otherwise the current date.
    const values = killStats.map(stat => Number(stat.stat_value));

    if (values.length === 0) {
      console.warn('No kill stats available to plot');
      return;
    }

    const labels = killStats.map(stat => {
      // Try to extract ms timestamp from dbFile (e.g. cs2_stats_169... .db)
      if (stat.dbFile) {
        const m = stat.dbFile.match(/cs2_stats_(\d+)\.db$/);
        if (m) {
          const d = new Date(Number(m[1]));
          if (!isNaN(d)) return d.toLocaleDateString();
        }
      }

      // Fallback to row.timestamp (could be SQLite DATETIME string)
      if (stat.timestamp) {
  const d = new Date(stat.timestamp);
  if (!isNaN(d)) return d.toLocaleDateString();
      }

  // Final fallback: now (date only)
  return new Date().toLocaleDateString();
    });

    // Calculate 1% below min and 1% above max
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const rangeMin = Math.round(minValue * 0.999);
    const rangeMax = Math.round(maxValue * 1.001);

    const ctx = document.getElementById('killsChart').getContext('2d');

    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Total Kills Over Time',
          data: values,
          borderColor: 'rgb(75, 192, 192)',
          tension: 0.1,
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: false,
            min: rangeMin,
            max: rangeMax
          }
        }
      }
    });
  })
  .catch(err => console.error('Error loading data:', err));
