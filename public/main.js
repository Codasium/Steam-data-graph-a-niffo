let steamData;
let cs2Data;
let prevCS2Data = null;
let prevSteamData = null;

function fetchSteamData() {
  fetch('http://localhost:3000/steam-data')
    .then(res => res.json())
    .then(data => {
      steamData = data;
      // niks gedaan met steam data
    })
    .catch(err => console.error(err));
}

function fetchCS2Data() {
  fetch('http://localhost:3000/cs2-stats')
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data)) {
        const entry = data.find(e => e.data && e.data.playerstats && e.data.playerstats.stats);
        if (entry && entry.data) {
          const ds = entry.data;
          logChanges(prevCS2Data, ds);
          prevCS2Data = JSON.parse(JSON.stringify(ds));
          cs2Data = ds;
          const killsStat = ds.playerstats.stats.find(stat => stat.name === 'total_kills');
          const deathsStat = ds.playerstats.stats.find(stat => stat.name === 'total_deaths');
          return;
        }
        return;
      }

      logChanges(prevCS2Data, data);
      prevCS2Data = JSON.parse(JSON.stringify(data));
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

fetchSteamData();
fetchCS2Data();

setInterval(fetchSteamData, 60000);
setInterval(fetchCS2Data, 60000);

fetch('http://localhost:3000/stats-data')
  .then(res => res.json())
  .then(data => {
    console.log('Database data:', data);

    const rows = data;

    const players = {};
    const msSet = new Set();
    rows.forEach(stat => {
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

      const key = stat.steamid || stat.dbFile || 'unknown';
      msSet.add(ms);
      players[key] = players[key] || { stats: {} };
      const statName = stat.stat_name || 'unknown_stat';
      players[key].stats[statName] = players[key].stats[statName] || {};
      players[key].stats[statName][ms] = Number(stat.stat_value);
    });

    if (window.playerCharts && Array.isArray(window.playerCharts)) {
      window.playerCharts.forEach(c => { try { c.destroy(); } catch (e) {} });
    }
    window.playerCharts = [];

    const container = document.getElementById('chartsContainer');
    container.innerHTML = '';

    // --- Build Compare UI (single shared stat, single Y-axis) ---
    const comparePanel = document.getElementById('comparePanel');
    const compareChartWrapper = document.getElementById('compareChartWrapper');
    comparePanel.innerHTML = '';
    compareChartWrapper.innerHTML = '';

    const playerKeys = Object.keys(players);
    if (playerKeys.length >= 2) {
      const labelA = document.createElement('label');
      labelA.textContent = 'Player A:';
      const playerASelect = document.createElement('select');
      playerKeys.forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = k; playerASelect.appendChild(o); });

      const labelB = document.createElement('label');
      labelB.textContent = 'Player B:';
      const playerBSelect = document.createElement('select');
      playerKeys.forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = k; playerBSelect.appendChild(o); });

      // ensure the same player can't be selected twice by disabling the selected option on the other select
      function syncPlayerSelects() {
        for (let i = 0; i < playerBSelect.options.length; i++) {
          const opt = playerBSelect.options[i];
          opt.disabled = (opt.value === playerASelect.value);
        }
        // if playerB currently equals playerA, pick the first non-disabled option
        if (playerBSelect.value === playerASelect.value) {
          for (let i = 0; i < playerBSelect.options.length; i++) {
            const opt = playerBSelect.options[i];
            if (!opt.disabled) { playerBSelect.value = opt.value; break; }
          }
        }

        for (let i = 0; i < playerASelect.options.length; i++) {
          const opt = playerASelect.options[i];
          opt.disabled = (opt.value === playerBSelect.value);
        }
        if (playerASelect.value === playerBSelect.value) {
          for (let i = 0; i < playerASelect.options.length; i++) {
            const opt = playerASelect.options[i];
            if (!opt.disabled) { playerASelect.value = opt.value; break; }
          }
        }
      }
      // set initial non-equal defaults
      if (playerBSelect.value === playerASelect.value) {
        for (let i = 0; i < playerBSelect.options.length; i++) {
          if (playerBSelect.options[i].value !== playerASelect.value) { playerBSelect.value = playerBSelect.options[i].value; break; }
        }
      }
      syncPlayerSelects();
      playerASelect.addEventListener('change', syncPlayerSelects);
      playerBSelect.addEventListener('change', syncPlayerSelects);

      // single shared stat select (union of all stat names)
      const statSelect = document.createElement('select');
      const globalStatNames = new Set();
      Object.values(players).forEach(p => Object.keys(p.stats).forEach(s => globalStatNames.add(s)));
      Array.from(globalStatNames).forEach(name => { const o = document.createElement('option'); o.value = name; o.textContent = name; statSelect.appendChild(o); });
      if (globalStatNames.has('total_kills')) statSelect.value = 'total_kills';

      const compareBtn = document.createElement('button');
      compareBtn.textContent = 'Compare';

      comparePanel.appendChild(labelA);
      comparePanel.appendChild(playerASelect);
      comparePanel.appendChild(labelB);
      comparePanel.appendChild(playerBSelect);
      comparePanel.appendChild(document.createTextNode(' Stat: '));
      comparePanel.appendChild(statSelect);
      comparePanel.appendChild(compareBtn);

      let compareChart = null;
      compareBtn.addEventListener('click', () => {
        const pA = playerASelect.value; const pB = playerBSelect.value;
        const s = statSelect.value;
        if (!pA || !pB || !s) return;

        const mapA = players[pA].stats[s] || {};
        const mapB = players[pB].stats[s] || {};
        const msSet = new Set();
        Object.keys(mapA).forEach(k => msSet.add(Number(k)));
        Object.keys(mapB).forEach(k => msSet.add(Number(k)));
        const unionMs = Array.from(msSet).sort((a, b) => a - b);
        const labels = unionMs.map(ms => new Date(ms).toLocaleDateString());

        const dataA = unionMs.map(ms => (ms in mapA ? mapA[ms] : null));
        const dataB = unionMs.map(ms => (ms in mapB ? mapB[ms] : null));

  const numericAll = [...dataA, ...dataB].filter(v => v !== null && !isNaN(v));
  const minAll = numericAll.length ? Math.min(...numericAll) : 0;
  const maxAll = numericAll.length ? Math.max(...numericAll) : 1;
  // always start compare chart at zero for easier comparison
  const padMin = 0;
  // add a bit more headroom so the line doesn't end exactly at the top (5%)
  const padMax = Math.max(1, Math.round(maxAll * 1.05));

        compareChartWrapper.innerHTML = '';
        const cwrap = document.createElement('div');
        cwrap.style.border = '1px solid #ddd';
        cwrap.style.padding = '8px';
        const title = document.createElement('h3'); title.textContent = `${pA} vs ${pB} — ${s}`; title.style.margin = '0 0 8px 0';
        cwrap.appendChild(title);
        const canvas = document.createElement('canvas'); canvas.id = 'compareChart'; canvas.style.width = '100%'; canvas.style.height = '300px';
        cwrap.appendChild(canvas);
        compareChartWrapper.appendChild(cwrap);

        if (compareChart) try { compareChart.destroy(); } catch (e) {}
        const ctx = canvas.getContext('2d');
        compareChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [
              { label: `${pA}`, data: dataA, borderColor: 'rgb(54,162,235)', backgroundColor: 'rgba(54,162,235,0.2)', tension: 0.1 },
              { label: `${pB}`, data: dataB, borderColor: 'rgb(255,99,132)', backgroundColor: 'rgba(255,99,132,0.2)', tension: 0.1 }
            ]
          },
          options: {
            responsive: true,
            scales: {
              y: { beginAtZero: true, min: padMin, max: padMax, title: { display: true, text: s } }
            }
          }
        });
      });
    }

    const baseColors = [
      'rgb(75, 192, 192)',
      'rgb(255, 99, 132)',
      'rgb(54, 162, 235)',
      'rgb(255, 205, 86)',
      'rgb(153, 102, 255)',
      'rgb(201, 203, 207)'
    ];

    Object.keys(players).forEach((key, idx) => {
      const player = players[key];
      const statNames = Object.keys(player.stats);
      if (statNames.length === 0) return;

      const playerMsSet = new Set();
      Object.values(player.stats).forEach(statMap => {
        Object.keys(statMap).forEach(msKey => playerMsSet.add(Number(msKey)));
      });
      const playerMsArray = Array.from(playerMsSet).sort((a, b) => a - b);
      const playerLabels = playerMsArray.map(ms => new Date(ms).toLocaleDateString());

      const wrapper = document.createElement('div');
      wrapper.style.margin = '12px 0';
      wrapper.style.border = '1px solid #eee';
      wrapper.style.padding = '8px';

      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.gap = '12px';

      const title = document.createElement('h3');
      title.textContent = `Player: ${key}`;
      title.style.margin = '0';
      header.appendChild(title);

      const select = document.createElement('select');
      statNames.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      });
      
      if (statNames.includes('total_kills')) select.value = 'total_kills';
      header.appendChild(select);
      wrapper.appendChild(header);

      const canvas = document.createElement('canvas');
      canvas.id = `chart-${idx}`;
      canvas.style.maxWidth = '700px';
      canvas.style.width = '100%';
      canvas.style.height = '220px';
      wrapper.appendChild(canvas);
      container.appendChild(wrapper);

      const color = baseColors[idx % baseColors.length] || `hsl(${(idx * 47) % 360} 70% 50%)`;

      function buildDataForStat(statName) {
        const map = player.stats[statName] || {};
        const dataPoints = playerMsArray.map(ms => (ms in map ? map[ms] : null));
        const numericVals = dataPoints.filter(v => v !== null && !isNaN(v));
        const minV = numericVals.length ? Math.min(...numericVals) : 0;
        const maxV = numericVals.length ? Math.max(...numericVals) : 1;
        const padMin = Math.round(minV * 0.99);
        const padMax = Math.round(maxV * 1.01);
        return { dataPoints, padMin, padMax };
      }

      const ctx = canvas.getContext('2d');
      const initialStat = select.value;
      const init = buildDataForStat(initialStat);
      const chart = new Chart(ctx, {
        type: 'line',
        data: { labels: playerLabels, datasets: [{ label: initialStat, data: init.dataPoints, borderColor: color, backgroundColor: color, tension: 0.1 }] },
        options: { responsive: true, scales: { y: { beginAtZero: false, min: init.padMin, max: init.padMax } } }
      });
      window.playerCharts.push(chart);

      select.addEventListener('change', () => {
        const statName = select.value;
        const { dataPoints, padMin, padMax } = buildDataForStat(statName);
        chart.data.datasets[0].data = dataPoints;
        chart.data.datasets[0].label = statName;
        
        chart.options.scales.y.min = padMin;
        chart.options.scales.y.max = padMax;
        chart.update();
      });
    });
  })
  .catch(err => console.error('Error loading data:', err));
