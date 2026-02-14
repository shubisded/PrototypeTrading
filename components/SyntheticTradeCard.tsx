import React, { useState } from "react";
import { INITIAL_CASH_BALANCE } from "../constants/demoAccount";

interface Props {
  ticker: string;
  currentPrice: number;
}

const SyntheticTradeCard: React.FC<Props> = ({ ticker, currentPrice }) => {
  const [activeTab, setActiveTab] = useState<"BUY" | "SELL">("BUY");
  const [amount, setAmount] = useState("100");

  // Simulated Bid/Ask Spread (0.2%)
  const askPrice = currentPrice * 1.001; // Buy price
  const bidPrice = currentPrice * 0.999; // Sell price

  const displayPrice = activeTab === "BUY" ? askPrice : bidPrice;
  const units = parseFloat(amount) / displayPrice || 0;

  return (
    <div className="w-full bg-[#0c1515] border border-[#1a2e2e] rounded-2xl overflow-hidden shadow-2xl flex flex-col min-h-[480px]">
      {/* Header Tabs */}
      <div className="flex bg-[#040b0b] border-b border-[#1a2e2e] shrink-0">
        <button
          onClick={() => setActiveTab("BUY")}
          className={`flex-1 py-4 text-[11px] font-bold uppercase tracking-[0.3em] transition-all relative ${
            activeTab === "BUY"
              ? "text-[#2ed3b7] bg-[#0d1c1c]"
              : "text-[#7f8c8d] hover:text-[#2ed3b7] hover:bg-[#0d1c1c]/30"
          }`}
        >
          Buy
          {activeTab === "BUY" && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#2ed3b7]"></div>
          )}
        </button>
        <button
          onClick={() => setActiveTab("SELL")}
          className={`flex-1 py-4 text-[11px] font-bold uppercase tracking-[0.3em] transition-all relative ${
            activeTab === "SELL"
              ? "text-rose-500 bg-[#1c0d0d]/30"
              : "text-[#7f8c8d] hover:text-rose-400 hover:bg-[#1c0d0d]/10"
          }`}
        >
          Sell
          {activeTab === "SELL" && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-rose-600"></div>
          )}
        </button>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-grow overflow-y-auto custom-scrollbar p-6 space-y-6">
        <div className="flex justify-between items-center px-1">
          <span className="text-[10px] font-bold text-[#7f8c8d] uppercase tracking-widest">
            {activeTab === "BUY" ? "Current Ask" : "Current Bid"}
          </span>
          <span
            className={`text-[12px] font-bold mono ${activeTab === "BUY" ? "text-[#2ed3b7]" : "text-rose-500"}`}
          >
            ${displayPrice.toFixed(3)}
          </span>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7f8c8d] px-1">
              Order Size (USD)
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={`w-full bg-[#040b0b] border border-[#1a2e2e] p-4 text-4xl font-bold text-white focus:outline-none transition-all rounded-xl pr-12 ${
                  activeTab === "BUY"
                    ? "focus:border-[#2ed3b7]"
                    : "focus:border-rose-600"
                }`}
              />
              <span className="absolute right-5 top-1/2 -translate-y-1/2 text-lg font-bold text-[#7f8c8d] opacity-50">
                $
              </span>
            </div>
          </div>

          {/* Quick Select Percentages */}
          <div className="flex gap-2">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() =>
                  setAmount(((INITIAL_CASH_BALANCE * pct) / 100).toFixed(0))
                }
                className={`flex-1 py-2 bg-[#1a2e2e] rounded text-[9px] font-bold transition-all uppercase tracking-widest ${
                  activeTab === "BUY"
                    ? "text-[#7f8c8d] hover:text-[#2ed3b7]"
                    : "text-[#7f8c8d] hover:text-rose-400"
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* Transaction Summary Box */}
        <div
          className={`p-5 rounded-2xl border space-y-3 ${
            activeTab === "BUY"
              ? "bg-[#0d1c1c]/30 border-[#1a2e2e]"
              : "bg-[#1c0d0d]/20 border-[#2e1a1a]"
          }`}
        >
          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-tight">
            <span className="text-[#7f8c8d]">
              {activeTab === "BUY"
                ? `Est. ${ticker} Units`
                : "Est. USD Proceeds"}
            </span>
            <span
              className={
                activeTab === "BUY" ? "text-[#2ed3b7]" : "text-rose-400"
              }
            >
              {activeTab === "BUY"
                ? units.toFixed(4)
                : `$${(units * bidPrice).toFixed(2)}`}
            </span>
          </div>
          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-tight">
            <span className="text-[#7f8c8d]">Price Impact</span>
            <span className="text-white">{"< 0.01%"}</span>
          </div>
          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-tight">
            <span className="text-[#7f8c8d]">Network Fee</span>
            <span className="text-white">$0.25</span>
          </div>
        </div>

        <div className="text-[9px] text-[#7f8c8d] font-bold uppercase tracking-[0.14em] text-center px-4 leading-relaxed opacity-60">
          Synthetic assets track the global spot price of DRAM modules.
          Settlement is conducted via high-frequency liquidity pools.
        </div>
      </div>

      {/* Fixed Confirm Button in Footer */}
      <div className="p-6 bg-[#040b0b]/50 border-t border-[#1a2e2e] shrink-0">
        <button
          className={`w-full py-5 font-bold text-[13px] uppercase tracking-[0.25em] transition-all rounded-xl shadow-xl active:scale-[0.98] ${
            activeTab === "BUY"
              ? "bg-[#2ed3b7] text-[#040b0b] shadow-[#2ed3b7]/10 hover:bg-[#2ed3b7]/90"
              : "bg-rose-600 text-white shadow-rose-600/10 hover:bg-rose-500"
          }`}
        >
          Confirm {activeTab === "BUY" ? "Buy" : "Sell"} Order
        </button>
      </div>
    </div>
  );
};

export default SyntheticTradeCard;
