let allBidsData = [];
let pollingInterval = null;
let columnFilters = {};   // { colKey: Set(values) } or { colKey: {from, to} }
let sortState = { key: null, dir: 0 }; // dir: 1 asc, -1 desc

// Single source of truth for all table columns (render / filter / sort)
const COLUMNS = [
  { key: 'bid_no',        label: 'Bid / RA Number', type: 'multi', getVal: b => b.bid_number || 'N/A' },
  { key: 'status',        label: 'User Status', type: 'multi', getVal: b => ((b.user_status || '').trim() === 'Close' ? 'Close' : 'Open') },
  { key: 'current_state', label: 'GeM Portal Status', type: 'multi', getVal: getCurrentState },
  { key: 'ra_date',       label: 'RA Date', type: 'date', getVal: b => (b.ra_info && b.ra_info.is_ra && b.ra_info.ra_start_date && b.ra_info.ra_start_date !== 'N/A') ? b.ra_info.ra_start_date : '' },
  { key: 'bid_date',      label: 'Bid Date', type: 'date', getVal: b => getBidDateVal(b) },
  { key: 'qty',           label: 'Quantity', type: 'multi', getVal: b => (b.bid_details && b.bid_details['Quantity']) || 'N/A' },
  { key: 'buyer_name',    label: 'Buyer Name', type: 'multi', getVal: b => (b.buyer_details && b.buyer_details['Name']) || 'N/A' },
  { key: 'buyer_ministry',label: 'Ministry / Department', type: 'multi', getVal: b => getBuyerMinistry(b) },
  { key: 'l1_seller',     label: 'Financial L1 Leader', type: 'multi', getVal: b => getL1SellerName(b) },
  { key: 'l1_price',      label: 'L1 Price', type: 'multi', getVal: b => getL1Price(b) },
  { key: 'dalui',         label: 'G.M. DALUI Position & Price Gap', type: 'multi', getVal: getDaluiCategory },
  { key: 'remark',        label: 'User Remarks', type: 'multi', getVal: b => b.user_remark || '' },
];

function getBuyerMinistry(b) {
  const bd = b.buyer_details || {};
  return bd['Ministry'] || bd['Department'] || bd['Organisation'] || bd['Office'] || 'N/A';
}

function parseGeMRaEndDate(dateStr) {
  if (!dateStr || dateStr === 'N/A') return null;
  try {
    const parts = dateStr.trim().split(' ');
    const dParts = parts[0].split('-');
    if (dParts.length === 3) {
      const day = parseInt(dParts[0], 10);
      const month = parseInt(dParts[1], 10) - 1;
      const year = parseInt(dParts[2], 10);
      let hours = 23, minutes = 59;
      
      if (parts.length >= 2) {
        const timeParts = parts[1].split(':');
        hours = parseInt(timeParts[0], 10) || 0;
        minutes = parseInt(timeParts[1], 10) || 0;
        if (parts.length >= 3 && parts[2].toUpperCase() === 'PM' && hours < 12) {
          hours += 12;
        } else if (parts.length >= 3 && parts[2].toUpperCase() === 'AM' && hours === 12) {
          hours = 0;
        }
      }
      return new Date(year, month, day, hours, minutes);
    }
  } catch (e) { }
  return null;
}

function getCurrentState(b) {
  const raInf = b.ra_info || {};
  if (raInf.is_ra) {
    const raEndStr = (raInf.ra_end_date && raInf.ra_end_date !== 'N/A') ? raInf.ra_end_date : (b.bid_details || {})['RA End Date / Time'];
    const endDate = parseGeMRaEndDate(raEndStr);
    if (endDate && endDate < new Date()) {
      return 'RA Date Closed';
    }
    return 'Reverse Auction (RA)';
  }
  if (b.financial_evaluation && b.financial_evaluation.length > 0) return 'Financial Evaluated (L1)';
  if (b.technical_evaluation && b.technical_evaluation.length > 0) return 'Technical Evaluated';
  
  const bidEndStr = (b.bid_details || {})['Bid End Date / Time'];
  const bidEndDate = parseGeMRaEndDate(bidEndStr);
  if (bidEndDate && bidEndDate < new Date()) {
    return 'Bid Date Closed';
  }

  return 'Active / Live';
}

function getBidDateVal(b) {
  const bd = b.bid_details || {};
  const bidStart = bd['Bid Start Date / Time'] || '';
  if (bidStart) return bidStart;
  if (b.ra_info && b.ra_info.is_ra && b.ra_info.ra_start_date && b.ra_info.ra_start_date !== 'N/A') {
    return b.ra_info.ra_start_date;
  }
  return bd['Bid Opening Date / Time'] || '';
}

function getL1SellerName(b) {
  const fe = b.financial_evaluation || [];
  if (fe.length === 0) return 'N/A';
  return fe[0]['Seller Name'] || fe[0]['L1 Seller Name'] || 'N/A';
}

function getL1Price(b) {
  const fe = b.financial_evaluation || [];
  if (fe.length === 0) return 'N/A';
  const raw = fe[0]['Total Price'] || fe[0]['Total L1 Price'] || 'N/A';
  return raw === 'N/A' ? 'N/A' : formatPrice(raw);
}

function getDaluiCategory(b) {
  const cAn = b.company_analysis || {};
  if (!cAn.participated) return 'Not Participated';
  if (cAn.is_l1) return 'Won L1';
  if (cAn.is_disqualified) return 'Disqualified';
  return 'Qualified (Ranked)';
}

document.addEventListener('DOMContentLoaded', () => {
  fetchBids();
  setupEventListeners();
  initColumnDropdowns();
});

function setupEventListeners() {
  document.getElementById('searchInput').addEventListener('input', filterBidsTable);
  document.getElementById('filterDateType').addEventListener('change', filterBidsTable);
  document.getElementById('filterDateFrom').addEventListener('change', filterBidsTable);
  document.getElementById('filterDateTo').addEventListener('change', filterBidsTable);
  document.getElementById('filterMinQty').addEventListener('input', filterBidsTable);
  document.getElementById('filterRankType').addEventListener('change', filterBidsTable);
  
  document.getElementById('btnFilterDalui').addEventListener('click', filterDaluiOnly);
  document.getElementById('btnClearFilters').addEventListener('click', resetFilters);
  document.getElementById('btnRefresh').addEventListener('click', fetchBids);
  document.getElementById('btnRunScraper').addEventListener('click', triggerRunScraper);
  document.getElementById('btnManageIds').addEventListener('click', openManageIdsModal);
  document.getElementById('btnSaveAndRun').addEventListener('click', saveAndRunScraper);
  
  document.getElementById('btnCombinedPdf').addEventListener('click', () => {
    openPdfModal('combined', 'Combined Master PDF Report');
  });

  document.getElementById('btnExportCsv').addEventListener('click', () => {
    window.location.href = '/api/csv';
  });

  // Make Top Summary Cards Clickable to filter table live
  const cardClickMap = [
    { id: 'cStatParticipated', val: 'dalui_participated' },
    { id: 'cStatQualified', val: 'dalui_qualified' },
    { id: 'cStatDisqualified', val: 'dalui_disqualified' },
    { id: 'cStatWonL1', val: 'dalui_l1' },
    { id: 'cStatMissedL2', val: 'dalui_l2' },
  ];

  cardClickMap.forEach(item => {
    const el = document.getElementById(item.id);
    if (el) {
      const card = el.closest('.c-metric');
      if (card) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
          document.getElementById('filterRankType').value = item.val;
          filterBidsTable();
        });
      }
    }
  });

  const applyCard = document.querySelector('.metric-card.card-blue');
  if (applyCard) {
    applyCard.style.cursor = 'pointer';
    applyCard.addEventListener('click', () => {
      document.getElementById('filterRankType').value = 'dalui_participated';
      filterBidsTable();
    });
  }

  // Close dropdowns on outside click or scroll
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.th-wrap') && !e.target.closest('.col-dropdown')) closeAllColumnDropdowns();
  });
  const tableContainer = document.querySelector('.table-responsive');
  if (tableContainer) {
    tableContainer.addEventListener('scroll', closeAllColumnDropdowns, { passive: true });
  }
  window.addEventListener('scroll', closeAllColumnDropdowns, { passive: true });
}

function initColumnDropdowns() {
  document.querySelectorAll('th.sortable').forEach(th => {
    const colKey = th.dataset.col;
    const btn = th.querySelector('.th-filter-btn');
    const label = th.querySelector('.th-label');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleColumnDropdown(colKey);
    });

    label.addEventListener('click', (e) => {
      e.stopPropagation();
      handleSortClick(colKey);
    });
  });
}

function toggleColumnDropdown(colKey) {
  const dd = document.querySelector(`.col-dropdown[data-dropdown="${colKey}"]`);
  if (!dd) return;
  const isOpen = dd.classList.contains('open');
  closeAllColumnDropdowns();
  if (!isOpen) {
    const th = document.querySelector(`th.sortable[data-col="${colKey}"]`);
    const btn = th ? th.querySelector('.th-filter-btn') : null;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 10;
      const spaceAbove = rect.top - 10;

      dd.style.position = 'fixed';
      dd.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - 300))}px`;

      if (spaceBelow < 300 && spaceAbove > spaceBelow) {
        dd.style.top = 'auto';
        dd.style.bottom = `${viewportHeight - rect.top + 6}px`;
      } else {
        dd.style.bottom = 'auto';
        dd.style.top = `${rect.bottom + 6}px`;
      }
    }
    dd.classList.add('open');
    buildDropdownContent(colKey);
  }
}

let isRenderingTable = false;

function closeAllColumnDropdowns() {
  if (isRenderingTable) return;
  document.querySelectorAll('.col-dropdown.open').forEach(dd => dd.classList.remove('open'));
}

function buildDropdownContent(colKey) {
  const dd = document.querySelector(`.col-dropdown[data-dropdown="${colKey}"]`);
  if (!dd) return;
  const col = COLUMNS.find(c => c.key === colKey);
  if (!col) return;

  if (col.type === 'date') {
    buildDateDropdown(colKey, col, dd);
  } else {
    buildMultiDropdown(colKey, col, dd);
  }
}

function buildMultiDropdown(colKey, col, dd) {
  const selected = columnFilters[colKey] instanceof Set ? columnFilters[colKey] : new Set();
  const values = [...new Set(allBidsData.map(b => col.getVal(b)).filter(v => v && v !== 'N/A' && v !== ''))];
  values.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  let optionsHtml = '';
  if (values.length === 0) {
    optionsHtml = `<div class="dd-empty">No options available</div>`;
  } else {
    optionsHtml = values.map(v => {
      const safe = String(v).replace(/"/g, '&quot;');
      const checked = selected.has(v) ? 'checked' : '';
      return `<label class="dd-opt"><input type="checkbox" value="${safe}" ${checked}><span>${escapeHtml(v)}</span></label>`;
    }).join('');
  }

  dd.innerHTML = `
    <div class="dd-pop-header">
      <span>Filter ${escapeHtml(col.label)}</span>
      <button class="dd-close-x" onclick="closeAllColumnDropdowns()">✕</button>
    </div>
    <div class="dd-search"><input type="text" class="dd-search-input" placeholder="Search options..."></div>
    <div class="dd-actions-bar">
      <button class="dd-select-all">Select All</button>
      <button class="dd-deselect-all">Clear All</button>
    </div>
    <div class="dd-options">${optionsHtml}</div>
    <div class="dd-footer">
      <button class="dd-clear btn btn-secondary btn-sm" style="width:100%;">Reset Filter</button>
    </div>`;

  // Auto-apply on checkbox toggle
  dd.querySelector('.dd-options').addEventListener('change', () => {
    applyColumnFilter(colKey);
  });

  dd.querySelector('.dd-select-all').addEventListener('click', () => {
    dd.querySelectorAll('.dd-opt input').forEach(i => i.checked = true);
    applyColumnFilter(colKey);
  });
  dd.querySelector('.dd-deselect-all').addEventListener('click', () => {
    dd.querySelectorAll('.dd-opt input').forEach(i => i.checked = false);
    applyColumnFilter(colKey);
  });

  dd.querySelector('.dd-search-input').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    dd.querySelectorAll('.dd-opt').forEach(opt => {
      opt.style.display = opt.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });

  dd.querySelector('.dd-clear').addEventListener('click', () => {
    delete columnFilters[colKey];
    closeAllColumnDropdowns();
    updateHeaderBadges();
    filterBidsTable();
  });
}

function buildDateDropdown(colKey, col, dd) {
  const cur = columnFilters[colKey] || {};
  dd.innerHTML = `
    <div class="dd-pop-header">
      <span>Filter ${escapeHtml(col.label)}</span>
      <button class="dd-close-x" onclick="closeAllColumnDropdowns()">✕</button>
    </div>
    <div class="dd-date-range">
      <div class="dd-date-field">
        <label>From Date</label>
        <input type="date" class="dd-from" value="${cur.from || ''}">
      </div>
      <div class="dd-date-field">
        <label>To Date</label>
        <input type="date" class="dd-to" value="${cur.to || ''}">
      </div>
    </div>
    <div class="dd-footer">
      <button class="dd-clear btn btn-secondary btn-sm" style="width:100%;">Reset Filter</button>
    </div>`;

  const updateDateRangeFilter = () => {
    const from = dd.querySelector('.dd-from').value;
    const to = dd.querySelector('.dd-to').value;
    if (!from && !to) delete columnFilters[colKey];
    else columnFilters[colKey] = { from, to };
    updateHeaderBadges();
    filterBidsTable();
  };

  dd.querySelector('.dd-from').addEventListener('change', updateDateRangeFilter);
  dd.querySelector('.dd-to').addEventListener('change', updateDateRangeFilter);

  dd.querySelector('.dd-clear').addEventListener('click', () => {
    delete columnFilters[colKey];
    closeAllColumnDropdowns();
    updateHeaderBadges();
    filterBidsTable();
  });
}

function applyColumnFilter(colKey) {
  const dd = document.querySelector(`.col-dropdown[data-dropdown="${colKey}"]`);
  if (!dd) return;
  const checked = [...dd.querySelectorAll('.dd-opt input:checked')].map(i => i.value);
  if (checked.length > 0) columnFilters[colKey] = new Set(checked);
  else delete columnFilters[colKey];
  updateHeaderBadges();
  filterBidsTable();
}

function updateHeaderBadges() {
  document.querySelectorAll('th.sortable').forEach(th => {
    const colKey = th.dataset.col;
    const btn = th.querySelector('.th-filter-btn');
    const filter = columnFilters[colKey];
    let active = false;
    let count = 0;
    if (filter instanceof Set) {
      active = filter.size > 0;
      count = filter.size;
    } else if (filter && (filter.from || filter.to)) {
      active = true;
    }
    btn.classList.toggle('active', active);
    btn.title = active ? (count > 0 ? `${count} value(s) selected` : 'Date range active') : 'Filter column';
    const badge = btn.querySelector('.th-filter-count');
    if (badge) badge.textContent = count > 0 ? count : '';
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function filterDaluiOnly() {
  resetFilters();
  document.getElementById('filterRankType').value = 'dalui_participated';
  filterBidsTable();
}

function resetFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value = '';
  document.getElementById('filterMinQty').value = '';
  document.getElementById('filterRankType').value = 'all';
  columnFilters = {};
  sortState = { key: null, dir: 0 };
  closeAllColumnDropdowns();
  updateHeaderBadges();
  updateSortIndicators();
  filterBidsTable();
}

function handleSortClick(colKey) {
  if (sortState.key === colKey) {
    if (sortState.dir === 1) sortState.dir = -1;
    else if (sortState.dir === -1) sortState.dir = 0;
    else sortState.dir = 1;
  } else {
    sortState.key = colKey;
    sortState.dir = 1;
  }
  updateSortIndicators();
  filterBidsTable();
}

function updateSortIndicators() {
  document.querySelectorAll('th.sortable').forEach(th => {
    const ind = th.querySelector('.sort-indicator');
    if (sortState.key === th.dataset.col && sortState.dir !== 0) {
      ind.textContent = sortState.dir === 1 ? '▲' : '▼';
    } else {
      ind.textContent = '';
    }
  });
}

function sortBids(bids) {
  if (!sortState.key || sortState.dir === 0) return bids;
  const col = COLUMNS.find(c => c.key === sortState.key);
  if (!col) return bids;
  const dir = sortState.dir;
  return [...bids].sort((a, b) => {
    let va = col.getVal(a);
    let vb = col.getVal(b);
    return compareValues(va, vb, col) * dir;
  });
}

function compareValues(va, vb, col) {
  const isNA = v => v === undefined || v === null || v === '' || v === 'N/A';
  const aNA = isNA(va);
  const bNA = isNA(vb);
  if (aNA && bNA) return 0;
  if (aNA) return 1;  // N/A goes last
  if (bNA) return -1;

  if (col.type === 'date') {
    const da = parseGeMDate(va);
    const db = parseGeMDate(vb);
    if (da && db) return da - db;
  }

  if (col.key === 'qty' || col.key === 'l1_price') {
    const na = parseFloat(String(va).replace(/[^\d.]/g, ''));
    const nb = parseFloat(String(vb).replace(/[^\d.]/g, ''));
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
  }

  return String(va).localeCompare(String(vb), undefined, { numeric: true });
}

async function fetchBids() {
  try {
    const res = await fetch('/api/bids');
    const json = await res.json();

    if (json.status === 'success') {
      allBidsData = json.bids || [];
      updateStats(json.stats);
      filterBidsTable();
    }
  } catch (err) {
    console.error('Error fetching bids:', err);
  }
}

function setElText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function updateStats(stats) {
  if (!stats) return;
  const total = stats.total_bids || 0;
  const cStats = stats.company_stats || {};
  const participated = cStats.participated || 0;
  const qualified = cStats.qualified || 0;
  const disqualified = cStats.disqualified || 0;
  const l1Won = cStats.l1_won || 0;
  const l2Missed = cStats.l2_missed || 0;

  // Overview metric cards
  setElText('statTotalBids', total);
  setElText('statTotalRa', stats.total_ra || 0);
  setElText('statQualified', stats.qualified_sellers || 0);
  setElText('statDisqualified', stats.disqualified_sellers || 0);
  setElText('statFinancialL1', stats.financial_l1_evaluated || 0);

  // "Apply for the Bid" card
  setElText('statApplyBid', participated);
  setElText('statApplyBidPct', total > 0 ? `(${((participated / total) * 100).toFixed(1)}% of ${total} bids)` : '');

  const qualPct = participated > 0 ? Math.round((qualified / participated) * 100) : 0;
  const disqualPct = participated > 0 ? Math.round((disqualified / participated) * 100) : 0;
  const wonPct = participated > 0 ? Math.round((l1Won / participated) * 100) : 0;

  setElText('statApplyQualPct', `${qualified} (${qualPct}%)`);
  setElText('statApplyDisqualPct', `${disqualified} (${disqualPct}%)`);
  setElText('statApplyWonPct', `${l1Won} (${wonPct}%)`);

  // G.M. DALUI banner
  setElText('cStatParticipated', participated);
  setElText('cStatQualified', qualified);
  setElText('cStatDisqualified', disqualified);
  setElText('cStatWonL1', l1Won);
  setElText('cStatMissedL2', l2Missed);

  setElText('cStatQualifiedPct', participated > 0 ? `(${qualPct}%)` : '');
  setElText('cStatDisqualifiedPct', participated > 0 ? `(${disqualPct}%)` : '');
  setElText('cStatWonL1Pct', participated > 0 ? `(${wonPct}%)` : '');
  setElText('cStatMissedL2Pct', participated > 0 ? `(${Math.round((l2Missed / participated) * 100)}%)` : '');
}

function parseGeMDate(dateStr) {
  if (!dateStr) return null;
  // Format e.g., "18-01-2024 13:22:28" or "18-01-2024"
  const parts = dateStr.trim().split(' ')[0].split('-');
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    return new Date(y, m, d);
  }
  return null;
}

// Parse an <input type="date"> value (YYYY-MM-DD) as a local-time Date so it
// matches the local dates produced by parseGeMDate.
function parseFilterDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return new Date(y, m, d);
  }
  return null;
}

function filterBidsTable() {
  const query = document.getElementById('searchInput').value.toLowerCase().trim();
  const dateType = document.getElementById('filterDateType').value;
  const dateFromStr = document.getElementById('filterDateFrom').value;
  const dateToStr = document.getElementById('filterDateTo').value;
  const minQtyVal = parseInt(document.getElementById('filterMinQty').value, 10);
  const rankType = document.getElementById('filterRankType').value;

  const dateFrom = dateFromStr ? new Date(dateFromStr) : null;
  const dateTo = dateToStr ? new Date(dateToStr) : null;
  if (dateTo) dateTo.setHours(23, 59, 59, 999);

  const filtered = allBidsData.filter(b => {
    const bDetails = b.bid_details || {};
    const buyerDetails = b.buyer_details || {};
    const finEval = b.financial_evaluation || [];
    const l1L2Diff = b.l1_l2_diff;
    const cAn = b.company_analysis || {};
    const raInf = b.ra_info || {};

    // 1. Keyword search
    if (query) {
      const fullText = (
        (b.bid_number || '') + ' ' + 
        (raInf.ra_number || '') + ' ' + 
        (b.user_remark || '') + ' ' + 
        (b.user_status || '') + ' ' + 
        JSON.stringify(bDetails) + ' ' + 
        JSON.stringify(buyerDetails) + ' ' + 
        JSON.stringify(b.technical_evaluation || []) + ' ' + 
        JSON.stringify(finEval)
      ).toLowerCase();
      if (!fullText.includes(query)) return false;
    }

    // 2. Quantity Filter (> minQty)
    if (!isNaN(minQtyVal)) {
      const rawQty = parseInt((bDetails['Quantity'] || '0').replace(/\D/g, ''), 10);
      if (rawQty < minQtyVal) return false;
    }

    // 3. Rank / RA Filter
    if (rankType === 'ra_only' && !raInf.is_ra) return false;
    if (rankType === 'l1_available' && finEval.length === 0) return false;
    if (rankType === 'dalui_participated' && !cAn.participated) return false;
    if (rankType === 'dalui_qualified' && !cAn.is_qualified) return false;
    if (rankType === 'dalui_disqualified' && !cAn.is_disqualified) return false;
    if (rankType === 'dalui_l1' && !cAn.is_l1) return false;
    if (rankType === 'dalui_l2' && !cAn.is_l2 && cAn.rank !== 'L2') return false;

    // 4. Date Range Filter
    if (dateFrom || dateTo) {
      let targetDateStr = '';
      if (dateType === 'start') targetDateStr = bDetails['Bid Start Date / Time'];
      else if (dateType === 'end') targetDateStr = bDetails['Bid End Date / Time'];
      else if (dateType === 'opening') targetDateStr = bDetails['Bid Opening Date / Time'];

      const parsedDate = parseGeMDate(targetDateStr);
      if (!parsedDate) return false;
      if (dateFrom && parsedDate < dateFrom) return false;
      if (dateTo && parsedDate > dateTo) return false;
    }

    return true;
  });

  // Apply per-column header filters (multi = OR within column; date = within range)
  const withColFilters = applyColumnFilters(filtered);

  const sorted = sortBids(withColFilters);
  isRenderingTable = true;
  renderBidsTable(sorted);
  setTimeout(() => { isRenderingTable = false; }, 200);
}

function applyColumnFilters(bids) {
  const activeKeys = Object.keys(columnFilters).filter(k => {
    const f = columnFilters[k];
    if (f instanceof Set) return f.size > 0;
    return f && (f.from || f.to);
  });
  if (activeKeys.length === 0) return bids;

  return bids.filter(b => {
    for (const key of activeKeys) {
      const col = COLUMNS.find(c => c.key === key);
      const filter = columnFilters[key];
      const val = col ? col.getVal(b) : '';

      if (filter instanceof Set) {
        if (!filter.has(val)) return false; // OR within column handled by set membership
      } else {
        const parsedDate = parseGeMDate(val);
        if (!parsedDate) return false;
        if (filter.from) {
          const from = parseFilterDate(filter.from);
          if (parsedDate < from) return false;
        }
        if (filter.to) {
          const to = parseFilterDate(filter.to);
          to.setHours(23, 59, 59, 999);
          if (parsedDate > to) return false;
        }
      }
    }
    return true;
  });
}

function renderBidsTable(bids) {
  const tbody = document.getElementById('bidsTableBody');
  document.getElementById('recordCountBadge').textContent = `${bids.length} records`;

  if (bids.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="text-center py-8 text-slate">
          No GeM bids match your filter criteria.
        </td>
      </tr>`;
    return;
  }

  let html = '';
  bids.forEach((b, index) => {
    const bidNo = b.bid_number || 'N/A';
    const bidDetails = b.bid_details || {};
    const buyerDetails = b.buyer_details || {};
    const techEval = b.technical_evaluation || [];
    const finEval = b.financial_evaluation || [];
    const diff = b.l1_l2_diff;
    const raInf = b.ra_info || {};

    const status = bidDetails['Bid Status'] || bidDetails['RA Status'] || 'Active';
    const qty = bidDetails['Quantity'] || 'N/A';
    const buyerName = buyerDetails['Name'] || 'N/A';
    const ministry = buyerDetails['Ministry'] || buyerDetails['Organisation'] || 'N/A';

    // Financial L1 & G.M. DALUI Position info
    const l1Seller = finEval.length > 0 ? (finEval[0]['Seller Name'] || finEval[0]['L1 Seller Name'] || 'N/A') : 'N/A';
    const l1Price = finEval.length > 0 ? formatPrice(finEval[0]['Total Price'] || finEval[0]['Total L1 Price']) : 'N/A';

    const cAn = b.company_analysis || {};
    const GMD_LABEL = 'G.M. DALUI & SONS';
    let posCell = '<span class="badge badge-slate">—</span>';

    if (cAn.participated) {
      const myPrice = cAn.my_price && cAn.my_price > 0
        ? `<div style="font-size:0.73rem;color:#64748b;margin-top:4px;">Our Price: <strong style="color:#0f172a;">₹ ${Number(cAn.my_price).toLocaleString('en-IN')}</strong></div>`
        : '';
      const rankPill = cAn.rank && cAn.rank !== 'N/A'
        ? `<span style="font-size:0.7rem;font-weight:700;color:#1d4ed8;background:#dbeafe;padding:1px 7px;border-radius:20px;display:inline-block;margin-right:4px;">${cAn.rank}</span>`
        : '';

      if (cAn.is_l1) {
        posCell = `
          <div style="font-size:0.78rem;font-weight:700;color:#0f172a;margin-bottom:4px;">${GMD_LABEL}</div>
          <span class="badge badge-gold"><i data-lucide="award"></i> WON L1!</span>
          ${myPrice}`;
      } else if (cAn.is_disqualified) {
        posCell = `
          <div style="font-size:0.78rem;font-weight:700;color:#0f172a;margin-bottom:4px;">${GMD_LABEL}</div>
          <span class="badge badge-red"><i data-lucide="x-circle"></i> Disqualified</span>
          ${myPrice}`;
      } else if (cAn.diff_amount > 0) {
        posCell = `
          <div style="font-size:0.78rem;font-weight:700;color:#0f172a;margin-bottom:4px;">${GMD_LABEL}</div>
          <div>${rankPill}<span class="badge badge-amber">+₹ ${Number(cAn.diff_amount).toLocaleString('en-IN')} (+${cAn.diff_pct}% vs L1)</span></div>
          ${myPrice}`;
      } else {
        posCell = `
          <div style="font-size:0.78rem;font-weight:700;color:#0f172a;margin-bottom:4px;">${GMD_LABEL}</div>
          <span class="badge badge-green">${rankPill}Qualified</span>
          ${myPrice}`;
      }
    } else if (diff) {
      posCell = `
        <div><strong>${formatPrice(diff.l2_price.toString())}</strong></div>
        <span class="badge badge-slate" style="font-size:0.7rem;margin-top:3px;">L2: +₹ ${diff.diff_amount.toLocaleString('en-IN')} (+${diff.diff_pct}%)</span>`;
    }

    const raBadge = raInf.is_ra ? `<span class="badge badge-purple" style="font-size:0.65rem; margin-left:4px;" title="Reverse Auction Active"><i data-lucide="zap"></i> RA</span>` : '';
    const isRa = raInf.is_ra;
    const raNo = raInf.ra_number;
    
    const isStandaloneRa = bidNo.includes('/R/');
    
    let bidRaCell = '';
    if (isStandaloneRa) {
      bidRaCell = `
        <div><strong style="color:#6b21a8; font-size:0.925rem;">⚡ ${bidNo}</strong></div>
        <div style="margin-top:3px;">
          <span class="badge badge-purple" style="font-size:0.65rem; padding:2px 6px; font-weight:700;">Standalone Reverse Auction</span>
        </div>`;
    } else if (isRa && raNo && raNo !== 'N/A' && raNo !== bidNo) {
      bidRaCell = `
        <div><strong style="color:var(--text-main); font-size:0.925rem;">${bidNo}</strong></div>
        <div style="font-size:0.75rem; color:#7e22ce; margin-top:3px; font-weight:600; display:flex; align-items:center; gap:4px;">
          <span>➔</span> <span class="badge badge-purple" style="font-size:0.7rem;">⚡ RA NO: ${raNo}</span>
        </div>`;
    } else {
      bidRaCell = `<div><strong style="color:var(--text-main); font-size:0.925rem;">${bidNo}</strong></div>`;
    }

    const raEndStr = (raInf.ra_end_date && raInf.ra_end_date !== 'N/A') ? raInf.ra_end_date : (bidDetails['RA End Date / Time'] || '');
    const raEndDateParsed = parseGeMRaEndDate(raEndStr);
    const isRaClosed = isRa && raEndDateParsed && raEndDateParsed < new Date();

    const bidEndStr = bidDetails['Bid End Date / Time'] || '';
    const bidEndDateParsed = parseGeMRaEndDate(bidEndStr);
    const isBidClosed = !isRa && bidEndDateParsed && bidEndDateParsed < new Date();

    let currentStateBadge = '';
    if (isRaClosed) {
      currentStateBadge = `<span class="badge badge-red" style="font-size:0.75rem; background:#fee2e2; color:#dc2626; border:1.5px solid #ef4444; font-weight:700; padding:4px 8px;" title="RA End Date ${raEndStr} has passed"><i data-lucide="clock-4"></i> ⚡ RA Date Closed</span>`;
    } else if (isRa) {
      currentStateBadge = `<span class="badge badge-purple" style="font-size:0.75rem;"><i data-lucide="zap"></i> Reverse Auction (RA)</span>`;
    } else if (status === 'Financial Evaluation' || (b.financial_evaluation && b.financial_evaluation.sellers && b.financial_evaluation.sellers.length > 0)) {
      currentStateBadge = `<span class="badge badge-gold" style="font-size:0.75rem;"><i data-lucide="award"></i> Financial Evaluated (L1)</span>`;
    } else if (status === 'Technical Evaluation' || (b.technical_evaluation && b.technical_evaluation.sellers && b.technical_evaluation.sellers.length > 0)) {
      currentStateBadge = `<span class="badge badge-blue" style="font-size:0.75rem;"><i data-lucide="file-check"></i> Technical Evaluated</span>`;
    } else if (isBidClosed) {
      currentStateBadge = `<span class="badge badge-amber" style="font-size:0.75rem; background:#fef3c7; color:#b45309; border:1.5px solid #f59e0b; font-weight:700; padding:4px 8px;" title="Bid End Date ${bidEndStr} has passed"><i data-lucide="clock-4"></i> ⏳ Bid Date Closed</span>`;
    } else {
      currentStateBadge = `<span class="badge badge-green" style="font-size:0.75rem;"><i data-lucide="check-circle-2"></i> ${status || 'Active / Live'}</span>`;
    }

    const pdfFilename = b.pdf_filename || `${bidNo.replace(/\//g, '_')}.pdf`;

    // RA Date cell
    let raDateCell = '<span class="text-muted">N/A</span>';
    if (isRa) {
      const rs = raInf.ra_start_date && raInf.ra_start_date !== 'N/A' ? raInf.ra_start_date : 'N/A';
      const re = raInf.ra_end_date && raInf.ra_end_date !== 'N/A' ? raInf.ra_end_date : null;
      raDateCell = `<div class="date-cell">
        <span class="d-start"><i data-lucide="calendar" style="width:12px; height:12px;"></i> ${rs}</span>
        ${re ? `<span class="d-end">→ ${re}</span>` : ''}
      </div>`;
    }

    // Bid Date cell (standard bids: start + end; RA rows fallback to RA start)
    const bidStartRaw = bidDetails['Bid Start Date / Time'] || '';
    const bidEndRaw = bidDetails['Bid End Date / Time'] || '';
    let bidDateCell = '<span class="text-muted">N/A</span>';
    if (bidStartRaw) {
      bidDateCell = `<div class="date-cell">
        <span class="d-start"><i data-lucide="calendar-clock" style="width:12px; height:12px;"></i> ${bidStartRaw}</span>
        ${bidEndRaw ? `<span class="d-end">→ ${bidEndRaw}</span>` : ''}
      </div>`;
    } else if (isRa && raInf.ra_start_date && raInf.ra_start_date !== 'N/A') {
      bidDateCell = `<div class="date-cell">
        <span class="d-start"><i data-lucide="calendar-clock" style="width:12px; height:12px;"></i> ${raInf.ra_start_date}</span>
        <span class="text-muted">(RA start fallback)</span>
      </div>`;
    }

    const rawUStatus = (b.user_status || '').trim();
    const uStatus = rawUStatus === 'Close' ? 'Close' : 'Open';
    const uStatusSelect = `
      <select class="user-status-select" data-bid="${bidNo}" onchange="saveUserStatusFromSelect(this)" style="font-size:0.775rem; font-weight:700; padding:4px 10px; border-radius:6px; border:1.5px solid ${uStatus === 'Close' ? '#ef4444' : '#22c55e'}; background:${uStatus === 'Close' ? '#fee2e2' : '#dcfce7'}; color:${uStatus === 'Close' ? '#991b1b' : '#166534'}; cursor:pointer;">
        <option value="Open" ${uStatus === 'Open' ? 'selected' : ''}>🟢 Open</option>
        <option value="Close" ${uStatus === 'Close' ? 'selected' : ''}>🔴 Close</option>
      </select>`;

    html += `
      <tr>
        <td style="text-align: center; font-weight: 700; color: #64748b; font-size: 0.85rem;">
          ${index + 1}
        </td>
        <td>
          ${bidRaCell}
        </td>
        <td>
          ${uStatusSelect}
        </td>
        <td>
          ${currentStateBadge}
        </td>
        <td>
          ${raDateCell}
        </td>
        <td>
          ${bidDateCell}
        </td>
        <td><strong>${qty}</strong></td>
        <td>
          <strong style="color:var(--text-main); font-size:0.875rem;">${escapeHtml(buyerName)}</strong>
        </td>
        <td>
          <span class="text-muted" style="font-size:0.825rem; font-weight:500;">${escapeHtml(ministry)}</span>
        </td>
        <td>
          <div style="max-width: 180px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${l1Seller}
          </div>
        </td>
        <td>
          <span class="badge badge-gold">${l1Price}</span>
        </td>
        <td>
          ${posCell}
        </td>
        <td>
          <div class="remark-cell" style="position:relative; min-width:180px;">
            <input type="text" class="remark-input" data-bid="${bidNo}" value="${escapeHtml(b.user_remark || '')}" placeholder="+ Add remark..." oninput="autoSaveRemarkDebounced(this)" style="width:100%; font-size:0.8rem; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px; background:#f8fafc; color:#0f172a; outline:none; transition:all 0.2s ease;">
            <span class="remark-status" style="position:absolute; right:8px; top:50%; transform:translateY(-50%); font-size:0.65rem; color:#16a34a; font-weight:700; opacity:0; transition:opacity 0.2s ease; pointer-events:none;">Saved ✓</span>
          </div>
        </td>
        <td style="text-align: right;">
          <button class="btn btn-sm btn-secondary" onclick="viewBidDetails('${bidNo}')" style="margin-right:4px;">
            <i data-lucide="eye"></i> View Details
          </button>
          <button class="btn btn-sm btn-primary" onclick="openPdfModal('${pdfFilename}', '${bidNo}')">
            <i data-lucide="file-text"></i> PDF
          </button>
        </td>
      </tr>`;
  });

  tbody.innerHTML = html;
  lucide.createIcons();
}

let remarkTimer = null;
function autoSaveRemarkDebounced(inputEl) {
  const statusSpan = inputEl.parentElement.querySelector('.remark-status');
  if (statusSpan) {
    statusSpan.textContent = 'Saving...';
    statusSpan.style.color = '#d97706';
    statusSpan.style.opacity = '1';
  }
  clearTimeout(remarkTimer);
  remarkTimer = setTimeout(() => {
    saveRemarkFromInput(inputEl);
  }, 400);
}

async function saveRemarkFromInput(inputEl) {
  const bidNo = inputEl.dataset.bid;
  const remark = inputEl.value.trim();
  const statusSpan = inputEl.parentElement.querySelector('.remark-status');

  try {
    const res = await fetch('/api/remark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bid_number: bidNo, remark: remark })
    });
    const json = await res.json();
    if (json.status === 'success') {
      const bObj = allBidsData.find(b => b.bid_number === bidNo);
      if (bObj) bObj.user_remark = remark;

      if (statusSpan) {
        statusSpan.textContent = 'Saved ✓';
        statusSpan.style.color = '#16a34a';
        statusSpan.style.opacity = '1';
        setTimeout(() => { statusSpan.style.opacity = '0'; }, 1500);
      }
    }
  } catch (err) {
    console.error('Error saving remark:', err);
  }
}

async function saveUserStatusFromSelect(selectEl) {
  const bidNo = selectEl.dataset.bid;
  const userStatus = selectEl.value;
  try {
    const res = await fetch('/api/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bid_number: bidNo, user_status: userStatus })
    });
    const json = await res.json();
    if (json.status === 'success') {
      const bObj = allBidsData.find(b => b.bid_number === bidNo);
      if (bObj) bObj.user_status = userStatus;
    }
  } catch (err) {
    console.error('Error saving user status:', err);
  }
}

function formatPrice(str) {
  if (!str) return 'N/A';
  str = str.replace(/`/g, '₹').replace(/INR/g, '₹').trim();
  if (!str.startsWith('₹')) str = '₹ ' + str;
  return str;
}

// MODAL OPENERS
async function viewBidDetails(bidNo) {
  try {
    const res = await fetch(`/api/bid/${encodeURIComponent(bidNo)}`);
    const json = await res.json();
    if (json.status !== 'success') return;

    const data = json.data;
    const raInf = data.ra_info || {};
    document.getElementById('modalBidNumber').textContent = data.bid_number || bidNo;
    document.getElementById('modalBidStatus').textContent = (data.bid_details || {})['Bid Status'] || 'Active';

    // Populate Bid Details Grid with GeM Unified Bid ➔ RA Banner
    const gridBid = document.getElementById('gridBidDetails');
    
    let unifiedBanner = '';
    if (raInf.is_ra) {
      unifiedBanner = `
        <div style="grid-column: span 2; background: #faf5ff; border: 1.5px solid #d8b4fe; border-radius: 8px; padding: 14px; margin-bottom: 12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #e9d5ff; padding-bottom: 8px; margin-bottom: 10px;">
            <div style="font-weight:700; font-size:1.05rem; color:#6b21a8;">
              Bid No.: <strong>${data.bid_number || bidNo}</strong> 
              <span style="color:#a855f7; margin: 0 6px;">➔</span> 
              ⚡ RA NO: <strong style="color:#7e22ce;">${raInf.ra_number || data.bid_number}</strong>
            </div>
            <span class="badge badge-purple">${raInf.ra_status || 'Active'}</span>
          </div>
          <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size:0.875rem;">
            <div><strong style="color:#64748b;">RA Start Date:</strong> <span style="color:#16a34a; font-weight:600;">${raInf.ra_start_date || 'N/A'}</span></div>
            <div><strong style="color:#64748b;">RA End Date:</strong> <span style="color:#d97706; font-weight:600;">${raInf.ra_end_date || 'N/A'}</span></div>
          </div>
        </div>`;
    } else {
      unifiedBanner = `
        <div style="grid-column: span 2; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-weight:600; color:#334155;">
          Bid No.: <strong>${data.bid_number || bidNo}</strong> <span class="badge badge-slate" style="margin-left:8px;">Standard GeM Bid</span>
        </div>`;
    }

    gridBid.innerHTML = unifiedBanner;
    Object.entries(data.bid_details || {}).forEach(([k, v]) => {
      if (k !== 'Bid Number' && k !== 'RA Number') {
        gridBid.innerHTML += `
          <div class="detail-item">
            <div class="detail-label">${k}</div>
            <div class="detail-value">${v}</div>
          </div>`;
      }
    });

    // Dedicated User Remarks Box in Modal
    gridBid.innerHTML += `
      <div style="grid-column: span 2; margin-top: 14px; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
          <strong style="color: #0369a1; font-size: 0.85rem; display:flex; align-items:center; gap:6px;">
            <i data-lucide="edit-3" style="width:14px; height:14px;"></i> User Remarks & Notes for Tender
          </strong>
          <span id="modalRemarkSavedBadge" style="color: #16a34a; font-size: 0.75rem; font-weight: 700; opacity: 0; transition: opacity 0.2s ease;">Saved ✓</span>
        </div>
        <textarea id="modalUserRemarkText" rows="2" style="width:100%; border:1px solid #93c5fd; border-radius:6px; padding:8px; font-size:0.85rem; outline:none;" placeholder="Enter custom remarks, price strategy, or internal notes for this bid...">${escapeHtml(data.user_remark || '')}</textarea>
        <div style="text-align:right; margin-top:6px;">
          <button class="btn btn-primary btn-sm" onclick="saveModalUserRemark('${data.bid_number || bidNo}')">
            <i data-lucide="save"></i> Save Remark
          </button>
        </div>
      </div>`;

    // Populate Buyer Details Grid
    const gridBuyer = document.getElementById('gridBuyerDetails');
    gridBuyer.innerHTML = '';
    Object.entries(data.buyer_details || {}).forEach(([k, v]) => {
      gridBuyer.innerHTML += `
        <div class="detail-item" ${k === 'Address' ? 'style="grid-column: span 2;"' : ''}>
          <div class="detail-label">${k}</div>
          <div class="detail-value">${v}</div>
        </div>`;
    });

    // Populate Tech Eval Table
    const bodyTech = document.getElementById('bodyTechEval');
    bodyTech.innerHTML = '';
    const companyKws = ['DALUI', 'G.M. DALUI', 'GM DALUI', 'G M DALUI'];

    (data.technical_evaluation || []).forEach(row => {
      const sellerStr = (String(row['Seller Name'] || '') + ' ' + String(row['Offered Item'] || '')).toUpperCase();
      const isMyCompany = companyKws.some(kw => sellerStr.includes(kw));
      const rowStyle = isMyCompany ? 'style="background: #f0f9ff; font-weight:600; border-left: 4px solid #0284c7;"' : '';
      const compBadge = isMyCompany ? '<span class="badge badge-blue" style="margin-left:6px; font-size:0.65rem;">🏢 YOUR COMPANY</span>' : '';

      const status = row.Status || '';
      const badgeClass = status.toUpperCase().includes('QUALIFIED') && !status.toUpperCase().includes('DISQUALIFIED') ? 'badge-green' : 'badge-red';
      const participatedOn = Object.entries(row).find(([k, v]) => k.includes('Participated'))?.[1] || '';

      bodyTech.innerHTML += `
        <tr ${rowStyle}>
          <td>${row['S.No.'] || ''}</td>
          <td><strong>${row['Seller Name'] || ''}</strong>${compBadge}</td>
          <td>${row['Offered Item'] || ''}</td>
          <td>${participatedOn}</td>
          <td>${row['MSE/MII Status'] || row['MSE Status'] || 'N/A'}</td>
          <td><span class="badge ${badgeClass}">${status}</span></td>
        </tr>`;
    });

    // Populate Financial Eval Table
    const bodyFin = document.getElementById('bodyFinEval');
    bodyFin.innerHTML = '';
    const l1Row = (data.financial_evaluation || []).find(r => (r.Rank || '').toUpperCase() === 'L1');
    const parseNum = s => {
      const c = (s || '').toString().replace(/[^\d.]/g, '');
      return parseFloat(c) || 0;
    };
    const l1PriceNum = l1Row ? parseNum(l1Row['Total Price'] || l1Row['Total L1 Price']) : 0;

    (data.financial_evaluation || []).forEach(row => {
      const sellerStr = (String(row['Seller Name'] || '') + ' ' + String(row['L1 Seller Name'] || '') + ' ' + String(row['Offered Item'] || '')).toUpperCase();
      const isMyCompany = companyKws.some(kw => sellerStr.includes(kw));
      const rank = row.Rank || (row['L1 Seller Name'] ? 'L1' : '');
      const rankBadge = rank.toUpperCase() === 'L1' ? 'badge-gold' : 'badge-blue';
      const priceNum = parseNum(row['Total Price'] || row['Total L1 Price']);

      let gapBadge = '';
      if (l1PriceNum > 0 && priceNum > l1PriceNum && rank.toUpperCase() !== 'L1') {
        const diffAmt = priceNum - l1PriceNum;
        const diffPct = ((diffAmt / l1PriceNum) * 100).toFixed(2);
        gapBadge = `<div style="font-size:0.725rem; color:#ef4444; margin-top:2px;">+₹ ${diffAmt.toLocaleString('en-IN')} (+${diffPct}% higher than L1)</div>`;
      }

      const rowStyle = isMyCompany ? 'style="background: #f0f9ff; border-left: 4px solid #0284c7;"' : '';
      const compBadge = isMyCompany ? '<span class="badge badge-blue" style="margin-left:6px; font-size:0.65rem;">🏢 YOUR COMPANY</span>' : '';

      bodyFin.innerHTML += `
        <tr ${rowStyle}>
          <td>${row['S.No.'] || ''}</td>
          <td><strong>${row['Seller Name'] || row['L1 Seller Name'] || ''}</strong>${compBadge}</td>
          <td>${row['Offered Item'] || ''}</td>
          <td>
            <strong>${formatPrice(row['Total Price'] || row['Total L1 Price'])}</strong>
            ${gapBadge}
          </td>
          <td><span class="badge ${rankBadge}">${rank}</span></td>
        </tr>`;
    });

    // Populate Reverse Auction (RA) Tab
    const gridRa = document.getElementById('gridRaDetails');
    const containerRaTable = document.getElementById('raTableContainer');

    if (gridRa && containerRaTable) {
      if (raInf.is_ra) {
        gridRa.innerHTML = `
          <div class="detail-item">
            <div class="detail-label">Reverse Auction Status</div>
            <div class="detail-value"><span class="badge badge-purple">${raInf.ra_status || 'Active'}</span></div>
          </div>
          <div class="detail-item">
            <div class="detail-label">RA Number</div>
            <div class="detail-value"><strong>${raInf.ra_number || data.bid_number}</strong></div>
          </div>
          <div class="detail-item">
            <div class="detail-label">RA Start Date / Time</div>
            <div class="detail-value"><strong style="color:#16a34a;">${raInf.ra_start_date || 'N/A'}</strong></div>
          </div>
          <div class="detail-item">
            <div class="detail-label">RA End Date / Time</div>
            <div class="detail-value"><strong style="color:#d97706;">${raInf.ra_end_date || 'N/A'}</strong></div>
          </div>`;

        let raSchedulesUrl = raInf.ra_schedules_url || (raInf.ra_number ? `https://bidplus.gem.gov.in/view-ra-schedules/${data.source_id || ''}` : null);
        if (raSchedulesUrl) {
          raSchedulesUrl = raSchedulesUrl.replace(/list-ra-schedules/g, 'view-ra-schedules');
        }
        
        let bidResultUrl = data.bid_result_url || `https://bidplus.gem.gov.in/bidding/bid/getBidResultViewSchedule/${data.source_id || ''}`;
        bidResultUrl = bidResultUrl.replace(/list-ra-schedules/g, 'view-ra-schedules');

        if (raInf.ra_schedules && raInf.ra_schedules.length > 0) {
          let schedHtml = `
            <div style="margin-top: 16px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h4 style="font-size:0.95rem; font-weight:700; color:#6b21a8; display:flex; align-items:center; gap:6px; margin:0;">
                  <i data-lucide="layers" style="width:16px; height:16px;"></i> Reverse Auction (RA) Schedules (${raInf.ra_schedules.length})
                </h4>
                ${raSchedulesUrl ? `<a href="${raSchedulesUrl}" target="_blank" class="btn btn-secondary" style="font-size:0.75rem; padding:4px 10px; background:#f3e8ff; color:#7e22ce; border:1px solid #d8b4fe; text-decoration:none;"><i data-lucide="external-link"></i> Open GeM RA Schedules Link</a>` : ''}
              </div>
              <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:12px;">`;

          raInf.ra_schedules.forEach((sch, sIdx) => {
            const schLink = (sch.result_url || raSchedulesUrl || '').replace(/list-ra-schedules/g, 'view-ra-schedules');
            const itemName = sch.item_name || data.items || data.category || 'Tender Items / Services';
            
            schedHtml += `
              <div style="background:#ffffff; border: 1.5px solid #e9d5ff; border-radius: 8px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); display:flex; flex-direction:column; justify-content:space-between;">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #f3e8ff; padding-bottom:6px; margin-bottom:8px;">
                    <strong style="color:#7e22ce; font-size:0.9rem;">${sch.title || 'Schedule ' + (sIdx + 1)}</strong>
                    <span class="badge badge-purple" style="font-size:0.65rem;">${sch.status || 'Active'}</span>
                  </div>
                  <div style="font-size:0.8rem; color:#334155; margin-bottom:8px;">
                    <strong>Item Name:</strong> <span style="color:#0f172a; font-weight:600;">${itemName}</span>
                  </div>
                  <div style="font-size:0.825rem; color:#475569; display:grid; gap:4px; margin-bottom:10px;">
                    <div><strong>Start Date:</strong> <span style="color:#16a34a; font-weight:600;">${sch.start_date || 'N/A'}</span></div>
                    <div><strong>End Date:</strong> <span style="color:#d97706; font-weight:600;">${sch.end_date || 'N/A'}</span></div>
                  </div>
                </div>
                ${schLink ? `<a href="${schLink}" target="_blank" class="btn btn-primary" style="font-size:0.75rem; padding:6px 12px; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:6px; background:#7e22ce; border:none; width:100%; border-radius:6px; color:#ffffff; font-weight:600;"><i data-lucide="external-link" style="width:13px; height:13px;"></i> View RA Result</a>` : ''}
              </div>`;
          });

          schedHtml += `</div></div>`;
          containerRaTable.innerHTML = schedHtml;
        } else {
          containerRaTable.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; background:#faf5ff; border:1px solid #e9d5ff; padding:12px; border-radius:8px; margin-top:12px;">
              <span style="font-size:0.85rem; color:#6b21a8;">⚡ Reverse Auction active for this tender.</span>
              ${raSchedulesUrl ? `<a href="${raSchedulesUrl}" target="_blank" class="btn btn-secondary" style="font-size:0.75rem; padding:5px 12px; background:#7e22ce; color:#ffffff; border:none; text-decoration:none;"><i data-lucide="external-link"></i> View RA Schedules on GeM</a>` : ''}
            </div>`;
        }
      } else {
        gridRa.innerHTML = `
          <div class="detail-item" style="grid-column: span 2;">
            <div class="detail-label">Reverse Auction Info</div>
            <div class="detail-value" style="color:var(--text-muted);">Standard GeM Bid (No Reverse Auction / RA).</div>
          </div>`;
        containerRaTable.innerHTML = '';
      }
    }

    const pdfFilename = data.pdf_filename || `${(data.bid_number || bidNo).replace(/\//g, '_')}.pdf`;
    document.getElementById('modalOpenPdfBtn').onclick = () => {
      closeModal('detailsModal');
      openPdfModal(pdfFilename, data.bid_number);
    };

    openModal('detailsModal');
    lucide.createIcons();
  } catch (err) {
    console.error('Error fetching bid details:', err);
  }
}

function openPdfModal(filename, title = 'PDF Document') {
  const iframe = document.getElementById('pdfFrame');
  const pdfUrl = `/api/pdf/${filename}`;
  iframe.src = pdfUrl;

  document.getElementById('pdfModalTitle').textContent = `PDF Document - ${title}`;
  document.getElementById('pdfDownloadLink').href = pdfUrl;

  openModal('pdfModal');
}

async function openManageIdsModal() {
  try {
    const res = await fetch('/api/inputs');
    const json = await res.json();
    if (json.status === 'success') {
      document.getElementById('txtGemIds').value = (json.items || []).join('\n');
    }
  } catch (err) {
    console.error('Error loading inputs:', err);
  }
  openModal('manageModal');
}

async function saveAndRunScraper() {
  const txt = document.getElementById('txtGemIds').value.trim();
  if (!txt) return;

  closeModal('manageModal');
  await fetch('/api/inputs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: txt })
  });

  triggerRunScraper();
}

async function triggerRunScraper() {
  openModal('progressOverlay');
  document.getElementById('progressStatusText').textContent = 'Starting scraper engine...';
  document.getElementById('progressBarFill').style.width = '0%';
  document.getElementById('progressPercent').textContent = '0%';

  try {
    await fetch('/api/run-scraper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(checkScraperStatus, 1500);
  } catch (err) {
    console.error('Error triggering scraper:', err);
    closeModal('progressOverlay');
  }
}

async function checkScraperStatus() {
  try {
    const res = await fetch('/api/scraper-status');
    const status = await res.json();

    if (status.is_running) {
      document.getElementById('progressStatusText').textContent = status.status_message || 'Scraping...';
      const pct = status.total_items > 0 ? Math.round((status.current_index / status.total_items) * 100) : 0;
      document.getElementById('progressBarFill').style.width = `${pct}%`;
      document.getElementById('progressPercent').textContent = `${pct}%`;
    } else {
      clearInterval(pollingInterval);
      document.getElementById('progressStatusText').textContent = 'Completed!';
      document.getElementById('progressBarFill').style.width = '100%';
      document.getElementById('progressPercent').textContent = '100%';

      setTimeout(() => {
        closeModal('progressOverlay');
        fetchBids();
      }, 1000);
    }
  } catch (err) {
    console.error('Status check error:', err);
  }
}

// MODAL UTILS
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}
function switchTab(tabId, btn) {
  const modal = btn.closest('.modal-card');
  modal.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  modal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  btn.classList.add('active');
  const target = document.getElementById(tabId);
  if (target) target.classList.add('active');
}

async function saveModalUserRemark(bidNo) {
  const textEl = document.getElementById('modalUserRemarkText');
  if (!textEl) return;
  const text = textEl.value.trim();
  const badge = document.getElementById('modalRemarkSavedBadge');

  try {
    const res = await fetch('/api/remark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bid_number: bidNo, remark: text })
    });
    const json = await res.json();
    if (json.status === 'success') {
      const bObj = allBidsData.find(b => b.bid_number === bidNo);
      if (bObj) bObj.user_remark = text;
      filterBidsTable();
      if (badge) {
        badge.style.opacity = '1';
        setTimeout(() => { badge.style.opacity = '0'; }, 1500);
      }
    }
  } catch (err) {
    console.error('Error saving modal remark:', err);
  }
}
