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
      // New server returns an aggregated array per steamid. Handle both formats.
      if (Array.isArray(data)) {
        // find first successful response with playerstats
        const entry = data.find(e => e.data && e.data.playerstats && e.data.playerstats.stats);
        if (entry && entry.data) {
          const ds = entry.data;
          logChanges(prevCS2Data, ds); // logs only differences
          prevCS2Data = JSON.parse(JSON.stringify(ds));
          cs2Data = ds;
          const killsStat = ds.playerstats.stats.find(stat => stat.name === 'total_kills');
          const deathsStat = ds.playerstats.stats.find(stat => stat.name === 'total_deaths');
          return;
        }
        return;
      }

      // fallback: old single-object format
      logChanges(prevCS2Data, data); // logs only differences
      prevCS2Data = JSON.parse(JSON.stringify(data)); // deep copy
      cs2Data = data;
      if (data.playerstats && data.playerstats.stats) {
        const killsStat = data.playerstats.stats.find(stat => stat.name === 'total_kills');
        const deathsStat = data.playerstats.stats.find(stat => stat.name === 'total_deaths');
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

// Fetch every 60 seconds

setInterval(fetchSteamData, 60000);
setInterval(fetchCS2Data, 60000);

// Fetch stats data and render separate kills chart per player
fetch('http://localhost:3000/stats-data')
  .then(res => res.json())
  .then(data => {
    console.log('Database data:', data);

    // Filter only kill stats
    const killStats = data.filter(stat => stat.stat_name === 'total_kills');
    if (killStats.length === 0) {
      console.warn('No kill stats available to plot');
      return;
    }

    // Parse entries: get steamid, numeric value and ms timestamp (from filename or row)
    const entries = killStats.map(stat => {
      let ms = null;
      if (stat.dbFile) {
        const m = stat.dbFile.match(/_(\d+)\.db$/);
        if (m) ms = Number(m[1]);
      }
      if (!ms && stat.timestamp) {
        const parsed = Date.parse(stat.timestamp);
        if (!isNaN(parsed)) ms = parsed;
      }
      if (!ms) ms = Date.now();

      // Use dbFile as fallback key when steamid missing, to differentiate files
      const key = stat.steamid || stat.dbFile || 'unknown';
      return { key, value: Number(stat.stat_value), ms };
    });

    // Build sorted list of unique ms timestamps
    const msSet = new Set(entries.map(e => e.ms));
    const msArray = Array.from(msSet).sort((a, b) => a - b);
    const labels = msArray.map(ms => new Date(ms).toLocaleDateString());

    // Group values per key and align to labels (null for missing points)
    const groups = {};
    entries.forEach(e => {
      groups[e.key] = groups[e.key] || {};
      groups[e.key][e.ms] = e.value;
    });

    // Clean up previous charts if any
    if (window.playerCharts && Array.isArray(window.playerCharts)) {
      window.playerCharts.forEach(c => { try { c.destroy(); } catch (e) {} });
    }
    window.playerCharts = [];

    const container = document.getElementById('chartsContainer');
    // clear container
    container.innerHTML = '';

    const baseColors = [
      'rgb(75, 192, 192)',
      'rgb(255, 99, 132)',
      'rgb(54, 162, 235)',
      'rgb(255, 205, 86)',
      'rgb(153, 102, 255)',
      'rgb(201, 203, 207)'
    ];

    Object.keys(groups).forEach((key, idx) => {
      const map = groups[key];
      const dataPoints = msArray.map(ms => (ms in map ? map[ms] : null));

      // create wrapper and canvas
      const wrapper = document.createElement('div');
      wrapper.style.margin = '16px 0';
      const title = document.createElement('h3');
      title.textContent = `Player: ${key}`;
      wrapper.appendChild(title);
      const canvas = document.createElement('canvas');
      canvas.id = `chart-${idx}`;
      wrapper.appendChild(canvas);
      container.appendChild(wrapper);

      const color = baseColors[idx % baseColors.length] || `hsl(${(idx * 47) % 360} 70% 50%)`;

      // compute min/max for this dataset
      const numericVals = dataPoints.filter(v => v !== null && !isNaN(v));
      const minV = numericVals.length ? Math.min(...numericVals) : 0;
      const maxV = numericVals.length ? Math.max(...numericVals) : 1;
      const padMin = Math.round(minV * 0.99);
      const padMax = Math.round(maxV * 1.01);

      const ctx = canvas.getContext('2d');
      const chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Total Kills',
            data: dataPoints,
            borderColor: color,
            backgroundColor: color,
            tension: 0.1,
            spanGaps: false
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: { beginAtZero: false, min: padMin, max: padMax }
          }
        }
      });
      window.playerCharts.push(chart);
    });
  })
  .catch(err => console.error('Error loading data:', err));
