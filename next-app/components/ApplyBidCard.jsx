'use client';
import { FileSpreadsheet } from 'lucide-react';

export default function ApplyBidCard({ stats, onCardClick }) {
  const total = stats.total_bids || 0;
  const cStats = stats.company_stats || {};
  const participated = cStats.participated || 0;
  const qualified = cStats.qualified || 0;
  const disqualified = cStats.disqualified || 0;
  const l1Won = cStats.l1_won || 0;

  const qualPct = participated > 0 ? Math.round((qualified / participated) * 100) : 0;
  const disqualPct = participated > 0 ? Math.round((disqualified / participated) * 100) : 0;
  const wonPct = participated > 0 ? Math.round((l1Won / participated) * 100) : 0;

  return (
    <div className="metrics-grid">
      <div className="metric-card card-blue" onClick={() => onCardClick('dalui_participated')}>
        <div className="metric-icon">
          <FileSpreadsheet className="w-6 h-6" />
        </div>
        <div className="metric-content">
          <span className="metric-label">Apply for the Bid</span>
          <h2 className="metric-value">
            <span>{participated}</span>
            <span className="apply-pct">
              {total > 0 ? `(${((participated / total) * 100).toFixed(1)}% of ${total} bids)` : ''}
            </span>
          </h2>
          <div className="apply-sub-stats">
            <div className="apply-sub">
              <span className="dot dot-green"></span> Qualified: <strong>{qualified} ({qualPct}%)</strong>
            </div>
            <div className="apply-sub">
              <span className="dot dot-red"></span> Disqualified: <strong>{disqualified} ({disqualPct}%)</strong>
            </div>
            <div className="apply-sub">
              <span className="dot dot-gold"></span> Won L1: <strong>{l1Won} ({wonPct}%)</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
