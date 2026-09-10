'use client';
import { useState } from 'react';
import { Users, Settings, SlidersHorizontal, RefreshCw, Save, ShieldCheck } from 'lucide-react';

export default function UserSettingsView({ mode = 'settings', onTriggerScraper }) {
  const [companyName, setCompanyName] = useState('G.M. DALUI');
  const [altNames, setAltNames] = useState('G.M. DALUI & SONS, G.M.DALUI, GM DALUI');
  const [savedMsg, setSavedMsg] = useState('');

  const handleSave = (e) => {
    e.preventDefault();
    setSavedMsg('Settings saved successfully!');
    setTimeout(() => setSavedMsg(''), 3000);
  };

  if (mode === 'users') {
    return (
      <div className="users-view records-card p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Users className="w-6 h-6 text-blue" /> User &amp; Company Target Management
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Configure target company names monitored by the financial bid parser engine
            </p>
          </div>
          <button className="btn btn-outline" onClick={onTriggerScraper}>
            <RefreshCw className="w-4 h-4" /> Run Instant Scraper
          </button>
        </div>

        <form onSubmit={handleSave} className="max-w-2xl space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Primary Company Target Name</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="filter-input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Alternative Spellings &amp; Aliases (Comma Separated)</label>
            <textarea
              rows={3}
              value={altNames}
              onChange={(e) => setAltNames(e.target.value)}
              className="form-textarea w-full"
            />
          </div>

          <div className="flex items-center gap-4">
            <button type="submit" className="btn btn-pdf flex items-center gap-2">
              <Save className="w-4 h-4" /> Save Target Config
            </button>
            {savedMsg && <span className="text-sm font-bold text-green-600">{savedMsg}</span>}
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="settings-view records-card p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Settings className="w-6 h-6 text-slate" /> System Settings &amp; Daemon Parameters
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Scraper timing, proxy ports, and scheduler configuration
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-4 border rounded-lg bg-slate-50 space-y-3">
          <h4 className="font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue" /> Next.js &amp; Python Port Proxy
          </h4>
          <div className="text-sm text-slate-600">
            <div>Frontend Server Port: <strong>6012</strong></div>
            <div>Backend API Endpoint: <strong>http://127.0.0.1:6001/api/</strong></div>
            <div>Proxy Rule: <code>/api/* -&gt; 6001/api/*</code></div>
          </div>
        </div>

        <div className="p-4 border rounded-lg bg-slate-50 space-y-3">
          <h4 className="font-bold text-slate-800 flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-purple" /> 2-Hour Background Daemon
          </h4>
          <div className="text-sm text-slate-600">
            <div>Auto Refresh Schedule: <strong>Every 2 Hours (Fixed Loop)</strong></div>
            <div>Auto Retry: <strong>Enabled with Backoff</strong></div>
            <div>JSON Output Path: <code>scraped_output/json/</code></div>
          </div>
        </div>
      </div>
    </div>
  );
}
