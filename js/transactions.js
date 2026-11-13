/**
 * transactions.js
 * Handles Feature 2 (Income & Expense Management) and Feature 3 (Transaction History):
 * - Form rendering, category syncing, and validation (Modal + Add Entry page)
 * - Transaction ledger table with search, category filter, type filter, and sorting
 * - Edit and Delete triggers
 */

import {
  storage,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  formatCurrency,
  formatDate,
  getTodayISO,
  escapeHTML,
} from './storage.js';

const filterState = {
  search: '',
  type: 'all',
  category: 'all',
  sort: 'date-desc',
};

let appCallbacks = {
  onDataChanged: () => {},
  onRequestConfirm: () => {},
  onToast: () => {},
  onNavigate: () => {},
  refreshIcons: () => {},
};

// ============================================================================
// Form Helpers & Validation
// ============================================================================

export function populateCategorySelect(selectEl, type, selectedValue = '') {
  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  selectEl.innerHTML = categories
    .map((cat) => `<option value="${escapeHTML(cat)}">${escapeHTML(cat)}</option>`)
    .join('');

  if (selectedValue && categories.includes(selectedValue)) {
    selectEl.value = selectedValue;
  } else if (categories.length > 0) {
    selectEl.value = categories[0];
  }
}

export function validateTransactionInput(data) {
  const errors = {};
  const title = String(data.title || '').trim();
  const amount = Number(data.amount);
  const category = String(data.category || '').trim();
  const date = String(data.date || '').trim();
  const type = data.type === 'income' ? 'income' : 'expense';

  if (title.length < 2) {
    errors.title = 'Enter a title of at least 2 characters.';
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    errors.amount = 'Enter a valid amount greater than 0.';
  } else if (amount > 999999999) {
    errors.amount = 'Amount exceeds maximum allowed limit.';
  }

  const validCats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  if (!category || !validCats.includes(category)) {
    errors.category = 'Please select a valid category.';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.date = 'Select a valid date.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

function clearFormErrors(prefix) {
  ['title', 'amount', 'category', 'date', 'description'].forEach((field) => {
    const errEl = document.getElementById(`${prefix}-err-${field}`);
    const inputEl = document.getElementById(`${prefix}-tx-${field}`);
    if (errEl) errEl.textContent = '';
    if (inputEl) inputEl.classList.remove('invalid');
  });
}

function showFormErrors(prefix, errors) {
  Object.entries(errors).forEach(([field, msg]) => {
    const errEl = document.getElementById(`${prefix}-err-${field}`);
    const inputEl = document.getElementById(`${prefix}-tx-${field}`);
    if (errEl) errEl.textContent = msg;
    if (inputEl) inputEl.classList.add('invalid');
  });
}

// ============================================================================
// Modal Add / Edit Transaction
// ============================================================================

export function openTransactionModal(transaction = null) {
  const modal = document.getElementById('transaction-modal');
  const titleEl = document.getElementById('modal-title');
  const submitBtn = document.getElementById('modal-submit-btn');
  const idInput = document.getElementById('modal-tx-id');
  const typeInput = document.getElementById('modal-tx-type');
  const nameInput = document.getElementById('modal-tx-title');
  const amountInput = document.getElementById('modal-tx-amount');
  const dateInput = document.getElementById('modal-tx-date');
  const categorySelect = document.getElementById('modal-tx-category');
  const descInput = document.getElementById('modal-tx-description');

  clearFormErrors('modal');

  const type = transaction ? transaction.type : 'expense';
  idInput.value = transaction ? transaction.id : '';
  typeInput.value = type;
  nameInput.value = transaction ? transaction.title : '';
  amountInput.value = transaction ? transaction.amount : '';
  dateInput.value = transaction ? transaction.date : getTodayISO();
  descInput.value = transaction ? transaction.description || '' : '';

  setSegmentTypeActive('data-modal-type', type);
  populateCategorySelect(categorySelect, type, transaction ? transaction.category : '');

  if (transaction) {
    titleEl.textContent = 'Edit Transaction';
    submitBtn.textContent = 'Update Transaction';
  } else {
    titleEl.textContent = 'Add Transaction';
    submitBtn.textContent = 'Save Transaction';
  }

  modal.classList.remove('hidden');
  setTimeout(() => nameInput.focus(), 20);
}

export function closeTransactionModal() {
  const modal = document.getElementById('transaction-modal');
  modal.classList.add('hidden');
  clearFormErrors('modal');
}

function setSegmentTypeActive(attr, activeType) {
  document.querySelectorAll(`[${attr}]`).forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute(attr) === activeType);
  });
}

// ============================================================================
// Shared Table Row Builder & Filtering
// ============================================================================

export function sortTransactions(list, sortKey = 'date-desc') {
  const copy = [...list];
  copy.sort((a, b) => {
    if (sortKey === 'date-asc') {
      return a.date.localeCompare(b.date);
    }
    if (sortKey === 'amount-desc') {
      return Number(b.amount) - Number(a.amount);
    }
    if (sortKey === 'amount-asc') {
      return Number(a.amount) - Number(b.amount);
    }
    // Default date-desc
    return b.date.localeCompare(a.date);
  });
  return copy;
}

export function renderTransactionTableHTML(transactions, { emptyTitle, emptyDesc, showClearFilters = false } = {}) {
  if (!transactions.length) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon"><i data-lucide="receipt"></i></div>
        <h3>${escapeHTML(emptyTitle || 'No transactions found')}</h3>
        <p>${escapeHTML(emptyDesc || 'Add an income or expense entry to start tracking.')}</p>
        ${
          showClearFilters
            ? `<button type="button" class="btn btn-secondary" data-action="clear-filters">Reset Filters</button>`
            : `<button type="button" class="btn btn-primary" data-action="open-add-modal">Add First Transaction</button>`
        }
      </div>
    `;
  }

  const rowsHTML = transactions
    .map((tx) => {
      const isIncome = tx.type === 'income';
      const signedAmount = `${isIncome ? '+' : '-'}${formatCurrency(tx.amount)}`;
      const amountClass = isIncome ? 'income-text' : 'expense-text';
      const typeLabel = isIncome ? 'Income' : 'Expense';

      return `
        <tr data-tx-id="${escapeHTML(tx.id)}">
          <td class="tabular-nums tx-meta-inline">${escapeHTML(formatDate(tx.date))}</td>
          <td>
            <div class="tx-title-cell">
              <span class="tx-title">${escapeHTML(tx.title)}</span>
              ${
                tx.description
                  ? `<span class="tx-desc" title="${escapeHTML(tx.description)}">${escapeHTML(
                      tx.description
                    )}</span>`
                  : ''
              }
            </div>
          </td>
          <td class="tx-meta-inline">${escapeHTML(tx.category)}</td>
          <td class="tx-type-text ${amountClass}">${typeLabel}</td>
          <td class="align-right tabular-nums tx-amount ${amountClass}">${signedAmount}</td>
          <td class="align-right">
            <div class="row-actions">
              <button
                type="button"
                class="icon-btn"
                data-action="edit-tx"
                data-id="${escapeHTML(tx.id)}"
                title="Edit transaction"
                aria-label="Edit ${escapeHTML(tx.title)}"
              >
                <i data-lucide="pencil"></i>
              </button>
              <button
                type="button"
                class="icon-btn delete"
                data-action="delete-tx"
                data-id="${escapeHTML(tx.id)}"
                title="Delete transaction"
                aria-label="Delete ${escapeHTML(tx.title)}"
              >
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Transaction</th>
          <th>Category</th>
          <th>Type</th>
          <th class="align-right">Amount</th>
          <th class="align-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHTML}
      </tbody>
    </table>
  `;
}

// ============================================================================
// Render Transaction History View & Add Entry Sidebar
// ============================================================================

export function renderTransactionsView() {
  const all = storage.getTransactions();

  // Populate category filter options dynamically from known + used categories
  const catSelect = document.getElementById('tx-category-filter');
  const usedCats = new Set([
    ...EXPENSE_CATEGORIES,
    ...INCOME_CATEGORIES,
    ...all.map((t) => t.category),
  ]);
  const prevCat = filterState.category;
  catSelect.innerHTML =
    `<option value="all">All Categories</option>` +
    Array.from(usedCats)
      .sort()
      .map((cat) => `<option value="${escapeHTML(cat)}">${escapeHTML(cat)}</option>`)
      .join('');
  catSelect.value = usedCats.has(prevCat) || prevCat === 'all' ? prevCat : 'all';

  // Apply search, type, category filters
  const query = filterState.search.trim().toLowerCase();
  const filtered = all.filter((tx) => {
    if (filterState.type !== 'all' && tx.type !== filterState.type) return false;
    if (filterState.category !== 'all' && tx.category !== filterState.category) return false;
    if (query) {
      const hay = `${tx.title} ${tx.category} ${tx.description || ''}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  const sorted = sortTransactions(filtered, filterState.sort);

  // Update dynamic filtered summary strip
  let fIncome = 0;
  let fExpense = 0;
  for (const tx of sorted) {
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'income') fIncome += amt;
    else fExpense += amt;
  }

  document.getElementById('tx-filtered-count').textContent = `${sorted.length} ${
    sorted.length === 1 ? 'transaction' : 'transactions'
  }`;
  document.getElementById('tx-filtered-income').textContent = formatCurrency(fIncome);
  document.getElementById('tx-filtered-expense').textContent = formatCurrency(fExpense);
  const netEl = document.getElementById('tx-filtered-net');
  const net = fIncome - fExpense;
  netEl.textContent = formatCurrency(net);
  netEl.className = `tabular-nums ${net >= 0 ? 'income-text' : 'expense-text'}`;

  // Render table
  const container = document.getElementById('all-transactions-container');
  const hasFilters =
    Boolean(query) || filterState.type !== 'all' || filterState.category !== 'all';

  container.innerHTML = renderTransactionTableHTML(sorted, {
    emptyTitle: hasFilters ? 'No matching transactions' : 'Your ledger is empty',
    emptyDesc: hasFilters
      ? 'Try clearing your search query or adjusting the active category and type filters.'
      : 'Start by recording an income or expense transaction.',
    showClearFilters: hasFilters && all.length > 0,
  });

  // Update Add Entry preview list
  renderAddViewRecentList(all);
  appCallbacks.refreshIcons();
}

function renderAddViewRecentList(allTransactions) {
  const listEl = document.getElementById('add-view-recent-list');
  if (!listEl) return;

  const recent = sortTransactions(allTransactions, 'date-desc').slice(0, 5);
  if (!recent.length) {
    listEl.innerHTML = `<p class="card-subtitle" style="padding: 12px 0;">No transactions logged yet.</p>`;
    return;
  }

  listEl.innerHTML = recent
    .map((tx) => {
      const isIncome = tx.type === 'income';
      return `
        <div class="mini-list-item">
          <div class="mini-list-info">
            <div class="mini-list-title">${escapeHTML(tx.title)}</div>
            <div class="mini-list-meta">${escapeHTML(tx.category)} · ${escapeHTML(
        formatDate(tx.date)
      )}</div>
          </div>
          <span class="tabular-nums tx-amount ${isIncome ? 'income-text' : 'expense-text'}">
            ${isIncome ? '+' : '-'}${formatCurrency(tx.amount)}
          </span>
        </div>
      `;
    })
    .join('');
}

// ============================================================================
// Initialization & Event Binding
// ============================================================================

export function initTransactionsModule(callbacks) {
  appCallbacks = { ...appCallbacks, ...callbacks };

  // 1. Setup Add Page Form defaults
  const pageTypeInput = document.getElementById('page-tx-type');
  const pageCategorySelect = document.getElementById('page-tx-category');
  const pageDateInput = document.getElementById('page-tx-date');
  const pageForm = document.getElementById('page-tx-form');

  populateCategorySelect(pageCategorySelect, 'expense');
  pageDateInput.value = getTodayISO();

  document.querySelectorAll('[data-form-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextType = btn.getAttribute('data-form-type');
      pageTypeInput.value = nextType;
      setSegmentTypeActive('data-form-type', nextType);
      populateCategorySelect(pageCategorySelect, nextType);
      clearFormErrors('page');
    });
  });

  pageForm.addEventListener('reset', () => {
    setTimeout(() => {
      pageTypeInput.value = 'expense';
      setSegmentTypeActive('data-form-type', 'expense');
      populateCategorySelect(pageCategorySelect, 'expense');
      pageDateInput.value = getTodayISO();
      clearFormErrors('page');
    }, 0);
  });

  pageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearFormErrors('page');

    const payload = {
      type: pageTypeInput.value,
      title: document.getElementById('page-tx-title').value,
      amount: document.getElementById('page-tx-amount').value,
      category: pageCategorySelect.value,
      date: pageDateInput.value,
      description: document.getElementById('page-tx-description').value,
    };

    const validation = validateTransactionInput(payload);
    if (!validation.isValid) {
      showFormErrors('page', validation.errors);
      return;
    }

    storage.addTransaction(payload);
    pageForm.reset();
    appCallbacks.onDataChanged();
    appCallbacks.onToast('Transaction saved to ledger.', 'success');
  });

  // 2. Setup Modal Form (Add / Edit)
  const modalTypeInput = document.getElementById('modal-tx-type');
  const modalCategorySelect = document.getElementById('modal-tx-category');
  const modalForm = document.getElementById('modal-tx-form');

  document.querySelectorAll('[data-modal-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextType = btn.getAttribute('data-modal-type');
      modalTypeInput.value = nextType;
      setSegmentTypeActive('data-modal-type', nextType);
      populateCategorySelect(modalCategorySelect, nextType);
      clearFormErrors('modal');
    });
  });

  modalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearFormErrors('modal');

    const editId = document.getElementById('modal-tx-id').value;
    const payload = {
      type: modalTypeInput.value,
      title: document.getElementById('modal-tx-title').value,
      amount: document.getElementById('modal-tx-amount').value,
      category: modalCategorySelect.value,
      date: document.getElementById('modal-tx-date').value,
      description: document.getElementById('modal-tx-description').value,
    };

    const validation = validateTransactionInput(payload);
    if (!validation.isValid) {
      showFormErrors('modal', validation.errors);
      return;
    }

    if (editId) {
      storage.updateTransaction(editId, payload);
      appCallbacks.onToast('Transaction updated.', 'success');
    } else {
      storage.addTransaction(payload);
      appCallbacks.onToast('Transaction added.', 'success');
    }

    closeTransactionModal();
    appCallbacks.onDataChanged();
  });

  document.getElementById('modal-close-btn').addEventListener('click', closeTransactionModal);
  document.getElementById('modal-cancel-btn').addEventListener('click', closeTransactionModal);
  document.getElementById('transaction-modal').addEventListener('click', (e) => {
    if (e.target.id === 'transaction-modal') closeTransactionModal();
  });

  // 3. Setup Search, Filters & Sort in Transactions History
  const searchInput = document.getElementById('tx-search-input');
  const catFilter = document.getElementById('tx-category-filter');
  const sortSelect = document.getElementById('tx-sort-select');

  searchInput.addEventListener('input', (e) => {
    filterState.search = e.target.value;
    renderTransactionsView();
  });

  document.querySelectorAll('[data-type-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterState.type = btn.getAttribute('data-type-filter');
      setSegmentTypeActive('data-type-filter', filterState.type);
      renderTransactionsView();
    });
  });

  catFilter.addEventListener('change', (e) => {
    filterState.category = e.target.value;
    renderTransactionsView();
  });

  sortSelect.addEventListener('change', (e) => {
    filterState.sort = e.target.value;
    renderTransactionsView();
  });

  // 4. Event delegation for Edit, Delete, Clear Filters, Add First Transaction
  document.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;

    const action = actionBtn.getAttribute('data-action');
    const id = actionBtn.getAttribute('data-id');

    if (action === 'edit-tx' && id) {
      const tx = storage.getTransactions().find((t) => t.id === id);
      if (tx) openTransactionModal(tx);
    } else if (action === 'delete-tx' && id) {
      const tx = storage.getTransactions().find((t) => t.id === id);
      if (!tx) return;
      appCallbacks.onRequestConfirm({
        title: 'Delete Transaction',
        message: `Are you sure you want to delete "${tx.title}" (${formatCurrency(
          tx.amount
        )})? This action cannot be undone.`,
        confirmText: 'Delete',
        onConfirm: () => {
          storage.deleteTransaction(id);
          appCallbacks.onDataChanged();
          appCallbacks.onToast('Transaction deleted.', 'success');
        },
      });
    } else if (action === 'clear-filters') {
      filterState.search = '';
      filterState.type = 'all';
      filterState.category = 'all';
      searchInput.value = '';
      setSegmentTypeActive('data-type-filter', 'all');
      renderTransactionsView();
    } else if (action === 'open-add-modal') {
      openTransactionModal(null);
    }
  });
}
