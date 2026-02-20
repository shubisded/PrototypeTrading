import React, { useEffect, useState } from "react";
import {
  DEPOSIT_INCREMENT,
  INITIAL_CASH_BALANCE,
  INITIAL_PORTFOLIO_PNL,
} from "../constants/demoAccount";
import { getOrCreateGuestId } from "../constants/guestSession";
import { getBackendBaseURL } from "../constants/network";

interface Props {
  onHome?: () => void;
}

const emitAccountUpdated = (account: {
  cashBalance: number;
  portfolioPnL: number;
  username: string;
}) => {
  window.dispatchEvent(new CustomEvent("accountUpdated", { detail: account }));
};

const ACCOUNT_CACHE_KEY_PREFIX = "siliconpredict.accountCache";

type CachedAccountState = {
  username: string;
  cashBalance?: number;
  portfolioPnL?: number;
};

const getAccountCacheKey = (guestId: string): string =>
  `${ACCOUNT_CACHE_KEY_PREFIX}:${guestId}`;

const readCachedAccount = (guestId: string): CachedAccountState | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getAccountCacheKey(guestId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const username = String(parsed?.username || "").trim();
    if (!username) return null;
    return {
      username,
      cashBalance: Number(parsed?.cashBalance) || 0,
      portfolioPnL: Number(parsed?.portfolioPnL) || 0,
    };
  } catch {
    return null;
  }
};

const writeCachedAccount = (guestId: string, account: CachedAccountState): void => {
  if (typeof window === "undefined") return;
  try {
    const normalizedUsername = String(account.username || "").trim() || "DEMO";
    window.localStorage.setItem(
      getAccountCacheKey(guestId),
      JSON.stringify({
        username: normalizedUsername,
        cashBalance: Number(account.cashBalance) || 0,
        portfolioPnL: Number(account.portfolioPnL) || 0,
      }),
    );
  } catch {
    // ignore storage failures
  }
};

const Navbar: React.FC<Props> = ({ onHome }) => {
  const apiBase = getBackendBaseURL();
  const guestId = getOrCreateGuestId();
  const cachedAccount = readCachedAccount(guestId);

  const [cashBalance, setCashBalance] = useState(
    Number.isFinite(cachedAccount?.cashBalance)
      ? Math.max(0, Number(cachedAccount?.cashBalance))
      : INITIAL_CASH_BALANCE,
  );
  const [portfolioPnL, setPortfolioPnL] = useState(
    Number.isFinite(cachedAccount?.portfolioPnL)
      ? Number(cachedAccount?.portfolioPnL)
      : INITIAL_PORTFOLIO_PNL,
  );
  const [username, setUsername] = useState(cachedAccount?.username || "DEMO");
  const [showToast, setShowToast] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}/api/account`, {
      headers: { "x-guest-id": guestId },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data?.account) return;
        const parsedCash = Number(data.account.cashBalance);
        const parsedPortfolio = Number(data.account.portfolioPnL);
        const nextCash = Number.isFinite(parsedCash)
          ? Math.max(0, parsedCash)
          : INITIAL_CASH_BALANCE;
        const nextPortfolio = Number.isFinite(parsedPortfolio)
          ? parsedPortfolio
          : INITIAL_PORTFOLIO_PNL;
        const nextUsername = data.account.username || "DEMO";
        setCashBalance(nextCash);
        setPortfolioPnL(nextPortfolio);
        setUsername(nextUsername);
        writeCachedAccount(guestId, {
          username: nextUsername,
          cashBalance: nextCash,
          portfolioPnL: nextPortfolio,
        });
        emitAccountUpdated({
          cashBalance: nextCash,
          portfolioPnL: nextPortfolio,
          username: nextUsername,
        });
      })
      .catch(() => {
        // Keep local cached/defaults if backend is unavailable.
      });
  }, [apiBase, guestId]);

  useEffect(() => {
    const onAccountUpdated = (event: Event) => {
      const custom = event as CustomEvent<{
        cashBalance?: number;
        portfolioPnL?: number;
        username?: string;
      }>;
      const nextCash = Number(custom.detail?.cashBalance);
      const nextPortfolio = Number(custom.detail?.portfolioPnL);
      const nextUsername = custom.detail?.username;

      const resolvedCash = Number.isFinite(nextCash) && nextCash >= 0 ? nextCash : cashBalance;
      const resolvedPortfolio = Number.isFinite(nextPortfolio)
        ? nextPortfolio
        : portfolioPnL;
      const resolvedUsername =
        typeof nextUsername === "string" && nextUsername.trim() ? nextUsername : username;

      if (Number.isFinite(nextCash) && nextCash >= 0) {
        setCashBalance(nextCash);
      }
      if (Number.isFinite(nextPortfolio)) {
        setPortfolioPnL(nextPortfolio);
      }
      if (typeof nextUsername === "string" && nextUsername.trim()) {
        setUsername(nextUsername);
      }

      writeCachedAccount(guestId, {
        username: resolvedUsername,
        cashBalance: resolvedCash,
        portfolioPnL: resolvedPortfolio,
      });
    };

    window.addEventListener("accountUpdated", onAccountUpdated);
    return () => window.removeEventListener("accountUpdated", onAccountUpdated);
  }, [guestId, username, cashBalance, portfolioPnL]);

  const handleDeposit = async () => {
    try {
      const response = await fetch(`${apiBase}/api/account/deposit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-guest-id": guestId,
        },
        body: JSON.stringify({ amount: DEPOSIT_INCREMENT }),
      });

      if (!response.ok) return;

      const data = await response.json();
      if (!data?.account) return;

      const parsedCash = Number(data.account.cashBalance);
      const parsedPortfolio = Number(data.account.portfolioPnL);
      const nextCash = Number.isFinite(parsedCash)
        ? Math.max(0, parsedCash)
        : INITIAL_CASH_BALANCE;
      const nextPortfolio = Number.isFinite(parsedPortfolio)
        ? parsedPortfolio
        : INITIAL_PORTFOLIO_PNL;
      const nextUsername = data.account.username || "DEMO";
      setCashBalance(nextCash);
      setPortfolioPnL(nextPortfolio);
      setUsername(nextUsername);
      writeCachedAccount(guestId, {
        username: nextUsername,
        cashBalance: nextCash,
        portfolioPnL: nextPortfolio,
      });
      emitAccountUpdated({
        cashBalance: nextCash,
        portfolioPnL: nextPortfolio,
        username: nextUsername,
      });
      setShowToast(true);
    } catch {
      // Keep current UI state when request fails.
    }
  };

  useEffect(() => {
    if (!showToast) return;
    const t = setTimeout(() => setShowToast(false), 1800);
    return () => clearTimeout(t);
  }, [showToast]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-4 md:px-6 h-[70px] bg-[#040b0b] border-b border-[#1a2e2e]">
      <div className="flex items-center gap-8">
        <div onClick={onHome} className="flex items-center gap-4 cursor-pointer group">
          <div className="w-11 h-11 overflow-hidden shrink-0">
            <img
              src="/site-logo.png"
              alt="SiliconPredict logo"
              className="w-full h-full object-contain"
            />
          </div>
          <span className="text-lg font-black tracking-[0.08em] text-white uppercase">
            SiliconPredict
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-6">
          {["Markets", "Portfolio", "Leaderboard", "FAQ"].map((item) => (
            <button
              key={item}
              className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#7f8c8d] hover:text-[#2ed3b7] transition-colors"
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex items-center gap-2">
        <div className="hidden md:flex items-center gap-2.5">
          <div className="h-10 min-w-[108px] px-3 rounded-lg bg-[#0b1818] border border-[#1a2e2e] flex flex-col justify-center">
            <p className="text-[9px] text-[#7f8c8d] uppercase tracking-[0.12em] font-bold leading-none">
              Portfolio
            </p>
            <p
              className={`text-[13px] font-bold leading-tight mt-1 ${portfolioPnL >= 0 ? "text-[#2ed3b7]" : "text-rose-500"}`}
            >
              ${portfolioPnL.toFixed(2)}
            </p>
          </div>
          <div className="h-10 min-w-[108px] px-3 rounded-lg bg-[#0b1818] border border-[#1a2e2e] flex flex-col justify-center">
            <p className="text-[9px] text-[#7f8c8d] uppercase tracking-[0.12em] font-bold leading-none">
              Cash
            </p>
            <p className="text-[13px] font-bold leading-tight mt-1 text-white">
              ${cashBalance.toFixed(2)}
            </p>
          </div>
        </div>

        <button
          onClick={handleDeposit}
          className="px-5 h-10 bg-[#1d4ed8] hover:bg-[#1e40af] text-white text-[13px] font-bold tracking-[0.06em] transition-colors rounded-lg shadow-[0_4px_16px_rgba(29,78,216,0.35)]"
        >
          Deposit
        </button>

        <button
          className="w-9 h-9 rounded-full border border-[#2f4f66] bg-[#0c1515] text-[#94a3b8] hover:text-white transition-colors flex items-center justify-center"
          aria-label="Notifications"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 4a4 4 0 00-4 4v2.2c0 .9-.3 1.7-.8 2.4L6 14.5h12l-1.2-1.9a4 4 0 01-.8-2.4V8a4 4 0 00-4-4z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9.5 18a2.5 2.5 0 005 0"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="relative">
          <button
            onClick={() => setProfileOpen((s) => !s)}
            className="flex items-center gap-1.5 pl-1"
            aria-label="Profile menu"
          >
            <div className="w-9 h-9 rounded-full bg-[radial-gradient(circle_at_30%_25%,#60a5fa,#6366f1_45%,#0f766e_100%)] border border-[#46658a] flex items-center justify-center">
              <span className="text-white text-[11px] font-bold">D</span>
            </div>
            <svg
              className={`w-4 h-4 text-[#94a3b8] transition-transform ${profileOpen ? "rotate-180" : ""}`}
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

          {profileOpen && (
            <>
              <div className="fixed inset-0 z-[90]" onClick={() => setProfileOpen(false)} />
              <div className="absolute right-0 top-11 z-[100] w-44 bg-[#0c1515] border border-[#1a2e2e] rounded-lg shadow-[0_12px_40px_rgba(0,0,0,0.6)] p-2">
                <p className="text-[10px] text-[#7f8c8d] uppercase tracking-[0.12em] px-2 py-1">
                  Account
                </p>
                <div className="px-2 py-2 rounded bg-[#122222] text-[#2ed3b7] text-[12px] font-bold">
                  {username}
                </div>
              </div>
            </>
          )}
        </div>

        {showToast && (
          <div className="absolute right-0 -bottom-10 px-3 py-1.5 rounded-md bg-[#102020] border border-[#1a2e2e] text-[11px] font-bold text-[#2ed3b7] whitespace-nowrap shadow-lg">
            Deposit Successful +${DEPOSIT_INCREMENT}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
