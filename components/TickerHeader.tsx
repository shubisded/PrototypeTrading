import React, { useMemo, useState } from "react";

interface Props {
  selectedTicker: string;
  onTickerChange: (ticker: string) => void;
  currentPrice: number;
  priceHistory: number[];
  tickerPrices: Record<string, number>;
  timeHistory?: string[];
  showExtendedStats?: boolean;
  targetPrice?: number;
  targetLabel?: string;
  className?: string;
  showTickerSelector?: boolean;
  maskExtendedStats?: boolean;
  showSessionRemaining?: boolean;
}

const SESSION_SLOTS_MINUTES = [8 * 60 + 30, 12 * 60, 15 * 60 + 30];

const getLatestAnchorDate = (timeHistory: string[]): Date => {
  for (let i = timeHistory.length - 1; i >= 0; i--) {
    const parsed = new Date(timeHistory[i]);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

const getCurrentSessionIndex = (date: Date): number => {
  const nowMinutes = date.getHours() * 60 + date.getMinutes();
  for (let i = SESSION_SLOTS_MINUTES.length - 1; i >= 0; i--) {
    if (SESSION_SLOTS_MINUTES[i] <= nowMinutes) return i;
  }
  return -1;
};

const formatClock = (date: Date): string =>
  date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

const TickerHeader: React.FC<Props> = ({
  selectedTicker,
  onTickerChange,
  currentPrice,
  priceHistory,
  tickerPrices,
  timeHistory = [],
  showExtendedStats = true,
  targetPrice,
  targetLabel = "Price To Beat",
  className = "",
  showTickerSelector = true,
  maskExtendedStats = false,
  showSessionRemaining = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const tickers = ["DDR5", "DDR4"];

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
    const referencePrice =
      priceHistory.length > 1
        ? priceHistory[priceHistory.length - 2]
        : priceHistory[0];
    const changePercent =
      ((currentPrice - referencePrice) / (referencePrice || 1)) * 100;

    return {
      price: currentPrice.toFixed(3),
      change: `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%`,
      high: maxPrice.toFixed(3),
      low: minPrice.toFixed(3),
      volume: `${priceHistory.length.toLocaleString()}`,
    };
  };

  const stats = calculateStats();

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const sessionProgress = useMemo(() => {
    const now = new Date(nowTick);
    const minutes = now.getHours() * 60 + now.getMinutes();

    // Fixed daily slots: 8:30, 12:00, 3:30.
    let completed = 0;
    if (minutes >= SESSION_SLOTS_MINUTES[0]) completed = 1;
    if (minutes >= SESSION_SLOTS_MINUTES[1]) completed = 2;
    if (minutes >= SESSION_SLOTS_MINUTES[2]) completed = 3;

    const remaining = Math.max(0, SESSION_SLOTS_MINUTES.length - completed);

    return {
      completed,
      remaining,
      dots: SESSION_SLOTS_MINUTES.map((_, idx) => idx < remaining),
      nextLabel: "",
    };
  }, [nowTick]);

  return (
    <div
      className={`bg-[#0c1515] border border-[#1a2e2e] rounded flex items-center h-14 shrink-0 relative z-[60] overflow-visible ${className}`}
    >
      {showTickerSelector ? (
        <>
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
                          <span className="w-1.5 h-1.5 rounded-full bg-[#2ed3b7]" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="w-[1px] h-full bg-[#1a2e2e]" />
        </>
      ) : null}

      <div className="flex items-center gap-8 px-6 overflow-hidden shrink py-1 h-full">
        {typeof targetPrice === "number" && (
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative flex flex-col justify-center">
              <span className="text-[8px] text-[#7f8c8d] uppercase tracking-widest leading-none">
                {targetLabel}
              </span>
              <span className="text-[14px] font-bold text-[#22c55e] leading-tight mt-1">
                ${targetPrice.toFixed(3)}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 shrink-0">
          {typeof targetPrice === "number" ? (
            <div className="h-8 w-[1px] bg-[#1a2e2e]" />
          ) : null}
          <div className="relative flex flex-col justify-center">
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


        {showSessionRemaining ? (
        <div className="hidden md:flex items-center gap-3 border-l border-[#1a2e2e] pl-5 shrink-0">
          <div className="flex flex-col justify-center">
            <span className="text-[8px] text-[#7f8c8d] uppercase tracking-widest leading-none">
              Sessions Remaining
            </span>
            <div className="mt-1 flex items-center gap-1.5">
              {sessionProgress.dots.map((isDone, idx) => (
                <span
                  key={idx}
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    isDone ? "bg-[#00e701]" : "bg-[#3e5168]"
                  }`}
                />
              ))}
              <span className="text-[10px] font-bold text-[#9fb1c5] ml-1">
                {sessionProgress.remaining}/{SESSION_SLOTS_MINUTES.length}
              </span>

            </div>
          </div>
        </div>

        ) : null}
        {showExtendedStats && (
          <div className="hidden sm:flex items-center gap-9 border-l border-[#1a2e2e] pl-8 h-1/2">
            <div className="flex flex-col justify-center">
              <span className="text-[13px] font-bold text-white leading-none">
                {maskExtendedStats ? "-" : `$${stats.high}`}
              </span>
              <span className="text-[9px] text-[#7f8c8d] uppercase tracking-widest mt-1">
                24h High
              </span>
            </div>
            <div className="flex flex-col justify-center">
              <span className="text-[13px] font-bold text-white leading-none">
                {maskExtendedStats ? "-" : `$${stats.low}`}
              </span>
              <span className="text-[9px] text-[#7f8c8d] uppercase tracking-widest mt-1">
                24h Low
              </span>
            </div>
            <div className="hidden lg:flex flex-col justify-center">
              <span className="text-[13px] font-bold text-white leading-none">
                {maskExtendedStats ? "-" : stats.volume}
              </span>
              <span className="text-[9px] text-[#7f8c8d] uppercase tracking-widest mt-1">
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








