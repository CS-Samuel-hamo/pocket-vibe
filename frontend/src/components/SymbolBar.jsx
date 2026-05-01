import React from 'react';

const SYMBOLS = [
    "{", "}", "(", ")", "[", "]", "<", ">", "=", "!", ":", ";",
    "\"", "'", "$", "#", "@", "&", "|", "+", "-", "*", "/", "\\", "_", ".", ",", "?",
    "def", "import", "return", "class"
];

const SymbolBar = ({ onSymbolClick }) => {
    return (
        <div className="flex gap-2 overflow-x-auto py-2 bg-slate-800 border-b border-slate-700 no-scrollbar">
            {SYMBOLS.map((sym) => (
                <button
                    key={sym}
                    onClick={() => onSymbolClick(sym + " ")}
                    className="bg-slate-700 text-slate-300 px-3 py-1.5 rounded-md text-sm font-mono whitespace-nowrap hover:bg-slate-600 active:bg-blue-600 transition-colors"
                >
                    {sym}
                </button>
            ))}
        </div>
    );
};

export default SymbolBar;
