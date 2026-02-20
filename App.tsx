import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import Navbar from "./components/Navbar";
import MarketList from "./components/MarketList";
import TradeCard from "./components/TradeCard";
import SyntheticTradeCard from "./components/SyntheticTradeCard";
import BackgroundGrid from "./components/BackgroundGrid";
import Footer from "./components/Footer";
import MarketChart from "./components/MarketChart";
import PredictionChanceChart from "./components/PredictionChanceChart";
import TickerHeader from "./components/TickerHeader";
import LandingPage from "./components/LandingPage";
import { getBackendBaseURL } from "./constants/network";
import { getOrCreateGuestId } from "./constants/guestSession";

export type Market = {
  id: string;
  question: string;
  ticker: string;
  probability: number;
  volume: string;
  category: string;
  period: "MONTHLY" | "DAILY";
  targetPrice: number;
};

export type ViewState = "LANDING" | "SYNTHETIC" | "PREDICTION";

const VIEW_PATHS: Record<ViewState, string> = {
  LANDING: "/",
  SYNTHETIC: "/spot",
  PREDICTION: "/prediction",
};

const getViewFromPath = (pathname: string): ViewState => {
  if (pathname === "/spot") return "SYNTHETIC";
  if (pathname === "/prediction") return "PREDICTION";
  return "LANDING";
};
type PredictionChartMode = "PRICE" | "CHANCE";
type PositionsTab = "SYNTHETIC" | "PREDICTION" | "ORDER_HISTORY";
type PredictionPeriodFilter = "MONTHLY" | "DAILY";

type PredictionOpenPosition = {
  id: number;
  marketId: string;
  ticker: string;
  category: string;
  period: "MONTHLY" | "DAILY";
  outcome: "YES" | "NO";
  contracts: number;
  avgEntryPrice: number;
  investedAmount: number;
  targetPrice: number;
  currentPrice: number;
  marketValue: number;
  pnl: number;
  sessionsToSettlement: number | null;
};

type PredictionOrder = {
  id: number;
  type: "BUY" | "SELL" | "SETTLEMENT";
  ticker: string;
  outcome: "YES" | "NO";
  contracts: number;
  price: number;
  amount: number;
  realizedPnl: number;
  result?: "WIN" | "LOSS";
  createdAt: string;
};

type PredictionPortfolio = {
  openPositions: PredictionOpenPosition[];
  orderHistory: PredictionOrder[];
};

type SyntheticPosition = {
  id: number;
  ticker: string;
  units: number;
  avgEntryPrice: number;
  investedAmount: number;
  markPrice: number;
  marketValue: number;
  pnl: number;
};

type SyntheticOrder = {
  id: number;
  type: "BUY" | "SELL";
  ticker: string;
  units: number;
  price: number;
  amount: number;
  realizedPnl: number;
  createdAt: string;
};

type SyntheticPortfolio = {
  openPositions: SyntheticPosition[];
  orderHistory: SyntheticOrder[];
};

type AppNotice = {
  id: number;
  text: string;
  tone: "INFO" | "GOOD" | "BAD";
};
type ActivityItem = {
  id: number;
  text: string;
  timestamp: string;
};

type MarketTemplate = Omit<Market, "question" | "targetPrice">;

const MOCK_MARKETS: MarketTemplate[] = [
  {
    id: "1",
    ticker: "DDR5-AUG-F",
    probability: 64,
    volume: "$1.2M",
    category: "DDR5",
    period: "MONTHLY",
  },
  {
    id: "2",
    ticker: "DDR5-DAILY",
    probability: 42,
    volume: "$4.5M",
    category: "DDR5",
    period: "DAILY",
  },
  {
    id: "3",
    ticker: "DDR4-AUG-F",
    probability: 78,
    volume: "$890K",
    category: "DDR4",
    period: "MONTHLY",
  },
  {
    id: "4",
    ticker: "DDR4-DAILY",
    probability: 52,
    volume: "$1.4M",
    category: "DDR4",
    period: "DAILY",
  },
];

const DEFAULT_PREDICTION_PERIOD: PredictionPeriodFilter = "DAILY";

const INITIAL_TICKER_PRICES: Record<string, number> = {
  DDR5: 38.067,
  DDR4: 78.409,
};
const PREDICTION_ONBOARDING_KEY_PREFIX = "siliconpredict.predictionOnboardingSeen";

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>(() => {
    if (typeof window === "undefined") return "LANDING";
    return getViewFromPath(window.location.pathname);
  });
  const [selectedTicker, setSelectedTicker] = useState<string>("DDR5");
  const [selectedMarket, setSelectedMarket] = useState<Market>({
    ...(MOCK_MARKETS.find((m) => m.period === DEFAULT_PREDICTION_PERIOD) ||
      MOCK_MARKETS[0]),
    question: "",
    targetPrice:
      INITIAL_TICKER_PRICES[
        (MOCK_MARKETS.find((m) => m.period === DEFAULT_PREDICTION_PERIOD) ||
          MOCK_MARKETS[0]).category
      ] || 0,
  });
  const [tickerPrices, setTickerPrices] = useState<Record<string, number>>(
    INITIAL_TICKER_PRICES,
  );
  const [priceToBeatMap, setPriceToBeatMap] = useState<Record<string, number>>(
    INITIAL_TICKER_PRICES,
  );
  const [monthlyStartPriceMap, setMonthlyStartPriceMap] = useState<
    Record<string, number>
  >(INITIAL_TICKER_PRICES);
  const [marketChances, setMarketChances] = useState<Record<string, number>>(
    MOCK_MARKETS.reduce(
      (acc, market) => {
        acc[market.id] = market.probability;
        return acc;
      },
      {} as Record<string, number>,
    ),
  );
  const [chanceHistories, setChanceHistories] = useState<Record<string, number[]>>(
    MOCK_MARKETS.reduce(
      (acc, market) => {
        acc[market.id] = [market.probability];
        return acc;
      },
      {} as Record<string, number[]>,
    ),
  );
  const [priceHistory, setPriceHistory] = useState<Record<string, number[]>>(
    Object.keys(INITIAL_TICKER_PRICES).reduce(
      (acc, ticker) => {
        acc[ticker] = [INITIAL_TICKER_PRICES[ticker]];
        return acc;
      },
      {} as Record<string, number[]>,
    ),
  );
  const [priceTimeHistory, setPriceTimeHistory] = useState<Record<string, string[]>>(
    Object.keys(INITIAL_TICKER_PRICES).reduce(
      (acc, ticker) => {
        acc[ticker] = [new Date().toISOString()];
        return acc;
      },
      {} as Record<string, string[]>,
    ),
  );
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [setBackendReady] = useState(false);
  const [predictionChartMode, setPredictionChartMode] =
    useState<PredictionChartMode>("PRICE");
  const [predictionPeriodFilter, setPredictionPeriodFilter] =
    useState<PredictionPeriodFilter>(DEFAULT_PREDICTION_PERIOD);
  const [hasPredictionPollSelection, setHasPredictionPollSelection] =
    useState(false);
  const [tradePresetOutcome, setTradePresetOutcome] = useState<
    "YES" | "NO" | null
  >(null);
  const [positionsTab, setPositionsTab] = useState<PositionsTab>("SYNTHETIC");
  const [predictionPortfolio, setPredictionPortfolio] =
    useState<PredictionPortfolio>({
      openPositions: [],
      orderHistory: [],
    });
  const [syntheticPortfolio, setSyntheticPortfolio] = useState<SyntheticPortfolio>(
    {
      openPositions: [],
      orderHistory: [],
    },
  );
  const [hideDustPositions, setHideDustPositions] = useState(true);
  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const guestId = getOrCreateGuestId();
  const lastSeenOrderIdRef = useRef<number>(0);
  const hasBootstrappedOrdersRef = useRef(false);
  const portfolioRefreshTimerRef = useRef<number | null>(null);

  const navigateToView = useCallback(
    (view: ViewState, options?: { replace?: boolean }) => {
      setCurrentView(view);
      if (typeof window === "undefined") return;

      const nextPath = VIEW_PATHS[view];
      if (window.location.pathname === nextPath) return;

      if (options?.replace) {
        window.history.replaceState({}, "", nextPath);
      } else {
        window.history.pushState({}, "", nextPath);
      }
    },
    [],
  );

  // Collapsible (non-draggable) dev panel state
  const [devOpen, setDevOpen] = useState(false);
  const [showSkipTooltip, setShowSkipTooltip] = useState(false);
  const [skipTooltipPos, setSkipTooltipPos] = useState({ x: 0, y: 0 });
  const skipButtonRef = useRef<HTMLButtonElement | null>(null);
  const [showResetTooltip, setShowResetTooltip] = useState(false);
  const [resetTooltipPos, setResetTooltipPos] = useState({ x: 0, y: 0 });
  const resetButtonRef = useRef<HTMLButtonElement | null>(null);
  const [showPredictionOnboarding, setShowPredictionOnboarding] = useState(false);
  const [usernameReady, setUsernameReady] = useState(false);
  const [accountUsername, setAccountUsername] = useState("DEMO");
  const [usernameCheckComplete, setUsernameCheckComplete] = useState(false);
  const previousViewRef = useRef<ViewState>("LANDING");

  const currentPrice = tickerPrices[selectedTicker] || 0;
  const visiblePredictionPositions = predictionPortfolio.openPositions.filter(
    (position) => (hideDustPositions ? position.contracts > 0.01 : true),
  );
  const visibleSyntheticPositions = syntheticPortfolio.openPositions.filter(
    (position) => (hideDustPositions ? position.marketValue > 0.01 : true),
  );
  const combinedOrderHistory = useMemo(() => {
    const syntheticOrders = syntheticPortfolio.orderHistory.map((order) => ({
      ...order,
      marketType: "SYNTHETIC" as const,
      sortTime: new Date(order.createdAt).getTime() || 0,
    }));
    const predictionOrders = predictionPortfolio.orderHistory.map((order) => ({
      ...order,
      marketType: "PREDICTION" as const,
      sortTime: new Date(order.createdAt).getTime() || 0,
    }));

    return [...syntheticOrders, ...predictionOrders].sort((a, b) => {
      if (b.sortTime !== a.sortTime) return b.sortTime - a.sortTime;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
  }, [syntheticPortfolio.orderHistory, predictionPortfolio.orderHistory]);

  const getTargetPriceForTemplate = (
    template: MarketTemplate,
    history: number[],
    timeHistory: string[],
    latestPrice: number,
  ) => {
    if (template.period === "MONTHLY") {
      // Monthly target should stay fixed to the first session price of the current month.
      if (history.length && timeHistory.length) {
        const latestTsRaw = timeHistory[timeHistory.length - 1];
        const latestTs = new Date(latestTsRaw);
        if (!Number.isNaN(latestTs.getTime())) {
          const monthStart = new Date(
            latestTs.getFullYear(),
            latestTs.getMonth(),
            1,
            0,
            0,
            0,
            0,
          );
          for (let i = 0; i < Math.min(history.length, timeHistory.length); i++) {
            const ts = new Date(timeHistory[i]);
            if (!Number.isNaN(ts.getTime()) && ts >= monthStart) {
              return history[i];
            }
          }
        }
      }
      return monthlyStartPriceMap[template.category] ?? history[0] ?? latestPrice;
    }

    return (
      priceToBeatMap[template.category] ??
      monthlyStartPriceMap[template.category] ??
      history[0] ??
      latestPrice
    );
  };

  const formatMarketQuestion = (
    template: MarketTemplate,
    targetPrice: number,
    referenceTimeISO?: string,
  ) => {
    const baseDate = referenceTimeISO ? new Date(referenceTimeISO) : new Date();
    const validBase = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;

    if (template.period === "MONTHLY") {
      const nextMonth = new Date(validBase.getFullYear(), validBase.getMonth() + 1, 1);
      const monthName = nextMonth.toLocaleString([], { month: "long" });
      return `${template.category} 16GB PRICE UP OR DOWN ON ${monthName} 1`;
    }
    validBase.setDate(validBase.getDate() + 1);
    const month = validBase.toLocaleString([], { month: "short" });
    const day = validBase.getDate();
    return `${template.category} 16GB Price Up or Down on ${month} ${day}`;
  };

  const filteredMarkets = useMemo(() => {
    const latestPrice = tickerPrices[selectedTicker] || 0;
    const history = priceHistory[selectedTicker] || [];
    const timeHistory = priceTimeHistory[selectedTicker] || [];

    return MOCK_MARKETS.filter(
      (m) =>
        m.category === selectedTicker && m.period === predictionPeriodFilter,
    ).map((template) => {
        const targetPrice = getTargetPriceForTemplate(
          template,
          history,
          timeHistory,
          latestPrice,
        );
        return {
          ...template,
          probability:
            typeof marketChances[template.id] === "number"
              ? marketChances[template.id]
              : template.probability,
          targetPrice,
          question: formatMarketQuestion(
            template,
            targetPrice,
            timeHistory[timeHistory.length - 1],
          ),
        };
      },
    );
  }, [
    selectedTicker,
    tickerPrices,
    priceHistory,
    priceTimeHistory,
    marketChances,
    priceToBeatMap,
    monthlyStartPriceMap,
    predictionPeriodFilter,
  ]);

  const resolvedSelectedMarket = useMemo(
    () =>
      filteredMarkets.find((m) => m.id === selectedMarket.id) || filteredMarkets[0] || selectedMarket,
    [filteredMarkets, selectedMarket],
  );

  const getPredictionTargetLabel = (
    period: "MONTHLY" | "DAILY",
    ticker: string,
  ) => {
    if (period === "DAILY") return "Price To Beat (3-session)";
    const series = priceTimeHistory[ticker] || [];
    const latestTs = series.length ? new Date(series[series.length - 1]) : new Date();
    const base = Number.isNaN(latestTs.getTime()) ? new Date() : latestTs;
    const nextMonth = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    const month = nextMonth.toLocaleString([], { month: "short" });
    return `Price To Beat (${month} 1)`;
  };

  // Update selected market if the ticker changes and current selected isn't in filtered list
  React.useEffect(() => {
    if (
      filteredMarkets.length > 0 &&
      !filteredMarkets.find((m) => m.id === selectedMarket.id)
    ) {
      setSelectedMarket(filteredMarkets[0]);
    }
  }, [filteredMarkets, selectedMarket.id]);

  const refreshPredictionPortfolio = React.useCallback(async () => {
    const socketURL = getBackendBaseURL();
    try {
      const response = await fetch(`${socketURL}/api/prediction/portfolio`, {
        headers: { "x-guest-id": guestId },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data?.prediction) {
        const nextOrders = Array.isArray(data.prediction.orderHistory)
          ? data.prediction.orderHistory
          : [];
        const latestSeen = nextOrders.reduce(
          (max: number, order: PredictionOrder) => Math.max(max, Number(order.id) || 0),
          lastSeenOrderIdRef.current,
        );

        if (hasBootstrappedOrdersRef.current) {
          const newOrders = nextOrders
            .filter((order: PredictionOrder) => (Number(order.id) || 0) > lastSeenOrderIdRef.current)
            .sort((a: PredictionOrder, b: PredictionOrder) => a.id - b.id);

          if (newOrders.length) {
            const createdAt = Date.now();
            setNotices((prev) => [
              ...prev,
              ...newOrders.map((order, idx) => {
                const base =
                  order.type === "BUY"
                    ? `Position opened: ${order.ticker} ${order.outcome === "YES" ? "UP" : "DOWN"}`
                    : order.type === "SELL"
                      ? `Position closed: ${order.ticker} ${order.outcome === "YES" ? "UP" : "DOWN"}`
                      : `Settlement: ${order.ticker} ${order.result || ""}`.trim();
                return {
                  id: createdAt + idx,
                  text: base,
                  tone:
                    order.type === "SETTLEMENT"
                      ? order.result === "LOSS"
                        ? "BAD"
                        : "GOOD"
                      : order.type === "SELL"
                        ? "INFO"
                        : "GOOD",
                } as AppNotice;
              }),
            ]);
          }
        } else {
          hasBootstrappedOrdersRef.current = true;
        }

        lastSeenOrderIdRef.current = latestSeen;
        setPredictionPortfolio({
          openPositions: Array.isArray(data.prediction.openPositions)
            ? data.prediction.openPositions
            : [],
          orderHistory: nextOrders,
        });
      }
      if (data?.account) {
        window.dispatchEvent(
          new CustomEvent("accountUpdated", {
            detail: {
              source: "sync",
              cashBalance: Number(data.account.cashBalance) || 0,
              portfolioPnL: Number(data.account.portfolioPnL) || 0,
              username: data.account.username || "DEMO",
            },
          }),
        );
      }
    } catch {
      // ignore
    }
  }, [guestId]);

  const refreshSyntheticPortfolio = React.useCallback(async () => {
    const socketURL = getBackendBaseURL();
    try {
      const response = await fetch(`${socketURL}/api/synthetic/portfolio`, {
        headers: { "x-guest-id": guestId },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data?.synthetic) {
        setSyntheticPortfolio({
          openPositions: Array.isArray(data.synthetic.openPositions)
            ? data.synthetic.openPositions
            : [],
          orderHistory: Array.isArray(data.synthetic.orderHistory)
            ? data.synthetic.orderHistory
            : [],
        });
      }
      if (data?.account) {
        window.dispatchEvent(
          new CustomEvent("accountUpdated", {
            detail: {
              source: "sync",
              cashBalance: Number(data.account.cashBalance) || 0,
              portfolioPnL: Number(data.account.portfolioPnL) || 0,
              username: data.account.username || "DEMO",
            },
          }),
        );
      }
    } catch {
      // ignore
    }
  }, [guestId]);

  const schedulePortfolioRefresh = React.useCallback(() => {
    if (portfolioRefreshTimerRef.current !== null) return;
    portfolioRefreshTimerRef.current = window.setTimeout(() => {
      portfolioRefreshTimerRef.current = null;
      void refreshPredictionPortfolio();
      void refreshSyntheticPortfolio();
    }, 350);
  }, [refreshPredictionPortfolio, refreshSyntheticPortfolio]);


  // Connect to Socket.io server
  useEffect(() => {
    const socketURL = getBackendBaseURL();
    const newSocket = io(socketURL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    newSocket.on("connect", () => {
      console.log("🔌 Connected to server");
      setConnected(true);
    });

    newSocket.on("disconnect", () => {
      console.log("⚠️  Disconnected from server");
      setConnected(false);
    });

    // Listen for price updates from server
    newSocket.on(
      "pricesUpdated",
      (data: {
        prices: Record<string, number>;
        histories: Record<string, number[]>;
        historyTimestamps?: Record<string, string[]>;
        priceToBeat?: Record<string, number>;
        chances?: Record<string, number>;
        chanceHistories?: Record<string, number[]>;
      }) => {
        setTickerPrices(data.prices);
        setPriceHistory(data.histories);
        if (data.historyTimestamps) {
          setPriceTimeHistory(data.historyTimestamps);
        }
        if (data.priceToBeat) {
          setPriceToBeatMap(data.priceToBeat);
        }
        if (data.chances) {
          setMarketChances(data.chances);
        }
        if (data.chanceHistories) {
          setChanceHistories(data.chanceHistories);
        }
        schedulePortfolioRefresh();
      },
    );
    newSocket.on(
      "activityUpdated",
      (data: { activityFeed?: ActivityItem[] }) => {
        const nextFeed = Array.isArray(data?.activityFeed)
          ? data.activityFeed
          : [];
        setActivityFeed(nextFeed.slice(0, 500));
      },
    );

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [schedulePortfolioRefresh]);

  useEffect(() => {
    return () => {
      if (portfolioRefreshTimerRef.current !== null) {
        clearTimeout(portfolioRefreshTimerRef.current);
        portfolioRefreshTimerRef.current = null;
      }
    };
  }, []);

  // Fetch initial prices & histories from server so the chart isn't blank
  useEffect(() => {
    const socketURL = getBackendBaseURL();

    fetch(`${socketURL}/api/prices`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.prices) {
          setTickerPrices(data.prices);
        }
        if (data && data.histories) {
          setPriceHistory(data.histories);
          setMonthlyStartPriceMap((prev) => {
            const next = { ...prev };
            Object.keys(data.histories).forEach((ticker) => {
              if (typeof next[ticker] !== "number" || !Number.isFinite(next[ticker])) {
                const start = Number(data.histories[ticker]?.[0]);
                if (Number.isFinite(start) && start > 0) {
                  next[ticker] = parseFloat(start.toFixed(3));
                }
              }
            });
            return next;
          });
        }
        if (data && data.historyTimestamps) {
          setPriceTimeHistory(data.historyTimestamps);
        }
        if (data && data.priceToBeat) {
          setPriceToBeatMap(data.priceToBeat);
        }
        if (data && data.chances) {
          setMarketChances(data.chances);
        }
        if (data && data.chanceHistories) {
          setChanceHistories(data.chanceHistories);
        }
      })
      .catch(() => {
        // ignore fetch failure; socket may provide updates later
      });
  }, []);

  useEffect(() => {
    const socketURL = getBackendBaseURL();
    fetch(`${socketURL}/api/activity`)
      .then((r) => r.json())
      .then((data) => {
        const nextFeed = Array.isArray(data?.activityFeed)
          ? data.activityFeed
          : [];
        setActivityFeed(nextFeed.slice(0, 500));
      })
      .catch(() => {
        // ignore fetch failure; socket may provide updates later
      });
  }, []);

  useEffect(() => {
    void refreshPredictionPortfolio();
  }, [refreshPredictionPortfolio]);

  useEffect(() => {
    void refreshSyntheticPortfolio();
  }, [refreshSyntheticPortfolio]);

  useEffect(() => {
    const socketURL = getBackendBaseURL();
    setUsernameCheckComplete(false);
    fetch(`${socketURL}/api/account`, {
      headers: { "x-guest-id": guestId },
    })
      .then((r) => r.json())
      .then((data) => {
        const nextUsername = String(data?.account?.username || "DEMO").trim();
        setAccountUsername(nextUsername || "DEMO");
        setUsernameReady(Boolean(nextUsername) && nextUsername !== "DEMO");
      })
      .catch(() => {
        setAccountUsername("DEMO");
        setUsernameReady(false);
      })
      .finally(() => {
        setUsernameCheckComplete(true);
      });
  }, [guestId]);

  useEffect(() => {
    const onAccountUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ source?: string; username?: string }>;
      if (typeof custom.detail?.username === "string") {
        const nextUsername = custom.detail.username.trim();
        setAccountUsername(nextUsername || "DEMO");
        setUsernameReady(Boolean(nextUsername) && nextUsername !== "DEMO");
      }
      if (custom.detail?.source === "sync") return;
      void refreshPredictionPortfolio();
      void refreshSyntheticPortfolio();
    };
    window.addEventListener("accountUpdated", onAccountUpdated);
    return () => window.removeEventListener("accountUpdated", onAccountUpdated);
  }, [refreshPredictionPortfolio, refreshSyntheticPortfolio]);

  const handleSetUsername = React.useCallback(
    async (username: string): Promise<{ ok: boolean; error?: string }> => {
      const trimmed = username.trim();
      if (!trimmed) {
        return { ok: false, error: "Username is required" };
      }

      const socketURL = getBackendBaseURL();
      try {
        const response = await fetch(`${socketURL}/api/account/username`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-guest-id": guestId,
          },
          body: JSON.stringify({ username: trimmed }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.account) {
          return { ok: false, error: data?.error || "Failed to set username" };
        }

        const nextUsername = String(data.account.username || "").trim();
        setAccountUsername(nextUsername || "DEMO");
        setUsernameReady(Boolean(nextUsername) && nextUsername !== "DEMO");
        window.dispatchEvent(
          new CustomEvent("accountUpdated", {
            detail: {
              cashBalance: Number(data.account.cashBalance) || 0,
              portfolioPnL: Number(data.account.portfolioPnL) || 0,
              username: nextUsername || "DEMO",
            },
          }),
        );
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error" };
      }
    },
    [guestId],
  );

  useEffect(() => {
    if (!usernameReady && currentView !== "LANDING") {
      navigateToView("LANDING", { replace: true });
    }
  }, [usernameReady, currentView, navigateToView]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const currentFromPath = getViewFromPath(window.location.pathname);
    if (currentFromPath !== currentView) {
      setCurrentView(currentFromPath);
    }

    const canonicalPath = VIEW_PATHS[currentFromPath];
    if (window.location.pathname !== canonicalPath) {
      window.history.replaceState({}, "", canonicalPath);
    }

    const onPopState = () => {
      setCurrentView(getViewFromPath(window.location.pathname));
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const previousView = previousViewRef.current;
    if (currentView === "PREDICTION" && previousView !== "PREDICTION") {
      setPredictionPeriodFilter("DAILY");
    }
    previousViewRef.current = currentView;
  }, [currentView]);

  useEffect(() => {
    if (currentView !== "PREDICTION") return;
    const storageKey = `${PREDICTION_ONBOARDING_KEY_PREFIX}:${guestId}`;
    try {
      const seen = window.localStorage.getItem(storageKey) === "1";
      setShowPredictionOnboarding(!seen);
    } catch {
      setShowPredictionOnboarding(true);
    }
  }, [currentView, guestId]);

  const dismissPredictionOnboarding = React.useCallback(() => {
    const storageKey = `${PREDICTION_ONBOARDING_KEY_PREFIX}:${guestId}`;
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // no-op
    }
    setShowPredictionOnboarding(false);
  }, [guestId]);

  const updatePrice = (ticker: string, newPrice: number) => {
    // Send update to server - server will broadcast to all clients
    if (socket && connected) {
      socket.emit("updatePrice", { ticker, price: newPrice });
    }
  };

  const randomizePrice = (ticker: string) => {
    const current = (tickerPrices as any)[ticker] || 0;
    if (!current || isNaN(current)) return;
    const anchor = INITIAL_TICKER_PRICES[ticker] || current;
    const randomShock = Math.random() * 0.1 - 0.05;
    const meanReversion = ((anchor - current) / (anchor || 1)) * 0.2;
    const pct = Math.max(-0.05, Math.min(0.05, randomShock + meanReversion));

    const lowerBound = anchor * 0.95;
    const upperBound = anchor * 1.05;
    const nextRaw = current * (1 + pct);
    const next = parseFloat(
      Math.max(lowerBound, Math.min(upperBound, nextRaw)).toFixed(3),
    );
    updatePrice(ticker, next);
  };

  const skipOneSessionForAll = () => {
    const fallbackSingleSessionAll = async () => {
      const socketURL = getBackendBaseURL();
      try {
        const response = await fetch(`${socketURL}/api/sessions/skip`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-guest-id": guestId,
          },
          body: JSON.stringify({ count: 1, guestId }),
        });
        if (!response.ok) return;
        const data = await response.json();
        if (data?.prices) setTickerPrices(data.prices);
        if (data?.histories) setPriceHistory(data.histories);
        if (data?.historyTimestamps) setPriceTimeHistory(data.historyTimestamps);
        if (data?.priceToBeat) setPriceToBeatMap(data.priceToBeat);
        if (data?.chances) setMarketChances(data.chances);
        if (data?.chanceHistories) setChanceHistories(data.chanceHistories);
        await refreshPredictionPortfolio();
      } catch {
        // ignore
      }
    };

    if (socket && connected) {
      socket.timeout(1000).emit(
        "skipSessionsAll",
        { count: 1, guestId },
        (err: unknown) => {
          // If server doesn't support skipSessionsAll yet, fallback to per-ticker updates.
          if (err) void fallbackSingleSessionAll();
          else {
            void refreshPredictionPortfolio();
          }
        },
      );
      return;
    }

    void fallbackSingleSessionAll();
  };

  const resetDemoAccounts = async () => {
    const socketURL = getBackendBaseURL();
    try {
      const response = await fetch(`${socketURL}/api/account/reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-guest-id": guestId,
        },
      });
      if (!response.ok) return;
      // Reset should re-trigger the dev-tools quick tip.
      try {
        const storageKey = `${PREDICTION_ONBOARDING_KEY_PREFIX}:${guestId}`;
        window.localStorage.removeItem(storageKey);
      } catch {
        // ignore storage errors
      }
      if (currentView === "PREDICTION") {
        setShowPredictionOnboarding(true);
      }
      await refreshPredictionPortfolio();
      await refreshSyntheticPortfolio();
      setNotices((prev) => [
        ...prev,
        {
          id: Date.now(),
          text: "Demo account reset for this user",
          tone: "INFO",
        },
      ]);
    } catch {
      // ignore
    }
  };

  const handlePollOutcomeSelect = (market: Market, outcome: "YES" | "NO") => {
    setSelectedTicker(market.category);
    setSelectedMarket(market);
    setHasPredictionPollSelection(true);
    setTradePresetOutcome(outcome);
  };

  const handlePredictionPollSelect = (market: Market) => {
    if (hasPredictionPollSelection && selectedMarket.id === market.id) {
      setHasPredictionPollSelection(false);
      setTradePresetOutcome(null);
      return;
    }
    setSelectedTicker(market.category);
    setSelectedMarket(market);
    setHasPredictionPollSelection(true);
    setTradePresetOutcome("YES");
  };

  const updateSkipTooltipPosition = () => {
    const btn = skipButtonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const tooltipWidth = 300;
    const x = Math.max(8, rect.left - tooltipWidth - 10);
    const y = Math.max(12, rect.top - 6);
    setSkipTooltipPos({ x, y });
  };

  const openSkipTooltip = () => {
    updateSkipTooltipPosition();
    setShowSkipTooltip(true);
  };

  const closeSkipTooltip = () => setShowSkipTooltip(false);

  const updateResetTooltipPosition = () => {
    const btn = resetButtonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const tooltipWidth = 300;
    const x = Math.max(8, rect.left - tooltipWidth - 10);
    const y = Math.max(12, rect.top - 6);
    setResetTooltipPos({ x, y });
  };

  const openResetTooltip = () => {
    updateResetTooltipPosition();
    setShowResetTooltip(true);
  };

  const closeResetTooltip = () => setShowResetTooltip(false);

  const renderContent = () => {
    if (currentView === "LANDING") {
      return (
        <LandingPage
          onSelect={navigateToView}
          activityFeed={activityFeed}
          usernameReady={usernameReady}
          usernameCheckComplete={usernameCheckComplete}
          currentUsername={accountUsername}
          onSetUsername={handleSetUsername}
        />
      );
    }

    return (
      <main className="relative z-10 w-full max-w-[1760px] px-4 md:px-6 pt-20 pb-10 flex flex-col gap-4 min-h-[calc(100vh-6.5rem)]">
        <div className="grid grid-cols-1 xl:grid-cols-[1.62fr_0.86fr] gap-4 min-h-[calc(100vh-7.2rem)]">
          {/* Main Terminal View (Left + Center) */}
          <div className="flex-grow flex flex-col gap-4 min-w-0 h-full">
          {currentView === "PREDICTION" ? (
            <div className="bg-[#0c1515] border border-[#1a2e2e] rounded-lg p-3 flex-[1.65] flex flex-col gap-3">
              <div className="flex items-center justify-between px-1 pb-2 border-b border-[#1a2e2e]">
                <h2 className="text-[11px] font-bold text-[#2ed3b7] uppercase tracking-[0.2em]">
                  Active Polls: {selectedTicker}
                </h2>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => {
                      setPredictionPeriodFilter("DAILY");
                      setHasPredictionPollSelection(false);
                      setTradePresetOutcome(null);
                    }}
                    className={`h-8 px-3 rounded-md border text-[10px] font-bold uppercase tracking-[0.1em] ${
                      predictionPeriodFilter === "DAILY"
                        ? "border-[#2ed3b7] text-[#2ed3b7] bg-[#102020]"
                        : "border-[#1a2e2e] text-[#7f8c8d] hover:text-[#2ed3b7]"
                    }`}
                  >
                    Daily
                  </button>
                  <button
                    onClick={() => {
                      setPredictionPeriodFilter("MONTHLY");
                      setHasPredictionPollSelection(false);
                      setTradePresetOutcome(null);
                    }}
                    className={`h-8 px-3 rounded-md border text-[10px] font-bold uppercase tracking-[0.1em] ${
                      predictionPeriodFilter === "MONTHLY"
                        ? "border-[#2ed3b7] text-[#2ed3b7] bg-[#102020]"
                        : "border-[#1a2e2e] text-[#7f8c8d] hover:text-[#2ed3b7]"
                    }`}
                  >
                    Monthly
                  </button>
                  <select
                    value={selectedTicker}
                    onChange={(e) => {
                      setSelectedTicker(e.target.value);
                      setHasPredictionPollSelection(false);
                      setTradePresetOutcome(null);
                    }}
                    className="h-8 px-3 rounded-md bg-[#0a1414] border border-[#1a2e2e] text-[#2ed3b7] text-[10px] font-bold uppercase tracking-[0.1em] focus:outline-none"
                  >
                    <option value="DDR5">DDR5</option>
                    <option value="DDR4">DDR4</option>
                  </select>
                </div>
              </div>

              <MarketList
                markets={filteredMarkets}
                selectedId={hasPredictionPollSelection ? resolvedSelectedMarket.id : ""}
                onSelect={handlePredictionPollSelect}
                onSelectOutcome={handlePollOutcomeSelect}
                renderExpanded={(market) => {
                  const pollTicker = market.category;
                  const pollCurrentPrice = tickerPrices[pollTicker] || 0;
                  const pollPriceHistory = priceHistory[pollTicker] || [];
                  const pollTimeHistory = priceTimeHistory[pollTicker] || [];
                  return (
                    <div className="relative overflow-hidden border border-[#1a2e2e] rounded-lg">
                      {predictionChartMode === "PRICE" && (
                        <TickerHeader
                          selectedTicker={pollTicker}
                          onTickerChange={setSelectedTicker}
                          currentPrice={pollCurrentPrice}
                          priceHistory={pollPriceHistory}
                          tickerPrices={tickerPrices}
                          timeHistory={pollTimeHistory}
                          showExtendedStats={false}
                          showSessionRemaining={market.period !== "MONTHLY"}
                          showTickerSelector={false}
                          targetPrice={market.targetPrice}
                          targetLabel={getPredictionTargetLabel(
                            market.period,
                            market.category,
                          )}
                          className="rounded-none border-0 border-b border-[#1a2e2e]"
                        />
                      )}
                      <div className="h-[300px]">
                        {predictionChartMode === "PRICE" ? (
                          <MarketChart
                            ticker={pollTicker}
                            priceHistory={pollPriceHistory}
                            timeHistory={pollTimeHistory}
                            currentPrice={pollCurrentPrice}
                            targetPrice={market.targetPrice}
                            showTitle={false}
                          />
                        ) : (
                          <PredictionChanceChart
                            baseChance={market.probability}
                            seedKey={`${market.id}-${pollTicker}`}
                            chanceSeries={chanceHistories[market.id] || []}
                          />
                        )}
                      </div>

                      <div className="absolute right-2 bottom-2 z-20 bg-[#081313]/95 border border-[#1a2e2e] rounded-md p-0.5 flex items-center gap-0.5">
                        <button
                          onClick={() => setPredictionChartMode("PRICE")}
                          className={`w-6 h-6 rounded-sm flex items-center justify-center text-[10px] font-bold transition-colors ${
                            predictionChartMode === "PRICE"
                              ? "bg-[#0f2730] text-[#2ed3b7]"
                              : "text-[#7f8c8d] hover:text-[#2ed3b7] hover:bg-[#102020]"
                          }`}
                          aria-label="Price chart"
                        >
                          $
                        </button>
                        <button
                          onClick={() => setPredictionChartMode("CHANCE")}
                          className={`w-6 h-6 rounded-sm flex items-center justify-center text-[10px] font-bold transition-colors ${
                            predictionChartMode === "CHANCE"
                              ? "bg-[#0f2730] text-[#2ed3b7]"
                              : "text-[#7f8c8d] hover:text-[#2ed3b7] hover:bg-[#102020]"
                          }`}
                          aria-label="Chance chart"
                        >
                          %
                        </button>
                      </div>
                    </div>
                  );
                }}
              />
            </div>
          ) : (
            <>
              <TickerHeader
                selectedTicker={selectedTicker}
                onTickerChange={setSelectedTicker}
                currentPrice={currentPrice}
                priceHistory={priceHistory[selectedTicker] || []}
                tickerPrices={tickerPrices}
                timeHistory={priceTimeHistory[selectedTicker] || []}
                showExtendedStats
                maskExtendedStats
              />

              <div className="bg-[#0c1515] border border-[#1a2e2e] rounded-lg relative overflow-hidden min-h-[440px] flex-[1.65]">
                <MarketChart
                  ticker={selectedTicker}
                  priceHistory={priceHistory[selectedTicker] || []}
                  timeHistory={priceTimeHistory[selectedTicker] || []}
                  currentPrice={currentPrice}
                />
              </div>
            </>
          )}

          {/* Contextual Bottom Pane */}
          {currentView === "SYNTHETIC" ? (
            <div className="bg-[#0c1515] border border-[#1a2e2e] rounded-lg p-6 min-h-[180px] flex-[1] flex items-center justify-center">
              <div className="text-center space-y-2">
                <h3 className="text-[10px] font-bold text-[#7f8c8d] uppercase tracking-[0.3em]">
                  Synthetic Order Book
                </h3>
                <div className="flex gap-4">
                  <div className="w-32 h-1 bg-[#1a2e2e] rounded-full overflow-hidden">
                    <div className="h-full bg-[#2ed3b7] w-[60%]" />
                  </div>
                  <div className="w-32 h-1 bg-[#1a2e2e] rounded-full overflow-hidden">
                    <div className="h-full bg-rose-500 w-[40%]" />
                  </div>
                </div>
                <p className="text-[9px] text-[#1a2e2e] font-bold uppercase tracking-widest">
                  Global Liquidity Pool Active
                </p>
              </div>
            </div>
          ) : null}
          </div>

          {/* Trade Execution Sidebar (Right) */}
          <div className="w-full flex flex-col gap-4 h-full">
            {currentView === "PREDICTION" ? (
              <TradeCard
                market={resolvedSelectedMarket}
                forcedOutcome={tradePresetOutcome}
                onTradeExecuted={() => {
                  void refreshPredictionPortfolio();
                }}
              />
            ) : (
              <SyntheticTradeCard
                ticker={selectedTicker}
                currentPrice={currentPrice}
                onTradeExecuted={() => {
                  void refreshSyntheticPortfolio();
                }}
              />
            )}

            <div className="p-4 bg-[#0c1515] border border-[#1a2e2e] rounded-lg shrink-0">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#7f8c8d]">
                  {currentView === "PREDICTION"
                    ? "Contract Specs"
                    : "Asset Specs"}
                </span>
                <div className="px-2 py-0.5 bg-[#1a2e2e] rounded text-[9px] text-[#2ed3b7] font-bold">
                  USD
                </div>
              </div>
              <p className="text-[10px] text-[#7f8c8d] leading-relaxed uppercase mono">
                {currentView === "PREDICTION"
                  ? `Contract: ${resolvedSelectedMarket.ticker}`
                  : `Asset: SYNTH-${selectedTicker}`}{" "}
                | Source: DRAMeXchange
              </p>
            </div>
          </div>
        </div>

        <div className="w-full bg-[#0c1515] border border-[#1a2e2e] rounded-lg overflow-hidden">
          <div className="flex flex-wrap items-center gap-y-1 border-b border-[#1a2e2e] bg-[#081111] px-1">
            <button
              onClick={() => setPositionsTab("SYNTHETIC")}
              className={`px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.08em] transition-colors border-b-2 ${
                positionsTab === "SYNTHETIC"
                  ? "text-[#2ed3b7] border-[#2ed3b7]"
                  : "text-[#7f8c8d] border-transparent hover:text-[#2ed3b7]"
              }`}
            >
              Spot Positions ({visibleSyntheticPositions.length})
            </button>
            <button
              onClick={() => setPositionsTab("PREDICTION")}
              className={`px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.08em] transition-colors border-b-2 ${
                positionsTab === "PREDICTION"
                  ? "text-[#2ed3b7] border-[#2ed3b7]"
                  : "text-[#7f8c8d] border-transparent hover:text-[#2ed3b7]"
              }`}
            >
              Prediction Positions ({visiblePredictionPositions.length})
            </button>
            <button
              onClick={() => setPositionsTab("ORDER_HISTORY")}
              className={`px-4 py-3 text-[11px] font-extrabold uppercase tracking-[0.08em] transition-colors border-b-2 ${
                positionsTab === "ORDER_HISTORY"
                  ? "text-[#2ed3b7] border-[#2ed3b7]"
                  : "text-[#7f8c8d] border-transparent hover:text-[#2ed3b7]"
              }`}
            >
              Order History ({combinedOrderHistory.length})
            </button>
            {positionsTab !== "ORDER_HISTORY" ? (
              <label className="ml-auto mr-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#7f8c8d]">
                <input
                  type="checkbox"
                  checked={hideDustPositions}
                  onChange={(e) => setHideDustPositions(e.target.checked)}
                  className="accent-[#2ed3b7]"
                />
                Hide Minimum Usd balance
              </label>
            ) : null}
          </div>

          <div className="p-4">
            {positionsTab === "SYNTHETIC" ? (
              <div className="h-full w-full border border-dashed border-[#1a2e2e] rounded-md p-3 min-h-[184px]">
                <div className="flex items-center justify-between px-1 pb-2 border-b border-[#1a2e2e]">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9ab3b3]">
                    Spot Positions
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#2ed3b7]">
                    {visibleSyntheticPositions.length} Open
                  </span>
                </div>
                <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-2 items-center px-2 py-2 mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#7f8c8d] border-b border-[#1a2e2e]">
                  <div>Asset</div>
                  <div>Units</div>
                  <div>Entry</div>
                  <div>Mark</div>
                  <div>PnL</div>
                </div>
                {visibleSyntheticPositions.length ? (
                  <div className="space-y-2 mt-2">
                    {visibleSyntheticPositions.map((position) => {
                      const liveMark =
                        (tickerPrices[position.ticker] || position.markPrice) as number;
                      const displayedPnl =
                        position.units * liveMark - position.investedAmount;
                      return (
                        <div
                          key={position.id}
                          className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-2 items-center px-2 py-2 border border-[#1a2e2e] rounded-md text-[10px] uppercase font-bold tracking-[0.08em]"
                        >
                          <div className="text-white">{position.ticker}/USD</div>
                          <div className="text-[#7f8c8d]">{position.units.toFixed(4)}</div>
                          <div className="text-[#7f8c8d]">${position.avgEntryPrice.toFixed(3)}</div>
                          <div className="text-[#7f8c8d]">${liveMark.toFixed(3)}</div>
                          <div
                            className={
                              displayedPnl >= 0 ? "text-[#2ed3b7]" : "text-rose-500"
                            }
                          >
                            {displayedPnl >= 0 ? "+" : ""}
                            {displayedPnl.toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-[150px] flex items-center justify-center">
                    <span className="text-[11px] font-bold text-[#7f8c8d] uppercase tracking-[0.16em]">
                      No Synthetic Positions For Now
                    </span>
                  </div>
                )}
              </div>
            ) : positionsTab === "PREDICTION" ? (
              <div className="h-full w-full border border-dashed border-[#1a2e2e] rounded-md p-3 min-h-[184px]">
                <div className="flex items-center justify-between px-1 pb-2 border-b border-[#1a2e2e]">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9ab3b3]">
                    Prediction Positions
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#2ed3b7]">
                    {visiblePredictionPositions.length} Open
                  </span>
                </div>
                <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1.2fr] gap-2 items-center px-3 py-2 mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#7f8c8d] border-b border-[#1a2e2e]">
                  <div>Market</div>
                  <div>Contracts</div>
                  <div>Entry</div>
                  <div>Current</div>
                  <div>PnL</div>
                  <div className="text-right">Status</div>
                </div>
                {visiblePredictionPositions.length ? (
                  <div className="space-y-2 mt-2">
                    {visiblePredictionPositions.map((position) => (
                      <div
                        key={position.id}
                        className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1.2fr] gap-2 items-center px-3 py-2 border border-[#1a2e2e] rounded-md text-[10px] uppercase font-bold tracking-[0.08em]"
                      >
                        <div className="text-white">
                          {position.ticker} {position.outcome === "YES" ? "UP" : "DOWN"}
                        </div>
                        <div className="text-[#7f8c8d]">
                          {position.contracts.toFixed(2)} CTS
                        </div>
                        <div className="text-[#7f8c8d]">
                          ${position.avgEntryPrice.toFixed(3)}
                        </div>
                        <div className="text-[#7f8c8d]">
                          ${position.currentPrice.toFixed(3)}
                        </div>
                        <div
                          className={
                            position.pnl >= 0 ? "text-[#2ed3b7]" : "text-rose-500"
                          }
                        >
                          {position.pnl >= 0 ? "+" : ""}
                          {position.pnl.toFixed(2)}
                        </div>
                        <div className="text-[#7f8c8d] text-right">
                          {position.period === "MONTHLY"
                            ? "MONTHLY"
                            : `T-${position.sessionsToSettlement ?? 0}`}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-[150px] flex items-center justify-center">
                    <span className="text-[11px] font-bold text-[#7f8c8d] uppercase tracking-[0.16em]">
                      No Prediction Positions For Now
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full w-full border border-dashed border-[#1a2e2e] rounded-md p-3 min-h-[184px]">
                <div className="flex items-center justify-between px-1 pb-2 border-b border-[#1a2e2e]">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9ab3b3]">
                    Order History
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#2ed3b7]">
                    {combinedOrderHistory.length} Orders
                  </span>
                </div>
                {combinedOrderHistory.length ? (
                  <div className="space-y-2 mt-2">
                    <div className="grid grid-cols-[1fr_0.9fr_1.5fr_0.85fr_1fr_1fr_1fr_1fr] gap-2 items-center px-3 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[#7f8c8d] border-b border-[#1a2e2e]">
                      <div>Market</div>
                      <div>Type</div>
                      <div>Ticker</div>
                      <div>Qty</div>
                      <div>Price</div>
                      <div>Amount</div>
                      <div>PnL</div>
                      <div className="text-right">Time</div>
                    </div>
                    {combinedOrderHistory.map((order) => (
                      <div
                        key={`${order.marketType}-${order.id}-${order.createdAt}`}
                        className="grid grid-cols-[1fr_0.9fr_1.5fr_0.85fr_1fr_1fr_1fr_1fr] gap-2 items-center px-3 py-2 border border-[#1a2e2e] rounded-md text-[10px] uppercase font-bold tracking-[0.08em]"
                      >
                        <div className="text-[#7f8c8d]">{order.marketType}</div>
                        <div
                          className={
                            order.type === "BUY"
                              ? "text-[#2ed3b7]"
                              : order.type === "SELL"
                                ? "text-rose-400"
                                : "text-white"
                          }
                        >
                          {order.type}
                        </div>
                        <div className="text-white">
                          {order.ticker} {"outcome" in order ? (order.outcome === "YES" ? "UP" : "DOWN") : ""}
                        </div>
                        <div className="text-[#7f8c8d]">
                          {"contracts" in order
                            ? order.contracts.toFixed(2)
                            : (order as SyntheticOrder).units.toFixed(4)}
                        </div>
                        <div className="text-[#7f8c8d]">${order.price.toFixed(3)}</div>
                        <div className="text-[#7f8c8d]">${order.amount.toFixed(2)}</div>
                        <div
                          className={
                            order.realizedPnl >= 0 ? "text-[#2ed3b7]" : "text-rose-500"
                          }
                        >
                          {order.realizedPnl >= 0 ? "+" : ""}
                          {order.realizedPnl.toFixed(2)}
                        </div>
                        <div className="text-[#7f8c8d] text-right">
                          {new Date(order.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-[150px] flex items-center justify-center">
                    <span className="text-[11px] font-bold text-[#7f8c8d] uppercase tracking-[0.16em]">
                      No Orders Yet
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    );
  };


  return (
    <div className="casino-ui relative min-h-screen flex flex-col items-center selection:bg-[#2ed3b7]/30 overflow-x-hidden">
      <BackgroundGrid />
      <div className="fixed inset-0 bg-radial-teal pointer-events-none"></div>
      <Navbar onHome={() => navigateToView("LANDING")} />

      {renderContent()}

      <Footer />

      {notices.length ? (
        <div className="fixed right-4 top-20 z-[120] flex flex-col gap-2 pointer-events-none">
          {notices.slice(-3).map((notice) => (
            <div
              key={notice.id}
              className={`min-w-[240px] max-w-[360px] px-3 py-2 rounded-md border text-[11px] font-bold uppercase tracking-[0.1em] shadow-xl ${
                notice.tone === "GOOD"
                  ? "bg-[#0f211f] border-[#2ed3b7]/40 text-[#2ed3b7]"
                  : notice.tone === "BAD"
                    ? "bg-[#2a1111] border-rose-500/40 text-rose-300"
                    : "bg-[#121f24] border-[#2f4f66] text-[#c3d7e6]"
              }`}
            >
              {notice.text}
            </div>
          ))}
        </div>
      ) : null}
      {currentView === "PREDICTION" && showPredictionOnboarding ? (
        <div className="fixed right-12 top-[34%] z-[118] w-[340px] rounded-xl border border-[#2ed3b7]/35 bg-[#071313] shadow-[0_14px_42px_rgba(0,0,0,0.65)] p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#2ed3b7]">
                Dev Tools Tip
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-[#c6d9d9]">
                Click the right-side <span className="font-bold text-white">&gt;</span> handle
                to open dev tools, then use{" "}
                <span className="font-bold text-white">Skip 1 Session</span> to advance market
                time or <span className="font-bold text-white">Reset Demo</span> to reset this
                demo user.
              </p>
            </div>
            <button
              onClick={dismissPredictionOnboarding}
              className="w-6 h-6 rounded border border-[#1a2e2e] text-[#9db3b3] hover:text-white hover:border-[#2ed3b7] text-[12px] font-bold"
              aria-label="Close quick start"
            >
              x
            </button>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={dismissPredictionOnboarding}
              className="h-8 px-3 rounded-md bg-[#2ed3b7] text-[#031010] text-[10px] font-black uppercase tracking-[0.12em] hover:bg-[#31e6c8] transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}

      {showSkipTooltip ? (
        <div
          className="fixed z-[130] pointer-events-none"
          style={{ left: skipTooltipPos.x, top: skipTooltipPos.y }}
        >
          <div className="relative w-[260px] rounded-xl border border-[#2ed3b7]/35 bg-[#071313]/95 shadow-[0_10px_30px_rgba(0,0,0,0.45)] p-3">
            <div className="absolute right-[-6px] top-4 w-3 h-3 rotate-45 bg-[#071313] border-r border-t border-[#2ed3b7]/35" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#2ed3b7]">
                Skip One Session
              </span>
            </div>
            <p className="text-[10px] leading-relaxed text-[#c4d7d7]">
              Advance one global session and refresh prices, chance, and settlements.
            </p>
            <div className="mt-2 space-y-1 text-[10px] font-bold uppercase tracking-[0.08em]">
              <div className="flex items-center justify-between text-[#7f9f9f]">
                <span>Active Commodity</span>
                <span className="text-[#2ed3b7]">{selectedTicker}/USD</span>
              </div>
              <div className="flex items-center justify-between text-[#7f9f9f]">
                <span>Current Price</span>
                <span className="text-[#2ed3b7]">${currentPrice.toFixed(3)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {showResetTooltip ? (
        <div
          className="fixed z-[130] pointer-events-none"
          style={{ left: resetTooltipPos.x, top: resetTooltipPos.y }}
        >
          <div className="relative w-[260px] rounded-xl border border-rose-400/35 bg-[#1a0d0d]/95 shadow-[0_10px_30px_rgba(0,0,0,0.45)] p-3">
            <div className="absolute right-[-6px] top-4 w-3 h-3 rotate-45 bg-[#1a0d0d] border-r border-t border-rose-400/35" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-rose-300">
                Reset Demo
              </span>
            </div>
            <p className="text-[10px] leading-relaxed text-rose-100/85">
              Resets this guest account only. Cash balance and all open orders
              return to a clean demo state.
            </p>
            <div className="mt-3 space-y-1.5 text-[10px] font-bold uppercase tracking-[0.08em]">
              <div className="flex items-center justify-between text-rose-100/60">
                <span>User</span>
                <span className="text-rose-300">DEMO</span>
              </div>
              <div className="flex items-center justify-between text-rose-100/60">
                <span>Scope</span>
                <span className="text-rose-300">Current Session</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Right-side developer panel: dropdown + randomize button */}
      {/* Collapsible right sidebar: small chevron handle + one-line controls */}
      <div className="fixed right-0 top-1/3 z-40 flex items-center pointer-events-auto">
        {/* Handle */}
        <button
          onClick={() => setDevOpen((s) => !s)}
          aria-label="Open dev prices"
          className="w-8 h-12 bg-[#071010] border-l border-[#1a2e2e] rounded-l-md flex items-center justify-center text-[#2ed3b7] hover:bg-[#092423] transition-colors"
        >
          <span
            className={`text-xl font-bold transform ${devOpen ? "rotate-180" : ""}`}
          >
            &gt;
          </span>
        </button>

        <div
          className={`transition-all duration-200 overflow-visible ${devOpen ? "w-auto p-3 mr-2" : "w-0 p-0 mr-0"} bg-[#071010] border border-[#1a2e2e] rounded-l-md`}
        >
          <div className="flex items-center gap-2 whitespace-nowrap">
            <button
              ref={skipButtonRef}
              onClick={skipOneSessionForAll}
              title="Skip one session"
              onMouseEnter={openSkipTooltip}
              onMouseLeave={closeSkipTooltip}
              onFocus={openSkipTooltip}
              onBlur={closeSkipTooltip}
              className="px-3 py-2 bg-[#1a2e2e] border border-[#2ed3b7]/30 rounded text-[11px] font-bold text-[#2ed3b7] uppercase tracking-[0.1em]"
            >
              Skip 1 Session
            </button>
            <button
              ref={resetButtonRef}
              onClick={resetDemoAccounts}
              title="Reset your balances and orders"
              onMouseEnter={openResetTooltip}
              onMouseLeave={closeResetTooltip}
              onFocus={openResetTooltip}
              onBlur={closeResetTooltip}
              className="px-3 py-2 bg-[#201010] border border-rose-500/30 rounded text-[11px] font-bold text-rose-400 uppercase tracking-[0.1em]"
            >
              Reset Demo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
















