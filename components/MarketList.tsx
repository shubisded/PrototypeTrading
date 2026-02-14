
import React from 'react';
import { Market } from '../App';

interface Props {
  markets: Market[];
  selectedId: string;
  onSelect: (market: Market) => void;
  onSelectOutcome?: (market: Market, outcome: "YES" | "NO") => void;
}

const MarketList: React.FC<Props> = ({
  markets,
  selectedId,
  onSelect,
  onSelectOutcome,
}) => {
  if (markets.length === 0) return (
    <div className="py-12 text-center">
        <p className="text-[10px] font-bold text-[#7f8c8d] uppercase tracking-widest">No Active Contracts</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {markets.map((market) => (
        <div 
          key={market.id}
          onClick={() => onSelect(market)}
          className={`group cursor-pointer p-4 bg-[#040b0b]/30 border transition-all rounded-lg flex items-center gap-4 ${
            selectedId === market.id ? 'border-[#2ed3b7] bg-[#0c1c1c]' : 'border-[#1a2e2e] hover:border-[#2ed3b7]/30'
          }`}
        >
          <div className="flex-grow min-w-0">
            <div className="flex items-center gap-2 mb-1">
                <span className="px-1.5 py-0.5 bg-[#1a2e2e] text-[#2ed3b7] text-[8px] font-bold rounded uppercase tracking-tighter shrink-0">
                    {market.ticker}
                </span>
                <span className="text-[9px] font-bold text-[#7f8c8d] uppercase truncate opacity-50">Vol: {market.volume}</span>
            </div>
            <h3 className="text-[11px] font-bold text-white truncate group-hover:text-[#2ed3b7] transition-colors uppercase tracking-tight">
                {market.question}
            </h3>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="w-24 hidden sm:block">
                <div className="h-1 bg-[#1a2e2e] rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-[#2ed3b7]" 
                        style={{ width: `${market.probability}%` }}
                    />
                </div>
            </div>
            <div className="text-right min-w-[40px]">
                <span className="text-sm font-bold text-white">{market.probability}%</span>
            </div>
            
            <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectOutcome?.(market, "YES");
                  }}
                  className="px-3 py-1 bg-[#1a2e2e] border border-transparent hover:border-[#2ed3b7] text-[#2ed3b7] text-[9px] font-bold uppercase rounded transition-all"
                >
                    Yes
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectOutcome?.(market, "NO");
                  }}
                  className="px-3 py-1 bg-[#1a2e2e] border border-transparent hover:border-white text-white text-[9px] font-bold uppercase rounded transition-all"
                >
                    No
                </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default MarketList;
