/**
 * analytics.js
 * Handles Feature 4 (Expense Analytics):
 * - Timeframe filtering (6 Months, This Month, All Time)
 * - Total Savings & Savings Rate, Highest Spending Category, Average Monthly Spend
 * - Dynamic Chart.js Monthly Income vs Expenses grouped bar chart
 * - Dynamic Chart.js Category-Wise Expense Breakdown horizontal bar chart
 * - Spending Distribution breakdown list
 */

import {
  storage,
  computeCategoryBreakdown,
  computeMonthlySeries,
  getLastNMonthKeys,
  getCurrentMonthKey,
  getMonthKey,
  formatCurrency,
  escapeHTML,
} from './storage.js';

let activeRange = '6m'; // '6m' | '1m' | 'all'
let monthlyChart = null;
let categoryChart = null;

function filterTransactionsByRange(transactions, range) {
  const currentMonth = getCurrentMonthKey();

  if (range === '1m') {
    return transactions.filter((tx) => getMonthKey(tx.date) === currentMonth);
  }

  if (range === '6m') {
    const allowedMonths = new Set(getLastNMonthKeys(6, currentMonth));
    return transactions.filter((tx) => allowedMonths.has(getMonthKey(tx.date)));
  }

  return transactions;
}

function getMonthKeysForRange(transactions, range) {
  const currentMonth = getCurrentMonthKey();
  if (range === '1m') return [currentMonth];
  if (range === '6m') return getLastNMonthKeys(6, currentMonth);

  const uniqueMonths = Array.from(
    new Set(transactions.map((tx) => getMonthKey(tx.date)).filter(Boolean))
  ).sort();

  return uniqueMonths.length ? uniqueMonths : [currentMonth];
}

export function renderAnalyticsView() {
  const allTransactions = storage.getTransactions();
  const scoped = filterTransactionsByRange(allTransactions, activeRange);
  const monthKeys = getMonthKeysForRange(scoped, activeRange);

  let periodIncome = 0;
  let periodExpense = 0;
  let expenseCount = 0;

  for (const tx of scoped) {
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'income') {
      periodIncome += amt;
    } else if (tx.type === 'expense') {
      periodExpense += amt;
      expenseCount += 1;
    }
  }

  // 1. Total Savings & Savings Rate
  const totalSavings = periodIncome - periodExpense;
  const savingsRate = periodIncome > 0 ? (totalSavings / periodIncome) * 100 : 0;

  const savingsEl = document.getElementById('analytics-total-savings');
  savingsEl.textContent = formatCurrency(totalSavings);
  savingsEl.className = `kpi-value tabular-nums ${
    totalSavings >= 0 ? 'income-text' : 'expense-text'
  }`;

  document.getElementById('analytics-savings-rate').textContent =
    periodIncome > 0
      ? `${savingsRate.toFixed(1)}% savings rate`
      : 'No income recorded in period';

  // 2. Highest Spending Category
  const { items: catItems } = computeCategoryBreakdown(scoped);
  const topCatEl = document.getElementById('analytics-top-category');
  const topCatMetaEl = document.getElementById('analytics-top-category-meta');

  if (catItems.length > 0) {
    const top = catItems[0];
    topCatEl.textContent = top.category;
    topCatMetaEl.textContent = `${formatCurrency(top.total)} (${top.percentage.toFixed(
      1
    )}% of expenses)`;
  } else {
    topCatEl.textContent = '—';
    topCatMetaEl.textContent = 'No expense data in period';
  }

  // 3. Average Monthly Spend
  const activeExpenseMonths = new Set(
    scoped.filter((tx) => tx.type === 'expense').map((tx) => getMonthKey(tx.date))
  );
  const divisor = activeExpenseMonths.size || 1;
  const avgSpend = periodExpense / divisor;

  document.getElementById('analytics-avg-spend').textContent = formatCurrency(avgSpend);
  document.getElementById('analytics-avg-meta').textContent =
    activeExpenseMonths.size > 0
      ? `Across ${activeExpenseMonths.size} active ${
          activeExpenseMonths.size === 1 ? 'month' : 'months'
        }`
      : 'No active expense months';

  // 4. Period Outflow
  document.getElementById('analytics-period-expense').textContent =
    formatCurrency(periodExpense);
  document.getElementById('analytics-period-count').textContent = `${expenseCount} expense ${
    expenseCount === 1 ? 'entry' : 'entries'
  }`;

  // 5. Render Charts & Distribution List
  renderMonthlyComparisonChart(scoped, monthKeys);
  renderCategoryBreakdownChart(catItems);
  renderSpendingDistribution(catItems);
}

function renderMonthlyComparisonChart(transactions, monthKeys) {
  const canvas = document.getElementById('chart-analytics-monthly');
  const emptyEl = document.getElementById('empty-analytics-monthly');

  if (monthlyChart) {
    monthlyChart.destroy();
    monthlyChart = null;
  }

  const series = computeMonthlySeries(transactions, monthKeys);
  const hasData = series.some((s) => s.income > 0 || s.expense > 0);

  if (!hasData || typeof window.Chart === 'undefined') {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  monthlyChart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: series.map((s) => s.label),
      datasets: [
        {
          label: 'Income',
          data: series.map((s) => s.income),
          backgroundColor: '#16a34a',
          borderRadius: 4,
          maxBarThickness: 26,
        },
        {
          label: 'Expenses',
          data: series.map((s) => s.expense),
          backgroundColor: '#dc2626',
          borderRadius: 4,
          maxBarThickness: 26,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: 'rectRounded',
            font: { family: "'DM Sans', sans-serif", size: 12 },
            color: '#475569',
          },
        },
        tooltip: {
          backgroundColor: '#0f172a',
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#64748b',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
          },
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: '#f1f5f9' },
          ticks: {
            color: '#64748b',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            callback: (val) => `$${Number(val).toLocaleString('en-US')}`,
          },
        },
      },
    },
  });
}

function renderCategoryBreakdownChart(catItems) {
  const canvas = document.getElementById('chart-analytics-category');
  const emptyEl = document.getElementById('empty-analytics-category');

  if (categoryChart) {
    categoryChart.destroy();
    categoryChart = null;
  }

  if (!catItems.length || typeof window.Chart === 'undefined') {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  categoryChart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: catItems.map((c) => c.category),
      datasets: [
        {
          label: 'Total Spent',
          data: catItems.map((c) => c.total),
          backgroundColor: catItems.map((c) => c.color),
          borderRadius: 4,
          maxBarThickness: 22,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (ctx) => {
              const item = catItems[ctx.dataIndex];
              return `${formatCurrency(item.total)} (${item.percentage.toFixed(1)}%)`;
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: '#f1f5f9' },
          ticks: {
            color: '#64748b',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            callback: (val) => `$${Number(val).toLocaleString('en-US')}`,
          },
        },
        y: {
          grid: { display: false },
          ticks: {
            color: '#0f172a',
            font: { family: "'DM Sans', sans-serif", size: 12, weight: '500' },
          },
        },
      },
    },
  });
}

function renderSpendingDistribution(catItems) {
  const container = document.getElementById('analytics-distribution-list');
  if (!catItems.length) {
    container.innerHTML = `
      <p class="card-subtitle">No expense transactions found for the selected timeframe.</p>
    `;
    return;
  }

  container.innerHTML = catItems
    .map(
      (item) => `
      <div class="dist-row">
        <div class="dist-row-head">
          <span class="dist-row-name">${escapeHTML(item.category)}</span>
          <span class="dist-row-stats">
            <span>${item.count} ${item.count === 1 ? 'entry' : 'entries'}</span>
            <span>·</span>
            <span class="tabular-nums">${item.percentage.toFixed(1)}%</span>
            <span>·</span>
            <strong class="tabular-nums">${formatCurrency(item.total)}</strong>
          </span>
        </div>
        <div class="dist-bar-track">
          <div
            class="dist-bar-fill"
            style="width: ${Math.min(100, item.percentage).toFixed(2)}%; background-color: ${escapeHTML(
              item.color
            )}"
          ></div>
        </div>
      </div>
    `
    )
    .join('');
}

export function initAnalyticsModule() {
  document.querySelectorAll('[data-analytics-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeRange = btn.getAttribute('data-analytics-range');
      document.querySelectorAll('[data-analytics-range]').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      renderAnalyticsView();
    });
  });
}
