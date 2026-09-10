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
      {/* 1. Keyword Search */}
      <div className="filter-group fg-search">
        <label className="filter-label">
          <Search className="w-3.5 h-3.5" /> Q SEARCH
        </label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Bid NO, Buyer, Item..."
          className="filter-input"
        />
      </div>

      {/* 2. Date Field Selection */}
      <div className="filter-group fg-date-type">
        <label className="filter-label">
          <Calendar className="w-3.5 h-3.5" /> DATE TYPE
        </label>
        <select value={dateType} onChange={(e) => setDateType(e.target.value)} className="filter-select">
          <option value="end">End Date</option>
          <option value="start">Start Date</option>
          <option value="opening">Opening Date</option>
        </select>
      </div>

      {/* 3. Date From */}
      <div className="filter-group fg-date">
        <label className="filter-label">DATE FROM</label>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="filter-input"
        />
      </div>

      {/* 4. Date To */}
      <div className="filter-group fg-date">
        <label className="filter-label">DATE TO</label>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="filter-input"
        />
      </div>

      {/* 5. Min Quantity */}
      <div className="filter-group fg-qty">
        <label className="filter-label">
          <Layers className="w-3.5 h-3.5" /> MIN QTY (&gt;)
        </label>
        <input
          type="number"
          value={minQty}
          onChange={(e) => setMinQty(e.target.value)}
          placeholder="e.g. 10"
          className="filter-input"
        />
      </div>

      {/* 6. Financial / Rank Filter */}
      <div className="filter-group fg-rank">
        <label className="filter-label">
          <Award className="w-3.5 h-3.5" /> FINANCIAL / RANK
        </label>
        <select value={rankType} onChange={(e) => setRankType(e.target.value)} className="filter-select">
          <option value="all">All Bids</option>
          <option value="ra_only">⚡ Reverse Auction (RA)</option>
          <option value="l1_available">Financial Evaluated (L1)</option>
          <option value="dalui_participated">🏢 G.M. DALUI Participated</option>
          <option value="dalui_qualified">🟢 G.M. DALUI Qualified (Non-L1)</option>
          <option value="dalui_qualified_all">🟢 G.M. DALUI Total Qualified</option>
          <option value="dalui_disqualified">🔴 G.M. DALUI Disqualified</option>
          <option value="dalui_l1">🏆 G.M. DALUI Won L1</option>
          <option value="dalui_l2">🔵 G.M. DALUI L2</option>
        </select>
      </div>

      {/* 7. Reset Button */}
      <div className="filter-actions-group">
        <button className="btn btn-reset" onClick={onResetFilters} title="Reset all filters">
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      </div>
    </div>
  );
}
