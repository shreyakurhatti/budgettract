/**
 * app.js
 * Main application coordinator:
 * - Initializes storage and all feature modules
 * - Manages SPA view navigation (Dashboard, Transactions, Add Entry, Analytics, Budget)
 * - Coordinates cross-module data refreshes, confirmation modal, toasts, and CSV export
 */

import { storage, getCurrentMonthKey, formatFullMonthLabel } from './storage.js';
import {
  initTransactionsModule,
  renderTransactionsView,
  openTransactionModal,
} from './transactions.js';
import { initDashboardModule, renderDashboardView } from './dashboard.js';
import { initAnalyticsModule, renderAnalyticsView } from './analytics.js';
import { initBudgetModule, renderBudgetView } from './budget.js';

const VIEW_META = {
  dashboard: {
    title: 'Dashboard',
    subtitle: () => `Financial overview · ${formatFullMonthLabel(getCurrentMonthKey())}`,
  },
  transactions: {
    title: 'Transactions',
    subtitle: () => 'Search, filter, edit, and audit your complete ledger',
  },
  add: {
    title: 'Add Entry',
    subtitle: () => 'Log new income or expense transactions',
  },
  analytics: {
    title: 'Expense Analytics',
    subtitle: () => 'Monthly cashflow, category distribution, and savings insights',
  },
  budget: {
    title: 'Budget Management',
    subtitle: () => 'Monthly spending limits and threshold alerts',
  },
};

let activeView = 'dashboard';
let pendingConfirmAction = null;

function refreshIcons() {
  if (typeof window.lucide !== 'undefined' && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function showToast(message, variant = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${variant}`;
  const iconName = variant === 'error' ? 'alert-circle' : 'check-circle-2';
  toast.innerHTML = `<i data-lucide="${iconName}"></i><span></span>`;
  toast.querySelector('span').textContent = message;

  container.appendChild(toast);
  refreshIcons();

  setTimeout(() => {
    toast.remove();
  }, 3200);
}

function openConfirmModal({ title, message, confirmText = 'Confirm', onConfirm }) {
  const modal = document.getElementById('confirm-modal');
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-ok-btn').textContent = confirmText;

  pendingConfirmAction = onConfirm;
  modal.classList.remove('hidden');
}

function closeConfirmModal() {
  document.getElementById('confirm-modal').classList.add('hidden');
  pendingConfirmAction = null;
}

function setSidebarOpen(isOpen) {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  sidebar.classList.toggle('open', isOpen);
  backdrop.classList.toggle('open', isOpen);
}

function navigateTo(viewName) {
  if (!VIEW_META[viewName]) return;
  activeView = viewName;

  // Toggle view sections
  document.querySelectorAll('.view-section').forEach((section) => {
    section.classList.toggle('active', section.id === `view-${viewName}`);
  });

  // Update sidebar nav active state
  document.querySelectorAll('.nav-item[data-nav]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-nav') === viewName);
  });

  // Update topbar title & subtitle
  const meta = VIEW_META[viewName];
  document.getElementById('topbar-title').textContent = meta.title;
  document.getElementById('topbar-subtitle').textContent = meta.subtitle();

  // Close mobile drawer
  setSidebarOpen(false);

  // Render active view so Chart.js canvases resize cleanly while visible
  renderActiveView();
}

function renderActiveView() {
  if (activeView === 'dashboard') {
    renderDashboardView();
  } else if (activeView === 'transactions') {
    renderTransactionsView();
  } else if (activeView === 'add') {
    renderTransactionsView();
  } else if (activeView === 'analytics') {
    renderAnalyticsView();
  } else if (activeView === 'budget') {
    renderBudgetView();
  }
}

function refreshAllViews() {
  renderDashboardView();
  renderTransactionsView();
  renderAnalyticsView();
  renderBudgetView();
  refreshIcons();
}

function handleExportCSV() {
  const csv = storage.exportTransactionsCSV();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ledgerflow-transactions-${getCurrentMonthKey()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast('Transactions exported as CSV.', 'success');
}

function initApp() {
  // Initialize LocalStorage repository (seeds realistic data on very first launch)
  storage.init();

  const sharedCallbacks = {
    onDataChanged: refreshAllViews,
    onRequestConfirm: openConfirmModal,
    onToast: showToast,
    onNavigate: navigateTo,
    refreshIcons,
  };

  initTransactionsModule(sharedCallbacks);
  initDashboardModule(sharedCallbacks);
  initAnalyticsModule();
  initBudgetModule(sharedCallbacks);

  // Navigation clicks
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const target = el.getAttribute('data-nav');
      navigateTo(target);
    });
  });

  // Mobile sidebar controls
  document.getElementById('sidebar-open-btn').addEventListener('click', () => setSidebarOpen(true));
  document.getElementById('sidebar-close-btn').addEventListener('click', () => setSidebarOpen(false));
  document.getElementById('sidebar-backdrop').addEventListener('click', () => setSidebarOpen(false));

  // Quick Add CTA in topbar
  document.getElementById('btn-quick-add').addEventListener('click', () => {
    openTransactionModal(null);
  });

  // Confirm Modal actions
  document.getElementById('confirm-ok-btn').addEventListener('click', () => {
    if (typeof pendingConfirmAction === 'function') {
      pendingConfirmAction();
    }
    closeConfirmModal();
  });
  document.getElementById('confirm-cancel-btn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirm-close-btn').addEventListener('click', closeConfirmModal);
  document.getElementById('confirm-modal').addEventListener('click', (e) => {
    if (e.target.id === 'confirm-modal') closeConfirmModal();
  });

  // Escape key closes open modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.getElementById('transaction-modal').classList.add('hidden');
      closeConfirmModal();
      setSidebarOpen(false);
    }
  });

  // Sidebar Data Controls
  document.getElementById('btn-export-csv').addEventListener('click', handleExportCSV);

  document.getElementById('btn-seed-demo').addEventListener('click', () => {
    openConfirmModal({
      title: 'Load Sample Data',
      message:
        'This will replace your current transactions and budget with a multi-month sample dataset. Continue?',
      confirmText: 'Load Sample Data',
      onConfirm: () => {
        storage.seedSampleData();
        refreshAllViews();
        showToast('Sample dataset loaded.', 'success');
      },
    });
  });

  document.getElementById('btn-clear-all').addEventListener('click', () => {
    openConfirmModal({
      title: 'Clear All Data',
      message:
        'This will permanently delete all recorded transactions and monthly budgets from LocalStorage.',
      confirmText: 'Clear Everything',
      onConfirm: () => {
        storage.clearAllData();
        refreshAllViews();
        showToast('All ledger data cleared.', 'success');
      },
    });
  });

  // Initial view render
  navigateTo('dashboard');
  refreshIcons();
}

document.addEventListener('DOMContentLoaded', initApp);
