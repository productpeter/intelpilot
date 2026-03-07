"use client";

import { useEffect } from "react";
import type { Entity } from "@/types";
import EntityCard from "./EntityCard";

interface EntityGridProps {
  entities: Entity[];
  currentPage: number;
  onPageChange: (page: number) => void;
  onEntityClick: (id: string) => void;
  pageSize?: number;
}

export default function EntityGrid({
  entities,
  currentPage,
  onPageChange,
  onEntityClick,
  pageSize = 24,
}: EntityGridProps) {
  const totalPages = Math.max(1, Math.ceil(entities.length / pageSize));
  const start = (currentPage - 1) * pageSize;
  const slice = entities.slice(start, start + pageSize);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentPage]);

  const getPageNumbers = (): (number | "ellipsis")[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | "ellipsis")[] = [1];
    if (currentPage > 3) pages.push("ellipsis");
    const lo = Math.max(2, currentPage - 2);
    const hi = Math.min(totalPages - 1, currentPage + 2);
    for (let p = lo; p <= hi; p++) {
      if (!pages.includes(p)) pages.push(p);
    }
    if (currentPage < totalPages - 2) pages.push("ellipsis");
    if (totalPages > 1) pages.push(totalPages);
    return pages;
  };

  if (entities.length === 0) {
    return (
      <div className="entity-grid grid-empty">
        No entities to display.
      </div>
    );
  }

  return (
    <div>
      <div className="entity-grid">
        {slice.map((entity) => (
          <EntityCard
            key={entity._id}
            entity={entity}
            onClick={onEntityClick}
          />
        ))}
      </div>
      {totalPages > 1 && (
        <div className="pagination">
          <button
            type="button"
            className="page-btn"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            Prev
          </button>
          {getPageNumbers().map((p, i) =>
            p === "ellipsis" ? (
              <span key={`ellipsis-${i}`} className="page-ellipsis">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className={`page-btn ${p === currentPage ? "active" : ""}`}
                onClick={() => onPageChange(p)}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            className="page-btn"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
