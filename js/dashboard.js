/**
 * dashboard.js
 * Handles Feature 1 (Dashboard):
 * - Total Balance, Total Income, Total Expenses, Monthly Spending KPIs
 * - Budget threshold alert banner
 * - Monthly Spending Overview chart (6-month cashflow vs current month daily toggle)
 * - Expense Category Breakdown doughnut chart & legend
 * - Recent Transactions ledger table
 */

import {
  storage,
  computeSummaryTotals,
  computeCategoryBreakdown,
  computeMonthlySeries,
  computeDailySpendingSeries,
  computeBudgetMetrics,
  getLastNMonthKeys,
  getCurrentMonthKey,
  formatFullMonthLabel,
  formatCurrency,
  getMonthKey,
  escapeHTML,
} from './storage.js';
import { renderTransactionTableHTML, sortTransactions } from './transactions.js';

let overviewMode = '6months'; // '6months' | 'daily'
let overviewChart = null;
let categoryChart = null;

let dashboardCallbacks = {
  onNavigate: () => {},
  refreshIcons: () => {},
};

export function renderDashboardView() {
  const transactions = storage.getTransactions();
  const currentMonth = getCurrentMonthKey();
  const budgetLimit = storage.getBudgetForMonth(currentMonth);

  // 1. Dynamic Summary KPIs
  const summary = computeSummaryTotals(transactions, currentMonth);
  const budgetMetrics = computeBudgetMetrics(transactions, currentMonth, budgetLimit);

  const balanceEl = document.getElementById('kpi-total-balance');
  balanceEl.textContent = formatCurrency(summary.totalBalance);
  balanceEl.className = `kpi-value tabular-nums ${
    summary.totalBalance < 0 ? 'expense-text' : ''
  }`;

  document.getElementById('kpi-balance-meta').textContent =
    summary.totalCount > 0
      ? `Across ${summary.totalCount} total ${summary.totalCount === 1 ? 'entry' : 'entries'}`
      : 'No entries recorded yet';

  document.getElementById('kpi-total-income').textContent = formatCurrency(summary.totalIncome);
  document.getElementById('kpi-income-meta').textContent = `${formatCurrency(
    summary.monthlyIncome
  )} in ${formatFullMonthLabel(currentMonth)}`;

  document.getElementById('kpi-total-expenses').textContent = formatCurrency(
    summary.totalExpenses
  );
  document.getElementById('kpi-expenses-meta').textContent = `${summary.expenseCount} expense ${
    summary.expenseCount === 1 ? 'entry' : 'entries'
  }`;

  document.getElementById('kpi-monthly-spending').textContent = formatCurrency(
    summary.monthlySpending
  );

  const monthlyMetaEl = document.getElementById('kpi-monthly-meta');
  if (budgetLimit > 0) {
    monthlyMetaEl.textContent = `${budgetMetrics.utilization.toFixed(0)}% of ${formatCurrency(
      budgetLimit
    )} budget`;
  } else {
    monthlyMetaEl.textContent = `For ${formatFullMonthLabel(currentMonth)} · No budget set`;
  }

  // 2. Dashboard Budget Alert Banner (at >= 80% or > 100%)
  const alertEl = document.getElementById('dashboard-budget-alert');
  if (budgetMetrics.status === 'exceeded') {
    alertEl.className = 'alert-banner exceeded';
    alertEl.innerHTML = `
      <div class="alert-banner-content">
        <i data-lucide="alert-octagon"></i>
        <span>
          <strong>Budget Exceeded:</strong> Monthly spending (${formatCurrency(
            budgetMetrics.monthlyExpenses
          )}) has exceeded your ${formatCurrency(budgetLimit)} limit by ${formatCurrency(
      Math.abs(budgetMetrics.remaining)
    )}.
        </span>
      </div>
      <button type="button" class="btn btn-secondary" id="btn-dash-go-budget">Manage Budget</button>
    `;
  } else if (budgetMetrics.status === 'warning') {
    alertEl.className = 'alert-banner warning';
    alertEl.innerHTML = `
      <div class="alert-banner-content">
        <i data-lucide="alert-triangle"></i>
        <span>
          <strong>Budget Warning:</strong> You have used ${budgetMetrics.utilization.toFixed(
            1
          )}% of your ${formatCurrency(budgetLimit)} monthly budget (${formatCurrency(
      budgetMetrics.remaining
    )} remaining).
        </span>
      </div>
      <button type="button" class="btn btn-secondary" id="btn-dash-go-budget">Review Budget</button>
    `;
  } else {
    alertEl.className = 'alert-banner hidden';
    alertEl.innerHTML = '';
  }

  const goBudgetBtn = document.getElementById('btn-dash-go-budget');
  if (goBudgetBtn) {
    goBudgetBtn.addEventListener('click', () => dashboardCallbacks.onNavigate('budget'));
  }

  // 3. Overview Chart
  renderOverviewChart(transactions, currentMonth);

  // 4. Category Breakdown Doughnut Chart
  renderCategoryDoughnut(transactions, currentMonth);

  // 5. Recent Transactions Table (top 6)
  const recent = sortTransactions(transactions, 'date-desc').slice(0, 6);
  const recentContainer = document.getElementById('recent-transactions-container');
  recentContainer.innerHTML = renderTransactionTableHTML(recent, {
    emptyTitle: 'No transactions yet',
    emptyDesc: 'Add your first income or expense entry to populate your dashboard.',
  });

  dashboardCallbacks.refreshIcons();
}

function renderOverviewChart(transactions, currentMonth) {
  const canvas = document.getElementById('chart-dashboard-overview');
  const emptyEl = document.getElementById('empty-dashboard-overview');
  const subtitleEl = document.getElementById('dashboard-overview-subtitle');

  if (overviewChart) {
    overviewChart.destroy();
    overviewChart = null;
  }

  if (typeof window.Chart === 'undefined') {
    emptyEl.textContent = 'Chart library unavailable.';
    emptyEl.classList.remove('hidden');
    return;
  }

  let labels = [];
  let datasets = [];
  let hasData = false;

  if (overviewMode === 'daily') {
    subtitleEl.textContent = `Daily expenses during ${formatFullMonthLabel(currentMonth)}`;
    const daily = computeDailySpendingSeries(transactions, currentMonth);
    hasData = daily.some((d) => d.total > 0);
    labels = daily.map((d) => d.day);
    datasets = [
      {
        label: 'Daily Spending',
        data: daily.map((d) => d.total),
        backgroundColor: '#1e40af',
        borderRadius: 4,
        maxBarThickness: 18,
      },
    ];
  } else {
    subtitleEl.textContent = 'Last 6 months income vs expenses';
    const monthKeys = getLastNMonthKeys(6, currentMonth);
    const series = computeMonthlySeries(transactions, monthKeys);
    hasData = series.some((s) => s.income > 0 || s.expense > 0);
    labels = series.map((s) => s.label);
    datasets = [
      {
        label: 'Income',
        data: series.map((s) => s.income),
        backgroundColor: '#16a34a',
        borderRadius: 4,
        maxBarThickness: 22,
      },
      {
        label: 'Expenses',
        data: series.map((s) => s.expense),
        backgroundColor: '#dc2626',
        borderRadius: 4,
        maxBarThickness: 22,
      },
    ];
  }

  if (!hasData) {
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  overviewChart = new window.Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: overviewMode === '6months',
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

function renderCategoryDoughnut(transactions, currentMonth) {
  const canvas = document.getElementById('chart-dashboard-categories');
  const emptyEl = document.getElementById('empty-dashboard-categories');
  const legendEl = document.getElementById('dashboard-category-legend');

  if (categoryChart) {
    categoryChart.destroy();
    categoryChart = null;
  }

  const monthTransactions = transactions.filter((tx) => getMonthKey(tx.date) === currentMonth);
  const { items } = computeCategoryBreakdown(monthTransactions);

  if (!items.length || typeof window.Chart === 'undefined') {
    emptyEl.classList.remove('hidden');
    legendEl.innerHTML = '';
    return;
  }
  emptyEl.classList.add('hidden');

  categoryChart = new window.Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: items.map((i) => i.category),
      datasets: [
        {
          data: items.map((i) => i.total),
          backgroundColor: items.map((i) => i.color),
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '66%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: (ctx) => {
              const item = items[ctx.dataIndex];
              return `${item.category}: ${formatCurrency(item.total)} (${item.percentage.toFixed(
                1
              )}%)`;
            },
          },
        },
      },
    },
  });

  legendEl.innerHTML = items
    .slice(0, 6)
    .map(
      (item) => `
      <div class="legend-item">
        <span class="legend-label">
          <span class="legend-swatch" style="background-color: ${escapeHTML(item.color)}"></span>
          <span>${escapeHTML(item.category)}</span>
        </span>
        <span class="legend-val tabular-nums">${item.percentage.toFixed(0)}%</span>
      </div>
    `
    )
    .join('');
}

export function initDashboardModule(callbacks) {
  dashboardCallbacks = { ...dashboardCallbacks, ...callbacks };

  document.querySelectorAll('[data-overview-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      overviewMode = btn.getAttribute('data-overview-mode');
      document.querySelectorAll('[data-overview-mode]').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      renderDashboardView();
    });
  });

  const viewAllBtn = document.getElementById('btn-view-all-tx');
  if (viewAllBtn) {
    viewAllBtn.addEventListener('click', () => dashboardCallbacks.onNavigate('transactions'));
  }
}
