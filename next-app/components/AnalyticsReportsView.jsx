'use client';
import { BarChart3, TrendingUp, CheckCircle, XCircle, Award, FileText, Download } from 'lucide-react';

export default function AnalyticsReportsView({ bids = [], stats = {}, onExportCsv, onOpenCombinedPdf }) {
  const cStats = stats.company_stats || {};
  const totalBids = bids.length;
  const participated = cStats.participated || 0;
  const qualifiedTotal = cStats.qualified_total || 0;
  const disqualified = cStats.disqualified || 0;
  const l1Won = cStats.l1_won || 0;

  const winRate = participated > 0 ? Math.round((l1Won / participated) * 100) : 0;
  const qualRate = participated > 0 ? Math.round((qualifiedTotal / participated) * 100) : 0;
  const disqualRate = participated > 0 ? Math.round((disqualified / participated) * 100) : 0;

  // Compute top buyer departments
  const deptCounts = {};
  bids.forEach((b) => {
    const bd = b.buyer_details || {};
    const dept = bd['Ministry'] || bd['Department'] || bd['Organisation'] || 'Other / General';
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });

  const sortedDepts = Object.entries(deptCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="analytics-view">
      <div className="analytics-header">
        <div>
          <h2>Analytics &amp; Performance Reports</h2>
          <p>Comprehensive bid qualification, price competitiveness, and buyer department breakdown</p>
        </div>
        <div className="analytics-actions">
          <button className="btn btn-outline" onClick={onOpenCombinedPdf}>
            <FileText className="w-4 h-4" /> Download PDF Master Report
          </button>
          <button className="btn btn-outline" onClick={onExportCsv}>
            <Download className="w-4 h-4" /> Export CSV Raw Data
          </button>
        </div>
      </div>

      {/* Overview Metric Grid */}
      <div className="analytics-grid">
        <div className="a-card">
          <div className="a-card-head">
            <TrendingUp className="w-5 h-5 text-blue" />
            <span>WIN RATE (L1)</span>
          </div>
          <div className="a-card-val text-blue">{winRate}%</div>
          <div className="a-card-sub">{l1Won} Bids Won out of {participated} Participated</div>
        </div>

        <div className="a-card">
          <div className="a-card-head">
            <CheckCircle className="w-5 h-5 text-green" />
            <span>QUALIFICATION RATE</span>
          </div>
          <div className="a-card-val text-green">{qualRate}%</div>
          <div className="a-card-sub">{qualifiedTotal} Bids Technologically &amp; Financially Qualified</div>
        </div>

        <div className="a-card">
          <div className="a-card-head">
            <XCircle className="w-5 h-5 text-red" />
            <span>DISQUALIFICATION RATE</span>
          </div>
          <div className="a-card-val text-red">{disqualRate}%</div>
          <div className="a-card-sub">{disqualified} Bids Technical Rejected</div>
        </div>

        <div className="a-card">
          <div className="a-card-head">
            <Award className="w-5 h-5 text-gold" />
            <span>TOTAL MONITORED BIDS</span>
          </div>
          <div className="a-card-val text-slate">{totalBids}</div>
          <div className="a-card-sub">Active GeM Scraped Database Records</div>
        </div>
      </div>

      {/* Breakdown Section */}
      <div className="analytics-details-grid">
        <div className="records-card p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue" /> Top Buying Organizations / Departments
          </h3>
          <div className="dept-list">
            {sortedDepts.map(([dept, count], idx) => {
              const pct = Math.round((count / totalBids) * 100);
              return (
                <div key={dept} className="dept-item mb-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold text-slate-800">{idx + 1}. {dept}</span>
                    <span className="font-bold text-slate-600">{count} bids ({pct}%)</span>
                  </div>
                  <div className="progress-bar-bg">
                    <div className="progress-bar-fill" style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
