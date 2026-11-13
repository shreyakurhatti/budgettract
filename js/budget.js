/**
 * budget.js
 * Handles Feature 5 (Budget Management):
 * - Set monthly budget per calendar month
 * - Track monthly expenses dynamically
 * - Calculate remaining budget and utilization percentage
 * - Warning at >= 80% utilization and alert when budget is exceeded (> 100%)
 */

import {
  storage,
  computeBudgetMetrics,
  computeCategoryBreakdown,
  getCurrentMonthKey,
  getMonthKey,
  formatFullMonthLabel,
  formatCurrency,
  escapeHTML,
} from './storage.js';

let selectedMonth = getCurrentMonthKey();

let budgetCallbacks = {
  onDataChanged: () => {},
  onToast: () => {},
  refreshIcons: () => {},
};

export function renderBudgetView() {
  const monthInput = document.getElementById('budget-month-input');
  const limitInput = document.getElementById('budget-limit-input');

  monthInput.value = selectedMonth;
  const savedLimit = storage.getBudgetForMonth(selectedMonth);
  if (document.activeElement !== limitInput) {
    limitInput.value = savedLimit > 0 ? savedLimit : '';
  }

  const transactions = storage.getTransactions();
  const metrics = computeBudgetMetrics(transactions, selectedMonth, savedLimit);

  // Period subtitle
  document.getElementById('budget-status-period').textContent = `Tracking ${formatFullMonthLabel(
    selectedMonth
  )}`;

  // Status label, progress bar & alert box
  const statusLabel = document.getElementById('budget-status-label');
  const alertBox = document.getElementById('budget-alert-box');
  const progressBar = document.getElementById('budget-progressbar');
  const progressFill = document.getElementById('budget-progress-fill');

  const clampedPct = Math.min(100, Math.max(0, metrics.utilization));
  progressFill.style.width = `${clampedPct.toFixed(1)}%`;
  progressBar.setAttribute('aria-valuenow', String(Math.round(metrics.utilization)));

  if (metrics.limit <= 0) {
    statusLabel.textContent = 'Not Configured';
    statusLabel.className = 'status-text';
    progressFill.className = 'progress-fill';
    alertBox.className = 'alert-banner hidden';
    alertBox.innerHTML = '';
  } else if (metrics.status === 'exceeded') {
    statusLabel.textContent = 'Budget Exceeded';
    statusLabel.className = 'status-text exceeded';
    progressFill.className = 'progress-fill exceeded';
    alertBox.className = 'alert-banner exceeded';
    alertBox.innerHTML = `
      <div class="alert-banner-content">
        <i data-lucide="alert-octagon"></i>
        <span>
          <strong>Alert: Monthly budget exceeded!</strong> You are ${formatCurrency(
            Math.abs(metrics.remaining)
          )} over your ${formatCurrency(metrics.limit)} budget (${metrics.utilization.toFixed(
      1
    )}% used).
        </span>
      </div>
    `;
  } else if (metrics.status === 'warning') {
    statusLabel.textContent = 'Warning (80%+)';
    statusLabel.className = 'status-text warning';
    progressFill.className = 'progress-fill warning';
    alertBox.className = 'alert-banner warning';
    alertBox.innerHTML = `
      <div class="alert-banner-content">
        <i data-lucide="alert-triangle"></i>
        <span>
          <strong>Warning: Approaching budget limit.</strong> You have used ${metrics.utilization.toFixed(
            1
          )}% of your monthly budget with ${formatCurrency(metrics.remaining)} remaining.
        </span>
      </div>
    `;
  } else {
    statusLabel.textContent = 'On Track';
    statusLabel.className = 'status-text nominal';
    progressFill.className = 'progress-fill';
    alertBox.className = 'alert-banner hidden';
    alertBox.innerHTML = '';
  }

  // Metric Displays
  document.getElementById('budget-spent-amount').textContent = formatCurrency(
    metrics.monthlyExpenses
  );
  document.getElementById('budget-percent-text').textContent =
    metrics.limit > 0 ? `${metrics.utilization.toFixed(1)}%` : '0%';

  document.getElementById('budget-limit-display').textContent =
    metrics.limit > 0 ? formatCurrency(metrics.limit) : 'Not set';
  document.getElementById('budget-expenses-display').textContent = formatCurrency(
    metrics.monthlyExpenses
  );

  const remEl = document.getElementById('budget-remaining-display');
  if (metrics.limit <= 0) {
    remEl.textContent = '—';
    remEl.className = 'metric-val tabular-nums';
  } else {
    remEl.textContent = formatCurrency(metrics.remaining);
    remEl.className = `metric-val tabular-nums ${
      metrics.remaining < 0 ? 'expense-text' : 'income-text'
    }`;
  }

  // Category Breakdown for selected month
  const monthTx = transactions.filter((tx) => getMonthKey(tx.date) === selectedMonth);
  const { items } = computeCategoryBreakdown(monthTx);
  const breakdownEl = document.getElementById('budget-category-breakdown');

  if (!items.length) {
    breakdownEl.innerHTML = `
      <p class="card-subtitle">No expenses recorded for ${escapeHTML(
        formatFullMonthLabel(selectedMonth)
      )}.</p>
    `;
  } else {
    const denominator = metrics.limit > 0 ? metrics.limit : metrics.monthlyExpenses;
    breakdownEl.innerHTML = items
      .map((item) => {
        const shareOfBudget = denominator > 0 ? (item.total / denominator) * 100 : 0;
        const shareLabel =
          metrics.limit > 0
            ? `${shareOfBudget.toFixed(1)}% of budget`
            : `${item.percentage.toFixed(1)}% of spending`;

        return `
          <div class="dist-row">
            <div class="dist-row-head">
              <span class="dist-row-name">${escapeHTML(item.category)}</span>
              <span class="dist-row-stats">
                <span class="tabular-nums">${shareLabel}</span>
                <span>·</span>
                <strong class="tabular-nums">${formatCurrency(item.total)}</strong>
              </span>
            </div>
            <div class="dist-bar-track">
              <div
                class="dist-bar-fill"
                style="width: ${Math.min(100, shareOfBudget).toFixed(
                  2
                )}%; background-color: ${escapeHTML(item.color)}"
              ></div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  budgetCallbacks.refreshIcons();
}

export function initBudgetModule(callbacks) {
  budgetCallbacks = { ...budgetCallbacks, ...callbacks };

  const monthInput = document.getElementById('budget-month-input');
  const limitInput = document.getElementById('budget-limit-input');
  const errEl = document.getElementById('budget-err-limit');
  const form = document.getElementById('budget-form');

  monthInput.value = selectedMonth;

  monthInput.addEventListener('change', (e) => {
    if (e.target.value) {
      selectedMonth = e.target.value;
      errEl.textContent = '';
      limitInput.classList.remove('invalid');
      renderBudgetView();
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errEl.textContent = '';
    limitInput.classList.remove('invalid');

    const monthKey = monthInput.value || getCurrentMonthKey();
    const limitVal = Number(limitInput.value);

    if (!Number.isFinite(limitVal) || limitVal <= 0) {
      errEl.textContent = 'Enter a valid monthly budget greater than 0.';
      limitInput.classList.add('invalid');
      return;
    }

    selectedMonth = monthKey;
    storage.saveBudgetForMonth(monthKey, limitVal);
    budgetCallbacks.onDataChanged();
    budgetCallbacks.onToast(
      `Budget for ${formatFullMonthLabel(monthKey)} set to ${formatCurrency(limitVal)}.`,
      'success'
    );
  });
}
