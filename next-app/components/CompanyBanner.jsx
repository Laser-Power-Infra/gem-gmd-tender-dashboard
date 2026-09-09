'use client';
import { Filter } from 'lucide-react';

export default function CompanyBanner({ stats, onCardClick, onFilterOnlyGmd }) {
  const cStats = stats.company_stats || {};
  const participated = cStats.participated || 0;
  const qualified = cStats.qualified || 0;
  const disqualified = cStats.disqualified || 0;
  const l1Won = cStats.l1_won || 0;
  const l2Missed = cStats.l2_missed || 0;

  const qualPct = participated > 0 ? Math.round((qualified / participated) * 100) : 0;
  const disqualPct = participated > 0 ? Math.round((disqualified / participated) * 100) : 0;
  const wonPct = participated > 0 ? Math.round((l1Won / participated) * 100) : 0;
  const l2Pct = participated > 0 ? Math.round((l2Missed / participated) * 100) : 0;

  return (
    <div className="company-banner">
      <div className="company-banner-header">
        <div className="company-title">
          <div>
            <h2>G.M. DALUI Performance Tracker</h2>
            <p>Targeted bid evaluation, Reverse Auction (RA), &amp; price gap analysis for G.M. DALUI</p>
          </div>
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={onFilterOnlyGmd}
          style={{ background: '#0284c7', color: '#fff', border: 'none' }}
        >
          <Filter className="w-4 h-4" /> Show Only G.M. DALUI Bids
        </button>
      </div>

      <div className="company-metrics-grid">
        <div className="c-metric" title="Total Participated Bids" onClick={() => onCardClick('dalui_participated')}>
          <span className="c-label">Participated Bids</span>
          <h3>{participated}</h3>
        </div>

        <div className="c-metric" title="Qualified Bids excluding Won L1 (Total Qualified = Qualified + Won L1)" onClick={() => onCardClick('dalui_qualified')}>
          <span className="c-label">Qualified (Other)</span>
          <h3 style={{ color: '#22c55e' }}>
            {qualified} {participated > 0 && <span className="c-pct">({qualPct}%)</span>}
          </h3>
        </div>

        <div className="c-metric" title="Disqualified in Technical Evaluation" onClick={() => onCardClick('dalui_disqualified')}>
          <span className="c-label">Disqualified</span>
          <h3 style={{ color: '#ef4444' }}>
            {disqualified} {participated > 0 && <span className="c-pct">({disqualPct}%)</span>}
          </h3>
        </div>

        <div className="c-metric" title="Won L1 Lowest Bids" onClick={() => onCardClick('dalui_l1')}>
          <span className="c-label">Won L1 Bids</span>
          <h3 style={{ color: '#eab308' }}>
            {l1Won} {participated > 0 && <span className="c-pct">({wonPct}%)</span>}
          </h3>
        </div>

        <div className="c-metric" title="Second Lowest Bids (L2)" onClick={() => onCardClick('dalui_l2')}>
          <span className="c-label">L2 (Missed L1)</span>
          <h3 style={{ color: '#38bdf8' }}>
            {l2Missed} {participated > 0 && <span className="c-pct">({l2Pct}%)</span>}
          </h3>
        </div>
      </div>
    </div>
  );
}
