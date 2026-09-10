'use client';

export default function CompanyBanner({ stats, onCardClick, onFilterOnlyGmd }) {
  const cStats = stats.company_stats || {};
  const participated = cStats.participated || 0;
  const qualifiedTotal = cStats.qualified_total || (cStats.qualified + cStats.l1_won) || 0;
  const qualifiedOther = cStats.qualified || 0;
  const disqualified = cStats.disqualified || 0;
  const l1Won = cStats.l1_won || 0;

  const qualPct = participated > 0 ? Math.round((qualifiedTotal / participated) * 100) : 0;
  const disqualPct = participated > 0 ? Math.round((disqualified / participated) * 100) : 0;
  const wonPct = participated > 0 ? Math.round((l1Won / participated) * 100) : 0;

  return (
    <div className="performance-banner">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', background: '#ffffff', padding: '10px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img 
            src="/logo.png" 
            alt="DALUI Logo" 
            style={{ height: '34px', width: 'auto', objectFit: 'contain' }} 
          />
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#881337', letterSpacing: '-0.2px' }}>
              G.M. DALUI &amp; SONS
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 500 }}>
              Making Valves Since 1976 • GeM Bid Tracking &amp; Competitor Intelligence Dashboard
            </div>
          </div>
        </div>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '4px 10px', borderRadius: '14px' }}>
          Official Company Profile
        </div>
      </div>
      <div className="banner-cards-grid">
        {/* Card 1: PARTICIPATED BIDS */}
        <div
          className="p-card border-blue"
          onClick={() => onCardClick('dalui_participated')}
          title="Filter Participated Bids"
        >
          <div className="p-card-body">
            <span className="p-card-label">PARTICIPATED BIDS</span>
            <div className="p-card-val-row">
              <h2 className="p-card-value text-blue">{participated}</h2>
            </div>
          </div>
          <div className="p-card-graphic">
            <svg viewBox="0 0 100 35" className="sparkline-svg" fill="none">
              <path
                d="M 0,25 Q 15,10 30,22 T 60,12 T 80,26 T 100,8 L 100,35 L 0,35 Z"
                fill="rgba(2, 132, 199, 0.12)"
              />
              <path
                d="M 0,25 Q 15,10 30,22 T 60,12 T 80,26 T 100,8"
                stroke="#0284c7"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Card 2: QUALIFIED BIDS */}
        <div
          className="p-card border-green"
          onClick={() => onCardClick('dalui_qualified_all')}
          title="Filter Qualified Bids"
        >
          <div className="p-card-body">
            <span className="p-card-label">QUALIFIED BIDS</span>
            <div className="p-card-val-row">
              <h2 className="p-card-value text-green">{qualifiedTotal}</h2>
              <span className="p-card-sub text-green">/ {qualPct}%</span>
            </div>
          </div>
          <div className="p-card-graphic">
            <svg viewBox="0 0 40 40" className="pie-svg">
              <circle cx="20" cy="20" r="14" fill="#ef4444" />
              <path
                d="M 20 20 L 20 6 A 14 14 0 1 1 6.5 24.5 Z"
                fill="#22c55e"
              />
              <circle cx="20" cy="20" r="6" fill="#ffffff" />
            </svg>
          </div>
        </div>

        {/* Card 3: DISQUALIFIED BIDS */}
        <div
          className="p-card border-red"
          onClick={() => onCardClick('dalui_disqualified')}
          title="Filter Disqualified Bids"
        >
          <div className="p-card-body">
            <span className="p-card-label">DISQUALIFIED BIDS</span>
            <div className="p-card-val-row">
              <h2 className="p-card-value text-red">{disqualified}</h2>
              <span className="p-card-sub text-red">/ {disqualPct}%</span>
            </div>
          </div>
        </div>

        {/* Card 4: WON L1 BIDS */}
        <div
          className="p-card border-cyan"
          onClick={() => onCardClick('dalui_l1')}
          title="Filter Won L1 Bids"
        >
          <div className="p-card-body">
            <span className="p-card-label">WON L1 BIDS</span>
            <div className="p-card-val-row">
              <h2 className="p-card-value text-cyan">{l1Won}</h2>
              <span className="p-card-sub text-cyan">/ {wonPct}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
