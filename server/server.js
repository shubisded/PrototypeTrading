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
const ACTIVITY_FILE = path.join(__dirname, "activity.json");

const BASE_TICKER_PRICES = {
  DDR5: 38.067,
  DDR4: 78.409,
};

const MARKET_IDS_BY_TICKER = {
  DDR5: ["1", "2"],
  DDR4: ["3", "4"],
};

const DEFAULT_MARKET_CHANCES = {
  "1": 64,
  "2": 42,
  "3": 78,
  "4": 52,
};

const MARKET_DEFINITIONS = {
  "1": { category: "DDR5", ticker: "DDR5-AUG-F", period: "MONTHLY" },
  "2": { category: "DDR5", ticker: "DDR5-DAILY", period: "DAILY" },
  "3": { category: "DDR4", ticker: "DDR4-AUG-F", period: "MONTHLY" },
  "4": { category: "DDR4", ticker: "DDR4-DAILY", period: "DAILY" },
};
const SESSION_SLOTS_MINUTES = [8 * 60 + 30, 12 * 60, 15 * 60 + 30];

const ALLOWED_ORIGINS_FROM_ENV = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname;

    if (host === "localhost" || host === "127.0.0.1") return true;
    if (host.startsWith("192.168.")) return true;
    if (host.startsWith("10.")) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;

    // Allow common deployment hosts for this prototype.
    if (host.endsWith(".vercel.app")) return true;
    if (host.endsWith(".railway.app")) return true;

    if (ALLOWED_ORIGINS_FROM_ENV.includes(origin)) return true;

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
      callback(null, isAllowedOrigin(origin));
    },
    methods: ["GET", "POST"],
  },
});

app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    },
  }),
);
app.use(express.json());

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const toFiniteNumber = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

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

const buildDefaultActivityData = () => ({
  metadata: {
    createdAt: new Date().toISOString(),
    version: "1.0",
  },
  items: [],
});

const sanitizeActivityData = (raw) => {
  const base = buildDefaultActivityData();
  if (!raw || typeof raw !== "object") return base;
  const items = Array.isArray(raw.items)
    ? raw.items
        .map((item) => ({
          id: Number(item?.id) || Date.now(),
          text: String(item?.text || "").trim(),
          timestamp:
            typeof item?.timestamp === "string" && item.timestamp
              ? item.timestamp
              : new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }),
        }))
        .filter((item) => item.text.length > 0)
        .slice(0, 500)
    : [];

  return {
    metadata: {
      createdAt: raw.metadata?.createdAt || base.metadata.createdAt,
      version: "1.0",
    },
    items,
  };
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
const activityData = sanitizeActivityData(loadJsonFile(ACTIVITY_FILE));
saveJsonFile(ACTIVITY_FILE, activityData);

const centralPrices = pricesData.currentPrices;
console.log("Loaded prices:", centralPrices);

const appendActivity = (text) => {
  const trimmed = String(text || "").trim();
  if (!trimmed) return;
  const entry = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    text: trimmed,
    timestamp: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
  activityData.items = [entry, ...activityData.items].slice(0, 500);
  saveJsonFile(ACTIVITY_FILE, activityData);
  io.emit("activityUpdated", { activityFeed: activityData.items });
};

const getPrevOrCurrentSessionSlot = (baseDate = new Date()) => {
  const date = new Date(baseDate);
  const nowMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  let slot = SESSION_SLOTS_MINUTES[0];

  for (const candidate of SESSION_SLOTS_MINUTES) {
    if (candidate <= nowMinutes) {
      slot = candidate;
    } else {
      break;
    }
  }

  // If we are before the first slot, use previous day's last slot.
  if (nowMinutes < SESSION_SLOTS_MINUTES[0]) {
    date.setUTCDate(date.getUTCDate() - 1);
    slot = SESSION_SLOTS_MINUTES[SESSION_SLOTS_MINUTES.length - 1];
  }

  date.setUTCHours(Math.floor(slot / 60), slot % 60, 0, 0);
  return date;
};

const getNextSessionSlotFromIndex = (fromDate, slotIndex) => {
  const date = new Date(fromDate);
  const normalizedIndex = Number.isInteger(Number(slotIndex))
    ? Math.max(0, Math.min(SESSION_SLOTS_MINUTES.length - 1, Number(slotIndex)))
    : 0;

  // Move by session sequence, independent from server timezone normalization.
  if (normalizedIndex < SESSION_SLOTS_MINUTES.length - 1) {
    const nextSlot = SESSION_SLOTS_MINUTES[normalizedIndex + 1];
    date.setUTCHours(Math.floor(nextSlot / 60), nextSlot % 60, 0, 0);
    return date;
  }

  date.setUTCDate(date.getUTCDate() + 1);
  const firstSlot = SESSION_SLOTS_MINUTES[0];
  date.setUTCHours(Math.floor(firstSlot / 60), firstSlot % 60, 0, 0);
  return date;
};

const alignTimestampToSlotIndex = (baseDate, slotIndex) => {
  const date = new Date(baseDate);
  const safeIndex = Number.isInteger(Number(slotIndex))
    ? Math.max(0, Math.min(SESSION_SLOTS_MINUTES.length - 1, Number(slotIndex)))
    : 0;
  const slotMinutes = SESSION_SLOTS_MINUTES[safeIndex];
  date.setUTCHours(Math.floor(slotMinutes / 60), slotMinutes % 60, 0, 0);
  return date;
};
const reconcileSessionSlotIndexFromTimestamp = () => {
  const parsed = new Date(String(sessionState.lastSessionAt || ""));
  if (Number.isNaN(parsed.getTime())) return;

  const exact = getSessionSlotIndex(parsed);
  if (exact >= 0) {
    sessionState.lastSessionSlotIndex = exact;
    return;
  }

  // Legacy/offset safety: choose the nearest of 8:30, 12:00, 3:30.
  const minutes = parsed.getUTCHours() * 60 + parsed.getUTCMinutes();
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  SESSION_SLOTS_MINUTES.forEach((slot, idx) => {
    const distance = Math.abs(slot - minutes);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = idx;
    }
  });

  sessionState.lastSessionSlotIndex = bestIndex;
};

const getLatestHistoryTimestamp = () => {
  const firstTicker = Object.keys(pricesData.priceHistory)[0];
  const entries = firstTicker ? pricesData.priceHistory[firstTicker] : [];
  const lastIso = entries?.[entries.length - 1]?.timestamp;
  const parsed = lastIso ? new Date(lastIso) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  return getPrevOrCurrentSessionSlot(new Date());
};

const buildDefaultSessionState = () => ({
  metadata: {
    createdAt: new Date().toISOString(),
    version: "1.0",
  },
  skipSessionCount: 0,
  priceToBeat: { ...centralPrices },
  lastSessionAt: getLatestHistoryTimestamp().toISOString(),
  lastSessionSlotIndex: getSessionSlotIndex(getPrevOrCurrentSessionSlot(getLatestHistoryTimestamp())),
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
    lastSessionAt: base.lastSessionAt,
    lastSessionSlotIndex: Number.isInteger(Number(raw.lastSessionSlotIndex))
      ? Math.max(0, Math.min(SESSION_SLOTS_MINUTES.length - 1, Number(raw.lastSessionSlotIndex)))
      : base.lastSessionSlotIndex,
  };

  Object.keys(BASE_TICKER_PRICES).forEach((ticker) => {
    const value = Number(raw.priceToBeat?.[ticker]);
    if (Number.isFinite(value) && value > 0) {
      next.priceToBeat[ticker] = parseFloat(value.toFixed(3));
    }
  });

  const parsedLast = new Date(String(raw.lastSessionAt || ""));
  if (!Number.isNaN(parsedLast.getTime())) {
    next.lastSessionAt = parsedLast.toISOString();
    if (!Number.isInteger(Number(raw.lastSessionSlotIndex))) {
      const derivedIndex = getSessionSlotIndex(parsedLast);
      next.lastSessionSlotIndex = derivedIndex >= 0 ? derivedIndex : base.lastSessionSlotIndex;
    }
  }

  return next;
};

const sessionState = sanitizeSessionState(loadJsonFile(SESSION_STATE_FILE));
if (!Number.isInteger(Number(sessionState.lastSessionSlotIndex))) {
  sessionState.lastSessionSlotIndex = 0;
}
sessionState.lastSessionAt = alignTimestampToSlotIndex(
  new Date(sessionState.lastSessionAt || getLatestHistoryTimestamp().toISOString()),
  sessionState.lastSessionSlotIndex,
).toISOString();
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

const updateChancesForTicker = (ticker, priceDelta = 0) => {
  const marketIds = MARKET_IDS_BY_TICKER[ticker] || [];
  const direction =
    priceDelta > 0 ? 1 : priceDelta < 0 ? -1 : Math.random() < 0.5 ? -1 : 1;
  marketIds.forEach((marketId) => {
    const current = Number(chancesData.currentChances[marketId]) || 50;
    const magnitude = 2 + Math.random() * 4; // 2-6% with price trend bias
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

const addPriceEntry = (ticker, incomingPrice, source = "auto", timestampOverride = null) => {
  const base = BASE_TICKER_PRICES[ticker];
  if (!base) return null;

  const prev = Number(centralPrices[ticker]) || base;
  const stepBounded = clamp(incomingPrice, prev * 0.95, prev * 1.05);
  const baseBounded = clamp(stepBounded, base * 0.95, base * 1.05);
  const price = parseFloat(baseBounded.toFixed(3));

  const entry = {
    price,
    timestamp: timestampOverride || new Date().toISOString(),
    source,
  };

  if (!pricesData.priceHistory[ticker]) pricesData.priceHistory[ticker] = [];
  pricesData.priceHistory[ticker].push(entry);
  pricesData.priceHistory[ticker] = pricesData.priceHistory[ticker].slice(-100);

  centralPrices[ticker] = price;
  pricesData.currentPrices[ticker] = price;
  pricesData.statistics[ticker] = calculateStats(pricesData.priceHistory[ticker]);
  updateChancesForTicker(ticker, price - prev);

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

const getActivityActorFromAccount = (account) => {
  const name = String(account?.username || "").trim();
  return name || "DEMO";
};

const settleDuePredictionPositions = () => {
  Object.values(accountStore.accounts).forEach((account) => {
    const actor = getActivityActorFromAccount(account);
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
      appendActivity(
        `${actor}: Settlement ${position.ticker} ${position.outcome === "YES" ? "UP" : "DOWN"} ${isWinningPosition ? "WIN" : "LOSS"}`,
      );
    });

    prediction.openPositions = stillOpen;
    account.updatedAt = new Date().toISOString();
    recalculatePortfolioPnL(account);
  });

  saveJsonFile(ACCOUNT_FILE, accountStore);
};

const runSkipSessions = (sessionCount = 1, actorName = "DEMO") => {
  const count = Math.max(1, Math.min(20, Number(sessionCount) || 1));
  const tickers = Object.keys(BASE_TICKER_PRICES);

  for (let s = 0; s < count; s++) {
    const nextSessionAt = getNextSessionSlotFromIndex(new Date(sessionState.lastSessionAt), sessionState.lastSessionSlotIndex);
    const nextSessionIso = nextSessionAt.toISOString();
    sessionState.lastSessionAt = nextSessionIso;
    sessionState.lastSessionSlotIndex =
      (Number(sessionState.lastSessionSlotIndex || 0) + 1) %
      SESSION_SLOTS_MINUTES.length;

    tickers.forEach((ticker) => {
      const next = getNextSessionPrice(ticker);
      addPriceEntry(ticker, next, "session-skip", nextSessionIso);
    });

    sessionState.skipSessionCount += 1;
    settleDuePredictionPositions();

    // Sync price-to-beat to current price at the 8:30 session.
    const slotIndex = Number(sessionState.lastSessionSlotIndex || 0);
    if (slotIndex === 0) {
      tickers.forEach((ticker) => {
        sessionState.priceToBeat[ticker] = parseFloat(
          Number(centralPrices[ticker]).toFixed(3),
        );
      });

      // Daily markets reset to neutral 50/50 at the next-day 8:30 session.
      ["2", "4"].forEach((dailyMarketId) => {
        chancesData.currentChances[dailyMarketId] = 50;
        chancesData.chanceHistory[dailyMarketId] = [50];
      });
      saveJsonFile(CHANCES_FILE, chancesData);
    } else {
      // Keep only the current daily cycle points (max 3 per day: 8:30, 12:00, 3:30).
      const cyclePointsToKeep = Math.min(3, slotIndex + 1);
      ["2", "4"].forEach((dailyMarketId) => {
        if (!Array.isArray(chancesData.chanceHistory[dailyMarketId])) {
          chancesData.chanceHistory[dailyMarketId] = [];
        }
        chancesData.chanceHistory[dailyMarketId] =
          chancesData.chanceHistory[dailyMarketId].slice(-cyclePointsToKeep);
      });
      saveJsonFile(CHANCES_FILE, chancesData);
    }
  }

  saveJsonFile(SESSION_STATE_FILE, sessionState);
  appendActivity(`${actorName}: Session skipped x${count}: prices and chances updated`);

  return count;
};

const buildLivePayload = (extra = {}) => {
  return {
    prices: centralPrices,
    histories: getHistoriesForClient(),
    historyTimestamps: getHistoryTimestampsForClient(),
    priceToBeat: sessionState.priceToBeat,
    chances: chancesData.currentChances,
    chanceHistories: chancesData.chanceHistory,
    timestamp: Date.now(),
    ...extra,
  };
};

const broadcastLiveUpdate = (extra = {}) => {
  const payload = buildLivePayload(extra);
  io.emit("pricesUpdated", payload);
  return payload;
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
  cashBalance: 1000,
  portfolioPnL: 0,
  synthetic: {
    nextPositionId: 1,
    nextOrderId: 1,
    openPositions: [],
    orderHistory: [],
  },
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

const buildDefaultSyntheticState = () => ({
  nextPositionId: 1,
  nextOrderId: 1,
  openPositions: [],
  orderHistory: [],
});

const sanitizeSyntheticState = (raw) => {
  const base = buildDefaultSyntheticState();
  if (!raw || typeof raw !== "object") return base;

  const openPositions = Array.isArray(raw.openPositions)
    ? raw.openPositions
        .map((position) => {
          const ticker = String(position?.ticker || "");
          if (!BASE_TICKER_PRICES[ticker]) return null;
          const units = Number(position?.units);
          const avgEntryPrice = Number(position?.avgEntryPrice);
          const investedAmount = Number(position?.investedAmount);
          if (
            !Number.isFinite(units) ||
            units <= 0 ||
            !Number.isFinite(avgEntryPrice) ||
            avgEntryPrice <= 0 ||
            !Number.isFinite(investedAmount) ||
            investedAmount <= 0
          ) {
            return null;
          }
          return {
            id: Number(position?.id) || 0,
            ticker,
            units: parseFloat(units.toFixed(6)),
            avgEntryPrice: parseFloat(avgEntryPrice.toFixed(4)),
            investedAmount: parseFloat(investedAmount.toFixed(4)),
            createdAt: position?.createdAt || new Date().toISOString(),
            updatedAt: position?.updatedAt || new Date().toISOString(),
          };
        })
        .filter(Boolean)
    : [];

  const orderHistory = Array.isArray(raw.orderHistory)
    ? raw.orderHistory
        .map((order) => {
          const ticker = String(order?.ticker || "");
          if (!BASE_TICKER_PRICES[ticker]) return null;
          const type = order?.type === "SELL" ? "SELL" : "BUY";
          const units = Number(order?.units) || 0;
          const price = Number(order?.price) || 0;
          const amount = Number(order?.amount) || 0;
          const realizedPnl = Number(order?.realizedPnl) || 0;
          return {
            id: Number(order?.id) || 0,
            type,
            ticker,
            units: parseFloat(units.toFixed(6)),
            price: parseFloat(price.toFixed(4)),
            amount: parseFloat(amount.toFixed(4)),
            realizedPnl: parseFloat(realizedPnl.toFixed(4)),
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
    nextPositionId: Math.max(Number(raw.nextPositionId) || 1, maxPositionId + 1),
    nextOrderId: Math.max(Number(raw.nextOrderId) || 1, maxOrderId + 1),
    openPositions,
    orderHistory: orderHistory.slice(-500),
  };
};

const getSyntheticQuote = (ticker) => {
  const current = Number(centralPrices[ticker]) || Number(BASE_TICKER_PRICES[ticker]) || 0;
  return {
    ask: current,
    bid: current,
    mark: current,
  };
};

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
  const synthetic = account.synthetic || buildDefaultSyntheticState();

  const predictionUnrealized = prediction.openPositions.reduce((sum, position) => {
    const currentPrice = getCurrentContractPrice(position.marketId, position.outcome);
    const markValue = position.contracts * currentPrice;
    return sum + (markValue - position.investedAmount);
  }, 0);

  const syntheticUnrealized = synthetic.openPositions.reduce((sum, position) => {
    const quote = getSyntheticQuote(position.ticker);
    const mark = quote.ask;
    const markValue = position.units * mark;
    return sum + (markValue - position.investedAmount);
  }, 0);

  // Keep account.portfolioPnL as unrealized PnL only.
  // Realized PnL is already reflected in cash balance via fills/settlements.
  account.portfolioPnL = parseFloat((predictionUnrealized + syntheticUnrealized).toFixed(2));
  return account.portfolioPnL;
};

const ensureAccountShape = (account) => {
  if (!account || typeof account !== "object") return buildDefaultGuestAccount();
  const nextCash = Math.max(0, toFiniteNumber(account.cashBalance, 1000));
  const nextPortfolio = toFiniteNumber(account.portfolioPnL, 0);
  const normalized = {
    username: account.username || "DEMO",
    cashBalance: parseFloat(nextCash.toFixed(2)),
    portfolioPnL: parseFloat(nextPortfolio.toFixed(2)),
    synthetic: sanitizeSyntheticState(account.synthetic),
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

const buildSyntheticSnapshot = (account) => {
  const synthetic = account.synthetic || buildDefaultSyntheticState();
  const openPositions = synthetic.openPositions.map((position) => {
    const quote = getSyntheticQuote(position.ticker);
    const markPrice = quote.ask;
    const marketValue = position.units * markPrice;
    const pnl = marketValue - position.investedAmount;
    return {
      ...position,
      markPrice: parseFloat(markPrice.toFixed(4)),
      marketValue: parseFloat(marketValue.toFixed(2)),
      pnl: parseFloat(pnl.toFixed(2)),
    };
  });

  const totals = openPositions.reduce(
    (acc, position) => {
      acc.units += position.units;
      acc.invested += position.investedAmount;
      acc.marketValue += position.marketValue;
      acc.unrealizedPnl += position.pnl;
      return acc;
    },
    { units: 0, invested: 0, marketValue: 0, unrealizedPnl: 0 },
  );

  return {
    openPositions,
    orderHistory: synthetic.orderHistory,
    totals: {
      units: parseFloat(totals.units.toFixed(6)),
      invested: parseFloat(totals.invested.toFixed(2)),
      marketValue: parseFloat(totals.marketValue.toFixed(2)),
      unrealizedPnl: parseFloat(totals.unrealizedPnl.toFixed(2)),
    },
  };
};

const executeSyntheticTrade = ({ account, side, ticker, amount }) => {
  if (!BASE_TICKER_PRICES[ticker]) {
    return { ok: false, error: "Invalid ticker" };
  }
  const usdAmount = Number(amount);
  if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
    return { ok: false, error: "Invalid amount" };
  }

  const synthetic = account.synthetic;
  const actor = getActivityActorFromAccount(account);
  const quote = getSyntheticQuote(ticker);
  const nowIso = new Date().toISOString();

  if (side === "BUY") {
    if (usdAmount > account.cashBalance) {
      return { ok: false, error: "Insufficient cash balance" };
    }
    const units = usdAmount / quote.ask;
    synthetic.openPositions.push({
      id: synthetic.nextPositionId++,
      ticker,
      units: parseFloat(units.toFixed(6)),
      avgEntryPrice: parseFloat(quote.ask.toFixed(4)),
      investedAmount: parseFloat(usdAmount.toFixed(4)),
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    account.cashBalance = parseFloat(
      Math.max(0, account.cashBalance - usdAmount).toFixed(2),
    );
    synthetic.orderHistory.unshift({
      id: synthetic.nextOrderId++,
      type: "BUY",
      ticker,
      units: parseFloat(units.toFixed(6)),
      price: parseFloat(quote.ask.toFixed(4)),
      amount: parseFloat(usdAmount.toFixed(4)),
      realizedPnl: 0,
      createdAt: nowIso,
    });
    appendActivity(`${actor}: Spot BUY ${ticker} ($${usdAmount.toFixed(2)})`);
  } else if (side === "SELL") {
    const totalOwnedUnits = synthetic.openPositions
      .filter((position) => position.ticker === ticker)
      .reduce((sum, position) => sum + position.units, 0);
    const requestedUnits = usdAmount / quote.bid;
    const EPS = 1e-4;
    if (requestedUnits > totalOwnedUnits + EPS) {
      return { ok: false, error: "Insufficient units to sell" };
    }

    let remainingUnits = Math.min(requestedUnits, totalOwnedUnits);
    let removedCost = 0;
    let soldUnits = 0;
    const nextOpenPositions = [];

    synthetic.openPositions.forEach((position) => {
      if (position.ticker !== ticker || remainingUnits <= 0) {
        nextOpenPositions.push(position);
        return;
      }
      const used = Math.min(remainingUnits, position.units);
      const ratio = used / position.units;
      const costPortion = position.investedAmount * ratio;
      soldUnits += used;
      removedCost += costPortion;
      remainingUnits -= used;

      const leftUnits = position.units - used;
      const leftInvested = position.investedAmount - costPortion;
      if (leftUnits > 1e-4) {
        nextOpenPositions.push({
          ...position,
          units: parseFloat(leftUnits.toFixed(6)),
          investedAmount: parseFloat(leftInvested.toFixed(4)),
          avgEntryPrice: parseFloat((leftInvested / leftUnits).toFixed(4)),
          updatedAt: nowIso,
        });
      }
    });

    if (soldUnits <= 0 || remainingUnits > 1e-4) {
      return { ok: false, error: "Insufficient units to sell" };
    }

    synthetic.openPositions = nextOpenPositions;
    const proceeds = soldUnits * quote.bid;
    const realizedPnl = proceeds - removedCost;
    account.cashBalance = parseFloat(
      Math.max(0, account.cashBalance + proceeds).toFixed(2),
    );
    synthetic.orderHistory.unshift({
      id: synthetic.nextOrderId++,
      type: "SELL",
      ticker,
      units: parseFloat(soldUnits.toFixed(6)),
      price: parseFloat(quote.bid.toFixed(4)),
      amount: parseFloat(proceeds.toFixed(4)),
      realizedPnl: parseFloat(realizedPnl.toFixed(4)),
      createdAt: nowIso,
    });
    appendActivity(`${actor}: Spot SELL ${ticker} ($${usdAmount.toFixed(2)})`);
  } else {
    return { ok: false, error: "Invalid side" };
  }

  synthetic.orderHistory = synthetic.orderHistory.slice(0, 500);
  account.updatedAt = nowIso;
  recalculatePortfolioPnL(account);
  saveJsonFile(ACCOUNT_FILE, accountStore);
  return {
    ok: true,
    account,
    synthetic: buildSyntheticSnapshot(account),
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
    cashBalance: parseFloat(
      Math.max(0, toFiniteNumber(loadedAccountData.cashBalance, 1000)).toFixed(2),
    ),
    portfolioPnL: parseFloat(
      toFiniteNumber(loadedAccountData.portfolioPnL, 0).toFixed(2),
    ),
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

const getActivityActorFromGuestId = (guestId) => {
  const account = getOrCreateGuestAccount(guestId);
  return getActivityActorFromAccount(account);
};

const getHistoriesForClient = () =>
  Object.keys(pricesData.priceHistory).reduce((acc, ticker) => {
    acc[ticker] = pricesData.priceHistory[ticker].map((p) => p.price);
    return acc;
  }, {});

const getHistoryTimestampsForClient = () =>
  Object.keys(pricesData.priceHistory).reduce((acc, ticker) => {
    acc[ticker] = pricesData.priceHistory[ticker].map((p) => p.timestamp);
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
  const actor = getActivityActorFromAccount(account);
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
    account.cashBalance = parseFloat(
      Math.max(0, account.cashBalance - buyAmount).toFixed(2),
    );

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
    appendActivity(
      `${actor}: Prediction BUY ${outcome === "YES" ? "UP" : "DOWN"} ${market.ticker} ($${buyAmount.toFixed(2)})`,
    );
  } else if (side === "SELL") {
    const contractsToSell = Number(contracts);
    if (!Number.isFinite(contractsToSell) || contractsToSell <= 0) {
      return { ok: false, error: "Invalid contracts to sell" };
    }

    const matchingTotalContracts = prediction.openPositions
      .filter(
        (position) =>
          position.marketId === marketId && position.outcome === outcome,
      )
      .reduce((sum, position) => sum + position.contracts, 0);
    const SELL_EPSILON = 0.01;
    if (contractsToSell > matchingTotalContracts + SELL_EPSILON) {
      return { ok: false, error: "Not enough contracts to sell" };
    }

    const targetContracts = Math.min(contractsToSell, matchingTotalContracts);
    let remaining = targetContracts;
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
      if (leftContracts > SELL_EPSILON) {
        nextOpenPositions.push({
          ...position,
          contracts: parseFloat(leftContracts.toFixed(4)),
          investedAmount: parseFloat(leftInvested.toFixed(4)),
          avgEntryPrice: parseFloat((leftInvested / leftContracts).toFixed(4)),
          updatedAt: nowIso,
        });
      }
    });

    if (soldContracts <= 0 || remaining > SELL_EPSILON) {
      return { ok: false, error: "Not enough contracts to sell" };
    }

    prediction.openPositions = nextOpenPositions;
    const proceeds = soldContracts * price;
    const realizedPnl = proceeds - removedCost;
    account.cashBalance = parseFloat(
      Math.max(0, account.cashBalance + proceeds).toFixed(2),
    );
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
    appendActivity(
      `${actor}: Prediction SELL ${outcome === "YES" ? "UP" : "DOWN"} ${market.ticker} (${soldContracts.toFixed(2)} cts)`,
    );
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

  socket.emit("pricesUpdated", buildLivePayload());
  socket.emit("activityUpdated", { activityFeed: activityData.items });

  socket.on("updatePrice", (data) => {
    const { ticker, price } = data || {};
    if (!BASE_TICKER_PRICES[ticker] || typeof price !== "number") return;

    const added = addPriceEntry(ticker, price, "manual-update");
    if (!added) return;
    // chances update is tied to the price move inside addPriceEntry
    appendActivity(`Price updated: ${ticker} -> $${Number(price).toFixed(3)}`);

    broadcastLiveUpdate();
  });

  socket.on("skipSessionsAll", (data, ack) => {
    const guestId = sanitizeGuestId(data?.guestId) || "guest-default";
    const actor = getActivityActorFromGuestId(guestId);
    const count = runSkipSessions(data?.count, actor);
    broadcastLiveUpdate({ skippedSessions: count });
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
    ...buildLivePayload(),
    statistics: pricesData.statistics,
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
  // chances update is tied to the price move inside addPriceEntry

  broadcastLiveUpdate();

  res.json({
    success: true,
    ...buildLivePayload(),
    statistics: pricesData.statistics,
  });
});

app.post("/api/sessions/reconcile", (req, res) => {
  const latest = getLatestHistoryTimestamp();
  const parsed = Number.isFinite(latest?.getTime?.()) ? latest : new Date();
  const derived = getSessionSlotIndex(parsed);
  sessionState.lastSessionSlotIndex = derived >= 0 ? derived : 0;
  sessionState.lastSessionAt = alignTimestampToSlotIndex(
    parsed,
    sessionState.lastSessionSlotIndex,
  ).toISOString();
  saveJsonFile(SESSION_STATE_FILE, sessionState);

  res.json({
    ok: true,
    lastSessionAt: sessionState.lastSessionAt,
    lastSessionSlotIndex: sessionState.lastSessionSlotIndex,
  });
});
app.post("/api/sessions/skip", (req, res) => {
  const guestId =
    resolveGuestId(req) ||
    sanitizeGuestId(req.body?.guestId) ||
    "guest-default";
  const actor = getActivityActorFromGuestId(guestId);
  const count = runSkipSessions(req.body?.count, actor);

  const payload = broadcastLiveUpdate({ skippedSessions: count });

  res.json({
    success: true,
    skippedSessions: count,
    ...payload,
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
    synthetic: buildSyntheticSnapshot(account),
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

  account.cashBalance = parseFloat(
    Math.max(0, account.cashBalance + amount).toFixed(2),
  );
  account.updatedAt = new Date().toISOString();
  recalculatePortfolioPnL(account);
  saveJsonFile(ACCOUNT_FILE, accountStore);
  appendActivity(`${getActivityActorFromAccount(account)}: Deposit +$${amount.toFixed(2)}`);

  res.json({
    success: true,
    guestId,
    account,
    synthetic: buildSyntheticSnapshot(account),
    prediction: buildPredictionSnapshot(account),
    deposited: amount,
    timestamp: Date.now(),
  });
});

app.post("/api/account/username", (req, res) => {
  const guestId = resolveGuestId(req);
  const account = getOrCreateGuestAccount(guestId);
  const rawUsername = String(req.body?.username || "").trim();

  if (!rawUsername) {
    res.status(400).json({ error: "Username is required" });
    return;
  }
  if (rawUsername.length < 3 || rawUsername.length > 20) {
    res.status(400).json({ error: "Username must be 3-20 characters" });
    return;
  }
  if (!/^[A-Za-z0-9_]+$/.test(rawUsername)) {
    res
      .status(400)
      .json({ error: "Username can use letters, numbers, and underscore only" });
    return;
  }

  account.username = rawUsername;
  account.updatedAt = new Date().toISOString();
  saveJsonFile(ACCOUNT_FILE, accountStore);

  res.json({
    success: true,
    guestId,
    account,
    synthetic: buildSyntheticSnapshot(account),
    prediction: buildPredictionSnapshot(account),
    timestamp: Date.now(),
  });
});

app.post("/api/account/reset", (req, res) => {
  const guestId = resolveGuestId(req);
  accountStore.accounts[guestId] = ensureAccountShape(buildDefaultGuestAccount());
  saveJsonFile(ACCOUNT_FILE, accountStore);
  res.json({
    success: true,
    guestId,
    message: "Demo account reset",
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

app.get("/api/synthetic/portfolio", (req, res) => {
  const guestId = resolveGuestId(req);
  const account = getOrCreateGuestAccount(guestId);
  recalculatePortfolioPnL(account);
  saveJsonFile(ACCOUNT_FILE, accountStore);

  res.json({
    success: true,
    guestId,
    account,
    synthetic: buildSyntheticSnapshot(account),
    timestamp: Date.now(),
  });
});

app.post("/api/synthetic/trade", (req, res) => {
  const guestId = resolveGuestId(req);
  const account = getOrCreateGuestAccount(guestId);
  const side = req.body?.side === "SELL" ? "SELL" : "BUY";
  const ticker = String(req.body?.ticker || "");
  const result = executeSyntheticTrade({
    account,
    side,
    ticker,
    amount: req.body?.amount,
  });

  if (!result.ok) {
    res.status(400).json({ error: result.error || "Trade rejected" });
    return;
  }

  res.json({
    success: true,
    guestId,
    account: result.account,
    synthetic: result.synthetic,
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

app.get("/api/activity", (req, res) => {
  res.json({
    activityFeed: activityData.items,
    timestamp: Date.now(),
  });
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









