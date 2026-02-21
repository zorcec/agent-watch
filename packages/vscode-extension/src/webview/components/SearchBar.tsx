import { useRef, useEffect, useCallback } from 'react';

type SearchBarProps = {
  query: string;
  matchCount: number;
  onQueryChange: (q: string) => void;
  onClose: () => void;
};

export function SearchBar({ query, matchCount, onQueryChange, onClose }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <div className="search-bar" data-testid="search-bar">
      <span className="search-icon">🔍</span>
      <input
        ref={inputRef}
        className="search-input"
        type="text"
        placeholder="Search nodes…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        data-testid="search-input"
      />
      {query && (
        <span className="search-match-count" data-testid="search-match-count">
          {matchCount} match{matchCount !== 1 ? 'es' : ''}
        </span>
      )}
      <button className="search-close-btn" onClick={onClose} title="Close search (Esc)">
        ✕
      </button>
    </div>
  );
}
