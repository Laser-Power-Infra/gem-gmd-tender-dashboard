'use client';
import { Loader2 } from 'lucide-react';

export default function ProgressOverlay({ isOpen, statusMessage, progressPercent }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay active">
      <div className="modal-card" style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <div className="modal-title-group">
            <Loader2 className="w-5 h-5 spin-icon" style={{ color: '#0284c7' }} />
            <h3 style={{ margin: 0 }}>Scraper Engine Active</h3>
          </div>
        </div>
        <div className="modal-body text-center py-8">
          <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155', marginBottom: '16px' }}>
            {statusMessage || 'Scraping GeM bid details...'}
          </p>
          <div className="progress-bar-bg" style={{ marginBottom: '8px' }}>
            <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0284c7' }}>
            {progressPercent}% Completed
          </span>
        </div>
      </div>
    </div>
  );
}
