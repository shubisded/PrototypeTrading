import React, { useEffect, useState } from "react";
import { INITIAL_CASH_BALANCE } from "../constants/demoAccount";
import { getOrCreateGuestId } from "../constants/guestSession";
import { getBackendBaseURL } from "../constants/network";

interface Props {
  ticker: string;
  currentPrice: number;
  onTradeExecuted?: () => void;
}

const SyntheticTradeCard: React.FC<Props> = ({
  ticker,
  currentPrice,
  onTradeExecuted,
}) => {
  const [activeTab, setActiveTab] = useState<"BUY" | "SELL">("BUY");
  const [amount, setAmount] = useState("100");
  const [availableCash, setAvailableCash] = useState(INITIAL_CASH_BALANCE);
  const [availableUnits, setAvailableUnits] = useState(0);
  const [sliderPercent, setSliderPercent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [tradeError, setTradeError] = useState("");
  const [tradeToast, setTradeToast] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const guestId = getOrCreateGuestId();
  const askPrice = currentPrice;
  const bidPrice = currentPrice;
  const displayPrice = activeTab === "BUY" ? askPrice : bidPrice;
  const numericAmount = parseFloat(amount) || 0;
  const estUnits = displayPrice > 0 ? numericAmount / displayPrice : 0;
  const availableUsdToSell = availableUnits * bidPrice;

  const refreshSyntheticState = async (nextTicker = ticker) => {
    const apiBase = getBackendBaseURL();
    try {
      const response = await fetch(`${apiBase}/api/synthetic/portfolio`, {
        headers: { "x-guest-id": guestId },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data?.account) {
        const parsedCash = Number(data.account.cashBalance);
        const nextCash = Number.isFinite(parsedCash)
          ? Math.max(0, parsedCash)
          : INITIAL_CASH_BALANCE;
        setAvailableCash(nextCash);
      }
      const openPositions = Array.isArray(data?.synthetic?.openPositions)
        ? data.synthetic.openPositions
        : [];
      const ownedUnits = openPositions
        .filter((position: { ticker?: string; units?: number }) => {
          return position.ticker === nextTicker;
        })
        .reduce((sum: number, position: { units?: number }) => {
          return sum + (Number(position.units) || 0);
        }, 0);
      setAvailableUnits(parseFloat(ownedUnits.toFixed(6)));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void refreshSyntheticState();
  }, [ticker]);

  useEffect(() => {
    const onAccountUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ cashBalance?: number }>;
      const parsedCash = Number(custom.detail?.cashBalance);
      if (Number.isFinite(parsedCash) && parsedCash >= 0) {
        setAvailableCash(parsedCash);
      }
    };
    window.addEventListener("accountUpdated", onAccountUpdated);
    return () => window.removeEventListener("accountUpdated", onAccountUpdated);
  }, []);

  useEffect(() => {
    setTradeError("");
    setSliderPercent(0);
    setAmount(activeTab === "BUY" ? "100" : "0");
  }, [activeTab, ticker]);

  useEffect(() => {
    if (!tradeToast) return;
    const timer = setTimeout(() => setTradeToast(""), 1800);
    return () => clearTimeout(timer);
  }, [tradeToast]);

  const emitSideNotice = (
    text: string,
    tone: "INFO" | "GOOD" | "BAD" = "INFO",
  ) => {
    window.dispatchEvent(
      new CustomEvent("appNotice", {
        detail: { text, tone },
      }),
    );
  };

  const setFromPercent = (percent: number) => {
    const safe = Math.max(0, Math.min(100, Math.round(percent)));
    setSliderPercent(safe);
    const base = activeTab === "BUY" ? availableCash : availableUsdToSell;
    const value = (base * safe) / 100;
    setAmount(Math.max(0, value).toFixed(2));
  };

  const canSubmit =
    numericAmount > 0 &&
    !submitting &&
    (activeTab === "BUY"
      ? numericAmount <= availableCash
      : numericAmount <= availableUsdToSell + 0.01);

  const executeTrade = async () => {
    setSubmitting(true);
    setTradeError("");
    setShowConfirm(false);
    const apiBase = getBackendBaseURL();
    try {
      const response = await fetch(`${apiBase}/api/synthetic/trade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-guest-id": guestId,
        },
        body: JSON.stringify({
          side: activeTab,
          ticker,
          amount: numericAmount,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.account) {
        setTradeError(data?.error || "Trade failed");
        emitSideNotice(data?.error || "Trade failed", "BAD");
        return;
      }
      const parsedCash = Number(data.account.cashBalance);
      const nextCash = Number.isFinite(parsedCash)
        ? Math.max(0, parsedCash)
        : INITIAL_CASH_BALANCE;
      setAvailableCash(nextCash);
      window.dispatchEvent(
        new CustomEvent("accountUpdated", {
          detail: {
            cashBalance: nextCash,
            portfolioPnL: Number(data.account.portfolioPnL) || 0,
            username: data.account.username || "DEMO",
          },
        }),
      );
      setTradeToast(
        activeTab === "BUY"
          ? `${ticker} bought successfully`
          : `${ticker} sold successfully`,
      );
      setSliderPercent(0);
      setAmount(activeTab === "BUY" ? "100" : "0");
      void refreshSyntheticState(ticker);
      if (onTradeExecuted) onTradeExecuted();
    } catch {
      setTradeError("Trade failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = () => {
    if (!canSubmit) return;
    if (activeTab === "SELL" && numericAmount > availableUsdToSell + 0.01) {
      setTradeError("Cannot sell more than held value");
      emitSideNotice("Sell rejected: insufficient held value", "BAD");
      return;
    }
    setTradeError("");
    setShowConfirm(true);
  };

  return (
    <div className="w-full bg-[#0c1515] border border-[#1a2e2e] rounded-2xl overflow-hidden shadow-2xl flex flex-col relative">
      <div className="flex bg-[#040b0b] border-b border-[#1a2e2e] shrink-0">
        <button
          onClick={() => setActiveTab("BUY")}
          className={`flex-1 py-5 text-[14px] font-extrabold uppercase tracking-[0.16em] transition-all relative ${
            activeTab === "BUY"
              ? "text-[#2ed3b7] bg-[#0d1c1c]"
              : "text-[#7f8c8d] hover:text-[#2ed3b7] hover:bg-[#0d1c1c]/30"
          }`}
        >
          Buy
          {activeTab === "BUY" && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#2ed3b7]" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("SELL")}
          className={`flex-1 py-5 text-[14px] font-extrabold uppercase tracking-[0.16em] transition-all relative ${
            activeTab === "SELL"
              ? "text-rose-500 bg-[#1c0d0d]/30"
              : "text-[#7f8c8d] hover:text-rose-400 hover:bg-[#1c0d0d]/10"
          }`}
        >
          Sell
          {activeTab === "SELL" && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-rose-600" />
          )}
        </button>
      </div>

      <div className="p-6 space-y-5">
        <div className="flex justify-between items-center px-1">
          <span className="text-[10px] font-bold text-[#7f8c8d] uppercase tracking-widest">
            {activeTab === "BUY" ? "Current Ask" : "Current Bid"}
          </span>
          <span
            className={`text-[12px] font-bold mono ${
              activeTab === "BUY" ? "text-[#2ed3b7]" : "text-rose-500"
            }`}
          >
            ${displayPrice.toFixed(3)}
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center px-1">
            <label className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7f8c8d]">
              Order Size (USD)
            </label>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7f8c8d]">
              {activeTab === "BUY"
                ? `$${availableCash.toFixed(2)} Cash`
                : `$${availableUsdToSell.toFixed(2)} Held`}
            </span>
          </div>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              onChange={(e) => {
                setSliderPercent(0);
                setAmount(e.target.value);
              }}
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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#7f8c8d]">
              {activeTab} %
            </span>
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#2ed3b7]">
              {sliderPercent}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={sliderPercent}
            onChange={(e) => setFromPercent(Number(e.target.value))}
            className={`w-full ${activeTab === "BUY" ? "accent-[#2ed3b7]" : "accent-rose-500"}`}
          />
          <div className="grid grid-cols-4 gap-2">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => setFromPercent(pct)}
                className={`h-8 rounded-md border text-[10px] font-bold uppercase tracking-[0.12em] ${
                  activeTab === "BUY"
                    ? "border-[#1a2e2e] text-[#7f8c8d] hover:text-[#2ed3b7] hover:bg-[#112020]"
                    : "border-[#2e1a1a] text-rose-300 hover:bg-[#1f1313]"
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        <div
          className={`p-5 rounded-2xl border space-y-3 ${
            activeTab === "BUY"
              ? "bg-[#0d1c1c]/30 border-[#1a2e2e]"
              : "bg-[#1c0d0d]/20 border-[#2e1a1a]"
          }`}
        >
          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-tight">
            <span className="text-[#7f8c8d]">{activeTab === "BUY" ? "Est. Units" : "Est. Units Sold"}</span>
            <span className={activeTab === "BUY" ? "text-[#2ed3b7]" : "text-rose-400"}>
              {estUnits.toFixed(4)}
            </span>
          </div>
          <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-tight">
            <span className="text-[#7f8c8d]">{activeTab === "BUY" ? "Est. Cost" : "Est. Proceeds"}</span>
            <span className="text-white">${numericAmount.toFixed(2)}</span>
          </div>
        </div>

        {tradeError ? (
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-rose-400 text-center">
            {tradeError}
          </div>
        ) : null}
        {tradeToast ? (
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#2ed3b7] text-center">
            {tradeToast}
          </div>
        ) : null}
      </div>

      <div className="p-6 bg-[#040b0b]/50 border-t border-[#1a2e2e] shrink-0">
        <button
          onClick={handleConfirm}
          disabled={!canSubmit}
          className={`w-full py-5 font-bold text-[13px] uppercase tracking-[0.25em] transition-all rounded-xl shadow-xl active:scale-[0.98] ${
            activeTab === "BUY"
              ? "bg-[#2ed3b7] text-[#040b0b] shadow-[#2ed3b7]/10 hover:bg-[#2ed3b7]/90"
              : "bg-rose-600 text-white shadow-rose-600/10 hover:bg-rose-500"
          } ${!canSubmit ? "opacity-50 cursor-not-allowed hover:bg-inherit" : ""}`}
        >
          {submitting ? "Processing..." : `Confirm ${activeTab} Order`}
        </button>
      </div>

      {showConfirm ? (
        <div className="absolute inset-0 z-30 bg-[#010707]/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#1a2e2e] bg-[#0a1414] shadow-2xl p-5 space-y-4">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#2ed3b7]">
              Confirm Trade
            </h3>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white leading-relaxed">
              {activeTab} {ticker} for ${numericAmount.toFixed(2)}?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="h-10 rounded-lg border border-[#2a3a3a] text-[#7f8c8d] text-[11px] font-bold uppercase tracking-[0.14em] hover:text-white hover:border-[#3a5a5a] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeTrade}
                className={`h-10 rounded-lg text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
                  activeTab === "BUY"
                    ? "bg-[#2ed3b7] text-[#040b0b] hover:bg-[#29c7ad]"
                    : "bg-rose-600 text-white hover:bg-rose-500"
                }`}
              >
                Yes, Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default SyntheticTradeCard;
