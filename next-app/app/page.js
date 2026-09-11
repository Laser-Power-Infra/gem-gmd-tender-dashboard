'use client';
import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import FilterPanel from '../components/FilterPanel';
import BidsTable from '../components/BidsTable';
import ViewDetailsModal from '../components/ViewDetailsModal';
import PdfPreviewModal from '../components/PdfPreviewModal';
import ManageIdsModal from '../components/ManageIdsModal';
import ProgressOverlay from '../components/ProgressOverlay';
import AnalyticsReportsView from '../components/AnalyticsReportsView';
import NetworkPortalView from '../components/NetworkPortalView';
import UserSettingsView from '../components/UserSettingsView';
import { RefreshCw } from 'lucide-react';

export default function Dashboard() {
  const [allBidsData, setAllBidsData] = useState([]);
  const [globalStats, setGlobalStats] = useState({});
  const [displayStats, setDisplayStats] = useState({});
  const [loading, setLoading] = useState(true);

  // Active Navigation Tab
  const [activeNav, setActiveNav] = useState('Dashboard');

  // Filters
  const [query, setQuery] = useState('');
  const [dateType, setDateType] = useState('end');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minQty, setMinQty] = useState('');
  const [rankType, setRankType] = useState('all');

  // Modals
  const [detailsModal, setDetailsModal] = useState({ open: false, bidNo: null });
  const [pdfModal, setPdfModal] = useState({ open: false, filename: '', title: '' });
  const [manageModal, setManageModal] = useState(false);
  const [progressModal, setProgressModal] = useState({ open: false, message: '', percent: 0 });

  // Handle Sidebar Navigation Click
  const handleNavSelect = (navId) => {
    setActiveNav(navId);

    if (navId === 'Dashboard') {
      setRankType('all');
    } else if (navId === 'My Bids') {
      setRankType('dalui_participated');
    } else if (navId === 'My Bids Qualified') {
      setRankType('dalui_qualified');
    } else if (navId === 'My Bids Won') {
      setRankType('dalui_l1');
    } else if (navId === 'My Bids Disqualified') {
      setRankType('dalui_disqualified');
    } else if (navId === 'Reverse Auctions') {
      setRankType('ra_only');
    }
  };

  // Compute dynamic stats from filtered bids
  const computeStatsFromBids = useCallback((bidsArray) => {
    let totalBids = bidsArray.length;
    let totalRa = 0;
    let totalTechQual = 0;
    let totalTechDisqual = 0;
    let totalFinL1 = 0;

    let daluiParticipated = 0;
    let daluiQualifiedExclL1 = 0;
    let daluiQualifiedTotal = 0;
    let daluiDisqualified = 0;
    let daluiL1 = 0;
    let daluiL2 = 0;

    bidsArray.forEach((b) => {
      const raInf = b.ra_info || {};
      if (raInf.is_ra) totalRa++;

      const tEval = b.technical_evaluation || [];
      const fEval = b.financial_evaluation || [];

      if (Array.isArray(tEval)) {
        tEval.forEach((t) => {
          if (typeof t === 'object' && t !== null) {
            const st = String(t.Status || '').toUpperCase();
            if (st.includes('QUALIFIED') && !st.includes('DISQUALIFIED')) totalTechQual++;
            else if (st.includes('DISQUALIFIED')) totalTechDisqual++;
          }
        });
      }

      if (Array.isArray(fEval) && fEval.length > 0) totalFinL1++;

      const cAn = b.company_analysis || {};
      if (cAn.participated) {
        daluiParticipated++;
        if (cAn.is_disqualified) {
          daluiDisqualified++;
        } else if (cAn.is_l1) {
          daluiL1++;
          daluiQualifiedTotal++;
        } else if (cAn.is_qualified) {
          daluiQualifiedTotal++;
          daluiQualifiedExclL1++;
        }

        if (cAn.is_l2 || cAn.rank === 'L2') {
          daluiL2++;
        }
      }
    });

    return {
      total_bids: totalBids,
      total_ra: totalRa,
      qualified_sellers: totalTechQual,
      disqualified_sellers: totalTechDisqual,
      financial_l1_evaluated: totalFinL1,
      company_stats: {
        name: 'G.M. DALUI',
        participated: daluiParticipated,
        qualified: daluiQualifiedExclL1,
        qualified_total: daluiQualifiedTotal,
        disqualified: daluiDisqualified,
        l1_won: daluiL1,
        l2_missed: daluiL2,
      },
    };
  }, []);

  const fetchBids = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bids?t=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.status === 'success') {
        const bids = json.bids || [];
        setAllBidsData(bids);
        setGlobalStats(json.stats || {});
        setDisplayStats(json.stats || {});
      }
    } catch (err) {
      console.error('Error fetching bids:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBids();
  }, [fetchBids]);

  // Parse GeM Date helper
  const parseGeMDate = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.trim().split(' ')[0].split('-');
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parseInt(parts[2], 10);
      return new Date(y, m, d);
    }
    return null;
  };

  // Match global filters
  const matchesGlobalFilters = useCallback(
    (b) => {
      const bDetails = b.bid_details || {};
      const buyerDetails = b.buyer_details || {};
      const finEval = b.financial_evaluation || [];
      const raInf = b.ra_info || {};

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
        if (!fullText.includes(query.toLowerCase())) return false;
      }

      const minQtyVal = parseInt(minQty, 10);
      if (!isNaN(minQtyVal)) {
        const rawQty = parseInt((bDetails['Quantity'] || '0').replace(/\D/g, ''), 10);
        if (rawQty < minQtyVal) return false;
      }

      if (dateFrom || dateTo) {
        let targetDateStr = '';
        if (dateType === 'start') targetDateStr = bDetails['Bid Start Date / Time'] || bDetails['RA Start Date / Time'] || raInf.ra_start_date || raInf.ra_schedules?.[0]?.start_date;
        else if (dateType === 'end') targetDateStr = bDetails['Bid End Date / Time'] || bDetails['RA End Date / Time'] || raInf.ra_end_date || raInf.ra_schedules?.[0]?.end_date;
        else if (dateType === 'opening') targetDateStr = bDetails['Bid Opening Date / Time'];

        const parsedDate = parseGeMDate(targetDateStr);
        if (!parsedDate) return false;
        if (dateFrom && parsedDate < new Date(dateFrom)) return false;
        if (dateTo) {
          const dTo = new Date(dateTo);
          dTo.setHours(23, 59, 59, 999);
          if (parsedDate > dTo) return false;
        }
      }

      return true;
    },
    [query, minQty, dateFrom, dateTo, dateType]
  );

  const getFilteredBids = useCallback(() => {
    const bidsMatchingBase = allBidsData.filter(matchesGlobalFilters);

    return bidsMatchingBase.filter((b) => {
      const cAn = b.company_analysis || {};
      const raInf = b.ra_info || {};
      const finEval = b.financial_evaluation || [];

      if (rankType === 'ra_only' && !raInf.is_ra) return false;
      if (rankType === 'l1_available' && finEval.length === 0) return false;
      if (rankType === 'dalui_participated' && !cAn.participated) return false;
      if (rankType === 'dalui_qualified' && (!cAn.is_qualified || cAn.is_l1)) return false;
      if (rankType === 'dalui_qualified_all' && !cAn.is_qualified) return false;
      if (rankType === 'dalui_disqualified' && !cAn.is_disqualified) return false;
      if (rankType === 'dalui_l1' && !cAn.is_l1) return false;
      if (rankType === 'dalui_l2' && !cAn.is_l2 && cAn.rank !== 'L2') return false;

      return true;
    });
  }, [allBidsData, matchesGlobalFilters, rankType]);

  useEffect(() => {
    const bidsMatchingBase = allBidsData.filter(matchesGlobalFilters);
    const dynamicStats = computeStatsFromBids(bidsMatchingBase);
    setDisplayStats(dynamicStats);
  }, [allBidsData, matchesGlobalFilters, computeStatsFromBids]);

  const handleResetFilters = () => {
    setQuery('');
    setDateType('end');
    setDateFrom('');
    setDateTo('');
    setMinQty('');
    setRankType('all');
  };

  const handleSaveRemark = async (bidNo, remark) => {
    try {
      const res = await fetch('/api/remark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bid_number: bidNo, remark }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setAllBidsData((prev) =>
          prev.map((b) => (b.bid_number === bidNo ? { ...b, user_remark: remark } : b))
        );
      }
    } catch (err) {
      console.error('Error saving remark:', err);
    }
  };

  const handleSaveStatus = async (bidNo, user_status) => {
    try {
      const res = await fetch('/api/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bid_number: bidNo, user_status }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setAllBidsData((prev) =>
          prev.map((b) => (b.bid_number === bidNo ? { ...b, user_status } : b))
        );
      }
    } catch (err) {
      console.error('Error saving status:', err);
    }
  };

  const handleExportCsv = () => {
    const bidsToExport = getFilteredBids();
    if (!bidsToExport || bidsToExport.length === 0) {
      alert('No tender records available to export.');
      return;
    }

    const headers = [
      '#',
      'Bid Number',
      'RA Number',
      'Items / Categories',
      'Department / Ministry',
      'Start Date',
      'End Date',
      'Opening Date',
      'Quantity',
      'Tender Status',
      'G.M. DALUI Status',
      'G.M. DALUI Rank',
      'G.M. DALUI Price',
      'L1 Seller',
      'L1 Price',
      'L1-L2 Diff %',
      'User Remark',
      'Orders PDF Link',
      'Attached Files'
    ];

    const rows = bidsToExport.map((b, idx) => {
      const bDetails = b.bid_details || {};
      const bDept = b.buyer_details || {};
      const ra = b.ra_info || {};
      const cAn = b.company_analysis || {};
      const fDiff = b.l1_l2_diff || {};
      const fEval = b.financial_evaluation || [];
      const l1Price = fEval[0]?.['Total Price'] || fEval[0]?.['total_price'] || fEval[0]?.['price'] || cAn.l1_price || '';
      const l1SellerName = fEval[0]?.['Seller Name'] || fEval[0]?.['L1 Seller Name'] || '';

      const sDate = bDetails['Bid Start Date / Time'] || bDetails['RA Start Date / Time'] || ra.ra_start_date || '';
      const eDate = bDetails['Bid End Date / Time'] || bDetails['RA End Date / Time'] || ra.ra_end_date || '';
      const deptName = bDept['Ministry'] || bDept['Department'] || bDept['Organisation'] || bDept['Ministry/State Name'] || bDept['Department Name'] || bDetails['Department Name'] || '';
      const qtyVal = bDetails['Quantity'] || bDetails['Contract Duration'] || bDetails['Items'] || '';

      return [
        idx + 1,
        `"${String(b.bid_number || '').replace(/"/g, '""')}"`,
        `"${String(ra.ra_number || '').replace(/"/g, '""')}"`,
        `"${String(bDetails['Items'] || bDetails['Item Categories'] || b.bid_title_type || '').replace(/"/g, '""')}"`,
        `"${String(deptName).replace(/"/g, '""')}"`,
        `"${String(sDate).replace(/"/g, '""')}"`,
        `"${String(eDate).replace(/"/g, '""')}"`,
        `"${String(bDetails['Bid Opening Date / Time'] || '').replace(/"/g, '""')}"`,
        `"${String(qtyVal).replace(/"/g, '""')}"`,
        `"${String(b.user_status || bDetails['Bid Status'] || 'Active').replace(/"/g, '""')}"`,
        `"${String(gmdStatus).replace(/"/g, '""')}"`,
        `"${String(cAn.rank || '').replace(/"/g, '""')}"`,
        `"${String(cAn.my_price ? '₹ ' + cAn.my_price : '').replace(/"/g, '""')}"`,
        `"${String(l1SellerName).replace(/"/g, '""')}"`,
        `"${String(l1Price ? (String(l1Price).startsWith('₹') ? l1Price : '₹ ' + l1Price) : '').replace(/"/g, '""')}"`,
        `"${String(fDiff.diff_pct !== undefined ? fDiff.diff_pct + '%' : '').replace(/"/g, '""')}"`,
        `"${String(b.user_remark || '').replace(/"/g, '""')}"`,
        `"${String(b.order_pdf || '').replace(/"/g, '""')}"`,
        `"${String(attLinks).replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `gem_bids_summary_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleUploadSuccess = (bidNo, newAtts, newLinks) => {
    const targetKey = String(bidNo || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    setAllBidsData((prev) =>
      prev.map((b) => {
        const bn = String(b.bid_number || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const raw = String(b.raw_bid_no || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (bn === targetKey || raw === targetKey || (targetKey && bn.includes(targetKey)) || (bn && targetKey.includes(bn))) {
          const mergedAtts = (newAtts && newAtts.length > 0) ? newAtts : b.attachments;
          const mergedLinks = (newLinks && newLinks.length > 0) ? newLinks : b.drive_links;
          return {
            ...b,
            attachments: mergedAtts,
            drive_links: mergedLinks,
          };
        }
        return b;
      })
    );
  };

  const triggerScraper = async () => {
    setProgressModal({ open: true, message: 'Starting scraper engine...', percent: 0 });
    try {
      await fetch('/api/run-scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const interval = setInterval(async () => {
        try {
          const res = await fetch('/api/scraper-status');
          const status = await res.json();
          if (status.is_running) {
            const pct =
              status.total_items > 0
                ? Math.round((status.current_index / status.total_items) * 100)
                : 0;
            setProgressModal({
              open: true,
              message: status.status_message || 'Scraping...',
              percent: pct,
            });
          } else {
            clearInterval(interval);
            setProgressModal({ open: true, message: 'Completed!', percent: 100 });
            setTimeout(() => {
              setProgressModal({ open: false, message: '', percent: 0 });
              fetchBids();
            }, 1000);
          }
        } catch (e) {
          console.error('Poll error:', e);
        }
      }, 1500);
    } catch (err) {
      console.error('Error triggering scraper:', err);
      setProgressModal({ open: false, message: '', percent: 0 });
    }
  };

  const filteredBidsList = getFilteredBids();

  return (
    <div className="app-layout">
      <Sidebar activeNav={activeNav} onNavSelect={handleNavSelect} stats={displayStats} />
      <div className="app-main">
        <Header
          onOpenCombinedPdf={() => setPdfModal({ open: true, filename: 'combined', title: 'Combined Master PDF Report' })}
          onExportCsv={handleExportCsv}
          onOpenManageIds={() => setManageModal(true)}
          onViewDetails={(bidNo) => setDetailsModal({ open: true, bidNo })}
        />

        <main className="main-content-area flex-1">
          {/* Main View Router */}
          {activeNav === 'Analytics Reports' ? (
            <AnalyticsReportsView
              bids={allBidsData}
              stats={displayStats}
              onExportCsv={handleExportCsv}
              onOpenCombinedPdf={() => setPdfModal({ open: true, filename: 'combined', title: 'Combined Master PDF Report' })}
            />
          ) : activeNav === 'Network Portal' ? (
            <NetworkPortalView onTriggerScraper={triggerScraper} />
          ) : activeNav === 'User Management' ? (
            <UserSettingsView mode="users" onTriggerScraper={triggerScraper} />
          ) : activeNav === 'Settings' ? (
            <UserSettingsView mode="settings" onTriggerScraper={triggerScraper} />
          ) : (
            /* Full-screen Tender Records View */
            <div className="records-card flex-1 flex flex-col">
              <div className="records-header">
                <div className="records-title-group">
                  <h3>
                    {activeNav.startsWith('My Bids')
                      ? `MY BIDS RECORD VIEW (${activeNav})`
                      : activeNav === 'Reverse Auctions'
                      ? 'REVERSE AUCTION (RA) RECORDS'
                      : 'GEM BID RESULT RECORDS'}
                  </h3>
                  <span className="badge badge-count">{filteredBidsList.length} records</span>
                </div>
                <div className="records-controls">
                  <button className="btn btn-icon" onClick={fetchBids} title="Refresh Data">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'spin-icon' : ''}`} />
                  </button>
                </div>
              </div>

              <FilterPanel
                query={query}
                setQuery={setQuery}
                dateType={dateType}
                setDateType={setDateType}
                dateFrom={dateFrom}
                setDateFrom={setDateFrom}
                dateTo={dateTo}
                setDateTo={setDateTo}
                minQty={minQty}
                setMinQty={setMinQty}
                rankType={rankType}
                setRankType={setRankType}
                onResetFilters={handleResetFilters}
              />

              {loading ? (
                <div className="loading-state">
                  <RefreshCw className="w-8 h-8 spin-icon text-blue" />
                  <span>Loading tender records from server...</span>
                </div>
              ) : (
                <BidsTable
                  bids={filteredBidsList}
                  onSaveRemark={handleSaveRemark}
                  onSaveStatus={handleSaveStatus}
                  onViewDetails={(bidNo) => setDetailsModal({ open: true, bidNo })}
                  onOpenPdf={(filename, bidNo) => setPdfModal({ open: true, filename, title: bidNo })}
                  onRefresh={fetchBids}
                  onUploadSuccess={handleUploadSuccess}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      <ViewDetailsModal
        isOpen={detailsModal.open}
        bidNo={detailsModal.bidNo}
        onClose={() => setDetailsModal({ open: false, bidNo: null })}
        onOpenPdf={(filename, title) => setPdfModal({ open: true, filename, title })}
      />

      <PdfPreviewModal
        isOpen={pdfModal.open}
        filename={pdfModal.filename}
        title={pdfModal.title}
        onClose={() => setPdfModal({ open: false, filename: '', title: '' })}
      />

      <ManageIdsModal
        isOpen={manageModal}
        onClose={() => setManageModal(false)}
        onSaveAndRun={triggerScraper}
        onRefresh={fetchBids}
      />

      <ProgressOverlay
        isOpen={progressModal.open}
        statusMessage={progressModal.message}
        progressPercent={progressModal.percent}
      />
    </div>
  );
}
