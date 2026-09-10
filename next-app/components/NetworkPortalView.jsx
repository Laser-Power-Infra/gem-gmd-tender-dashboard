'use client';
import { Globe, Server, CheckCircle, ExternalLink, RefreshCw } from 'lucide-react';

export default function NetworkPortalView({ onTriggerScraper }) {
  return (
    <div className="network-portal-view">
      <div className="records-card p-6 mb-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Globe className="w-6 h-6 text-blue" /> Network Portal &amp; Live Scraper Nodes
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Real-time cluster status for port 4560 Network Dashboard and Playwright background daemon
            </p>
          </div>
          <a
            href="http://192.168.1.190:4560/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" /> Open Live Portal (http://192.168.1.190:4560/)
          </a>
        </div>

        <div className="network-nodes-grid grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="node-card p-4 border rounded-lg bg-slate-50">
            <div className="flex items-center gap-3 mb-2">
              <Server className="w-5 h-5 text-blue" />
              <h4 className="font-bold text-slate-800">Primary Scraper Server</h4>
            </div>
            <div className="text-xs text-slate-500 mb-2">IP: 192.168.1.200 | Port: 6001 (Flask API)</div>
            <span className="badge badge-green flex items-center gap-1 w-fit">
              <CheckCircle className="w-3 h-3" /> ONLINE &amp; RESPONSIVE
            </span>
          </div>

          <div className="node-card p-4 border rounded-lg bg-slate-50">
            <div className="flex items-center gap-3 mb-2">
              <Globe className="w-5 h-5 text-green" />
              <h4 className="font-bold text-slate-800">Network Portal Node</h4>
            </div>
            <div className="text-xs text-slate-500 mb-2">IP: 192.168.1.200 | Port: 4560</div>
            <span className="badge badge-green flex items-center gap-1 w-fit">
              <CheckCircle className="w-3 h-3" /> ACTIVE CLUSTER
            </span>
          </div>

          <div className="node-card p-4 border rounded-lg bg-slate-50">
            <div className="flex items-center gap-3 mb-2">
              <RefreshCw className="w-5 h-5 text-purple" />
              <h4 className="font-bold text-slate-800">2-Hour Auto Scheduler</h4>
            </div>
            <div className="text-xs text-slate-500 mb-2">Interval: Every 120 Mins</div>
            <span className="badge badge-purple flex items-center gap-1 w-fit">
              <CheckCircle className="w-3 h-3" /> DAEMON RUNNING
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
