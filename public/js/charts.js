/** Chart.js configuration for the mood graph (purple, emoji y-axis). */

const EMOJIS = { 1: '😢', 2: '☹️', 3: '😐', 4: '😊', 5: '😄' };
const LABELS = { 1: 'Very Sad', 2: 'Sad', 3: 'Neutral', 4: 'Happy', 5: 'Very Happy' };

const registry = new WeakMap();

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function shortLabel(entry, index, entries) {
  const date = new Date(entry.timestamp);
  if (Number.isNaN(date.getTime())) return `#${index + 1}`;
  const day = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const sameDay = entries.filter((item) => {
    const other = new Date(item.timestamp);
    return other.toDateString() === date.toDateString();
  }).length;
  if (!sameDay || sameDay === 1) return day;
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function renderMoodChart(canvas, entries, { compact = false } = {}) {
  if (!canvas || !window.Chart) return null;
  const existing = window.Chart.getChart(canvas);
  if (existing) existing.destroy();

  const list = Array.isArray(entries) ? entries : [];
  registry.set(canvas, { entries: list, compact });

  const grid = cssVar('--line', '#ebe3f7');
  const ink = cssVar('--ink-soft', '#4e4366');
  const muted = cssVar('--ink-faint', '#a89ec0');
  const surface = cssVar('--surface', '#ffffff');
  const brand = cssVar('--brand-600', '#7c3aed');

  const context = canvas.getContext('2d');
  const height = canvas.parentElement?.clientHeight || 240;
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(139, 92, 246, 0.32)');
  gradient.addColorStop(0.65, 'rgba(139, 92, 246, 0.09)');
  gradient.addColorStop(1, 'rgba(139, 92, 246, 0.01)');

  return new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: list.map((entry, index) => shortLabel(entry, index, list)),
      datasets: [
        {
          label: 'Mood',
          data: list.map((entry) => entry.mood),
          borderColor: brand,
          borderWidth: compact ? 2.2 : 2.6,
          backgroundColor: gradient,
          fill: true,
          tension: 0.38,
          pointRadius: compact ? 2.6 : 3.6,
          pointHoverRadius: 6,
          pointBackgroundColor: surface,
          pointBorderColor: brand,
          pointBorderWidth: 2,
          pointHoverBackgroundColor: brand,
          pointHoverBorderColor: surface,
          pointHoverBorderWidth: 2,
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 10, right: 6, bottom: 2, left: 2 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: cssVar('--ink', '#251b3b'),
          titleColor: '#ffffff',
          bodyColor: '#ede9fe',
          padding: 10,
          cornerRadius: 9,
          displayColors: false,
          titleFont: { family: 'Segoe UI, system-ui, sans-serif', size: 11, weight: '600' },
          bodyFont: { family: 'Segoe UI, system-ui, sans-serif', size: 12, weight: '500' },
          callbacks: {
            title(items) {
              const entry = list[items[0]?.dataIndex];
              if (!entry) return '';
              return new Date(entry.timestamp).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              });
            },
            label(item) {
              const level = Number(item.raw);
              return `${EMOJIS[level] || '🌱'}  ${LABELS[level] || 'Mood'} (${level}/5)`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: muted,
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: compact ? 5 : 8,
            font: { family: 'Segoe UI, system-ui, sans-serif', size: compact ? 10 : 11 },
            padding: 6,
          },
        },
        y: {
          min: 0.55,
          max: 5.45,
          grid: { color: grid, drawTicks: false },
          border: { display: false },
          ticks: {
            stepSize: 1,
            color: ink,
            padding: 10,
            font: { size: compact ? 14 : 16 },
            callback(value) {
              return EMOJIS[value] || '';
            },
          },
        },
      },
    },
  });
}

/** Re-renders every live mood chart (used after a theme change). */
export function refreshCharts() {
  for (const canvas of document.querySelectorAll('canvas')) {
    const config = registry.get(canvas);
    if (config) renderMoodChart(canvas, config.entries, { compact: config.compact });
  }
}

export function destroyChartsIn(root = document) {
  if (!window.Chart) return;
  for (const canvas of root.querySelectorAll('canvas')) {
    const chart = window.Chart.getChart(canvas);
    if (chart) chart.destroy();
  }
}
