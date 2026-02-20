
import React from 'react';
import { Market } from '../App';

interface Props {
  markets: Market[];
  selectedId: string;
  onSelect: (market: Market) => void;
  onSelectOutcome?: (market: Market, outcome: "YES" | "NO") => void;
  renderExpanded?: (market: Market) => React.ReactNode;
}

const MarketList: React.FC<Props> = ({
  markets,
  selectedId,
  onSelect,
  onSelectOutcome,
  renderExpanded,
}) => {
  if (markets.length === 0) return (
    <div className="py-12 text-center">
        <p className="text-[10px] font-bold text-[#7f8c8d] uppercase tracking-widest">No Active Contracts</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {markets.map((market) => {
        const isSelected = selectedId === market.id;
        return (
          <div
            key={market.id}
            className={`bg-[#040b0b]/30 border transition-all rounded-xl ${
              isSelected
                ? "border-[#2ed3b7] bg-[#10263a]"
                : "border-[#1a2e2e]"
            }`}
          >
            <div
              onClick={() => onSelect(market)}
              className={`group cursor-pointer p-4 flex items-center gap-3 ${
                isSelected ? "" : "hover:border-[#2ed3b7]/30"
              }`}
            >
              <div className="flex-grow min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 bg-[#1a2e2e] text-[#2ed3b7] text-[9px] font-bold rounded-md uppercase tracking-tight shrink-0">
                    {market.ticker}
                  </span>
                  <span className="text-[10px] font-bold text-[#7f8c8d] uppercase truncate opacity-70">
                    Vol: {market.volume}
                  </span>
                </div>
                <h3 className="text-[15px] font-bold text-white leading-snug line-clamp-2 group-hover:text-[#2ed3b7] transition-colors uppercase tracking-tight">
                  {market.question}
                </h3>
                {/* poll timing line removed by request */}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="w-24 hidden sm:block">
                  <div className="h-1.5 bg-[#1a2e2e] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#2ed3b7]"
                      style={{ width: `${market.probability}%` }}
                    />
                  </div>
                </div>
                <div className="text-right min-w-[40px]">
                  <span className="text-[15px] font-bold text-white">
                    {market.probability}%
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectOutcome?.(market, "YES");
                    }}
                    className="px-3 py-1.5 bg-[#1a2e2e] border border-transparent hover:border-[#2ed3b7] text-[#2ed3b7] text-[9px] font-bold uppercase rounded-lg transition-all"
                  >
                    Up
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectOutcome?.(market, "NO");
                    }}
                    className="px-3 py-1.5 bg-[#1a2e2e] border border-transparent hover:border-white text-white text-[9px] font-bold uppercase rounded-lg transition-all"
                  >
                    Down
                  </button>
                </div>
              </div>
            </div>
          {renderExpanded ? (
            <div
              className={`overflow-hidden transition-all duration-300 ease-out ${
                isSelected
                  ? "max-h-[520px] opacity-100 pb-4 pt-1"
                  : "max-h-0 opacity-0 pb-0 pt-0"
              }`}
            >
              <div className="px-4">{renderExpanded(market)}</div>
            </div>
          ) : null}
        </div>
        );
      })}
    </div>
  );
};

export default MarketList;
