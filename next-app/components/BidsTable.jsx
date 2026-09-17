'use client';
import { useState, useRef, useEffect } from 'react';
import { Award, Eye, FileText, FileSpreadsheet, Image as ImageIcon, XCircle, Filter, X, ExternalLink, Paperclip, Upload } from 'lucide-react';

const formatPrice = (str) => {
  if (!str) return '—';
  str = String(str).replace(/`/g, '₹').replace(/INR/g, '₹').trim();
  if (!str.startsWith('₹')) str = '₹ ' + str;
  return str;
};

const parseDateStringToDate = (str) => {
  if (!str || str === '—' || str === 'N/A') return null;
  // Match DD-MM-YYYY or DD/MM/YYYY with optional time
  const dmy = String(str).match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10) - 1;
    const year = parseInt(dmy[3], 10);
    return new Date(year, month, day);
  }
  // Match YYYY-MM-DD
  const ymd = String(str).match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymd) {
    const year = parseInt(ymd[1], 10);
    const month = parseInt(ymd[2], 10) - 1;
    const day = parseInt(ymd[3], 10);
    return new Date(year, month, day);
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
};

export default function BidsTable({ bids, onSaveRemark, onSaveStatus, onViewDetails, onOpenPdf, onRefresh, onUploadSuccess }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(1);
  const [activeColFilter, setActiveColFilter] = useState(null);
  const [columnFilters, setColumnFilters] = useState({});
  const [colSearchQuery, setColSearchQuery] = useState('');
  const [dateInputs, setDateInputs] = useState({});
  const dropdownRef = useRef(null);
  const [uploadingRow, setUploadingRow] = useState(null); // bid_number currently uploading
  const fileInputRefs = useRef({});

  // Order Number state
  const [orderNumbers, setOrderNumbers] = useState({});
  const [savedOrderNos, setSavedOrderNos] = useState({});

  useEffect(() => {
    const initial = {};
    (bids || []).forEach((b) => {
      const k = b.bid_number || b.raw_bid_no;
      if (k && b.order_number !== undefined) {
        initial[k] = b.order_number || '';
      }
    });
    setOrderNumbers((prev) => ({ ...initial, ...prev }));
  }, [bids]);

  const handleOrderNumberChange = (bidNo, val) => {
    setOrderNumbers((prev) => ({ ...prev, [bidNo]: val }));
  };

  const handleSaveOrderNumber = async (bidNo) => {
    const orderNo = orderNumbers[bidNo] !== undefined ? orderNumbers[bidNo] : '';
    try {
      const res = await fetch('/api/order-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bid_number: bidNo, order_number: orderNo }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setSavedOrderNos((prev) => ({ ...prev, [bidNo]: true }));
        setTimeout(() => {
          setSavedOrderNos((prev) => ({ ...prev, [bidNo]: false }));
        }, 2000);
      }
    } catch (err) {
      console.error('Error saving order number:', err);
    }
  };

  const handleFileUpload = async (bidNo, file) => {
    if (!file || !bidNo) return;
    setUploadingRow(bidNo);
    try {
      const formData = new FormData();
      formData.append('gem_id', bidNo);
      formData.append('pdf_file', file);
      formData.append('remarks', '');

      const res = await fetch('/api/upload-bid-document', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.status === 'success') {
        const dbRec = data.db_record || {};
        const url = data.drive_link || (dbRec.drive_links ? dbRec.drive_links[dbRec.drive_links.length - 1] : '');
        const fileExt = file.name ? (file.name.split('.').pop() || 'pdf').toLowerCase() : 'pdf';
        const fallbackAtt = { name: file.name || 'Uploaded File', url: url, type: fileExt };

        const newAtts = (dbRec.attachments && dbRec.attachments.length > 0)
          ? dbRec.attachments
          : [fallbackAtt];
        const newLinks = dbRec.drive_links || (url ? [url] : []);

        if (onUploadSuccess) {
          onUploadSuccess(bidNo, newAtts, newLinks);
        }
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      console.error('Error uploading file:', err);
    } finally {
      setUploadingRow(null);
      // Reset file input
      if (fileInputRefs.current[bidNo]) {
        fileInputRefs.current[bidNo].value = '';
      }
    }
  };

  // Define table columns with explicit min-widths to prevent overlapping
  const COLUMNS = [
    { key: 'index', label: '#', minWidth: '50px', getVal: (b, i) => i + 1 },
    {
      key: 'bid_no',
      label: 'GEM BID / RA NUMBER',
      minWidth: '220px',
      getVal: (b) => {
        const raNo = b.ra_info?.ra_number;
        const bNo = b.bid_number || '';
        return (raNo && raNo !== 'N/A' && raNo !== bNo) ? `${bNo} ${raNo}` : bNo;
      }
    },
    { 
      key: 'qty', 
      label: 'QUANTITY', 
      minWidth: '110px', 
      getVal: (b) => {
        const bd = b.bid_details || {};
        return bd['Quantity'] || bd['Contract Duration'] || bd['Items'] || '—';
      } 
    },
    {
      key: 'buyer_org',
      label: 'ORGANIZATION',
      minWidth: '220px',
      getVal: (b) => {
        const bd = b.buyer_details || {};
        const bdt = b.bid_details || {};
        return bd['Organisation'] || bd['Organisation Name'] || bd['Office'] || bd['Office Name'] || bdt['Department Name'] || '—';
      }
    },
    {
      key: 'buyer_ministry',
      label: 'MINISTRY / DEPARTMENT',
      minWidth: '220px',
      getVal: (b) => {
        const bd = b.buyer_details || {};
        const bdt = b.bid_details || {};
        return bd['Ministry'] || bd['Department'] || bd['Ministry/State Name'] || bd['Department Name'] || bdt['Department Name'] || '—';
      }
    },
    { 
      key: 'buyer_name', 
      label: 'BUYER NAME', 
      minWidth: '180px', 
      getVal: (b) => {
        const bd = b.buyer_details || {};
        return bd['Name'] || bd['Designation'] || '—';
      } 
    },
    {
      key: 'bid_end_date',
      label: 'BID CLOSING DATE',
      minWidth: '170px',
      getVal: (b) => {
        const bdt = b.bid_details || {};
        return bdt['Bid End Date / Time'] || bdt['Bid End Date'] || '—';
      }
    },
    {
      key: 'ra_dates',
      label: 'RA DATES',
      minWidth: '200px',
      getVal: (b) => {
        const bdt = b.bid_details || {};
        const raInf = b.ra_info || {};
        const isRa = raInf.is_ra || (raInf.ra_number && raInf.ra_number !== 'N/A') || (raInf.ra_start_date && raInf.ra_start_date !== 'N/A') || bdt['RA Start Date / Time'];
        if (!isRa) return '—';
        const rStart = raInf.ra_start_date || bdt['RA Start Date / Time'] || '—';
        const rEnd = raInf.ra_end_date || bdt['RA End Date / Time'] || '—';
        return `${rStart} - ${rEnd}`;
      }
    },
    {
      key: 'dalui_pos',
      label: 'G.M. DALUI - OUR BID',
      minWidth: '195px',
      getVal: (b) => {
        const cAn = b.company_analysis || {};
        if (cAn.is_l1) return 'WON L1';
        if (cAn.is_disqualified) return 'Disqualified';
        if (cAn.diff_amount > 0) return `Ranked (${cAn.rank})`;
        if (cAn.is_qualified) return 'Qualified';
        if (cAn.participated) return 'Participated';
        return 'Not Participated';
      }
    },
    { 
      key: 'l1_price', 
      label: 'L1 PRICE', 
      minWidth: '130px', 
      getVal: (b) => {
        const fe = b.financial_evaluation || [];
        const cAn = b.company_analysis || {};
        const p = fe[0]?.['Total Price'] || fe[0]?.['Total L1 Price'] || fe[0]?.['total_price'] || fe[0]?.['price'] || cAn.l1_price;
        return p && p !== 'N/A' && p !== 0 ? formatPrice(p) : '—';
      } 
    },
    { key: 'status', label: 'STATUS', minWidth: '140px', getVal: (b) => b.user_status || 'Pending' },
    {
      key: 'order_number',
      label: 'ORDER NUMBER',
      minWidth: '160px',
      getVal: (b) => {
        const k = b.bid_number || b.raw_bid_no;
        return orderNumbers[k] !== undefined ? orderNumbers[k] : (b.order_number || '');
      }
    }
  ];

  const handleSort = (key) => {
    if (sortKey === key) {
      if (sortDir === 1) setSortDir(-1);
      else { setSortKey(null); setSortDir(1); }
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) && !e.target.closest('.th-filter-btn')) {
        setActiveColFilter(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getDistinctValues = (colKey) => {
    const col = COLUMNS.find((c) => c.key === colKey);
    if (!col) return [];
    const setVals = new Set();
    bids.forEach((b) => {
      const v = col.getVal(b);
      if (v !== undefined && v !== null && v !== '') setVals.add(String(v));
    });
    return Array.from(setVals).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  };

  const filterByColumnFilters = (inputBids) => {
    const activeKeys = Object.keys(columnFilters).filter((k) => {
      const f = columnFilters[k];
      if (!f) return false;
      if (f instanceof Set) return f.size > 0;
      return Boolean(f.from || f.to);
    });
    if (activeKeys.length === 0) return inputBids;

    return inputBids.filter((b) => {
      for (const key of activeKeys) {
        const col = COLUMNS.find((c) => c.key === key);
        const filter = columnFilters[key];
        if (!col || !filter) continue;

        if (filter instanceof Set) {
          const val = col.getVal(b);
          if (!filter.has(String(val))) return false;
        } else if (typeof filter === 'object' && (filter.from || filter.to)) {
          const fromDate = filter.from ? new Date(filter.from + 'T00:00:00') : null;
          const toDate = filter.to ? new Date(filter.to + 'T23:59:59') : null;

          if (key === 'bid_end_date') {
            const bdt = b.bid_details || {};
            const dStr = bdt['Bid End Date / Time'] || bdt['Bid End Date'] || '';
            const d = parseDateStringToDate(dStr);
            if (!d) return false;
            if (fromDate && d < fromDate) return false;
            if (toDate && d > toDate) return false;
          } else if (key === 'ra_dates') {
            const bdt = b.bid_details || {};
            const raInf = b.ra_info || {};
            const rStartStr = raInf.ra_start_date || bdt['RA Start Date / Time'] || raInf.ra_schedules?.[0]?.start_date || '';
            const rEndStr = raInf.ra_end_date || bdt['RA End Date / Time'] || raInf.ra_schedules?.[0]?.end_date || '';
            const dStart = parseDateStringToDate(rStartStr);
            const dEnd = parseDateStringToDate(rEndStr);
            const targetDate = dEnd || dStart;
            if (!targetDate) return false;
            if (fromDate && targetDate < fromDate) return false;
            if (toDate && targetDate > toDate) return false;
          }
        }
      }
      return true;
    });
  };

  const filteredBids = filterByColumnFilters(bids);

  const sortedBids = [...filteredBids].sort((a, b) => {
    if (!sortKey || sortDir === 0) return 0;
    const col = COLUMNS.find((c) => c.key === sortKey);
    if (!col) return 0;
    const va = col.getVal(a);
    const vb = col.getVal(b);
    if (va === vb) return 0;
    if (va === 'N/A' || va === '') return 1;
    if (vb === 'N/A' || vb === '') return -1;
    return String(va).localeCompare(String(vb), undefined, { numeric: true }) * sortDir;
  });

  const toggleColValue = (colKey, val) => {
    setColumnFilters((prev) => {
      const existing = prev[colKey] ? new Set(prev[colKey]) : new Set();
      if (existing.has(val)) existing.delete(val);
      else existing.add(val);
      return { ...prev, [colKey]: existing };
    });
  };

  const clearColFilter = (colKey) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      delete next[colKey];
      return next;
    });
  };

  const selectAllColValues = (colKey) => {
    const vals = getDistinctValues(colKey);
    setColumnFilters((prev) => ({ ...prev, [colKey]: new Set(vals) }));
  };

  const handleDateChange = (colKey, field, value) => {
    const cur = { ...(dateInputs[colKey] || columnFilters[colKey] || {}), [field]: value };
    setDateInputs((prev) => ({ ...prev, [colKey]: cur }));
    if (!cur.from && !cur.to) {
      clearColFilter(colKey);
    } else {
      setColumnFilters((prev) => ({
        ...prev,
        [colKey]: { from: cur.from || '', to: cur.to || '' }
      }));
    }
  };

  const handleClearDateFilter = (colKey) => {
    setDateInputs((prev) => ({ ...prev, [colKey]: { from: '', to: '' } }));
    clearColFilter(colKey);
  };

  return (
    <div className="table-responsive">
      <table className="dashboard-table">
        <thead>
          <tr>
            {COLUMNS.map((col, colIdx) => {
              const isDateCol = col.key === 'bid_end_date' || col.key === 'ra_dates';
              const filterVal = columnFilters[col.key];
              const filterActive = isDateCol
                ? Boolean(filterVal?.from || filterVal?.to)
                : Boolean(filterVal instanceof Set && filterVal.size > 0);
              const filterCount = isDateCol
                ? (filterVal?.from || filterVal?.to ? 1 : 0)
                : (filterVal instanceof Set ? filterVal.size : 0);
              const isLeftAligned = colIdx < 6;

              return (
                <th key={col.key} style={{ minWidth: col.minWidth, position: 'relative' }}>
                  <div className="th-wrap">
                    <span className="th-label" onClick={() => handleSort(col.key)}>
                      {col.label}
                      {sortKey === col.key && (
                        <span className="sort-indicator">{sortDir === 1 ? ' ▲' : ' ▼'}</span>
                      )}
                    </span>
                    {col.key !== 'index' && (
                      <button
                        className={`th-filter-btn ${filterActive ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextKey = activeColFilter === col.key ? null : col.key;
                          setActiveColFilter(nextKey);
                          setColSearchQuery('');
                          if (isDateCol && nextKey) {
                            setDateInputs((prev) => ({
                              ...prev,
                              [col.key]: columnFilters[col.key] || { from: '', to: '' }
                            }));
                          }
                        }}
                        title={`Filter ${col.label}`}
                      >
                        <Filter className="w-3 h-3" />
                        {filterCount > 0 && <span className="th-filter-count">{filterCount}</span>}
                      </button>
                    )}
                  </div>

                  {/* Per Column Filter Dropdown */}
                  {activeColFilter === col.key && (
                    <div className={`col-dropdown open ${isLeftAligned ? 'align-left' : 'align-right'}`} ref={dropdownRef}>
                      <div className="dd-pop-header">
                        <span>Filter {col.label}</span>
                        <button className="dd-close-x" onClick={() => setActiveColFilter(null)}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {isDateCol ? (
                        <div className="dd-date-range">
                          <div className="dd-date-group">
                            <label className="dd-date-label">From Date</label>
                            <input
                              type="date"
                              className="dd-date-input"
                              value={dateInputs[col.key]?.from || columnFilters[col.key]?.from || ''}
                              onChange={(e) => handleDateChange(col.key, 'from', e.target.value)}
                            />
                          </div>
                          <div className="dd-date-group">
                            <label className="dd-date-label">To Date</label>
                            <input
                              type="date"
                              className="dd-date-input"
                              value={dateInputs[col.key]?.to || columnFilters[col.key]?.to || ''}
                              onChange={(e) => handleDateChange(col.key, 'to', e.target.value)}
                            />
                          </div>
                          <div className="dd-date-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleClearDateFilter(col.key)}
                              style={{ width: '100%' }}
                            >
                              Reset Dates
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="dd-search">
                            <input
                              type="text"
                              placeholder="Search options..."
                              value={colSearchQuery}
                              onChange={(e) => setColSearchQuery(e.target.value)}
                            />
                          </div>
                          <div className="dd-actions-bar">
                            <button onClick={() => selectAllColValues(col.key)}>Select All</button>
                            <button onClick={() => clearColFilter(col.key)}>Clear</button>
                          </div>
                          <div className="dd-options">
                            {getDistinctValues(col.key)
                              .filter((v) => v.toLowerCase().includes(colSearchQuery.toLowerCase()))
                              .map((val) => {
                                const isChecked = columnFilters[col.key]?.has(val) || false;
                                return (
                                  <label key={val} className="dd-opt">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggleColValue(col.key, val)}
                                    />
                                    <span>{val}</span>
                                  </label>
                                );
                              })}
                          </div>
                          <div className="dd-footer">
                            <button className="btn btn-secondary btn-sm" onClick={() => clearColFilter(col.key)} style={{ width: '100%' }}>
                              Reset Filter
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </th>
              );
            })}
            <th style={{ minWidth: '130px' }}>ORDERS PDF</th>
            <th style={{ minWidth: '240px' }}>ATTACHED FILES</th>
            <th style={{ minWidth: '120px', textAlign: 'center' }}>ADD FILE</th>
            <th style={{ minWidth: '170px' }}>USER REMARK</th>
            <th style={{ minWidth: '100px', textAlign: 'right' }}>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {sortedBids.length === 0 ? (
            <tr>
              <td colSpan={17} className="text-center py-8 text-muted">
                No tender records found matching your active filter criteria.
              </td>
            </tr>
          ) : (
            sortedBids.map((b, i) => {
              const bDetails = b.bid_details || {};
              const buyerDetails = b.buyer_details || {};
              const finEval = b.financial_evaluation || [];
              const cAn = b.company_analysis || {};
              const raInf = b.ra_info || {};
              const bidNo = b.bid_number || 'N/A';
              const rawBidNo = b.raw_bid_no || bidNo;

              const isStandaloneRa = rawBidNo.includes('/R/');
              const isRa = raInf.is_ra;
              const raNo = raInf.ra_number;

              const GMD_LABEL = 'G.M. DALUI & SONS';

              // Render G.M. DALUI Our Bid cell
              let posCell = <span className="pill-badge pill-slate">—</span>;
              if (cAn.participated) {
                const myPrice = cAn.my_price && cAn.my_price > 0 ? (
                  <div className="our-price-sub">
                    Our Price: <strong>₹ {Number(cAn.my_price).toLocaleString('en-IN')}</strong>
                  </div>
                ) : null;

                const rankPill = cAn.rank && cAn.rank !== 'N/A' ? (
                  <span className="rank-tag">
                    {cAn.rank}
                  </span>
                ) : null;

                const gmdHeader = (
                  <div className="gmd-name" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                    <img src="/logo.png" alt="DALUI" style={{ height: '14px', width: 'auto', objectFit: 'contain' }} />
                    <span>{GMD_LABEL}</span>
                  </div>
                );

                if (cAn.is_l1) {
                  posCell = (
                    <div>
                      {gmdHeader}
                      <span className="pill-badge pill-gold"><Award className="w-3 h-3" /> WON L1!</span>
                      {myPrice}
                    </div>
                  );
                } else if (cAn.is_disqualified) {
                  posCell = (
                    <div>
                      {gmdHeader}
                      <span className="pill-badge pill-red"><XCircle className="w-3 h-3" /> Disqualified</span>
                      {myPrice}
                    </div>
                  );
                } else if (cAn.diff_amount > 0) {
                  posCell = (
                    <div>
                      {gmdHeader}
                      <div>
                        {rankPill}
                        <span className="pill-badge pill-amber">+₹ {Number(cAn.diff_amount).toLocaleString('en-IN')} (+{cAn.diff_pct}% vs L1)</span>
                      </div>
                      {myPrice}
                    </div>
                  );
                } else {
                  posCell = (
                    <div>
                      {gmdHeader}
                      <span className="pill-badge pill-green">{rankPill}Qualified</span>
                      {myPrice}
                    </div>
                  );
                }
              }

              // Status Dropdown styling
              const userStatus = b.user_status || 'Pending';
              let statusClass = 'pill-status-pending';
              if (userStatus === 'Participating') statusClass = 'pill-status-qualified';
              else if (userStatus === 'Won') statusClass = 'pill-status-won';
              else if (userStatus === 'Not Interested') statusClass = 'pill-status-disqualified';

              return (
                <tr key={bidNo + i}>
                  <td className="cell-num">{i + 1}</td>
                  <td>
                    {isStandaloneRa ? (
                      <div>
                        <strong className="bid-number text-purple">⚡ {bidNo}</strong>
                        <div style={{ marginTop: '2px' }}>
                          <span className="pill-badge pill-purple">Standalone RA</span>
                        </div>
                      </div>
                    ) : isRa && raNo && raNo !== 'N/A' && raNo !== bidNo ? (
                      <div>
                        <strong className="bid-number">{bidNo}</strong>
                        <div className="ra-sub-badge">
                          <span>⚡ RA NO: {raNo}</span>
                        </div>
                      </div>
                    ) : (
                      <div><strong className="bid-number">{bidNo}</strong></div>
                    )}
                  </td>
                  <td>
                    <span className="cell-qty">
                      {bDetails['Quantity'] || bDetails['Contract Duration'] || bDetails['Items'] || '—'}
                    </span>
                  </td>
                  <td>
                    <div className="buyer-org">
                      {buyerDetails['Organisation'] || buyerDetails['Organisation Name'] || buyerDetails['Office'] || buyerDetails['Office Name'] || '—'}
                    </div>
                  </td>
                  <td>
                    <div className="buyer-dept">
                      {buyerDetails['Ministry'] || buyerDetails['Department'] || buyerDetails['Ministry/State Name'] || buyerDetails['Department Name'] || bDetails['Department Name'] || '—'}
                    </div>
                  </td>
                  <td>
                    <div className="buyer-name">{buyerDetails['Name'] || buyerDetails['Designation'] || '—'}</div>
                  </td>
                  <td>
                    <div className="date-cell">
                      <span className="d-end">{bDetails['Bid End Date / Time'] || bDetails['Bid End Date'] || '—'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="date-cell">
                      {(() => {
                        const isRaActive = isRa || (raNo && raNo !== 'N/A') || (raInf.ra_start_date && raInf.ra_start_date !== 'N/A') || bDetails['RA Start Date / Time'];
                        if (!isRaActive) return <span className="text-muted">—</span>;
                        const raStart = raInf.ra_start_date || bDetails['RA Start Date / Time'] || raInf.ra_schedules?.[0]?.start_date || '—';
                        const raEnd = raInf.ra_end_date || bDetails['RA End Date / Time'] || raInf.ra_schedules?.[0]?.end_date || '—';
                        return (
                          <>
                            <span className="d-start">Start: {raStart}</span>
                            <span className="d-end">End: {raEnd}</span>
                          </>
                        );
                      })()}
                    </div>
                  </td>
                  <td>{posCell}</td>
                  <td>
                    {(() => {
                      const rawPrice = finEval[0]?.['Total Price'] || finEval[0]?.['Total L1 Price'] || finEval[0]?.['total_price'] || finEval[0]?.['price'] || cAn.l1_price || b.l1_price;
                      if (rawPrice && rawPrice !== 'N/A' && rawPrice !== 0) {
                        return <div className="l1-price-val">{formatPrice(rawPrice)}</div>;
                      }
                      const tEval = b.technical_evaluation || [];
                      const isOngoing = (bDetails['Bid Status'] && (bDetails['Bid Status'].includes('Ongoing') || bDetails['Bid Status'].includes('Active'))) || tEval.length === 0;
                      if (isOngoing) {
                        return <span className="pill-badge pill-slate" style={{ fontSize: '0.72rem' }}>Eval Pending</span>;
                      }
                      return <span className="text-muted">—</span>;
                    })()}
                  </td>
                  <td>
                    <select
                      className={`user-status-select ${statusClass}`}
                      value={userStatus}
                      onChange={(e) => onSaveStatus(bidNo, e.target.value)}
                    >
                      <option value="Pending">Pending</option>
                      <option value="Participating">Participating</option>
                      <option value="Won">Won</option>
                      <option value="Not Interested">Not Interested</option>
                    </select>
                  </td>
                  <td>
                    <div className="order-num-input-wrap">
                      <input
                        type="text"
                        className="order-num-input"
                        placeholder="Enter Order No"
                        value={orderNumbers[bidNo] !== undefined ? orderNumbers[bidNo] : (b.order_number || '')}
                        onChange={(e) => handleOrderNumberChange(bidNo, e.target.value)}
                        onBlur={() => handleSaveOrderNumber(bidNo)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.target.blur();
                          }
                        }}
                      />
                      {savedOrderNos[bidNo] && (
                        <span className="order-saved-tag">✓ Saved</span>
                      )}
                    </div>
                  </td>
                  {/* ORDERS PDF Column (Strictly from order_pdf in database) */}
                  <td>
                    {b.order_pdf && b.order_pdf.trim() ? (
                      b.order_pdf.startsWith('http') ? (
                        <a
                          href={b.order_pdf}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="action-btn btn-pdf"
                          title="View Order PDF on Google Drive"
                          style={{ textDecoration: 'none' }}
                        >
                          <FileText className="w-3.5 h-3.5" /> Drive <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <button
                          className="action-btn btn-pdf"
                          onClick={() => onOpenPdf(b.order_pdf, bidNo)}
                          title="View Order PDF"
                        >
                          <FileText className="w-3.5 h-3.5" /> PDF
                        </button>
                      )
                    ) : (
                      <span className="pill-badge pill-slate" style={{ fontSize: '0.7rem' }}>—</span>
                    )}
                  </td>
                  {/* ATTACHED FILES Column (Displays all attachment file names with direct Google Drive links) */}
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                      {(() => {
                        let rawList = [];
                        if (Array.isArray(b.attachments) && b.attachments.length > 0) {
                          rawList = [...b.attachments];
                        }
                        if (Array.isArray(b.drive_links) && b.drive_links.length > 0) {
                          rawList = [...rawList, ...b.drive_links.map((link, idx) => ({ name: `Doc ${idx + 1}`, url: link, type: 'pdf' }))];
                        }
                        if (b.drive_link && typeof b.drive_link === 'string') {
                          try {
                            const parsed = JSON.parse(b.drive_link);
                            if (Array.isArray(parsed)) rawList = [...rawList, ...parsed];
                            else rawList.push({ name: 'Doc 1', url: b.drive_link, type: 'pdf' });
                          } catch {
                            b.drive_link.split(',').filter(Boolean).forEach((link, idx) => {
                              rawList.push({ name: `Doc ${idx + 1}`, url: link.trim(), type: 'pdf' });
                            });
                          }
                        }

                        // Deduplicate across all items by URL
                        const seenUrls = new Set();
                        const uniqueAtts = [];
                        for (const item of rawList) {
                          const u = typeof item === 'string' ? item : item?.url;
                          if (u && !seenUrls.has(u)) {
                            seenUrls.add(u);
                            uniqueAtts.push(item);
                          }
                        }

                        if (uniqueAtts.length === 0) {
                          return <span className="pill-badge pill-slate" style={{ fontSize: '0.7rem' }}>—</span>;
                        }

                        return uniqueAtts.map((att, idx) => {
                          const url = typeof att === 'string' ? att : att.url;
                          const name = typeof att === 'string' ? `Doc ${idx + 1}` : (att.name || `Doc ${idx + 1}`);
                          let ext = (typeof att === 'object' && att.type ? att.type : (name.split('.').pop() || 'pdf')).toLowerCase();
                          if (url.includes('.pdf') || name.toLowerCase().endsWith('.pdf')) ext = 'pdf';

                          let icon = <Paperclip className="w-3 h-3" />;
                          let pillClass = "pill-badge pill-slate";

                          if (ext === 'pdf') {
                            icon = <FileText className="w-3 h-3 text-red-500" />;
                            pillClass = "pill-badge pill-red";
                          } else if (ext === 'doc' || ext === 'docx') {
                            icon = <FileText className="w-3 h-3 text-blue-500" />;
                            pillClass = "pill-badge pill-blue";
                          } else if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') {
                            icon = <FileSpreadsheet className="w-3 h-3 text-green-600" />;
                            pillClass = "pill-badge pill-green";
                          } else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
                            icon = <ImageIcon className="w-3 h-3 text-amber-500" />;
                            pillClass = "pill-badge pill-amber";
                          }

                          return (
                            <a
                              key={idx}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={pillClass}
                              title={`Open ${name} in Google Drive (${url})`}
                              style={{
                                textDecoration: 'none',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '0.74rem',
                                fontWeight: '600',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: '1px solid rgba(0, 0, 0, 0.08)',
                                maxWidth: '240px',
                                width: 'fit-content',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <span style={{ flexShrink: 0 }}>{icon}</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                              <ExternalLink className="w-2.5 h-2.5 opacity-60 ml-0.5" style={{ flexShrink: 0 }} />
                            </a>
                          );
                        });
                      })()}
                    </div>
                  </td>
                  {/* ADD FILE Column (Dedicated upload button) */}
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
                      ref={(el) => { fileInputRefs.current[bidNo] = el; }}
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(bidNo, file);
                      }}
                    />
                    {uploadingRow === bidNo ? (
                      <span className="pill-badge pill-amber" style={{ fontSize: '0.68rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <Upload className="w-3 h-3 spin-icon" /> Uploading...
                      </span>
                    ) : (
                      <button
                        className="pill-badge pill-slate"
                        onClick={() => fileInputRefs.current[bidNo]?.click()}
                        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', border: '1px dashed #cbd5e1', background: '#f8fafc', padding: '3px 8px' }}
                        title="Upload file to Google Drive for this GeM ID"
                      >
                        <Upload className="w-3 h-3" /> + Add File
                      </button>
                    )}
                  </td>
                  <td>
                    <div className="remark-cell">
                      <input
                        type="text"
                        className="remark-input"
                        defaultValue={b.user_remark || ''}
                        placeholder="+ Add remark..."
                        onBlur={(e) => onSaveRemark(bidNo, e.target.value)}
                      />
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      className="action-btn btn-view"
                      onClick={() => onViewDetails(bidNo)}
                      title="View Details"
                    >
                      <Eye className="w-3.5 h-3.5" /> Details
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
