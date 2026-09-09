'use client';
import { useState, useEffect } from 'react';
import { X, Zap } from 'lucide-react';

export default function ManageIdsModal({ isOpen, onClose, onSaveAndRun }) {
  const [idsText, setIdsText] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch('/api/inputs')
        .then((res) => res.json())
        .then((data) => {
          if (data.status === 'success') {
            setIdsText((data.items || []).join('\n'));
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error('Error fetching input IDs:', err);
          setLoading(false);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    const txt = idsText.trim();
    if (!txt) return;

    try {
      await fetch('/api/inputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: txt })
      });
      onSaveAndRun();
      onClose();
    } catch (err) {
      console.error('Error saving inputs:', err);
    }
  };

  return (
    <div className="modal-overlay active">
      <div className="modal-card">
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>Manage GeM IDs / URLs List</h3>
          <button className="modal-close" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="modal-body">
          <p className="text-muted mb-2" style={{ fontSize: '0.85rem' }}>
            Paste GeM Bid Numbers (e.g. <code>GEM/2023/B/4309262</code>) or View IDs (e.g. <code>5705747</code>) below, one per line or comma-separated:
          </p>
          <textarea
            rows={8}
            className="form-textarea"
            value={idsText}
            onChange={(e) => setIdsText(e.target.value)}
            placeholder="5705747&#10;GEM/2023/B/4309262&#10;6000000"
            disabled={loading}
          />
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
            <Zap className="w-4 h-4" /> Save &amp; Run Scraper Now
          </button>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
