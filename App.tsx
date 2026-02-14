import React, { useState, useMemo, useEffect, useRef } from "react";
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
type PredictionChartMode = "PRICE" | "CHANCE";
type PositionsTab = "SYNTHETIC" | "PREDICTION" | "ORDER_HISTORY";

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

type AppNotice = {
  id: number;
  text: string;
  tone: "INFO" | "GOOD" | "BAD";
};

type MarketTemplate = Omit<Market, "question" | "targetPrice">;

const MOCK_MARKETS: MarketTemplate[] = [
  // DDR5
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
  // DDR4
  {
    id: "3",
    ticker: "DDR4-AUG-F",
    probability: 21,
    volume: "$2.1M",
    category: "DDR4",
    period: "MONTHLY",
  },
  {
    id: "4",
    ticker: "DDR4-DAILY",
    probability: 35,
    volume: "$780K",
    category: "DDR4",
    period: "DAILY",
  },
  // GDDR6
  {
    id: "5",
    ticker: "G6-AUG-F",
    probability: 78,
    volume: "$890K",
    category: "GDDR6",
    period: "MONTHLY",
  },
  {
    id: "6",
    ticker: "G6-DAILY",
    probability: 52,
    volume: "$1.4M",
    category: "GDDR6",
    period: "DAILY",
  },
  // GDDR5
  {
    id: "7",
    ticker: "G5-AUG-F",
    probability: 55,
    volume: "$410K",
    category: "GDDR5",
    period: "MONTHLY",
  },
  {
    id: "8",
    ticker: "G5-DAILY",
    probability: 48,
    volume: "$220K",
    category: "GDDR5",
    period: "DAILY",
  },
];

const INITIAL_TICKER_PRICES: Record<string, number> = {
  DDR5: 38.067,
  DDR4: 78.409,
  GDDR6: 9.654,
  GDDR5: 9.409,
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>("LANDING");
  const [selectedTicker, setSelectedTicker] = useState<string>("DDR5");
  const [selectedMarket, setSelectedMarket] = useState<Market>({
    ...MOCK_MARKETS[0],
    question: "",
    targetPrice: INITIAL_TICKER_PRICES[MOCK_MARKETS[0].category] || 0,
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
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [predictionChartMode, setPredictionChartMode] =
    useState<PredictionChartMode>("PRICE");
  const [tradePresetOutcome, setTradePresetOutcome] = useState<
    "YES" | "NO" | null
  >(null);
  const [positionsTab, setPositionsTab] = useState<PositionsTab>("SYNTHETIC");
  const [predictionPortfolio, setPredictionPortfolio] =
    useState<PredictionPortfolio>({
      openPositions: [],
      orderHistory: [],
    });
  const [notices, setNotices] = useState<AppNotice[]>([]);
  const guestId = getOrCreateGuestId();
  const lastSeenOrderIdRef = useRef<number>(0);
  const hasBootstrappedOrdersRef = useRef(false);

  // Collapsible (non-draggable) dev panel state
  const [devOpen, setDevOpen] = useState(false);

  const currentPrice = tickerPrices[selectedTicker] || 0;
  const selectedTickerHistory = priceHistory[selectedTicker] || [];

  const getTargetPriceForTemplate = (
    template: MarketTemplate,
    history: number[],
    latestPrice: number,
  ) => {
    if (template.period === "MONTHLY") {
      return monthlyStartPriceMap[template.category] ?? history[0] ?? latestPrice;
    }
    return priceToBeatMap[template.category] ?? latestPrice;
  };

  const formatMarketQuestion = (template: MarketTemplate, targetPrice: number) => {
    if (template.period === "MONTHLY") {
      return `WILL ${template.category} 16GB SPOT PRICE EXCEED $${targetPrice.toFixed(3)} BY NEXT MONTH`;
    }
    return `WILL ${template.category} 16GB SPOT PRICE EXCEED $${targetPrice.toFixed(3)} TOMORROW / AFTER 3-SESSION`;
  };

  const filteredMarkets = useMemo(() => {
    const latestPrice = tickerPrices[selectedTicker] || 0;
    const history = priceHistory[selectedTicker] || [];

    return MOCK_MARKETS.filter((m) => m.category === selectedTicker).map(
      (template) => {
        const targetPrice = getTargetPriceForTemplate(
          template,
          history,
          latestPrice,
        );
        return {
          ...template,
          probability:
            typeof marketChances[template.id] === "number"
              ? marketChances[template.id]
              : template.probability,
          targetPrice,
          question: formatMarketQuestion(template, targetPrice),
        };
      },
    );
  }, [selectedTicker, tickerPrices, priceHistory, marketChances, priceToBeatMap, monthlyStartPriceMap]);

  const resolvedSelectedMarket = useMemo(
    () =>
      filteredMarkets.find((m) => m.id === selectedMarket.id) || filteredMarkets[0] || selectedMarket,
    [filteredMarkets, selectedMarket],
  );

  const predictionTargetLabel =
    resolvedSelectedMarket.period === "MONTHLY"
      ? "Price To Beat (Mar 1)"
      : "Price To Beat (3-session)";

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
                    ? `Position opened: ${order.ticker} ${order.outcome}`
                    : order.type === "SELL"
                      ? `Position closed: ${order.ticker} ${order.outcome}`
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

  useEffect(() => {
    if (!notices.length) return;
    const timer = setTimeout(() => {
      setNotices((prev) => prev.slice(1));
    }, 2200);
    return () => clearTimeout(timer);
  }, [notices]);

  useEffect(() => {
    const onAppNotice = (event: Event) => {
      const custom = event as CustomEvent<{
        text?: string;
        tone?: "INFO" | "GOOD" | "BAD";
      }>;
      const text = custom.detail?.text?.trim();
      if (!text) return;
      setNotices((prev) => [
        ...prev,
        {
          id: Date.now(),
          text,
          tone: custom.detail?.tone || "INFO",
        },
      ]);
    };

    window.addEventListener("appNotice", onAppNotice);
    return () => window.removeEventListener("appNotice", onAppNotice);
  }, []);

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
        priceToBeat?: Record<string, number>;
        chances?: Record<string, number>;
        chanceHistories?: Record<string, number[]>;
      }) => {
        setTickerPrices(data.prices);
        setPriceHistory(data.histories);
        if (data.priceToBeat) {
          setPriceToBeatMap(data.priceToBeat);
        }
        if (data.chances) {
          setMarketChances(data.chances);
        }
        if (data.chanceHistories) {
          setChanceHistories(data.chanceHistories);
        }
        void refreshPredictionPortfolio();
      },
    );

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [refreshPredictionPortfolio]);

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
    void refreshPredictionPortfolio();
  }, [refreshPredictionPortfolio]);

  useEffect(() => {
    const onAccountUpdated = () => {
      void refreshPredictionPortfolio();
    };
    window.addEventListener("accountUpdated", onAccountUpdated);
    return () => window.removeEventListener("accountUpdated", onAccountUpdated);
  }, [refreshPredictionPortfolio]);

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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: 1 }),
        });
        if (!response.ok) return;
        const data = await response.json();
        if (data?.prices) setTickerPrices(data.prices);
        if (data?.histories) setPriceHistory(data.histories);
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
        { count: 1 },
        (err: unknown) => {
          // If server doesn't support skipSessionsAll yet, fallback to per-ticker updates.
          if (err) void fallbackSingleSessionAll();
          else void refreshPredictionPortfolio();
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
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) return;
      await refreshPredictionPortfolio();
      setNotices((prev) => [
        ...prev,
        {
          id: Date.now(),
          text: "Demo accounts reset",
          tone: "INFO",
        },
      ]);
    } catch {
      // ignore
    }
  };

  const handlePollOutcomeSelect = (market: Market, outcome: "YES" | "NO") => {
    setSelectedMarket(market);
    setTradePresetOutcome(outcome);
  };

  const renderContent = () => {
    if (currentView === "LANDING") {
      return <LandingPage onSelect={setCurrentView} />;
    }

    return (
      <main className="relative z-10 flex-grow w-full max-w-[1600px] px-3 pt-20 pb-16 flex flex-col gap-3 min-h-[calc(100vh-6.5rem)]">
        <div className="flex flex-col lg:flex-row-reverse gap-3 flex-shrink-0 lg:h-[calc(100vh-7.5rem)]">
          {/* Main Terminal View (Left + Center) */}
          <div className="flex-grow flex flex-col gap-3 min-w-0 h-full overflow-hidden pr-1">
          {currentView === "PREDICTION" ? (
            <div className="flex-grow h-[65%] bg-[#0c1515] border border-[#1a2e2e] rounded-lg relative overflow-hidden min-h-0 flex flex-col">
              {predictionChartMode === "PRICE" && (
                <TickerHeader
                  selectedTicker={selectedTicker}
                  onTickerChange={setSelectedTicker}
                  currentPrice={currentPrice}
                  priceHistory={priceHistory[selectedTicker] || []}
                  tickerPrices={tickerPrices}
                  showExtendedStats={false}
                  targetPrice={resolvedSelectedMarket.targetPrice}
                  targetLabel={predictionTargetLabel}
                  className="rounded-none border-0 border-b border-[#1a2e2e]"
                />
              )}
              <div className="flex-grow min-h-0 relative overflow-hidden">
                {predictionChartMode === "PRICE" ? (
                  <MarketChart
                    ticker={selectedTicker}
                    priceHistory={priceHistory[selectedTicker] || []}
                    currentPrice={currentPrice}
                    targetPrice={resolvedSelectedMarket.targetPrice}
                  />
                ) : (
                  <PredictionChanceChart
                    baseChance={resolvedSelectedMarket.probability}
                    seedKey={`${resolvedSelectedMarket.id}-${selectedTicker}`}
                    chanceSeries={chanceHistories[resolvedSelectedMarket.id] || []}
                  />
                )}
              </div>

              <div className="absolute right-2 bottom-1.5 z-20 bg-[#081313]/95 border border-[#1a2e2e] rounded-md p-0.5 flex items-center gap-0.5">
                <button
                  onClick={() => setPredictionChartMode("PRICE")}
                  className={`w-6 h-6 rounded-sm flex items-center justify-center text-[10px] font-bold transition-colors ${
                    predictionChartMode === "PRICE"
                      ? "bg-[#0f2730] text-[#2ed3b7]"
                      : "text-[#7f8c8d] hover:text-[#2ed3b7] hover:bg-[#102020]"
                  }`}
                  aria-label="Price chart"
                  title="Price chart"
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
                  title="Chance chart"
                >
                  %
                </button>
              </div>
            </div>
          ) : (
            <>
              <TickerHeader
                selectedTicker={selectedTicker}
                onTickerChange={setSelectedTicker}
                currentPrice={currentPrice}
                priceHistory={priceHistory[selectedTicker] || []}
                tickerPrices={tickerPrices}
                showExtendedStats
              />

              <div className="flex-grow h-[65%] bg-[#0c1515] border border-[#1a2e2e] rounded-lg relative overflow-hidden min-h-0">
                <MarketChart
                  ticker={selectedTicker}
                  priceHistory={priceHistory[selectedTicker] || []}
                  currentPrice={currentPrice}
                />
              </div>
            </>
          )}

          {/* Contextual Bottom Pane */}
          {currentView === "PREDICTION" ? (
            <div className="bg-[#0c1515] border border-[#1a2e2e] rounded-lg p-4 shrink-0 overflow-y-auto h-[35%] custom-scrollbar">
              <div className="flex items-center justify-between mb-4 px-1 pb-2">
                <h2 className="text-[11px] font-bold text-[#2ed3b7] uppercase tracking-[0.2em]">
                  ACTIVE POLLS: {selectedTicker}
                </h2>
                <div className="flex gap-6">
                  <span className="text-[10px] text-[#7f8c8d] font-bold uppercase tracking-widest">
                    Vol: $4.1M
                  </span>
                  <span className="text-[10px] text-[#7f8c8d] font-bold uppercase tracking-widest">
                    OI: 14.2K
                  </span>
                </div>
              </div>
              <MarketList
                markets={filteredMarkets}
                selectedId={resolvedSelectedMarket.id}
                onSelect={setSelectedMarket}
                onSelectOutcome={handlePollOutcomeSelect}
              />
            </div>
          ) : (
            <div className="bg-[#0c1515] border border-[#1a2e2e] rounded-lg p-6 shrink-0 h-40 flex items-center justify-center">
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
          )}
          </div>

          {/* Trade Execution Sidebar (Right) */}
          <div className="w-full lg:w-[380px] flex flex-col gap-3 shrink-0 h-full overflow-y-auto pl-2 custom-scrollbar">
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

        <div className="w-full bg-[#0c1515] border border-[#1a2e2e] rounded-lg shrink-0 overflow-hidden mt-4">
          <div className="flex items-center border-b border-[#1a2e2e] bg-[#081111]">
            <button
              onClick={() => setPositionsTab("SYNTHETIC")}
              className={`px-4 py-3 text-[11px] font-bold tracking-tight transition-colors border-b-2 ${
                positionsTab === "SYNTHETIC"
                  ? "text-[#2ed3b7] border-[#2ed3b7]"
                  : "text-[#7f8c8d] border-transparent hover:text-[#2ed3b7]"
              }`}
            >
              Synthetic Positions (0)
            </button>
            <button
              onClick={() => setPositionsTab("PREDICTION")}
              className={`px-4 py-3 text-[11px] font-bold tracking-tight transition-colors border-b-2 ${
                positionsTab === "PREDICTION"
                  ? "text-[#2ed3b7] border-[#2ed3b7]"
                  : "text-[#7f8c8d] border-transparent hover:text-[#2ed3b7]"
              }`}
            >
              Prediction Positions ({predictionPortfolio.openPositions.length})
            </button>
            <button
              onClick={() => setPositionsTab("ORDER_HISTORY")}
              className={`px-4 py-3 text-[11px] font-bold tracking-tight transition-colors border-b-2 ${
                positionsTab === "ORDER_HISTORY"
                  ? "text-[#2ed3b7] border-[#2ed3b7]"
                  : "text-[#7f8c8d] border-transparent hover:text-[#2ed3b7]"
              }`}
            >
              Order History ({predictionPortfolio.orderHistory.length})
            </button>
          </div>

          <div className="h-48 overflow-y-auto custom-scrollbar p-4">
            {positionsTab === "SYNTHETIC" ? (
              <div className="h-full w-full border border-dashed border-[#1a2e2e] rounded-md flex items-center justify-center">
                <span className="text-[11px] font-bold text-[#7f8c8d] uppercase tracking-[0.16em]">
                  No Synthetic Positions For Now
                </span>
              </div>
            ) : positionsTab === "PREDICTION" ? (
              predictionPortfolio.openPositions.length ? (
                <div className="space-y-2">
                  {predictionPortfolio.openPositions.map((position) => (
                    <div
                      key={position.id}
                      className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1.2fr] gap-2 items-center px-3 py-2 border border-[#1a2e2e] rounded-md text-[10px] uppercase font-bold tracking-[0.08em]"
                    >
                      <div className="text-white">
                        {position.ticker} {position.outcome}
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
                <div className="h-full w-full border border-dashed border-[#1a2e2e] rounded-md flex items-center justify-center">
                  <span className="text-[11px] font-bold text-[#7f8c8d] uppercase tracking-[0.16em]">
                    No Prediction Positions For Now
                  </span>
                </div>
              )
            ) : predictionPortfolio.orderHistory.length ? (
              <div className="space-y-2">
                {predictionPortfolio.orderHistory.map((order) => (
                  <div
                    key={order.id}
                    className="grid grid-cols-[0.9fr_1.4fr_0.8fr_1fr_1fr_1fr_1fr] gap-2 items-center px-3 py-2 border border-[#1a2e2e] rounded-md text-[10px] uppercase font-bold tracking-[0.08em]"
                  >
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
                      {order.ticker} {order.outcome}
                    </div>
                    <div className="text-[#7f8c8d]">{order.contracts.toFixed(2)}</div>
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
              <div className="h-full w-full border border-dashed border-[#1a2e2e] rounded-md flex items-center justify-center">
                <span className="text-[11px] font-bold text-[#7f8c8d] uppercase tracking-[0.16em]">
                  No Prediction Orders Yet
                </span>
              </div>
            )}
          </div>
        </div>
      </main>
    );
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center selection:bg-[#2ed3b7]/30 overflow-x-hidden">
      <BackgroundGrid />
      <div className="fixed inset-0 bg-radial-teal pointer-events-none"></div>
      <Navbar onHome={() => setCurrentView("LANDING")} />

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
          className={`transition-all duration-200 overflow-hidden ${devOpen ? "w-auto p-3 mr-2" : "w-0 p-0 mr-0"} bg-[#071010] border border-[#1a2e2e] rounded-l-md`}
        >
          <div className="flex items-center gap-2 whitespace-nowrap">
            <button
              onClick={skipOneSessionForAll}
              className="px-3 py-2 bg-[#1a2e2e] border border-[#2ed3b7]/30 rounded text-[11px] font-bold text-[#2ed3b7] uppercase tracking-[0.1em]"
            >
              Skip 1 Session
            </button>
            <button
              onClick={resetDemoAccounts}
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
