'use client';
import { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck, X, Sparkles, Award, CheckCircle, XCircle, Zap, ExternalLink, Info, Calendar, TrendingUp } from 'lucide-react';

export default function NotificationCenter({ onViewDetails }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filterUnread, setFilterUnread] = useState(false);
  const panelRef = useRef(null);

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return; // Backend not available, skip silently
      const data = await res.json();
      if (data.status === 'success') {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch (err) {
      // Silently ignore when backend is unreachable
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000); // Auto refresh every 10s
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target) && !e.target.closest('.notif-bell-btn')) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: null })
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'success') {
        setNotifications(data.notifications || []);
        setUnreadCount(0);
      }
    } catch (err) {
      // Silently ignore
    }
  };

  const handleItemClick = (notif) => {
    if (onViewDetails && notif.gem_id) {
      onViewDetails(notif.gem_id);
      setIsOpen(false);
    }
  };

  const displayedNotifications = filterUnread
    ? notifications.filter((n) => !n.read)
    : notifications;

  const getTypeBadge = (type) => {
    switch (type) {
      case 'WON_L1':
        return <span className="pill-badge pill-gold"><Award className="w-3 h-3" /> WON L1</span>;
      case 'QUALIFIED':
        return <span className="pill-badge pill-green"><CheckCircle className="w-3 h-3" /> Qualified</span>;
      case 'DISQUALIFIED':
        return <span className="pill-badge pill-red"><XCircle className="w-3 h-3" /> Disqualified</span>;
      case 'RA_TRIGGERED':
        return <span className="pill-badge pill-purple"><Zap className="w-3 h-3" /> RA Active</span>;
      case 'DATE_CHANGED':
        return <span className="pill-badge pill-amber"><Calendar className="w-3 h-3" /> Date Changed</span>;
      case 'STATUS_CHANGE':
        return <span className="pill-badge pill-blue"><TrendingUp className="w-3 h-3" /> Status / Price</span>;
      default:
        return <span className="pill-badge pill-blue"><Info className="w-3 h-3" /> Tender Alert</span>;
    }
  };

  const formatTimeAgo = (isoStr) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      const diffMs = new Date() - d;
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${Math.floor(diffHours / 24)}d ago`;
    } catch (e) {
      return '';
    }
  };

  return (
    <div className="notif-center-wrapper" style={{ position: 'relative' }}>
      <button
        className="notif-bell-btn btn-icon"
        onClick={() => setIsOpen(!isOpen)}
        title="Notification Center"
      >
        <Bell className="w-4 h-4 text-slate" />
        {unreadCount > 0 && (
          <span className="notif-badge-count">{unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="notif-panel-dropdown" ref={panelRef}>
          <div className="notif-panel-header">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue" />
              <h4 className="font-bold text-slate-800 text-sm">Notification Center</h4>
              {unreadCount > 0 && (
                <span className="pill-badge pill-blue">{unreadCount} new</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
              <button className="dd-close-x" onClick={() => setIsOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="notif-tabs">
            <button
              className={`notif-tab ${!filterUnread ? 'active' : ''}`}
              onClick={() => setFilterUnread(false)}
            >
              All ({notifications.length})
            </button>
            <button
              className={`notif-tab ${filterUnread ? 'active' : ''}`}
              onClick={() => setFilterUnread(true)}
            >
              Unread ({unreadCount})
            </button>
          </div>

          <div className="notif-list">
            {displayedNotifications.length === 0 ? (
              <div className="notif-empty">
                <Bell className="w-8 h-8 text-slate-300 mb-2" />
                <p>No new tender updates yet.</p>
                <span className="text-xs text-slate-400">Scraper engine automatically logs updates on each 2-hour scan round.</span>
              </div>
            ) : (
              displayedNotifications.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item ${!n.read ? 'unread' : ''}`}
                  onClick={() => handleItemClick(n)}
                >
                  <div className="notif-item-top">
                    {getTypeBadge(n.type)}
                    <span className="notif-time">{formatTimeAgo(n.timestamp)}</span>
                  </div>
                  <div className="notif-item-title">{n.title}</div>
                  <div className="notif-item-msg">{n.message}</div>
                  {n.gem_id && (
                    <div className="notif-item-footer">
                      <span className="notif-gem-id flex items-center gap-1 text-blue font-bold">
                        {n.gem_id} <ExternalLink className="w-3 h-3" />
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
