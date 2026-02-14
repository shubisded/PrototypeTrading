import React, { useState } from "react";

interface Props {
  selectedTicker: string;
  onTickerChange: (ticker: string) => void;
  currentPrice: number;
  priceHistory: number[];
  tickerPrices: Record<string, number>;
  showExtendedStats?: boolean;
  targetPrice?: number;
  targetLabel?: string;
  className?: string;
}

const TickerHeader: React.FC<Props> = ({
  selectedTicker,
  onTickerChange,
  currentPrice,
  priceHistory,
  tickerPrices,
  showExtendedStats = true,
  targetPrice,
  targetLabel = "Price To Beat",
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const tickers = ["DDR5", "DDR4", "GDDR5", "GDDR6"];

  // Calculate stats from price history
  const calculateStats = () => {
    if (priceHistory.length === 0) {
      return {
        price: "0.000",
        change: "0.00%",
        high: "0.000",
        low: "0.000",
        volume: "0",
      };
    }

    const minPrice = Math.min(...priceHistory);
    const maxPrice = Math.max(...priceHistory);
    const firstPrice = priceHistory[0];
    const changePercent = ((currentPrice - firstPrice) / firstPrice) * 100;

    return {
      price: currentPrice.toFixed(3),
      change: `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`,
      high: maxPrice.toFixed(3),
      low: minPrice.toFixed(3),
      volume: `${priceHistory.length.toLocaleString()}`,
    };
  };

  const stats = calculateStats();

  return (
    <div
      className={`bg-[#0c1515] border border-[#1a2e2e] rounded flex items-center h-14 shrink-0 relative z-[60] overflow-visible ${className}`}
    >
      {/* Dropdown Selector */}
      <div className="relative h-full flex items-center px-3">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-3 h-10 px-4 bg-[#1a2e2e] border border-[#253d3d] rounded text-[#2ed3b7] hover:bg-[#253d3d] transition-all group z-10"
        >
          <div className="w-5 h-5 bg-[#2ed3b7] rounded-sm flex items-center justify-center shrink-0">
            <span className="text-[#040b0b] font-bold text-[10px]">
              {selectedTicker[0]}
            </span>
          </div>
          <span className="text-[13px] font-bold tracking-tight uppercase whitespace-nowrap">
            {selectedTicker}/USD
          </span>
          <svg
            className={`w-4 h-4 text-[#7f8c8d] transition-transform ${isOpen ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
        >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-[90] bg-transparent"
              onClick={() => setIsOpen(false)}
            />

            <div className="absolute top-full left-0 mt-1.5 w-48 bg-[#0c1515] border border-[#1a2e2e] rounded shadow-[0_12px_40px_rgba(0,0,0,0.9)] z-[100] overflow-hidden">
              <div className="py-1">
                {tickers.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      onTickerChange(t);
                      setIsOpen(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-[12px] font-bold transition-all flex items-center justify-between group/item ${
                      selectedTicker === t
                        ? "text-[#2ed3b7] bg-[#1a2e2e]/50"
                        : "text-[#7f8c8d] hover:bg-[#1a2e2e] hover:text-[#2ed3b7]"
                    }`}
                  >
                    <span>{t}/USD</span>
                    {selectedTicker === t && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#2ed3b7]"></span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Vertical Separator */}
      <div className="w-[1px] h-full bg-[#1a2e2e]"></div>

      {/* Stats Display */}
      <div className="flex items-center gap-8 px-6 overflow-hidden shrink py-1 h-full">
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex flex-col justify-center">
            <span className="text-[8px] text-[#7f8c8d] uppercase tracking-widest leading-none">
              Current Price
            </span>
            <span className="text-[14px] font-bold text-[#2ed3b7] leading-tight mt-1">
              ${stats.price}
            </span>
          </div>
          <span className="text-[12px] font-bold text-[#2ed3b7] opacity-90 mt-4">
            {stats.change}
          </span>
        </div>

        {typeof targetPrice === "number" && (
          <div className="flex items-center gap-3 border-l border-[#1a2e2e] pl-4">
            <div className="flex flex-col justify-center">
              <span className="text-[8px] text-[#7f8c8d] uppercase tracking-widest leading-none">
                {targetLabel}
              </span>
              <span className="text-[14px] font-bold text-[#22c55e] leading-tight mt-1">
                ${targetPrice.toFixed(3)}
              </span>
            </div>
          </div>
        )}

        {showExtendedStats && (
          <div className="hidden sm:flex items-center gap-8 border-l border-[#1a2e2e] pl-8 h-1/2">
          <div className="flex flex-col justify-center">
            <span className="text-[11px] font-bold text-white leading-none">
              ${stats.high}
            </span>
            <span className="text-[8px] text-[#7f8c8d] uppercase tracking-widest mt-1">
              24h High
            </span>
          </div>
          <div className="flex flex-col justify-center">
            <span className="text-[11px] font-bold text-white leading-none">
              ${stats.low}
            </span>
            <span className="text-[8px] text-[#7f8c8d] uppercase tracking-widest mt-1">
              24h Low
            </span>
          </div>
          <div className="hidden lg:flex flex-col justify-center">
            <span className="text-[11px] font-bold text-white leading-none">
              {stats.volume}
            </span>
            <span className="text-[8px] text-[#7f8c8d] uppercase tracking-widest mt-1">
              24h Volume
            </span>
          </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TickerHeader;
