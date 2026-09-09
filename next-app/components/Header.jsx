'use client';
import { ShieldCheck, ExternalLink, FileText, Download, ListFilter } from 'lucide-react';

export default function Header({ onOpenCombinedPdf, onExportCsv, onOpenManageIds }) {
  return (
    <header className="app-header">
      <div className="header-container">
        <div className="logo-group">
          <div className="logo-badge">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1>GeM Bid &amp; Reverse Auction (RA) Dashboard</h1>
            <p>Government e Marketplace • Live Bid &amp; RA Scraper • Next.js Edition</p>
          </div>
        </div>
        <div className="header-actions">
          <a
            href="http://192.168.1.200:4560/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ textDecoration: 'none', background: '#e0f2fe', color: '#0284c7', border: '1px solid #bae6fd' }}
          >
            <ExternalLink className="w-4 h-4" /> Network Portal (4560)
          </a>
          <button className="btn btn-secondary" onClick={onOpenCombinedPdf}>
            <FileText className="w-4 h-4" /> Combined PDF Report
          </button>
          <button className="btn btn-secondary" onClick={onExportCsv}>
            <Download className="w-4 h-4" /> Export CSV Summary
          </button>
          <button className="btn btn-secondary" onClick={onOpenManageIds}>
            <ListFilter className="w-4 h-4" /> Manage GeM IDs / Scrape
          </button>
        </div>
      </div>
    </header>
  );
}
