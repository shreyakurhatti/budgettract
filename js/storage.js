/**
 * storage.js
 * Centralized data persistence and pure financial calculation module.
 * Currently backed by window.localStorage. Designed with clean repository
 * functions so it can be swapped for REST API calls (Node/Express/SQL)
 * without changing UI modules.
 */

const STORAGE_KEYS = {
  TRANSACTIONS: 'ledgerflow_transactions_v1',
  BUDGETS: 'ledgerflow_budgets_v1',
  INITIALIZED: 'ledgerflow_initialized_v1',
};

export const EXPENSE_CATEGORIES = [
  'Food',
  'Housing',
  'Transport',
  'Utilities',
  'Entertainment',
  'Healthcare',
  'Shopping',
  'Other',
];

export const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Investments',
  'Gift',
  'Refund',
  'Other',
];

export const CATEGORY_COLORS = {
  Food: '#2563eb',
  Housing: '#0f172a',
  Transport: '#0891b2',
  Utilities: '#4f46e5',
  Entertainment: '#d97706',
  Healthcare: '#16a34a',
  Shopping: '#db2777',
  Other: '#64748b',
  Salary: '#16a34a',
  Freelance: '#0d9488',
  Investments: '#1e40af',
  Gift: '#7c3aed',
  Refund: '#0284c7',
};

// ============================================================================
// Pure Formatting & Date Helpers
// ============================================================================

export function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentMonthKey() {
  return getTodayISO().slice(0, 7);
}

export function getMonthKey(dateStr) {
  return typeof dateStr === 'string' && dateStr.length >= 7 ? dateStr.slice(0, 7) : '';
}

export function formatMonthLabel(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || '';
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function formatFullMonthLabel(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey || '';
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return dateStr;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  const abs = Math.abs(num);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return num < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function escapeHTML(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================================================
// Pure Calculation Helpers (Independent of Storage)
// ============================================================================

export function computeSummaryTotals(transactions, monthKey = getCurrentMonthKey()) {
  let totalIncome = 0;
  let totalExpenses = 0;
  let monthlyIncome = 0;
  let monthlySpending = 0;
  let expenseCount = 0;
  let incomeCount = 0;

  for (const tx of transactions) {
    const amt = Number(tx.amount) || 0;
    const isCurrentMonth = getMonthKey(tx.date) === monthKey;

    if (tx.type === 'income') {
      totalIncome += amt;
      incomeCount += 1;
      if (isCurrentMonth) monthlyIncome += amt;
    } else if (tx.type === 'expense') {
      totalExpenses += amt;
      expenseCount += 1;
      if (isCurrentMonth) monthlySpending += amt;
    }
  }

  return {
    totalIncome,
    totalExpenses,
    totalBalance: totalIncome - totalExpenses,
    monthlyIncome,
    monthlySpending,
    expenseCount,
    incomeCount,
    totalCount: transactions.length,
  };
}

export function computeCategoryBreakdown(transactions) {
  const map = new Map();
  let totalExpense = 0;

  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    const amt = Number(tx.amount) || 0;
    totalExpense += amt;
    const current = map.get(tx.category) || { category: tx.category, total: 0, count: 0 };
    current.total += amt;
    current.count += 1;
    map.set(tx.category, current);
  }

  const items = Array.from(map.values())
    .map((item) => ({
      ...item,
      percentage: totalExpense > 0 ? (item.total / totalExpense) * 100 : 0,
      color: CATEGORY_COLORS[item.category] || '#64748b',
    }))
    .sort((a, b) => b.total - a.total);

  return { items, totalExpense };
}

export function getLastNMonthKeys(n = 6, anchorMonthKey = getCurrentMonthKey()) {
  const [y, m] = anchorMonthKey.split('-').map(Number);
  const keys = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    keys.push(key);
  }
  return keys;
}

export function computeMonthlySeries(transactions, monthKeys) {
  const buckets = new Map();
  for (const key of monthKeys) {
    buckets.set(key, { monthKey: key, label: formatMonthLabel(key), income: 0, expense: 0 });
  }

  for (const tx of transactions) {
    const mKey = getMonthKey(tx.date);
    if (!buckets.has(mKey)) continue;
    const bucket = buckets.get(mKey);
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'income') bucket.income += amt;
    if (tx.type === 'expense') bucket.expense += amt;
  }

  return Array.from(buckets.values());
}

export function computeDailySpendingSeries(transactions, monthKey = getCurrentMonthKey()) {
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyTotals = Array.from({ length: daysInMonth }, (_, idx) => ({
    day: String(idx + 1),
    total: 0,
  }));

  for (const tx of transactions) {
    if (tx.type !== 'expense' || getMonthKey(tx.date) !== monthKey) continue;
    const dayNum = Number(tx.date.slice(8, 10));
    if (dayNum >= 1 && dayNum <= daysInMonth) {
      dailyTotals[dayNum - 1].total += Number(tx.amount) || 0;
    }
  }

  return dailyTotals;
}

export function computeBudgetMetrics(transactions, monthKey, budgetLimit) {
  const monthlyExpenses = transactions
    .filter((tx) => tx.type === 'expense' && getMonthKey(tx.date) === monthKey)
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

  const limit = Number(budgetLimit) || 0;
  const remaining = limit - monthlyExpenses;
  const utilization = limit > 0 ? (monthlyExpenses / limit) * 100 : 0;

  let status = 'none';
  if (limit > 0) {
    if (utilization > 100) {
      status = 'exceeded';
    } else if (utilization >= 80) {
      status = 'warning';
    } else {
      status = 'nominal';
    }
  }

  return {
    limit,
    monthlyExpenses,
    remaining,
    utilization,
    status,
  };
}

// ============================================================================
// Sample Data Generator (Anchored to Current Date for Realistic First Run)
// ============================================================================

function buildSampleTransactions() {
  const now = new Date();
  const makeDate = (monthsAgo, day) => {
    const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
    const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const clampedDay = Math.min(day, maxDay);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      clampedDay
    ).padStart(2, '0')}`;
  };

  const todayDay = now.getDate();

  return [
    {
      id: generateId(),
      title: 'Monthly Salary Deposit',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: makeDate(0, Math.min(1, todayDay)),
      description: 'Primary engineering payroll',
    },
    {
      id: generateId(),
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: makeDate(0, Math.min(2, todayDay)),
      description: 'Monthly lease payment',
    },
    {
      id: generateId(),
      title: 'Whole Foods Market',
      amount: 164.8,
      category: 'Food',
      type: 'expense',
      date: makeDate(0, Math.max(1, todayDay - 3)),
      description: 'Weekly produce and pantry groceries',
    },
    {
      id: generateId(),
      title: 'UI Design Consulting',
      amount: 850,
      category: 'Freelance',
      type: 'income',
      date: makeDate(0, Math.max(1, todayDay - 4)),
      description: 'Client dashboard audit milestone',
    },
    {
      id: generateId(),
      title: 'Electric & Fiber Internet',
      amount: 148.5,
      category: 'Utilities',
      type: 'expense',
      date: makeDate(0, Math.max(1, todayDay - 5)),
      description: 'Combined monthly utility bill',
    },
    {
      id: generateId(),
      title: 'Metro Transit Pass',
      amount: 92,
      category: 'Transport',
      type: 'expense',
      date: makeDate(0, Math.max(1, todayDay - 6)),
      description: 'Monthly commuter pass reload',
    },
    {
      id: generateId(),
      title: 'Neighborhood Bistro Dinner',
      amount: 68.4,
      category: 'Food',
      type: 'expense',
      date: makeDate(0, Math.max(1, todayDay - 2)),
      description: 'Dinner with colleagues',
    },
    {
      id: generateId(),
      title: 'Pharmacy & Dental Checkup',
      amount: 115,
      category: 'Healthcare',
      type: 'expense',
      date: makeDate(0, Math.max(1, todayDay - 1)),
      description: 'Routine checkup copay',
    },
    {
      id: generateId(),
      title: 'Monthly Salary Deposit',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: makeDate(1, 1),
      description: 'Primary engineering payroll',
    },
    {
      id: generateId(),
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: makeDate(1, 2),
      description: 'Monthly lease payment',
    },
    {
      id: generateId(),
      title: 'Trader Joe’s Groceries',
      amount: 312.25,
      category: 'Food',
      type: 'expense',
      date: makeDate(1, 11),
      description: 'Bi-weekly groceries',
    },
    {
      id: generateId(),
      title: 'Streaming & Cloud Subscriptions',
      amount: 54.99,
      category: 'Entertainment',
      type: 'expense',
      date: makeDate(1, 16),
      description: 'Music, film, and storage plans',
    },
    {
      id: generateId(),
      title: 'Winter Running Jacket',
      amount: 185,
      category: 'Shopping',
      type: 'expense',
      date: makeDate(1, 21),
      description: 'Outdoor apparel',
    },
    {
      id: generateId(),
      title: 'Monthly Salary Deposit',
      amount: 5400,
      category: 'Salary',
      type: 'income',
      date: makeDate(2, 1),
      description: 'Primary engineering payroll',
    },
    {
      id: generateId(),
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: makeDate(2, 2),
      description: 'Monthly lease payment',
    },
    {
      id: generateId(),
      title: 'Quarterly Dividend Payout',
      amount: 320,
      category: 'Investments',
      type: 'income',
      date: makeDate(2, 15),
      description: 'Index fund distribution',
    },
    {
      id: generateId(),
      title: 'Grocery & Household Supplies',
      amount: 295.6,
      category: 'Food',
      type: 'expense',
      date: makeDate(2, 18),
      description: 'Monthly stock-up',
    },
    {
      id: generateId(),
      title: 'Train Tickets & Rideshare',
      amount: 142,
      category: 'Transport',
      type: 'expense',
      date: makeDate(2, 24),
      description: 'Weekend regional trip',
    },
    {
      id: generateId(),
      title: 'Monthly Salary Deposit',
      amount: 5100,
      category: 'Salary',
      type: 'income',
      date: makeDate(3, 1),
      description: 'Primary engineering payroll',
    },
    {
      id: generateId(),
      title: 'Apartment Rent & Utilities',
      amount: 1580,
      category: 'Housing',
      type: 'expense',
      date: makeDate(3, 3),
      description: 'Monthly rent and water',
    },
    {
      id: generateId(),
      title: 'Groceries & Coffee',
      amount: 340,
      category: 'Food',
      type: 'expense',
      date: makeDate(3, 14),
      description: 'Monthly food expenses',
    },
    {
      id: generateId(),
      title: 'Monthly Salary Deposit',
      amount: 5100,
      category: 'Salary',
      type: 'income',
      date: makeDate(4, 1),
      description: 'Primary engineering payroll',
    },
    {
      id: generateId(),
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: makeDate(4, 2),
      description: 'Monthly lease payment',
    },
    {
      id: generateId(),
      title: 'Concert & Museum Tickets',
      amount: 165,
      category: 'Entertainment',
      type: 'expense',
      date: makeDate(4, 19),
      description: 'Weekend cultural events',
    },
    {
      id: generateId(),
      title: 'Monthly Salary Deposit',
      amount: 5100,
      category: 'Salary',
      type: 'income',
      date: makeDate(5, 1),
      description: 'Primary engineering payroll',
    },
    {
      id: generateId(),
      title: 'Apartment Rent',
      amount: 1450,
      category: 'Housing',
      type: 'expense',
      date: makeDate(5, 2),
      description: 'Monthly lease payment',
    },
    {
      id: generateId(),
      title: 'Grocery Market',
      amount: 278,
      category: 'Food',
      type: 'expense',
      date: makeDate(5, 12),
      description: 'Fresh food & staples',
    },
  ];
}

// ============================================================================
// Centralized Storage Repository (LocalStorage Adapter)
// ============================================================================

export const storage = {
  init() {
    const initialized = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
    if (!initialized) {
      this.seedSampleData();
    }
  },

  getTransactions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error('Failed to read transactions from LocalStorage:', err);
      return [];
    }
  },

  saveTransactions(transactions) {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
    localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    return transactions;
  },

  addTransaction(txInput) {
    const transactions = this.getTransactions();
    const newTx = {
      id: generateId(),
      title: String(txInput.title).trim(),
      amount: Number(Number(txInput.amount).toFixed(2)),
      category: String(txInput.category),
      type: txInput.type === 'income' ? 'income' : 'expense',
      date: String(txInput.date),
      description: String(txInput.description || '').trim(),
    };
    transactions.unshift(newTx);
    this.saveTransactions(transactions);
    return newTx;
  },

  updateTransaction(id, txInput) {
    const transactions = this.getTransactions();
    const idx = transactions.findIndex((tx) => tx.id === id);
    if (idx === -1) return null;

    const updated = {
      ...transactions[idx],
      title: String(txInput.title).trim(),
      amount: Number(Number(txInput.amount).toFixed(2)),
      category: String(txInput.category),
      type: txInput.type === 'income' ? 'income' : 'expense',
      date: String(txInput.date),
      description: String(txInput.description || '').trim(),
    };

    transactions[idx] = updated;
    this.saveTransactions(transactions);
    return updated;
  },

  deleteTransaction(id) {
    const transactions = this.getTransactions();
    const next = transactions.filter((tx) => tx.id !== id);
    this.saveTransactions(next);
    return next.length !== transactions.length;
  },

  getBudgets() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.BUDGETS);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      console.error('Failed to read budgets from LocalStorage:', err);
      return {};
    }
  },

  getBudgetForMonth(monthKey = getCurrentMonthKey()) {
    const budgets = this.getBudgets();
    if (Object.prototype.hasOwnProperty.call(budgets, monthKey)) {
      return Number(budgets[monthKey]) || 0;
    }
    return 0;
  },

  saveBudgetForMonth(monthKey, limitAmount) {
    const budgets = this.getBudgets();
    budgets[monthKey] = Number(Number(limitAmount).toFixed(2));
    localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(budgets));
    localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    return budgets[monthKey];
  },

  seedSampleData() {
    const sample = buildSampleTransactions();
    this.saveTransactions(sample);
    const currentMonth = getCurrentMonthKey();
    const budgets = { [currentMonth]: 2500 };
    localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify(budgets));
    localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    return sample;
  },

  clearAllData() {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.BUDGETS, JSON.stringify({}));
    localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  },

  exportTransactionsCSV() {
    const transactions = this.getTransactions();
    const headers = ['ID', 'Date', 'Type', 'Title', 'Category', 'Amount', 'Description'];
    const escapeCSV = (val) => {
      const str = String(val ?? '');
      if (/[",\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = transactions.map((tx) =>
      [tx.id, tx.date, tx.type, tx.title, tx.category, tx.amount, tx.description]
        .map(escapeCSV)
        .join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  },
};
