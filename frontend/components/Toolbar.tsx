"use client";

const SORT_OPTIONS = [
  { value: "revenue", label: "Revenue First" },
  { value: "updated", label: "Recently Updated" },
  { value: "newest", label: "Newest First" },
  { value: "name", label: "Name A-Z" },
] as const;

interface ToolbarProps {
  totalCount: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  sortValue: string;
  onSortChange: (sort: string) => void;
}

export default function Toolbar({
  totalCount,
  searchQuery,
  onSearchChange,
  categories,
  selectedCategory,
  onCategoryChange,
  sortValue,
  onSortChange,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <h2 className="page-title">Discovered Startups</h2>
        <span className="entity-count">{totalCount}</span>
      </div>
      <div className="toolbar-right">
        <input
          type="search"
          className="search-box"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <select
          className="select-filter"
          value={selectedCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <select
          className="select-filter"
          value={sortValue}
          onChange={(e) => onSortChange(e.target.value)}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
