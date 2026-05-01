import React from 'react';

/**
 * FuzzySearch - Modular popup for file targeting (@ mentions).
 */
const FuzzySearch = ({ visible, query, items, onSelect }) => {
    if (!visible) return null;

    const filtered = items.filter(item =>
        item.name.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5);

    return (
        <div className="fuzzy-search-popup">
            {filtered.length > 0 ? filtered.map((item, i) => (
                <div
                    key={i}
                    className="fuzzy-item"
                    onClick={() => onSelect(item.name)}
                    onTouchStart={() => onSelect(item.name)}
                >
                    <span className="icon">{item.type === 'dir' ? '📁' : '📄'}</span>
                    <span className="name">{item.name}</span>
                </div>
            )) : (
                <div className="fuzzy-item empty">No files found</div>
            )}
        </div>
    );
};

export default FuzzySearch;
