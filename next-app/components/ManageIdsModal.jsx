'use client';
import { useState, useEffect } from 'react';
import { X, Zap, Upload, Cloud, Save, CheckCircle, Database } from 'lucide-react';

export default function ManageIdsModal({ isOpen, onClose, onSaveAndRun, onRefresh }) {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' or 'batch'
  
  // Upload Form State
  const [gemId, setGemId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  // Batch IDs State
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

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!gemId.trim()) return;

    setUploading(true);
    setUploadStatus(null);

    const formData = new FormData();
    formData.append('gem_id', gemId.trim());
    formData.append('remarks', remarks.trim());
    if (pdfFile) {
      formData.append('pdf_file', pdfFile);
    }

    try {
      const res = await fetch('/api/upload-bid-document', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.status === 'success') {
        setUploadStatus({
          type: 'success',
          msg: `Saved to DB table 'gmd_gem_ids'! ${data.drive_link ? 'Uploaded to Google Drive!' : ''}`,
          drive_link: data.drive_link
        });
        setGemId('');
        setRemarks('');
        setPdfFile(null);
        // Immediately refresh table data so ORDERS PDF / ATTACHMENTS show up
        if (onRefresh) onRefresh();
        setTimeout(() => {
          onSaveAndRun();
        }, 1200);
      } else {
        setUploadStatus({ type: 'error', msg: data.message || 'Upload failed' });
      }
    } catch (err) {
      console.error('Error uploading document:', err);
      setUploadStatus({ type: 'error', msg: 'Network error uploading document' });
    } finally {
      setUploading(false);
    }
  };

  const handleBatchSubmit = async () => {
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
      <div className="modal-card modal-lg">
        <div className="modal-header">
          <div className="modal-title-group">
            <Database className="w-5 h-5 text-blue" />
            <h3 style={{ margin: 0 }}>Add GeM ID, Document &amp; DB Remarks</h3>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-tabs">
          <button
            className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            <Upload className="w-3.5 h-3.5 inline mr-1" /> Upload PDF &amp; Save to DB
          </button>
          <button
            className={`tab-btn ${activeTab === 'batch' ? 'active' : ''}`}
            onClick={() => setActiveTab('batch')}
          >
            <Zap className="w-3.5 h-3.5 inline mr-1" /> Batch Input Scraper List
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'upload' ? (
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-slate-700">
                <Cloud className="w-4 h-4 text-blue inline mr-1.5" />
                Uploaded PDF documents automatically save to Google Drive Folder: <strong>1WR5AkLfp_ymTgBeLbLbfJq1Zng_KfB90</strong> and store in database table <code>gmd_gem_ids</code>.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  GeM BID / RA ID <span className="text-red">*</span>
                </label>
                <input
                  type="text"
                  required
                  className="filter-input w-full"
                  placeholder="e.g. GEM/2026/B/6818167 or GEM/2026/R/123456"
                  value={gemId}
                  onChange={(e) => setGemId(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  PDF Document (Upload to Google Drive)
                </label>
                <input
                  type="file"
                  accept="application/pdf"
                  className="filter-input w-full"
                  onChange={(e) => setPdfFile(e.target.files[0] || null)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Remarks (Saved to DB table gmd_gem_ids)
                </label>
                <textarea
                  rows={3}
                  className="form-textarea w-full"
                  placeholder="Enter remarks..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>

              {uploadStatus && (
                <div className={`p-3 rounded-lg text-xs ${uploadStatus.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  <div className="font-bold flex items-center gap-1.5">
                    {uploadStatus.type === 'success' && <CheckCircle className="w-4 h-4 text-green" />}
                    {uploadStatus.msg}
                  </div>
                  {uploadStatus.drive_link && (
                    <div className="mt-1">
                      <a href={uploadStatus.drive_link} target="_blank" rel="noopener noreferrer" className="text-blue underline font-semibold">
                        View Uploaded Google Drive Document ↗
                      </a>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="submit" className="btn btn-pdf flex items-center gap-2" disabled={uploading}>
                  <Upload className="w-4 h-4" /> {uploading ? 'Uploading to Drive & DB...' : 'Upload & Save Record'}
                </button>
              </div>
            </form>
          ) : (
            <div>
              <p className="text-muted mb-2" style={{ fontSize: '0.82rem' }}>
                Paste GeM Bid Numbers (e.g. <code>GEM/2026/B/6818167</code>), one per line:
              </p>
              <textarea
                rows={8}
                className="form-textarea"
                value={idsText}
                onChange={(e) => setIdsText(e.target.value)}
                placeholder="GEM/2026/B/6818167&#10;5705747&#10;6000000"
                disabled={loading}
              />
              <div className="flex justify-end gap-2 pt-4">
                <button className="btn btn-primary" onClick={handleBatchSubmit} disabled={loading}>
                  <Zap className="w-4 h-4" /> Save &amp; Run Scraper Now
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
