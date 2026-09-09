'use client';
import { useState, useEffect } from 'react';
import { X, FileText, Zap, Edit3, Save } from 'lucide-react';

export default function ViewDetailsModal({ isOpen, bidNo, onClose, onOpenPdf }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('bid_info');
  const [remarkText, setRemarkText] = useState('');
  const [remarkSaved, setRemarkSaved] = useState(false);

  useEffect(() => {
    if (isOpen && bidNo) {
      setLoading(true);
      fetch(`/api/bid/${encodeURIComponent(bidNo)}`)
        .then((res) => res.json())
        .then((resJson) => {
          if (resJson.status === 'success') {
            setData(resJson.data);
            setRemarkText(resJson.data.user_remark || '');
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error('Error fetching bid details:', err);
          setLoading(false);
        });
    } else {
      setData(null);
    }
  }, [isOpen, bidNo]);

  if (!isOpen) return null;

  const saveRemark = async () => {
    if (!bidNo) return;
    try {
      const res = await fetch('/api/remark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bid_number: bidNo, remark: remarkText })
      });
      const json = await res.json();
      if (json.status === 'success') {
        setRemarkSaved(true);
        setTimeout(() => setRemarkSaved(false), 2000);
      }
    } catch (err) {
      console.error('Error saving remark:', err);
    }
  };

  const raInf = data?.ra_info || {};
  const bDetails = data?.bid_details || {};
  const bBuyer = data?.buyer_details || {};
  const tEval = data?.technical_evaluation || [];
  const fEval = data?.financial_evaluation || [];

  const pdfFilename = data?.pdf_filename || `${(bidNo || '').replace(/\//g, '_')}.pdf`;

  return (
    <div className="modal-overlay active">
      <div className="modal-card modal-lg">
        <div className="modal-header">
          <div className="modal-title-group">
            <h3 style={{ margin: 0 }}>GeM Tender Details — {bidNo}</h3>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-tabs">
          <button className={`tab-btn ${activeTab === 'bid_info' ? 'active' : ''}`} onClick={() => setActiveTab('bid_info')}>
            Bid &amp; Buyer Details
          </button>
          <button className={`tab-btn ${activeTab === 'tech_eval' ? 'active' : ''}`} onClick={() => setActiveTab('tech_eval')}>
            Technical Evaluation ({tEval.length})
          </button>
          <button className={`tab-btn ${activeTab === 'fin_eval' ? 'active' : ''}`} onClick={() => setActiveTab('fin_eval')}>
            Financial Evaluation ({fEval.length})
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="loading-state">
              <span>Loading bid details...</span>
            </div>
          ) : data ? (
            <>
              {/* TAB 1: BID & BUYER INFO */}
              {activeTab === 'bid_info' && (
                <div>
                  {raInf.is_ra ? (
                    <div style={{ background: '#faf5ff', border: '1.5px solid #d8b4fe', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e9d5ff', paddingBottom: '8px', marginBottom: '10px' }}>
                        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#6b21a8' }}>
                          Bid No.: <strong>{data.bid_number || bidNo}</strong>
                          <span style={{ color: '#a855f7', margin: '0 6px' }}>➔</span>
                          ⚡ RA NO: <strong style={{ color: '#7e22ce' }}>{raInf.ra_number || data.bid_number}</strong>
                        </div>
                        <span className="badge badge-purple">{raInf.ra_status || 'Active'}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '0.875rem' }}>
                        <div><strong style={{ color: '#64748b' }}>RA Start Date:</strong> <span style={{ color: '#16a34a', fontWeight: 600 }}>{raInf.ra_start_date || 'N/A'}</span></div>
                        <div><strong style={{ color: '#64748b' }}>RA End Date:</strong> <span style={{ color: '#d97706', fontWeight: 600 }}>{raInf.ra_end_date || 'N/A'}</span></div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontWeight: 600, color: '#334155' }}>
                      Bid No.: <strong>{data.bid_number || bidNo}</strong> <span className="badge badge-slate" style={{ marginLeft: '8px' }}>Standard GeM Bid</span>
                    </div>
                  )}

                  <h4 style={{ fontSize: '0.9rem', color: '#0284c7', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Bid Specifications
                  </h4>
                  <div className="detail-grid" style={{ marginBottom: '20px' }}>
                    {Object.entries(bDetails).map(([k, v]) => (
                      <div key={k} className="detail-item">
                        <div className="detail-label">{k}</div>
                        <div className="detail-value">{String(v)}</div>
                      </div>
                    ))}
                  </div>

                  <h4 style={{ fontSize: '0.9rem', color: '#0284c7', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Buyer Details
                  </h4>
                  <div className="detail-grid" style={{ marginBottom: '20px' }}>
                    {Object.entries(bBuyer).map(([k, v]) => (
                      <div key={k} className="detail-item" style={k === 'Address' ? { gridColumn: 'span 2' } : {}}>
                        <div className="detail-label">{k}</div>
                        <div className="detail-value">{String(v)}</div>
                      </div>
                    ))}
                  </div>

                  {/* Remarks textarea */}
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <strong style={{ color: '#0369a1', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Edit3 className="w-3.5 h-3.5" /> User Remarks &amp; Internal Notes
                      </strong>
                      {remarkSaved && <span style={{ color: '#16a34a', fontSize: '0.75rem', fontWeight: 700 }}>Saved ✓</span>}
                    </div>
                    <textarea
                      rows={2}
                      className="form-textarea"
                      value={remarkText}
                      onChange={(e) => setRemarkText(e.target.value)}
                      placeholder="Enter custom remarks, price strategy, or internal notes for this bid..."
                    />
                    <div style={{ textAlign: 'right', marginTop: '6px' }}>
                      <button className="btn btn-primary btn-sm" onClick={saveRemark}>
                        <Save className="w-3.5 h-3.5" /> Save Remark
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: TECHNICAL EVALUATION */}
              {activeTab === 'tech_eval' && (
                <div>
                  {tEval.length === 0 ? (
                    <p className="text-muted text-center py-8">No technical evaluation records found.</p>
                  ) : (
                    <table className="modal-table">
                      <thead>
                        <tr>
                          <th>Seller Name</th>
                          <th>Offered Item</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tEval.map((row, idx) => (
                          <tr key={idx}>
                            <td><strong>{row['Seller Name'] || 'N/A'}</strong></td>
                            <td>{row['Offered Item'] || 'N/A'}</td>
                            <td>
                              <span className={`badge ${String(row['Status']).toUpperCase().includes('QUALIFIED') && !String(row['Status']).toUpperCase().includes('DISQUALIFIED') ? 'badge-green' : 'badge-red'}`}>
                                {row['Status'] || 'N/A'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* TAB 3: FINANCIAL EVALUATION */}
              {activeTab === 'fin_eval' && (
                <div>
                  {fEval.length === 0 ? (
                    <p className="text-muted text-center py-8">No financial evaluation records found.</p>
                  ) : (
                    <table className="modal-table">
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Seller Name</th>
                          <th>Offered Item</th>
                          <th>Total Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fEval.map((row, idx) => (
                          <tr key={idx}>
                            <td>
                              <span className={`badge ${row['Rank'] === 'L1' ? 'badge-gold' : 'badge-blue'}`}>
                                {row['Rank'] || 'N/A'}
                              </span>
                            </td>
                            <td><strong>{row['Seller Name'] || row['L1 Seller Name'] || 'N/A'}</strong></td>
                            <td>{row['Offered Item'] || 'N/A'}</td>
                            <td><strong>₹ {Number(String(row['Total Price'] || '0').replace(/[^\d.]/g, '')).toLocaleString('en-IN')}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={() => { onClose(); onOpenPdf(pdfFilename, bidNo); }}>
            <FileText className="w-4 h-4" /> Open PDF Document
          </button>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
