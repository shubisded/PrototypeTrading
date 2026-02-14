import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRICES_FILE = path.join(__dirname, "prices.json");
const ACCOUNT_FILE = path.join(__dirname, "demoAccount.json");
const CHANCES_FILE = path.join(__dirname, "chances.json");
const SESSION_STATE_FILE = path.join(__dirname, "sessionState.json");

const BASE_TICKER_PRICES = {
  DDR5: 38.067,
  DDR4: 78.409,
  GDDR5: 9.409,
  GDDR6: 9.654,
};

const MARKET_IDS_BY_TICKER = {
  DDR5: ["1", "2"],
  DDR4: ["3", "4"],
  GDDR6: ["5", "6"],
  GDDR5: ["7", "8"],
};

const DEFAULT_MARKET_CHANCES = {
  "1": 64,
  "2": 42,
  "3": 21,
  "4": 35,
  "5": 78,
  "6": 52,
  "7": 55,
  "8": 48,
};

const MARKET_DEFINITIONS = {
  "1": { category: "DDR5", ticker: "DDR5-AUG-F", period: "MONTHLY" },
  "2": { category: "DDR5", ticker: "DDR5-DAILY", period: "DAILY" },
  "3": { category: "DDR4", ticker: "DDR4-AUG-F", period: "MONTHLY" },
  "4": { category: "DDR4", ticker: "DDR4-DAILY", period: "DAILY" },
  "5": { category: "GDDR6", ticker: "G6-AUG-F", period: "MONTHLY" },
  "6": { category: "GDDR6", ticker: "G6-DAILY", period: "DAILY" },
  "7": { category: "GDDR5", ticker: "G5-AUG-F", period: "MONTHLY" },
  "8": { category: "GDDR5", ticker: "G5-DAILY", period: "DAILY" },
};

const isAllowedDevOrigin = (origin) => {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (host.startsWith("192.168.")) return true;
    if (host.startsWith("10.")) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    return false;
  } catch {
    return false;
  }
};

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (origin, callback) => {
      callback(null, isAllowedDevOrigin(origin));
    },
    methods: ["GET", "POST"],
  },
});

app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, isAllowedDevOrigin(origin));
    },
  }),
);
app.use(express.json());

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const loadJsonFile = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (error) {
    console.error(`Failed to read ${filePath}:`, error);
    return null;
  }
};

const saveJsonFile = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Failed to write ${filePath}:`, error);
  }
};

const calculateStats = (priceEntries) => {
  const prices = priceEntries.map((p) => p.price);
  return {
    highest: Math.max(...prices),
    lowest: Math.min(...prices),
    average: prices.reduce((a, b) => a + b, 0) / prices.length,
    totalUpdates: prices.length,
    lastUpdate: priceEntries[priceEntries.length - 1].timestamp,
  };
};

const generateSeedHistory = (base, ticker) => {
  const entries = [];
  let current = base;
  for (let i = 0; i < 50; i++) {
    const randomShock = Math.random() * 0.08 - 0.04;
    const meanReversion = ((base - current) / base) * 0.25;
    const pct = clamp(randomShock + meanReversion, -0.05, 0.05);
    current = clamp(current * (1 + pct), base * 0.95, base * 1.05);
    entries.push({
      price: parseFloat(current.toFixed(3)),
      timestamp: new Date(Date.now() - (50 - i) * 60_000).toISOString(),
      source: `seed-${ticker.toLowerCase()}`,
    });
  }
  return entries;
};

const buildDefaultPricesData = () => {
  const priceHistory = {};
  const statistics = {};
  const currentPrices = {};

  Object.entries(BASE_TICKER_PRICES).forEach(([ticker, base]) => {
    priceHistory[ticker] = generateSeedHistory(base, ticker);
    currentPrices[ticker] = priceHistory[ticker][priceHistory[ticker].length - 1].price;
    statistics[ticker] = calculateStats(priceHistory[ticker]);
  });

  return {
    metadata: {
      createdAt: new Date().toISOString(),
      version: "2.0",
      description: "DRAM prices normalized around base values with bounded volatility",
    },
    currentPrices,
    priceHistory,
    statistics,
  };
};

const sanitizePricesData = (raw) => {
  if (!raw || typeof raw !== "object") return buildDefaultPricesData();

  const next = {
    metadata: {
      createdAt: raw.metadata?.createdAt || new Date().toISOString(),
      version: "2.0",
      description: "DRAM prices normalized around base values with bounded volatility",
    },
    currentPrices: {},
    priceHistory: {},
    statistics: {},
  };

  Object.entries(BASE_TICKER_PRICES).forEach(([ticker, base]) => {
    const sourceEntries = Array.isArray(raw.priceHistory?.[ticker])
      ? raw.priceHistory[ticker].slice(-100)
      : [];

    const cleaned = [];
    let prev = base;
    for (const entry of sourceEntries) {
      const rawPrice = Number(entry?.price);
      if (!Number.isFinite(rawPrice)) continue;

      const stepBounded = clamp(rawPrice, prev * 0.95, prev * 1.05);
      const baseBounded = clamp(stepBounded, base * 0.95, base * 1.05);
      const normalized = parseFloat(baseBounded.toFixed(3));

      cleaned.push({
        price: normalized,
        timestamp: entry?.timestamp || new Date().toISOString(),
        source: entry?.source || "normalized",
      });
      prev = normalized;
    }

    if (cleaned.length < 2) {
      next.priceHistory[ticker] = generateSeedHistory(base, ticker);
    } else {
      next.priceHistory[ticker] = cleaned;
    }

    next.currentPrices[ticker] =
      next.priceHistory[ticker][next.priceHistory[ticker].length - 1].price;
    next.statistics[ticker] = calculateStats(next.priceHistory[ticker]);
  });

  return next;
};

const pricesData = sanitizePricesData(loadJsonFile(PRICES_FILE));
saveJsonFile(PRICES_FILE, pricesData);

const centralPrices = pricesData.currentPrices;
console.log("Loaded prices:", centralPrices);

const buildDefaultSessionState = () => ({
  metadata: {
    createdAt: new Date().toISOString(),
    version: "1.0",
  },
  skipSessionCount: 0,
  priceToBeat: { ...centralPrices },
});

const sanitizeSessionState = (raw) => {
  const base = buildDefaultSessionState();
  if (!raw || typeof raw !== "object") return base;

  const next = {
    metadata: {
      createdAt: raw.metadata?.createdAt || base.metadata.createdAt,
      version: "1.0",
    },
    skipSessionCount: Number(raw.skipSessionCount) || 0,
    priceToBeat: { ...base.priceToBeat },
  };

  Object.keys(BASE_TICKER_PRICES).forEach((ticker) => {
    const value = Number(raw.priceToBeat?.[ticker]);
    if (Number.isFinite(value) && value > 0) {
      next.priceToBeat[ticker] = parseFloat(value.toFixed(3));
    }
  });

  return next;
};

const sessionState = sanitizeSessionState(loadJsonFile(SESSION_STATE_FILE));
// Bootstrap baseline for now: start from equal current/beat prices for all commodities.
sessionState.skipSessionCount = 0;
Object.keys(BASE_TICKER_PRICES).forEach((ticker) => {
  sessionState.priceToBeat[ticker] = parseFloat(
    Number(centralPrices[ticker]).toFixed(3),
  );
});
saveJsonFile(SESSION_STATE_FILE, sessionState);

const generateChanceSeedHistory = (baseChance) => {
  const entries = [];
  let current = baseChance;
  for (let i = 0; i < 60; i++) {
    const delta = (Math.random() - 0.5) * 4;
    current = clamp(current + delta, 1, 99);
    entries.push(parseFloat(current.toFixed(2)));
  }
  entries[entries.length - 1] = baseChance;
  return entries;
};

const buildDefaultChancesData = () => {
  const currentChances = {};
  const chanceHistory = {};
  Object.keys(DEFAULT_MARKET_CHANCES).forEach((marketId) => {
    const base = DEFAULT_MARKET_CHANCES[marketId];
    currentChances[marketId] = base;
    chanceHistory[marketId] = generateChanceSeedHistory(base);
  });
  return {
    metadata: {
      createdAt: new Date().toISOString(),
      version: "1.0",
      description: "Prediction market probabilities and chart history",
    },
    currentChances,
    chanceHistory,
  };
};

const sanitizeChancesData = (raw) => {
  if (!raw || typeof raw !== "object") return buildDefaultChancesData();
  const next = {
    metadata: {
      createdAt: raw.metadata?.createdAt || new Date().toISOString(),
      version: "1.0",
      description: "Prediction market probabilities and chart history",
    },
    currentChances: {},
    chanceHistory: {},
  };

  Object.keys(DEFAULT_MARKET_CHANCES).forEach((marketId) => {
    const fallback = DEFAULT_MARKET_CHANCES[marketId];
    const current = clamp(Number(raw.currentChances?.[marketId]) || fallback, 1, 99);
    const history = Array.isArray(raw.chanceHistory?.[marketId])
      ? raw.chanceHistory[marketId]
          .map((n) => clamp(Number(n) || current, 1, 99))
          .slice(-160)
      : generateChanceSeedHistory(current);

    if (!history.length) history.push(current);
    history[history.length - 1] = current;

    next.currentChances[marketId] = current;
    next.chanceHistory[marketId] = history;
  });

  return next;
};

const chancesData = sanitizeChancesData(loadJsonFile(CHANCES_FILE));
saveJsonFile(CHANCES_FILE, chancesData);

const updateChancesForTicker = (ticker) => {
  const marketIds = MARKET_IDS_BY_TICKER[ticker] || [];
  marketIds.forEach((marketId) => {
    const current = Number(chancesData.currentChances[marketId]) || 50;
    const magnitude = 5 + Math.random() * 5; // 5-10%
    const direction = Math.random() < 0.5 ? -1 : 1;
    const next = clamp(current + direction * magnitude, 1, 99);
    const rounded = parseFloat(next.toFixed(2));

    chancesData.currentChances[marketId] = rounded;
    if (!Array.isArray(chancesData.chanceHistory[marketId])) {
      chancesData.chanceHistory[marketId] = [];
    }
    chancesData.chanceHistory[marketId].push(rounded);
    chancesData.chanceHistory[marketId] = chancesData.chanceHistory[marketId].slice(-160);
  });

  saveJsonFile(CHANCES_FILE, chancesData);
};

const addPriceEntry = (ticker, incomingPrice, source = "auto") => {
  const base = BASE_TICKER_PRICES[ticker];
  if (!base) return null;

  const prev = Number(centralPrices[ticker]) || base;
  const stepBounded = clamp(incomingPrice, prev * 0.95, prev * 1.05);
  const baseBounded = clamp(stepBounded, base * 0.95, base * 1.05);
  const price = parseFloat(baseBounded.toFixed(3));

  const entry = {
    price,
    timestamp: new Date().toISOString(),
    source,
  };

  if (!pricesData.priceHistory[ticker]) pricesData.priceHistory[ticker] = [];
  pricesData.priceHistory[ticker].push(entry);
  pricesData.priceHistory[ticker] = pricesData.priceHistory[ticker].slice(-100);

  centralPrices[ticker] = price;
  pricesData.currentPrices[ticker] = price;
  pricesData.statistics[ticker] = calculateStats(pricesData.priceHistory[ticker]);

  saveJsonFile(PRICES_FILE, pricesData);
  return entry;
};

const getNextSessionPrice = (ticker) => {
  const current = Number(centralPrices[ticker]) || BASE_TICKER_PRICES[ticker];
  const base = BASE_TICKER_PRICES[ticker] || current;
  const randomShock = Math.random() * 0.1 - 0.05;
  const meanReversion = ((base - current) / (base || 1)) * 0.2;
  const pct = clamp(randomShock + meanReversion, -0.05, 0.05);
  const lowerBound = base * 0.95;
  const upperBound = base * 1.05;
  return clamp(current * (1 + pct), lowerBound, upperBound);
};

const settleDuePredictionPositions = () => {
  Object.values(accountStore.accounts).forEach((account) => {
    const prediction = account.prediction;
    const stillOpen = [];

    prediction.openPositions.forEach((position) => {
      if (position.period === "MONTHLY") {
        stillOpen.push(position);
        return;
      }

      const sessionsHeld = sessionState.skipSessionCount - position.openedSession;
      if (sessionsHeld < 3) {
        stillOpen.push(position);
        return;
      }

      const finalSpot = Number(centralPrices[position.category]) || 0;
      const won = finalSpot > position.targetPrice ? "YES" : "NO";
      const isWinningPosition = position.outcome === won;
      const payout = isWinningPosition ? position.contracts : 0;
      const realizedPnl = payout - position.investedAmount;

      account.cashBalance = parseFloat((account.cashBalance + payout).toFixed(2));
      prediction.realizedPnL = parseFloat(
        (Number(prediction.realizedPnL || 0) + realizedPnl).toFixed(4),
      );

      appendOrderHistory(account, {
        type: "SETTLEMENT",
        marketId: position.marketId,
        ticker: position.ticker,
        category: position.category,
        period: position.period,
        outcome: position.outcome,
        contracts: parseFloat(position.contracts.toFixed(4)),
        price: isWinningPosition ? 1 : 0,
        amount: parseFloat(payout.toFixed(4)),
        realizedPnl: parseFloat(realizedPnl.toFixed(4)),
        result: isWinningPosition ? "WIN" : "LOSS",
        session: sessionState.skipSessionCount,
        note: `Settled after ${sessionsHeld} sessions`,
      });
    });

    prediction.openPositions = stillOpen;
    account.updatedAt = new Date().toISOString();
    recalculatePortfolioPnL(account);
  });

  saveJsonFile(ACCOUNT_FILE, accountStore);
};

const runSkipSessions = (sessionCount = 1) => {
  const count = Math.max(1, Math.min(20, Number(sessionCount) || 1));
  const tickers = Object.keys(BASE_TICKER_PRICES);

  for (let s = 0; s < count; s++) {
    tickers.forEach((ticker) => {
      const next = getNextSessionPrice(ticker);
      addPriceEntry(ticker, next, "session-skip");
      updateChancesForTicker(ticker);
    });

    sessionState.skipSessionCount += 1;
    settleDuePredictionPositions();

    if (sessionState.skipSessionCount % 3 === 0) {
      tickers.forEach((ticker) => {
        sessionState.priceToBeat[ticker] = parseFloat(
          Number(centralPrices[ticker]).toFixed(3),
        );
      });
    }
  }

  saveJsonFile(SESSION_STATE_FILE, sessionState);

  return count;
};

const buildAccountStore = () => ({
  metadata: {
    createdAt: new Date().toISOString(),
    version: "2.0",
  },
  accounts: {},
});

const resetAccountStore = () => {
  accountStore = buildAccountStore();
  saveJsonFile(ACCOUNT_FILE, accountStore);
};

const buildDefaultGuestAccount = () => ({
  username: "DEMO",
  cashBalance: 1240,
  portfolioPnL: 0,
  prediction: {
    realizedPnL: 0,
    nextPositionId: 1,
    nextOrderId: 1,
    openPositions: [],
    orderHistory: [],
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const buildDefaultPredictionState = () => ({
  realizedPnL: 0,
  nextPositionId: 1,
  nextOrderId: 1,
  openPositions: [],
  orderHistory: [],
});

const sanitizePredictionState = (raw) => {
  const base = buildDefaultPredictionState();
  if (!raw || typeof raw !== "object") return base;

  const openPositions = Array.isArray(raw.openPositions)
    ? raw.openPositions
        .map((position) => {
          const marketId = String(position?.marketId || "");
          const market = MARKET_DEFINITIONS[marketId];
          if (!market) return null;

          const contracts = Number(position?.contracts);
          const avgEntryPrice = Number(position?.avgEntryPrice);
          const investedAmount = Number(position?.investedAmount);
          const openedSession = Number(position?.openedSession);
          const targetPrice = Number(position?.targetPrice);
          const outcome = position?.outcome === "NO" ? "NO" : "YES";
          if (
            !Number.isFinite(contracts) ||
            contracts <= 0 ||
            !Number.isFinite(avgEntryPrice) ||
            avgEntryPrice <= 0 ||
            !Number.isFinite(investedAmount) ||
            investedAmount <= 0
          ) {
            return null;
          }

          return {
            id: Number(position?.id) || 0,
            marketId,
            ticker: market.ticker,
            category: market.category,
            period: market.period,
            outcome,
            contracts: parseFloat(contracts.toFixed(4)),
            avgEntryPrice: parseFloat(avgEntryPrice.toFixed(4)),
            investedAmount: parseFloat(investedAmount.toFixed(4)),
            targetPrice: Number.isFinite(targetPrice)
              ? parseFloat(targetPrice.toFixed(3))
              : parseFloat((sessionState.priceToBeat[market.category] || 0).toFixed(3)),
            openedSession: Number.isFinite(openedSession)
              ? Math.max(0, Math.floor(openedSession))
              : 0,
            createdAt: position?.createdAt || new Date().toISOString(),
            updatedAt: position?.updatedAt || new Date().toISOString(),
          };
        })
        .filter(Boolean)
    : [];

  const orderHistory = Array.isArray(raw.orderHistory)
    ? raw.orderHistory
        .map((order) => {
          const marketId = String(order?.marketId || "");
          const market = MARKET_DEFINITIONS[marketId];
          if (!market && order?.type !== "SETTLEMENT") return null;
          const type = ["BUY", "SELL", "SETTLEMENT"].includes(order?.type)
            ? order.type
            : null;
          if (!type) return null;

          const contracts = Number(order?.contracts) || 0;
          const price = Number(order?.price) || 0;
          const amount = Number(order?.amount) || 0;
          const realizedPnl = Number(order?.realizedPnl) || 0;

          return {
            id: Number(order?.id) || 0,
            type,
            marketId: marketId || "N/A",
            ticker: market?.ticker || order?.ticker || "N/A",
            category: market?.category || order?.category || "N/A",
            period: market?.period || order?.period || "N/A",
            outcome: order?.outcome === "NO" ? "NO" : "YES",
            contracts: parseFloat(contracts.toFixed(4)),
            price: parseFloat(price.toFixed(4)),
            amount: parseFloat(amount.toFixed(4)),
            realizedPnl: parseFloat(realizedPnl.toFixed(4)),
            result:
              order?.result === "WIN" || order?.result === "LOSS"
                ? order.result
                : undefined,
            session: Number(order?.session) || 0,
            note: typeof order?.note === "string" ? order.note : undefined,
            createdAt: order?.createdAt || new Date().toISOString(),
          };
        })
        .filter(Boolean)
    : [];

  const maxPositionId = openPositions.reduce(
    (max, position) => Math.max(max, Number(position.id) || 0),
    0,
  );
  const maxOrderId = orderHistory.reduce(
    (max, order) => Math.max(max, Number(order.id) || 0),
    0,
  );

  return {
    realizedPnL: parseFloat((Number(raw.realizedPnL) || 0).toFixed(4)),
    nextPositionId: Math.max(Number(raw.nextPositionId) || 1, maxPositionId + 1),
    nextOrderId: Math.max(Number(raw.nextOrderId) || 1, maxOrderId + 1),
    openPositions,
    orderHistory: orderHistory.slice(-500),
  };
};

const getCurrentContractPrice = (marketId, outcome) => {
  const chance = Number(chancesData.currentChances[marketId]) || 50;
  const probability = outcome === "YES" ? chance / 100 : (100 - chance) / 100;
  return clamp(probability, 0.01, 0.99);
};

const recalculatePortfolioPnL = (account) => {
  const prediction = account.prediction || buildDefaultPredictionState();
  const unrealized = prediction.openPositions.reduce((sum, position) => {
    const currentPrice = getCurrentContractPrice(position.marketId, position.outcome);
    const markValue = position.contracts * currentPrice;
    return sum + (markValue - position.investedAmount);
  }, 0);

  // Keep account.portfolioPnL as unrealized PnL only.
  // Realized PnL is already reflected in cash balance via fills/settlements.
  account.portfolioPnL = parseFloat(unrealized.toFixed(2));
  return account.portfolioPnL;
};

const ensureAccountShape = (account) => {
  if (!account || typeof account !== "object") return buildDefaultGuestAccount();
  const normalized = {
    username: account.username || "DEMO",
    cashBalance: Number(account.cashBalance) || 1240,
    portfolioPnL: Number(account.portfolioPnL) || 0,
    prediction: sanitizePredictionState(account.prediction),
    createdAt: account.createdAt || new Date().toISOString(),
    updatedAt: account.updatedAt || new Date().toISOString(),
  };
  recalculatePortfolioPnL(normalized);
  return normalized;
};

const appendOrderHistory = (account, order) => {
  const prediction = account.prediction;
  const entry = {
    ...order,
    id: prediction.nextOrderId++,
    createdAt: new Date().toISOString(),
  };
  prediction.orderHistory.unshift(entry);
  prediction.orderHistory = prediction.orderHistory.slice(0, 500);
};

const buildPredictionSnapshot = (account) => {
  const prediction = account.prediction;
  const openPositions = prediction.openPositions.map((position) => {
    const currentPrice = getCurrentContractPrice(position.marketId, position.outcome);
    const marketValue = position.contracts * currentPrice;
    const pnl = marketValue - position.investedAmount;
    return {
      ...position,
      currentPrice: parseFloat(currentPrice.toFixed(4)),
      marketValue: parseFloat(marketValue.toFixed(4)),
      pnl: parseFloat(pnl.toFixed(4)),
      sessionsHeld: Math.max(0, sessionState.skipSessionCount - position.openedSession),
      sessionsToSettlement:
        position.period === "DAILY"
          ? Math.max(0, 3 - (sessionState.skipSessionCount - position.openedSession))
          : null,
    };
  });

  const totals = openPositions.reduce(
    (acc, position) => {
      acc.contracts += position.contracts;
      acc.invested += position.investedAmount;
      acc.marketValue += position.marketValue;
      acc.unrealizedPnl += position.pnl;
      return acc;
    },
    { contracts: 0, invested: 0, marketValue: 0, unrealizedPnl: 0 },
  );

  return {
    realizedPnl: parseFloat((Number(prediction.realizedPnL) || 0).toFixed(2)),
    unrealizedPnl: parseFloat(totals.unrealizedPnl.toFixed(2)),
    totalPnl: parseFloat(
      ((Number(prediction.realizedPnL) || 0) + totals.unrealizedPnl).toFixed(2),
    ),
    openPositions,
    orderHistory: prediction.orderHistory,
    totals: {
      contracts: parseFloat(totals.contracts.toFixed(4)),
      invested: parseFloat(totals.invested.toFixed(2)),
      marketValue: parseFloat(totals.marketValue.toFixed(2)),
    },
    settlementSessionLength: 3,
  };
};

const sanitizeGuestId = (value) => {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!/^[a-zA-Z0-9_-]{4,80}$/.test(cleaned)) return null;
  return cleaned;
};

const resolveGuestId = (req) => sanitizeGuestId(req.header("x-guest-id")) || "guest-default";

const loadedAccountData = loadJsonFile(ACCOUNT_FILE);
let accountStore = buildAccountStore();

if (loadedAccountData?.accounts && typeof loadedAccountData.accounts === "object") {
  accountStore = loadedAccountData;
} else if (loadedAccountData?.cashBalance !== undefined) {
  accountStore.accounts["guest-default"] = {
    username: loadedAccountData.username || "DEMO",
    cashBalance: Number(loadedAccountData.cashBalance) || 1240,
    portfolioPnL: Number(loadedAccountData.portfolioPnL) || 0,
    createdAt: loadedAccountData.createdAt || new Date().toISOString(),
    updatedAt: loadedAccountData.updatedAt || new Date().toISOString(),
  };
}

accountStore.accounts = Object.entries(accountStore.accounts || {}).reduce(
  (acc, [guestId, account]) => {
    acc[guestId] = ensureAccountShape(account);
    return acc;
  },
  {},
);

saveJsonFile(ACCOUNT_FILE, accountStore);

const getOrCreateGuestAccount = (guestId) => {
  if (!accountStore.accounts[guestId]) {
    accountStore.accounts[guestId] = ensureAccountShape(buildDefaultGuestAccount());
    saveJsonFile(ACCOUNT_FILE, accountStore);
  }
  const normalized = ensureAccountShape(accountStore.accounts[guestId]);
  accountStore.accounts[guestId] = normalized;
  return normalized;
};

const getHistoriesForClient = () =>
  Object.keys(pricesData.priceHistory).reduce((acc, ticker) => {
    acc[ticker] = pricesData.priceHistory[ticker].map((p) => p.price);
    return acc;
  }, {});

const executePredictionTrade = ({
  account,
  side,
  marketId,
  outcome,
  amount,
  contracts,
}) => {
  const market = MARKET_DEFINITIONS[marketId];
  if (!market) {
    return { ok: false, error: "Invalid market id" };
  }
  if (outcome !== "YES" && outcome !== "NO") {
    return { ok: false, error: "Invalid outcome" };
  }

  const price = getCurrentContractPrice(marketId, outcome);
  const prediction = account.prediction;
  const nowIso = new Date().toISOString();

  if (side === "BUY") {
    const buyAmount = Number(amount);
    if (!Number.isFinite(buyAmount) || buyAmount <= 0) {
      return { ok: false, error: "Invalid buy amount" };
    }
    if (buyAmount > account.cashBalance) {
      return { ok: false, error: "Insufficient cash balance" };
    }

    const boughtContracts = buyAmount / price;
    const position = {
      id: prediction.nextPositionId++,
      marketId,
      ticker: market.ticker,
      category: market.category,
      period: market.period,
      outcome,
      contracts: parseFloat(boughtContracts.toFixed(4)),
      avgEntryPrice: parseFloat(price.toFixed(4)),
      investedAmount: parseFloat(buyAmount.toFixed(4)),
      targetPrice: parseFloat(
        Number(sessionState.priceToBeat[market.category] || centralPrices[market.category] || 0).toFixed(3),
      ),
      openedSession: sessionState.skipSessionCount,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    prediction.openPositions.push(position);
    account.cashBalance = parseFloat((account.cashBalance - buyAmount).toFixed(2));

    appendOrderHistory(account, {
      type: "BUY",
      marketId,
      ticker: market.ticker,
      category: market.category,
      period: market.period,
      outcome,
      contracts: parseFloat(boughtContracts.toFixed(4)),
      price: parseFloat(price.toFixed(4)),
      amount: parseFloat(buyAmount.toFixed(4)),
      realizedPnl: 0,
      session: sessionState.skipSessionCount,
    });
  } else if (side === "SELL") {
    const contractsToSell = Number(contracts);
    if (!Number.isFinite(contractsToSell) || contractsToSell <= 0) {
      return { ok: false, error: "Invalid contracts to sell" };
    }

    let remaining = contractsToSell;
    let removedCost = 0;
    let soldContracts = 0;
    const nextOpenPositions = [];

    prediction.openPositions.forEach((position) => {
      if (
        remaining <= 0 ||
        position.marketId !== marketId ||
        position.outcome !== outcome
      ) {
        nextOpenPositions.push(position);
        return;
      }

      const used = Math.min(remaining, position.contracts);
      const ratio = used / position.contracts;
      const costPortion = position.investedAmount * ratio;

      soldContracts += used;
      removedCost += costPortion;
      remaining -= used;

      const leftContracts = position.contracts - used;
      const leftInvested = position.investedAmount - costPortion;
      if (leftContracts > 0.000001) {
        nextOpenPositions.push({
          ...position,
          contracts: parseFloat(leftContracts.toFixed(4)),
          investedAmount: parseFloat(leftInvested.toFixed(4)),
          avgEntryPrice: parseFloat((leftInvested / leftContracts).toFixed(4)),
          updatedAt: nowIso,
        });
      }
    });

    if (soldContracts <= 0 || remaining > 0.000001) {
      return { ok: false, error: "Not enough contracts to sell" };
    }

    prediction.openPositions = nextOpenPositions;
    const proceeds = soldContracts * price;
    const realizedPnl = proceeds - removedCost;
    account.cashBalance = parseFloat((account.cashBalance + proceeds).toFixed(2));
    prediction.realizedPnL = parseFloat(
      (Number(prediction.realizedPnL || 0) + realizedPnl).toFixed(4),
    );

    appendOrderHistory(account, {
      type: "SELL",
      marketId,
      ticker: market.ticker,
      category: market.category,
      period: market.period,
      outcome,
      contracts: parseFloat(soldContracts.toFixed(4)),
      price: parseFloat(price.toFixed(4)),
      amount: parseFloat(proceeds.toFixed(4)),
      realizedPnl: parseFloat(realizedPnl.toFixed(4)),
      session: sessionState.skipSessionCount,
    });
  } else {
    return { ok: false, error: "Invalid side" };
  }

  account.updatedAt = nowIso;
  recalculatePortfolioPnL(account);
  saveJsonFile(ACCOUNT_FILE, accountStore);

  return {
    ok: true,
    account,
    prediction: buildPredictionSnapshot(account),
  };
};

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id} (Total: ${io.engine.clientsCount})`);

  socket.emit("pricesUpdated", {
    prices: centralPrices,
    histories: getHistoriesForClient(),
    priceToBeat: sessionState.priceToBeat,
    chances: chancesData.currentChances,
    chanceHistories: chancesData.chanceHistory,
    timestamp: Date.now(),
  });

  socket.on("updatePrice", (data) => {
    const { ticker, price } = data || {};
    if (!BASE_TICKER_PRICES[ticker] || typeof price !== "number") return;

    const added = addPriceEntry(ticker, price, "manual-update");
    if (!added) return;
    updateChancesForTicker(ticker);

    io.emit("pricesUpdated", {
      prices: centralPrices,
      histories: getHistoriesForClient(),
      priceToBeat: sessionState.priceToBeat,
      chances: chancesData.currentChances,
      chanceHistories: chancesData.chanceHistory,
      timestamp: Date.now(),
    });
  });

  socket.on("skipSessionsAll", (data, ack) => {
    const count = runSkipSessions(data?.count);
    io.emit("pricesUpdated", {
      prices: centralPrices,
      histories: getHistoriesForClient(),
      priceToBeat: sessionState.priceToBeat,
      chances: chancesData.currentChances,
      chanceHistories: chancesData.chanceHistory,
      skippedSessions: count,
      timestamp: Date.now(),
    });
    if (typeof ack === "function") {
      ack({ ok: true, skippedSessions: count });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id} (Total: ${io.engine.clientsCount})`);
  });
});

app.get("/api/prices", (req, res) => {
  res.json({
    prices: centralPrices,
    histories: getHistoriesForClient(),
    priceToBeat: sessionState.priceToBeat,
    chances: chancesData.currentChances,
    chanceHistories: chancesData.chanceHistory,
    statistics: pricesData.statistics,
    timestamp: Date.now(),
  });
});

app.post("/api/prices", (req, res) => {
  const { ticker, price } = req.body || {};
  if (!BASE_TICKER_PRICES[ticker] || typeof price !== "number") {
    res.status(400).json({ error: "Invalid ticker or price" });
    return;
  }

  const added = addPriceEntry(ticker, price, "api-update");
  if (!added) {
    res.status(400).json({ error: "Invalid ticker or price" });
    return;
  }
  updateChancesForTicker(ticker);

  io.emit("pricesUpdated", {
    prices: centralPrices,
    histories: getHistoriesForClient(),
    priceToBeat: sessionState.priceToBeat,
    chances: chancesData.currentChances,
    chanceHistories: chancesData.chanceHistory,
    timestamp: Date.now(),
  });

  res.json({
    success: true,
    prices: centralPrices,
    priceToBeat: sessionState.priceToBeat,
    chances: chancesData.currentChances,
    chanceHistories: chancesData.chanceHistory,
    statistics: pricesData.statistics,
  });
});

app.post("/api/sessions/skip", (req, res) => {
  const count = runSkipSessions(req.body?.count);

  io.emit("pricesUpdated", {
    prices: centralPrices,
    histories: getHistoriesForClient(),
    priceToBeat: sessionState.priceToBeat,
    chances: chancesData.currentChances,
    chanceHistories: chancesData.chanceHistory,
    skippedSessions: count,
    timestamp: Date.now(),
  });

  res.json({
    success: true,
    skippedSessions: count,
    prices: centralPrices,
    histories: getHistoriesForClient(),
    priceToBeat: sessionState.priceToBeat,
    chances: chancesData.currentChances,
    chanceHistories: chancesData.chanceHistory,
    timestamp: Date.now(),
  });
});

app.get("/api/account", (req, res) => {
  const guestId = resolveGuestId(req);
  const account = getOrCreateGuestAccount(guestId);
  recalculatePortfolioPnL(account);
  saveJsonFile(ACCOUNT_FILE, accountStore);
  res.json({
    guestId,
    account,
    prediction: buildPredictionSnapshot(account),
    timestamp: Date.now(),
  });
});

app.post("/api/account/deposit", (req, res) => {
  const guestId = resolveGuestId(req);
  const account = getOrCreateGuestAccount(guestId);
  const amount = Number(req.body?.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "Invalid deposit amount" });
    return;
  }

  account.cashBalance = parseFloat((account.cashBalance + amount).toFixed(2));
  account.updatedAt = new Date().toISOString();
  recalculatePortfolioPnL(account);
  saveJsonFile(ACCOUNT_FILE, accountStore);

  res.json({
    success: true,
    guestId,
    account,
    prediction: buildPredictionSnapshot(account),
    deposited: amount,
    timestamp: Date.now(),
  });
});

app.post("/api/account/reset", (req, res) => {
  resetAccountStore();
  res.json({
    success: true,
    message: "All demo guest accounts reset",
    timestamp: Date.now(),
  });
});

app.get("/api/prediction/portfolio", (req, res) => {
  const guestId = resolveGuestId(req);
  const account = getOrCreateGuestAccount(guestId);
  recalculatePortfolioPnL(account);
  saveJsonFile(ACCOUNT_FILE, accountStore);

  res.json({
    success: true,
    guestId,
    account,
    prediction: buildPredictionSnapshot(account),
    timestamp: Date.now(),
  });
});

app.post("/api/prediction/trade", (req, res) => {
  const guestId = resolveGuestId(req);
  const account = getOrCreateGuestAccount(guestId);
  const side = req.body?.side === "SELL" ? "SELL" : "BUY";
  const marketId = String(req.body?.marketId || "");
  const outcome = req.body?.outcome === "NO" ? "NO" : "YES";

  const result = executePredictionTrade({
    account,
    side,
    marketId,
    outcome,
    amount: req.body?.amount,
    contracts: req.body?.contracts,
  });

  if (!result.ok) {
    res.status(400).json({ error: result.error || "Trade rejected" });
    return;
  }

  res.json({
    success: true,
    guestId,
    account: result.account,
    prediction: result.prediction,
    timestamp: Date.now(),
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "Server running",
    clients: io.engine.clientsCount,
    prices: centralPrices,
  });
});

app.get("/api/history", (req, res) => {
  res.json(pricesData);
});

app.get("/api/chances", (req, res) => {
  res.json({
    chances: chancesData.currentChances,
    chanceHistories: chancesData.chanceHistory,
    timestamp: Date.now(),
  });
});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
  console.log(`Prices file: ${PRICES_FILE}`);
  console.log(`Account file: ${ACCOUNT_FILE}`);
});
