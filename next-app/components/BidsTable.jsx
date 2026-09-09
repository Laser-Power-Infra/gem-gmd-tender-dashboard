'use client';
import { useState, useRef, useEffect } from 'react';
import { Award, Zap, Eye, FileText, CheckCircle, XCircle, ArrowUpDown, Filter, Check, X } from 'lucide-react';

export default function BidsTable({ bids, onSaveRemark, onSaveStatus, onViewDetails, onOpenPdf }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(1);
  const [activeColFilter, setActiveColFilter] = useState(null);
  const [columnFilters, setColumnFilters] = useState({});
  const [colSearchQuery, setColSearchQuery] = useState('');
  const dropdownRef = useRef(null);

  // Define table columns
  const COLUMNS = [
    { key: 'index', label: '#', type: 'text', getVal: (b, i) => i + 1 },
    {
      key: 'bid_no',
      label: 'GeM Bid / RA Number',
      type: 'text',
      getVal: (b) => {
        const raNo = b.ra_info?.ra_number;
        const bNo = b.bid_number || '';
        return (raNo && raNo !== 'N/A') ? `${bNo} ${raNo}` : bNo;
      }
    },
    { key: 'qty', label: 'Quantity', type: 'number', getVal: (b) => b.bid_details?.['Quantity'] || 'N/A' },
    { key: 'buyer_name', label: 'Buyer Name', type: 'text', getVal: (b) => b.buyer_details?.['Name'] || 'N/A' },
    {
      key: 'buyer_ministry',
      label: 'Ministry / Department',
      type: 'text',
      getVal: (b) => {
        const bd = b.buyer_details || {};
        return bd['Ministry'] || bd['Department'] || bd['Organisation'] || bd['Office'] || 'N/A';
      }
    },
    {
      key: 'dates',
      label: 'RA & Bid Closing Dates',
      type: 'date',
      getVal: (b) => b.ra_info?.ra_end_date || b.bid_details?.['Bid End Date / Time'] || ''
    },
    {
      key: 'dalui_pos',
      label: 'G.M. DALUI — Our Bid',
      type: 'text',
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
    { key: 'l1_price', label: 'L1 Price', type: 'number', getVal: (b) => b.financial_evaluation?.[0]?.['Total Price'] || 'N/A' },
    { key: 'status', label: 'Status', type: 'text', getVal: (b) => b.user_status || 'Pending' }
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

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) && !e.target.closest('.th-filter-btn')) {
        setActiveColFilter(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute distinct values for column filter
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

  // Filter bids by active per-column filters
  const filterByColumnFilters = (inputBids) => {
    const activeKeys = Object.keys(columnFilters).filter((k) => {
      const f = columnFilters[k];
      return f instanceof Set ? f.size > 0 : Boolean(f?.from || f?.to);
    });
    if (activeKeys.length === 0) return inputBids;

    return inputBids.filter((b) => {
      for (const key of activeKeys) {
        const col = COLUMNS.find((c) => c.key === key);
        const filter = columnFilters[key];
        const val = col ? col.getVal(b) : '';
        if (filter instanceof Set) {
          if (!filter.has(String(val))) return false;
        }
      }
      return true;
    });
  };

  const filteredBids = filterByColumnFilters(bids);

  // Sort filtered bids
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

  const formatPrice = (str) => {
    if (!str) return 'N/A';
    str = String(str).replace(/`/g, '₹').replace(/INR/g, '₹').trim();
    if (!str.startsWith('₹')) str = '₹ ' + str;
    return str;
  };

  return (
    <div className="table-responsive" style={{ position: 'relative' }}>
      <table className="dashboard-table">
        <thead>
          <tr>
            {COLUMNS.map((col) => {
              const filterActive = Boolean(columnFilters[col.key]?.size);
              const filterCount = columnFilters[col.key]?.size || 0;

              return (
                <th key={col.key} style={{ position: 'relative' }}>
                  <div className="th-wrap">
                    <span className="th-label" onClick={() => handleSort(col.key)}>
                      {col.label}
                    </span>
                    {sortKey === col.key && (
                      <span className="sort-indicator">{sortDir === 1 ? '▲' : '▼'}</span>
                    )}
                    {col.key !== 'index' && col.key !== 'dates' && (
                      <button
                        className={`th-filter-btn ${filterActive ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveColFilter(activeColFilter === col.key ? null : col.key);
                          setColSearchQuery('');
                        }}
                        title={`Filter ${col.label}`}
                      >
                        <Filter className="w-3.5 h-3.5" />
                        {filterCount > 0 && <span className="th-filter-count">{filterCount}</span>}
                      </button>
                    )}
                  </div>

                  {/* Per Column Filter Dropdown */}
                  {activeColFilter === col.key && (
                    <div className="col-dropdown open" ref={dropdownRef} style={{ left: 0, top: '100%' }}>
                      <div className="dd-pop-header">
                        <span>Filter {col.label}</span>
                        <button className="dd-close-x" onClick={() => setActiveColFilter(null)}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="dd-search">
                        <input
                          type="text"
                          placeholder="Search filter options..."
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
                    </div>
                  )}
                </th>
              );
            })}
            <th>User Remarks</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedBids.length === 0 ? (
            <tr>
              <td colSpan={11} className="text-center py-8 text-muted">
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
              let posCell = <span className="badge badge-slate">—</span>;
              if (cAn.participated) {
                const myPrice = cAn.my_price && cAn.my_price > 0 ? (
                  <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: '4px' }}>
                    Our Price: <strong style={{ color: '#0f172a' }}>₹ {Number(cAn.my_price).toLocaleString('en-IN')}</strong>
                  </div>
                ) : null;

                const rankPill = cAn.rank && cAn.rank !== 'N/A' ? (
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '1px 7px', borderRadius: '20px', display: 'inline-block', marginRight: '4px' }}>
                    {cAn.rank}
                  </span>
                ) : null;

                if (cAn.is_l1) {
                  posCell = (
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>{GMD_LABEL}</div>
                      <span className="badge badge-gold"><Award className="w-3 h-3" /> WON L1!</span>
                      {myPrice}
                    </div>
                  );
                } else if (cAn.is_disqualified) {
                  posCell = (
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>{GMD_LABEL}</div>
                      <span className="badge badge-red"><XCircle className="w-3 h-3" /> Disqualified</span>
                      {myPrice}
                    </div>
                  );
                } else if (cAn.diff_amount > 0) {
                  posCell = (
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>{GMD_LABEL}</div>
                      <div>
                        {rankPill}
                        <span className="badge badge-amber">+₹ {Number(cAn.diff_amount).toLocaleString('en-IN')} (+{cAn.diff_pct}% vs L1)</span>
                      </div>
                      {myPrice}
                    </div>
                  );
                } else {
                  posCell = (
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>{GMD_LABEL}</div>
                      <span className="badge badge-green">{rankPill}Qualified</span>
                      {myPrice}
                    </div>
                  );
                }
              }

              // Status Dropdown style
              const userStatus = b.user_status || 'Pending';
              let statusBg = '#f1f5f9';
              let statusColor = '#475569';
              if (userStatus === 'Participating') { statusBg = '#dbeafe'; statusColor = '#1d4ed8'; }
              else if (userStatus === 'Won') { statusBg = '#fef3c7'; statusColor = '#92400e'; }
              else if (userStatus === 'Not Interested') { statusBg = '#fee2e2'; statusColor = '#b91c1c'; }

              return (
                <tr key={bidNo + i}>
                  <td>{i + 1}</td>
                  <td>
                    {isStandaloneRa ? (
                      <div>
                        <strong style={{ color: '#6b21a8', fontSize: '0.925rem' }}>⚡ {bidNo}</strong>
                        <div style={{ marginTop: '3px' }}>
                          <span className="badge badge-purple" style={{ fontSize: '0.65rem', padding: '2px 6px', fontWeight: 700 }}>
                            Standalone Reverse Auction
                          </span>
                        </div>
                      </div>
                    ) : isRa && raNo && raNo !== 'N/A' && raNo !== bidNo ? (
                      <div>
                        <strong style={{ color: 'var(--text-main)', fontSize: '0.925rem' }}>{bidNo}</strong>
                        <div style={{ fontSize: '0.75rem', color: '#7e22ce', marginTop: '3px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>➔</span> <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>⚡ RA NO: {raNo}</span>
                        </div>
                      </div>
                    ) : (
                      <div><strong style={{ color: 'var(--text-main)', fontSize: '0.925rem' }}>{bidNo}</strong></div>
                    )}
                  </td>
                  <td><strong>{bDetails['Quantity'] || 'N/A'}</strong></td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{buyerDetails['Name'] || 'N/A'}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                      {buyerDetails['Ministry'] || buyerDetails['Department'] || buyerDetails['Organisation'] || buyerDetails['Office'] || 'N/A'}
                    </div>
                  </td>
                  <td>
                    <div className="date-cell">
                      <span className="d-start">Start: {bDetails['Bid Start Date / Time'] || 'N/A'}</span>
                      <span className="d-end">End: {bDetails['Bid End Date / Time'] || 'N/A'}</span>
                    </div>
                  </td>
                  <td>{posCell}</td>
                  <td>
                    <div><strong>{formatPrice(finEval[0]?.['Total Price'])}</strong></div>
                  </td>
                  <td>
                    <select
                      className="user-status-select"
                      value={userStatus}
                      onChange={(e) => onSaveStatus(bidNo, e.target.value)}
                      style={{ background: statusBg, color: statusColor, border: 'none' }}
                    >
                      <option value="Pending">Pending</option>
                      <option value="Participating">Participating</option>
                      <option value="Won">Won</option>
                      <option value="Not Interested">Not Interested</option>
                    </select>
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
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => onViewDetails(bidNo)}
                      style={{ marginRight: '4px' }}
                    >
                      <Eye className="w-3.5 h-3.5" /> View Details
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => onOpenPdf(b.pdf_filename || `${bidNo.replace(/\//g, '_')}.pdf`, bidNo)}
                    >
                      <FileText className="w-3.5 h-3.5" /> PDF
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
