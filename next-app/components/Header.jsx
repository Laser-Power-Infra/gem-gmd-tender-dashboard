'use client';
import { ExternalLink, FileText, Download, SlidersHorizontal } from 'lucide-react';
import NotificationCenter from './NotificationCenter';

export default function Header({ onOpenCombinedPdf, onExportCsv, onOpenManageIds, onViewDetails }) {
  return (
    <header className="app-header">
      <div className="header-container">
        <div className="header-actions-bar">
          <NotificationCenter onViewDetails={onViewDetails} />
          
          <a
            href="http://192.168.1.190:4560/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline btn-compact"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Network Portal (4560)
          </a>
          <button className="btn btn-outline btn-compact" onClick={onOpenCombinedPdf}>
            <FileText className="w-3.5 h-3.5" /> Combined PDF Report
          </button>
          <button className="btn btn-outline btn-compact" onClick={onExportCsv}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button className="btn btn-outline btn-compact" onClick={onOpenManageIds}>
            <SlidersHorizontal className="w-3.5 h-3.5" /> Manage GeM IDs
          </button>
        </div>
      </div>
    </header>
  );
}
