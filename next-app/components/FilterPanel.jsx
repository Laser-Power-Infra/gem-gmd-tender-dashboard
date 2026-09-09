'use client';
import { Search, Calendar, Layers, Award, RotateCcw } from 'lucide-react';

export default function FilterPanel({
  query,
  setQuery,
  dateType,
  setDateType,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  minQty,
  setMinQty,
  rankType,
  setRankType,
  onResetFilters,
}) {
  return (
    <div className="filter-panel">
      <div className="filter-group" style={{ flex: 2, minWidth: '220px' }}>
        <label>
          <Search className="w-3.5 h-3.5" /> Search Keyword
        </label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Bid NO, RA NO, Buyer, Item, Status..."
        />
      </div>

      <div className="filter-group">
        <label>
          <Calendar className="w-3.5 h-3.5" /> Date Field
        </label>
        <select value={dateType} onChange={(e) => setDateType(e.target.value)}>
          <option value="end">Bid End Date</option>
          <option value="start">Bid Start Date</option>
          <option value="opening">Bid Opening Date</option>
        </select>
      </div>

      <div className="filter-group">
        <label>Date From</label>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
      </div>

      <div className="filter-group">
        <label>Date To</label>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </div>

      <div className="filter-group">
        <label>
          <Layers className="w-3.5 h-3.5" /> Min Quantity (&gt;)
        </label>
        <input
          type="number"
          value={minQty}
          onChange={(e) => setMinQty(e.target.value)}
          placeholder="e.g. 10"
        />
      </div>

      <div className="filter-group">
        <label>
          <Award className="w-3.5 h-3.5" /> Financial / Rank
        </label>
        <select value={rankType} onChange={(e) => setRankType(e.target.value)}>
          <option value="all">All Bids</option>
          <option value="ra_only">⚡ Reverse Auction (RA) Bids</option>
          <option value="l1_available">Financial Evaluated (L1)</option>
          <option value="dalui_participated">🏢 G.M. DALUI Participated</option>
          <option value="dalui_qualified">🟢 G.M. DALUI Qualified (Other / Non-L1)</option>
          <option value="dalui_qualified_all">🟢 G.M. DALUI Total Qualified (Incl. L1)</option>
          <option value="dalui_disqualified">🔴 G.M. DALUI Disqualified</option>
          <option value="dalui_l1">🏆 G.M. DALUI Won L1</option>
          <option value="dalui_l2">🔵 G.M. DALUI L2 (Missed L1)</option>
        </select>
      </div>

      <div className="filter-actions-group">
        <button className="btn btn-secondary btn-sm" onClick={onResetFilters}>
          <RotateCcw className="w-4 h-4" /> Reset Filters
        </button>
      </div>
    </div>
  );
}
