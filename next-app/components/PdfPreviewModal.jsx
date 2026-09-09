'use client';
import { X, FileText, Download } from 'lucide-react';

export default function PdfPreviewModal({ isOpen, filename, title, onClose }) {
  if (!isOpen) return null;

  const pdfUrl = `/api/pdf/${filename}`;

  return (
    <div className="modal-overlay active">
      <div className="modal-card modal-xl">
        <div className="modal-header">
          <div className="modal-title-group">
            <FileText className="w-5 h-5" style={{ color: '#0284c7' }} />
            <h3>PDF Document - {title || filename}</h3>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="modal-body p-0" style={{ height: '75vh', padding: 0 }}>
          <iframe src={pdfUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="PDF Preview" />
        </div>
        <div className="modal-footer">
          <a href={pdfUrl} download className="btn btn-primary">
            <Download className="w-4 h-4" /> Download PDF File
          </a>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
