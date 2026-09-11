'use client';
import { useState } from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  Zap, 
  BarChart3, 
  Globe, 
  Users, 
  Settings, 
  Sparkles,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Award
} from 'lucide-react';

export default function Sidebar({ activeNav = 'Dashboard', onNavSelect, stats = {} }) {
  const [myBidsExpanded, setMyBidsExpanded] = useState(true);

  const cStats = stats.company_stats || {};
  const participated = cStats.participated || 0;
  const qualified = cStats.qualified || 0;
  const qualifiedTotal = cStats.qualified_total || 0;
  const disqualified = cStats.disqualified || 0;
  const l1Won = cStats.l1_won || 0;

  const handleSelect = (navId) => {
    if (onNavSelect) onNavSelect(navId);
  };

  return (
    <aside className="app-sidebar">
      {/* Brand Header */}
      <div className="sidebar-brand" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
        <img 
          src="/logo.png" 
          alt="G.M. DALUI Logo" 
          style={{ height: '32px', width: 'auto', objectFit: 'contain' }} 
        />
        <div className="brand-text">
          <span className="brand-title" style={{ fontSize: '0.88rem', fontWeight: 800, color: '#881337', letterSpacing: '-0.2px' }}>G.M. DALUI</span>
          <span className="brand-subtitle" style={{ fontSize: '0.66rem', color: '#64748b', display: 'block', fontWeight: 600 }}>Tender Intelligence</span>
        </div>
      </div>

      {/* Navigation Tree */}
      <nav className="sidebar-nav-tree">
        <div className="nav-tree-section">
          <div className="tree-section-label">NAV TREE</div>

          {/* Dashboard */}
          <button
            className={`tree-node ${activeNav === 'Dashboard' ? 'active' : ''}`}
            onClick={() => handleSelect('Dashboard')}
          >
            <LayoutDashboard className="tree-icon text-blue" />
            <span className="tree-label">Dashboard</span>
            <span className="tree-badge badge-slate">{stats.total_bids || 0}</span>
          </button>

          {/* My Bids Tree Item */}
          <div className="tree-parent-group">
            <button
              className={`tree-node ${activeNav.startsWith('My Bids') ? 'active' : ''}`}
              onClick={() => {
                setMyBidsExpanded(!myBidsExpanded);
                handleSelect('My Bids');
              }}
            >
              <FileText className="tree-icon text-green" />
              <span className="tree-label">My Bids</span>
              <span className="tree-badge badge-green">{participated}</span>
              {myBidsExpanded ? (
                <ChevronDown className="w-3 h-3 tree-arrow" />
              ) : (
                <ChevronRight className="w-3 h-3 tree-arrow" />
              )}
            </button>

            {/* Tree Children */}
            {myBidsExpanded && (
              <div className="tree-children">
                <button
                  className={`tree-node child-node ${activeNav === 'My Bids Qualified' ? 'active' : ''}`}
                  onClick={() => handleSelect('My Bids Qualified')}
                  title="Qualified non-L1 bids (Ranked)"
                >
                  <CheckCircle className="tree-icon text-green" />
                  <span className="tree-label">Qualified</span>
                  <span className="tree-badge badge-green-sub">{qualified}</span>
                </button>

                <button
                  className={`tree-node child-node ${activeNav === 'My Bids Won' ? 'active' : ''}`}
                  onClick={() => handleSelect('My Bids Won')}
                >
                  <Award className="tree-icon text-gold" />
                  <span className="tree-label">Won L1</span>
                  <span className="tree-badge badge-gold-sub">{l1Won}</span>
                </button>

                <button
                  className={`tree-node child-node ${activeNav === 'My Bids Disqualified' ? 'active' : ''}`}
                  onClick={() => handleSelect('My Bids Disqualified')}
                >
                  <XCircle className="tree-icon text-red" />
                  <span className="tree-label">Disqualified</span>
                  <span className="tree-badge badge-red-sub">{disqualified}</span>
                </button>
              </div>
            )}
          </div>

          {/* Reverse Auctions */}
          <button
            className={`tree-node ${activeNav === 'Reverse Auctions' ? 'active' : ''}`}
            onClick={() => handleSelect('Reverse Auctions')}
          >
            <Zap className="tree-icon text-purple" />
            <span className="tree-label">RA Bids</span>
            <span className="tree-badge badge-purple">{stats.total_ra || 0}</span>
          </button>

          {/* Analytics Reports */}
          <button
            className={`tree-node ${activeNav === 'Analytics Reports' ? 'active' : ''}`}
            onClick={() => handleSelect('Analytics Reports')}
          >
            <BarChart3 className="tree-icon text-cyan" />
            <span className="tree-label">Analytics</span>
          </button>

          {/* Network Portal */}
          <button
            className={`tree-node ${activeNav === 'Network Portal' ? 'active' : ''}`}
            onClick={() => handleSelect('Network Portal')}
          >
            <Globe className="tree-icon text-blue" />
            <span className="tree-label">Portal</span>
            <span className="tree-badge badge-blue-sub">4560</span>
          </button>

          {/* User Management */}
          <button
            className={`tree-node ${activeNav === 'User Management' ? 'active' : ''}`}
            onClick={() => handleSelect('User Management')}
          >
            <Users className="tree-icon text-slate" />
            <span className="tree-label">Users</span>
          </button>

          {/* Settings */}
          <button
            className={`tree-node ${activeNav === 'Settings' ? 'active' : ''}`}
            onClick={() => handleSelect('Settings')}
          >
            <Settings className="tree-icon text-slate" />
            <span className="tree-label">Settings</span>
          </button>
        </div>
      </nav>

      {/* Sidebar Footer Live Stats */}
      <div className="sidebar-quick-stats">
        <div className="quick-stats-title">LIVE SUMMARY</div>
        <div className="quick-stats-grid">
          <div className="qs-item qs-blue">
            <span className="qs-val">{participated}</span>
            <span className="qs-lbl">Part.</span>
          </div>
          <div className="qs-item qs-green">
            <span className="qs-val">{qualifiedTotal}</span>
            <span className="qs-lbl">Qual.</span>
          </div>
          <div className="qs-item qs-red">
            <span className="qs-val">{disqualified}</span>
            <span className="qs-lbl">Disq.</span>
          </div>
          <div className="qs-item qs-gold">
            <span className="qs-val">{l1Won}</span>
            <span className="qs-lbl">L1</span>
          </div>
        </div>
        <div className="system-status">
          <span className="status-dot"></span>
          <span>Daemon 2h</span>
        </div>
      </div>
    </aside>
  );
}
