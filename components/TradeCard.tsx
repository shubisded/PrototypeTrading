import React, { useEffect, useState } from "react";
import { Market } from "../App";
import { INITIAL_CASH_BALANCE } from "../constants/demoAccount";
import { getOrCreateGuestId } from "../constants/guestSession";
import { getBackendBaseURL } from "../constants/network";

interface Props {
  market: Market;
  forcedOutcome?: "YES" | "NO" | null;
  onTradeExecuted?: () => void;
}

const TradeCard: React.FC<Props> = ({
  market,
  forcedOutcome = null,
  onTradeExecuted,
}) => {
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("BUY");
  const [outcome, setOutcome] = useState<"YES" | "NO">("YES");
  const [amount, setAmount] = useState("100");
  const [availableBalance, setAvailableBalance] =
    useState(INITIAL_CASH_BALANCE);
  const [availableContracts, setAvailableContracts] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [tradeError, setTradeError] = useState<string>("");
  const [tradeToast, setTradeToast] = useState<string>("");
  const [showTradeConfirm, setShowTradeConfirm] = useState(false);
  const guestId = getOrCreateGuestId();

  useEffect(() => {
    const apiBase = getBackendBaseURL();

    fetch(`${apiBase}/api/account`, {
      headers: { "x-guest-id": guestId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data?.account) return;
        setAvailableBalance(
          Number(data.account.cashBalance) || INITIAL_CASH_BALANCE,
        );
      })
      .catch(() => {
        // Keep default when backend is unavailable.
      });
  }, [guestId]);

  const refreshAvailableContracts = async (
    nextMarketId: string,
    nextOutcome: "YES" | "NO",
  ) => {
    try {
      const apiBase = getBackendBaseURL();
      const response = await fetch(`${apiBase}/api/prediction/portfolio`, {
        headers: { "x-guest-id": guestId },
      });
      if (!response.ok) return;
      const data = await response.json();
      const openPositions = Array.isArray(data?.prediction?.openPositions)
        ? data.prediction.openPositions
        : [];
      const owned = openPositions
        .filter(
          (position: {
            marketId?: string;
            outcome?: "YES" | "NO";
            contracts?: number;
          }) =>
            position.marketId === nextMarketId &&
            position.outcome === nextOutcome,
        )
        .reduce(
          (
            sum: number,
            position: {
              contracts?: number;
            },
          ) => sum + (Number(position.contracts) || 0),
          0,
        );
      setAvailableContracts(parseFloat(owned.toFixed(2)));
    } catch {
      // Keep previous value if backend is unavailable.
    }
  };

  useEffect(() => {
    const onAccountUpdated = (event: Event) => {
      const custom = event as CustomEvent<{
        cashBalance?: number;
      }>;
      const nextCash = Number(custom.detail?.cashBalance);
      if (Number.isFinite(nextCash) && nextCash >= 0) {
        setAvailableBalance(nextCash);
      }
    };

    window.addEventListener("accountUpdated", onAccountUpdated);
    return () => window.removeEventListener("accountUpdated", onAccountUpdated);
  }, []);

  useEffect(() => {
    if (!forcedOutcome) return;
    setTradeType("BUY");
    setOutcome(forcedOutcome);
  }, [forcedOutcome, market.id]);

  useEffect(() => {
    void refreshAvailableContracts(market.id, outcome);
  }, [market.id, outcome]);

  useEffect(() => {
    if (tradeType !== "SELL") return;
    const current = Number(amount);
    if (!Number.isFinite(current)) return;
    if (current > availableContracts) {
      setTradeError("Cannot sell more than owned contracts");
    } else if (tradeError === "Cannot sell more than owned contracts") {
      setTradeError("");
    }
  }, [tradeType, amount, availableContracts, tradeError]);

  const sharePrice =
    outcome === "YES"
      ? market.probability / 100
      : (100 - market.probability) / 100;
  const numericAmount = parseFloat(amount) || 0;
  const profitMultiplier = sharePrice > 0 ? 1 / sharePrice : 0;
  const buyPayout = numericAmount * profitMultiplier;
  const estimatedShares = sharePrice > 0 ? numericAmount / sharePrice : 0;
  const contractsToSell = numericAmount;
  const estimatedProceeds = contractsToSell * sharePrice;
  const canSubmit =
    numericAmount > 0 &&
    !submitting &&
    (tradeType === "BUY" ? numericAmount <= availableBalance : true);

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

  const executeTrade = async () => {
    setSubmitting(true);
    setTradeError("");
    setShowTradeConfirm(false);
    const actionVerb = tradeType === "BUY" ? "open" : "sell";
    const apiBase = getBackendBaseURL();
    try {
      const response = await fetch(`${apiBase}/api/prediction/trade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-guest-id": guestId,
        },
        body: JSON.stringify(
          tradeType === "BUY"
            ? {
                side: "BUY",
                marketId: market.id,
                outcome,
                amount: numericAmount,
              }
            : {
                side: "SELL",
                marketId: market.id,
                outcome,
                contracts: numericAmount,
              },
        ),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.account) {
        setTradeError(data?.error || "Trade failed");
        emitSideNotice(data?.error || "Trade failed", "BAD");
        return;
      }

      const nextCash =
        Number(data.account.cashBalance) || INITIAL_CASH_BALANCE;
      setAvailableBalance(nextCash);
      window.dispatchEvent(
        new CustomEvent("accountUpdated", {
          detail: {
            cashBalance: nextCash,
            portfolioPnL: Number(data.account.portfolioPnL) || 0,
            username: data.account.username || "DEMO",
          },
        }),
      );
      if (tradeType === "BUY") {
        setTradeToast(
          `${outcome} position opened: ${estimatedShares.toFixed(2)} contracts`,
        );
      } else {
        setTradeToast(
          `${outcome} contracts sold: ${contractsToSell.toFixed(2)} contracts`,
        );
      }
      void refreshAvailableContracts(market.id, outcome);
      if (onTradeExecuted) onTradeExecuted();
    } catch {
      setTradeError(`Failed to ${actionVerb} position`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmTrade = () => {
    if (!canSubmit) return;
    if (tradeType === "SELL" && numericAmount > availableContracts) {
      setTradeError("Cannot sell more than owned contracts");
      emitSideNotice("Sell rejected: not enough contracts", "BAD");
      return;
    }
    setTradeError("");
    setShowTradeConfirm(true);
  };

  useEffect(() => {
    if (!tradeToast) return;
    const timer = setTimeout(() => setTradeToast(""), 1800);
    return () => clearTimeout(timer);
  }, [tradeToast]);

  return (
    <div className="w-full bg-[#0c1515] border border-[#1a2e2e] rounded-2xl overflow-hidden shadow-2xl flex flex-col min-h-[480px]">
      {/* Header Tabs */}
      <div className="flex bg-[#040b0b] border-b border-[#1a2e2e] shrink-0">
        <button
          onClick={() => setTradeType("BUY")}
          className={`flex-1 py-4 text-[11px] font-bold uppercase tracking-[0.3em] transition-all relative ${
            tradeType === "BUY"
              ? "text-[#2ed3b7] bg-[#0d1c1c]"
              : "text-[#7f8c8d] hover:text-[#2ed3b7] hover:bg-[#0d1c1c]/30"
          }`}
        >
          Buy
          {tradeType === "BUY" && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#2ed3b7]"></div>
          )}
        </button>
        <button
          onClick={() => setTradeType("SELL")}
          className={`flex-1 py-4 text-[11px] font-bold uppercase tracking-[0.3em] transition-all relative ${
            tradeType === "SELL"
              ? "text-rose-500 bg-[#1c0d0d]/30"
              : "text-[#7f8c8d] hover:text-rose-400 hover:bg-[#1c0d0d]/10"
          }`}
        >
          Sell
          {tradeType === "SELL" && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-rose-600"></div>
          )}
        </button>
      </div>

      {/* Selected Poll Context */}
      <div className="shrink-0 px-6 pt-5 pb-3 border-b border-[#1a2e2e]/60 bg-[#0a1414]">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2 py-0.5 bg-[#1a2e2e] text-[#2ed3b7] text-[8px] font-bold rounded uppercase tracking-[0.16em]">
            {market.ticker}
          </span>
          <span className="text-[8px] font-bold text-[#7f8c8d] uppercase tracking-[0.16em]">
            Selected Poll
          </span>
        </div>
        <p className="text-[10px] leading-relaxed text-white/90 font-semibold uppercase tracking-[0.04em] line-clamp-3">
          {market.question}
        </p>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-grow overflow-y-auto custom-scrollbar p-6 space-y-6">
        {/* Outcome Toggle */}
        <div className="flex gap-3 p-2 bg-[#040b0b] rounded-2xl border border-[#1a2e2e]">
          <button
            onClick={() => setOutcome("YES")}
            className={`flex-1 py-4 text-[13px] font-bold uppercase tracking-[0.18em] rounded-xl transition-all ${
              outcome === "YES"
                ? tradeType === "BUY"
                  ? "bg-[#2ed3b7] text-[#040b0b] shadow-lg"
                  : "bg-rose-600 text-white shadow-lg"
                : "text-[#7f8c8d] hover:text-[#7f8c8d]"
            }`}
          >
            {tradeType === "BUY" ? "Buy Yes" : "Sell Yes"}
          </button>
          <button
            onClick={() => setOutcome("NO")}
            className={`flex-1 py-4 text-[13px] font-bold uppercase tracking-[0.18em] rounded-xl transition-all ${
              outcome === "NO"
                ? tradeType === "BUY"
                  ? "bg-white text-[#040b0b] shadow-lg"
                  : "bg-rose-600 text-white shadow-lg"
                : "text-[#7f8c8d] hover:text-[#7f8c8d]"
            }`}
          >
            {tradeType === "BUY" ? "Buy No" : "Sell No"}
          </button>
        </div>

        {/* Amount Input */}
        <div className="space-y-3">
          <div className="flex justify-between items-center px-1">
            <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#7f8c8d]">
              {tradeType === "BUY" ? "Trade Amount" : "Contracts"}
            </label>
            <span
              className={`text-[9px] font-bold uppercase tracking-widest ${
                tradeType === "BUY" ? "text-[#2ed3b7]" : "text-rose-500"
              }`}
            >
              {tradeType === "BUY"
                ? `$${availableBalance.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} Bal`
                : `${availableContracts.toFixed(2)} Contracts`}
            </span>
          </div>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => {
                const nextRaw = e.target.value;
                if (tradeType === "BUY") {
                  setAmount(nextRaw);
                  return;
                }
                const nextNumeric = Number(nextRaw);
                if (!Number.isFinite(nextNumeric)) {
                  setAmount(nextRaw);
                  return;
                }
                if (nextNumeric < 0) {
                  setAmount("0");
                  return;
                }
                setAmount(nextRaw);
              }}
              className={`w-full bg-[#040b0b] border border-[#1a2e2e] p-4 text-4xl font-bold text-white focus:outline-none transition-all rounded-xl pr-12 ${
                tradeType === "BUY"
                  ? "focus:border-[#2ed3b7]"
                  : "focus:border-rose-600"
              }`}
            />
            <span className="absolute right-5 top-1/2 -translate-y-1/2 text-lg font-bold text-[#7f8c8d] opacity-50">
              {tradeType === "BUY" ? "$" : "cts"}
            </span>
          </div>
        </div>

        {/* Summary Details */}
        <div
          className={`space-y-4 p-6 rounded-2xl border transition-all ${
            tradeType === "BUY"
              ? outcome === "YES"
                ? "bg-[#0d1c1c]/30 border-[#1a2e2e]"
                : "bg-[#ffffff]/5 border-[#333]"
              : "bg-[#1c0d0d]/20 border-[#2e1a1a]"
          }`}
        >
          <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-tight">
            <span className="text-[#7f8c8d]">
              {tradeType === "BUY" ? "Avg Price" : "Avg Sell Price"}
            </span>
            <span
              className={tradeType === "BUY" ? "text-white" : "text-rose-400"}
            >
              ${sharePrice.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-tight">
            <span className="text-[#7f8c8d]">
              {tradeType === "BUY" ? "Est. Shares" : "Contracts"}
            </span>
            <span
              className={
                tradeType === "BUY"
                  ? outcome === "YES"
                    ? "text-[#2ed3b7]"
                    : "text-white"
                  : "text-rose-400"
              }
            >
              {tradeType === "BUY"
                ? estimatedShares.toFixed(2)
                : contractsToSell.toFixed(2)}
            </span>
          </div>
          {tradeType === "BUY" ? (
            <div className="pt-4 border-t border-[#1a2e2e]/50 flex justify-between items-center text-[11px] font-bold uppercase tracking-widest">
              <span className="text-[#7f8c8d]">Payout</span>
              <span className="text-white">
                ${buyPayout.toFixed(2)}{" "}
                <span className="ml-2 text-[#2ed3b7]">
                  ({profitMultiplier.toFixed(2)}x)
                </span>
              </span>
            </div>
          ) : (
            <div className="pt-4 border-t border-[#1a2e2e]/50 flex justify-between items-center text-[11px] font-bold uppercase tracking-widest">
              <span className="text-[#7f8c8d]">You'll Receive</span>
              <span className="text-rose-400">
                ${estimatedProceeds.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {tradeError ? (
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-rose-400 text-center">
            {tradeError}
          </div>
        ) : null}
        {tradeType === "SELL" ? (
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7f8c8d] text-center">
            Available To Sell: {availableContracts.toFixed(2)} Contracts
          </div>
        ) : null}
        {tradeToast ? (
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#2ed3b7] text-center">
            {tradeToast}
          </div>
        ) : null}

        <div className="text-[8px] text-[#7f8c8d] font-bold uppercase tracking-[0.2em] text-center px-4 leading-relaxed opacity-60">
          Shares represent binary outcomes on price milestones. Settlement is
          automated via smart contract execution.
        </div>
      </div>

      {/* Fixed Confirm Button in Footer */}
      <div className="p-6 bg-[#040b0b]/50 border-t border-[#1a2e2e] shrink-0">
        <button
          onClick={handleConfirmTrade}
          disabled={!canSubmit}
          className={`w-full py-5 font-bold text-[13px] uppercase tracking-[0.25em] transition-all rounded-xl shadow-xl active:scale-[0.98] ${
            tradeType === "BUY"
              ? outcome === "YES"
                ? "bg-[#2ed3b7] text-[#040b0b] shadow-[#2ed3b7]/10 hover:bg-[#2ed3b7]/90"
                : "bg-white text-[#040b0b] shadow-white/10 hover:bg-[#f0f0f0]"
              : "bg-rose-600 text-white shadow-rose-600/10 hover:bg-rose-500"
          } ${!canSubmit ? "opacity-50 cursor-not-allowed hover:bg-inherit" : ""}`}
        >
          {submitting
            ? "Processing..."
            : `Confirm ${tradeType === "BUY" ? "Buy" : "Sell"} ${outcome} Order`}
        </button>
      </div>

      {showTradeConfirm ? (
        <div className="absolute inset-0 z-30 bg-[#010707]/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#1a2e2e] bg-[#0a1414] shadow-2xl p-5 space-y-4">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#2ed3b7]">
              Confirm Trade
            </h3>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white leading-relaxed">
              {tradeType === "BUY"
                ? `Open ${outcome} position on ${market.ticker} for $${numericAmount.toFixed(2)}?`
                : `Sell ${contractsToSell.toFixed(2)} ${outcome} contracts on ${market.ticker}?`}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowTradeConfirm(false)}
                className="h-10 rounded-lg border border-[#2a3a3a] text-[#7f8c8d] text-[11px] font-bold uppercase tracking-[0.14em] hover:text-white hover:border-[#3a5a5a] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeTrade}
                className={`h-10 rounded-lg text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
                  tradeType === "BUY"
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

export default TradeCard;
