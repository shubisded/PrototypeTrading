import React, { useEffect, useRef, useState } from "react";

interface Props {
  ticker: string;
  priceHistory: number[];
  timeHistory?: string[];
  currentPrice: number;
  targetPrice?: number;
  showTitle?: boolean;
  selectedTicker?: string;
  onTickerChange?: (ticker: string) => void;
  tickerPrices?: Record<string, number>;

}

const SESSION_SLOTS_MINUTES = [8 * 60 + 30, 12 * 60, 15 * 60 + 30];
const VISIBLE_POINTS = 10;

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

const MarketChart: React.FC<Props> = ({
  ticker,
  priceHistory,
  timeHistory = [],
  currentPrice,
  targetPrice,
  showTitle = true,
  selectedTicker = "",
  onTickerChange,

}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hoverTooltip, setHoverTooltip] = useState<{
    left: number;
    top: number;
    price: string;
    time: string;
  } | null>(null);
  const [hoverMarker, setHoverMarker] = useState<{
    x: number;
    y: number;
    top: number;
    height: number;
  } | null>(null);
  const [viewEndIndex, setViewEndIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const dragStartXRef = useRef(0);
  const dragStartEndRef = useRef(0);
  const hoverRafRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<{ clientX: number; clientY: number } | null>(
    null,
  );

  const tickers = ["DDR5", "DDR4"];
  const ramNames: Record<string, string> = {
    DDR5: "LIVE DDR5 SPOT",
    DDR4: "LIVE DDR4 SPOT",
  };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const buildSessionTimeline = (points: number) => {
    const timeline: Date[] = [];
    if (points <= 0) return timeline;

    const getSlotAligned = (date: Date) => {
      const aligned = new Date(date);
      const nowMinutes = aligned.getUTCHours() * 60 + aligned.getUTCMinutes();
      let slotIdx = -1;

      for (let i = SESSION_SLOTS_MINUTES.length - 1; i >= 0; i--) {
        if (SESSION_SLOTS_MINUTES[i] <= nowMinutes) {
          slotIdx = i;
          break;
        }
      }

      if (slotIdx < 0) {
        aligned.setUTCDate(aligned.getUTCDate() - 1);
        slotIdx = SESSION_SLOTS_MINUTES.length - 1;
      }

      const slotMinutes = SESSION_SLOTS_MINUTES[slotIdx];
      aligned.setUTCHours(
        Math.floor(slotMinutes / 60),
        slotMinutes % 60,
        0,
        0,
      );
      return aligned;
    };

    const getPrevSlot = (date: Date) => {
      const prev = new Date(date);
      const minutes = prev.getUTCHours() * 60 + prev.getUTCMinutes();
      const idx = SESSION_SLOTS_MINUTES.findIndex((slot) => slot === minutes);
      if (idx > 0) {
        const slotMinutes = SESSION_SLOTS_MINUTES[idx - 1];
        prev.setUTCHours(
          Math.floor(slotMinutes / 60),
          slotMinutes % 60,
          0,
          0,
        );
        return prev;
      }

      prev.setUTCDate(prev.getUTCDate() - 1);
      const lastSlot = SESSION_SLOTS_MINUTES[SESSION_SLOTS_MINUTES.length - 1];
      prev.setUTCHours(Math.floor(lastSlot / 60), lastSlot % 60, 0, 0);
      return prev;
    };

    // Anchor to latest backend timestamp if available, then normalize to session slots.
    let anchorDate = new Date();
    for (let i = timeHistory.length - 1; i >= 0; i--) {
      const parsed = new Date(timeHistory[i]);
      if (!Number.isNaN(parsed.getTime())) {
        anchorDate = parsed;
        break;
      }
    }

    timeline[points - 1] = getSlotAligned(anchorDate);
    for (let i = points - 2; i >= 0; i--) {
      timeline[i] = getPrevSlot(timeline[i + 1]);
    }

    return timeline;
  };

  const formatSessionTime = (date: Date) =>
    date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  const formatSessionDate = (date: Date) => {
    const month = date.toLocaleDateString([], { month: "short" });
    return `${date.getDate()} ${month}`;
  };

  const getFullSeries = () =>
    priceHistory && priceHistory.length >= 2
      ? priceHistory
      : Array.from({ length: 20 }, (_, i) => {
          const jitter = (i - 10) * 0.002;
          return parseFloat((currentPrice * (1 + jitter)).toFixed(6));
        });

  const getVisibleWindow = (fullLen: number) => {
    const maxEnd = Math.max(0, fullLen - 1);
    const end = clamp(viewEndIndex ?? maxEnd, 0, maxEnd);
    const start = Math.max(0, end - VISIBLE_POINTS + 1);
    return { start, end };
  };

  const calculateStats = () => {
    if (!priceHistory || priceHistory.length === 0) {
      return { price: currentPrice.toFixed(3), change: "0.00%" };
    }
    const first = priceHistory[0] || currentPrice;
    const change = ((currentPrice - first) / (first || 1)) * 100;
    return {
      price: currentPrice.toFixed(3),
      change: `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`,
    };
  };

  const stats = calculateStats();


  useEffect(() => {
    setViewEndIndex(null);
    setHoverTooltip(null);
    setHoverMarker(null);
  }, [ticker, priceHistory.length, timeHistory.length]);

  useEffect(() => {
    return () => {
      if (hoverRafRef.current !== null) {
        cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      if (!ctx || canvas.width <= 0 || canvas.height <= 0) return;

      ctx.fillStyle = "#141d29";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const fullSeries = getFullSeries();
      const fullTimeline = buildSessionTimeline(fullSeries.length);
      const { start, end } = getVisibleWindow(fullSeries.length);
      const series = fullSeries.slice(start, end + 1);
      const sessionTimeline = fullTimeline.slice(start, end + 1);

      const len = series.length;
      const padding = { top: 40, right: 80, bottom: 80, left: 60 };
      const chartWidth = canvas.width - padding.left - padding.right;
      const chartHeight = canvas.height - padding.top - padding.bottom;

      const priceChartHeight = chartHeight;

      const boundCandidates = [...series, currentPrice];
      if (typeof targetPrice === "number") {
        boundCandidates.push(targetPrice);
      }
      const minPrice = Math.min(...boundCandidates);
      const maxPrice = Math.max(...boundCandidates);
      const range = Math.max(1e-6, maxPrice - minPrice);
      const pad = range * 0.1;
      const chartMin = minPrice - pad;
      const chartMax = maxPrice + pad;
      const adjustedRange = chartMax - chartMin || 1;
      const points = Array.from({ length: len }, (_, i) => {
        const x = padding.left + (i / (len - 1 || 1)) * chartWidth;
        const y =
          padding.top +
          priceChartHeight -
          ((series[i] - chartMin) / adjustedRange) * priceChartHeight;
        return { x, y };
      });

      ctx.strokeStyle = "#2a3a4d";
      ctx.lineWidth = 0.8;

      const verticalGridCount = 9;
      for (let i = 0; i <= verticalGridCount; i++) {
        const idx = Math.min(
          len - 1,
          Math.round((i / verticalGridCount) * (len - 1)),
        );
        const x = padding.left + (i / verticalGridCount) * chartWidth;
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, canvas.height - padding.bottom);
        ctx.stroke();

        ctx.font = "500 8px Roboto";
        ctx.fillStyle = "#8fa5be";
        ctx.textAlign = "center";
        ctx.fillText(
          formatSessionTime(sessionTimeline[idx]),
          x,
          canvas.height - padding.bottom + 18,
          72,
        );
        ctx.fillStyle = "#6f88a5";
        ctx.fillText(
          formatSessionDate(sessionTimeline[idx]),
          x,
          canvas.height - padding.bottom + 32,
          72,
        );
      }

      const horizontalGridCount = 5;
      for (let i = 0; i <= horizontalGridCount; i++) {
        const y = padding.top + (priceChartHeight / horizontalGridCount) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(canvas.width - padding.right, y);
        ctx.stroke();

        const price = chartMax - (i / horizontalGridCount) * adjustedRange;
        ctx.font = "600 10px Roboto";
        ctx.fillStyle = "#8fa5be";
        ctx.textAlign = "right";
        ctx.fillText(`$${price.toFixed(2)}`, padding.left - 10, y + 4);
      }

      ctx.beginPath();
      ctx.moveTo(points[0]?.x ?? padding.left, points[0]?.y ?? padding.top);
      const lastPoint = points[points.length - 1];
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      if (lastPoint) ctx.lineTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(padding.left + chartWidth, padding.top + priceChartHeight);
      ctx.lineTo(padding.left, padding.top + priceChartHeight);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(
        0,
        padding.top,
        0,
        padding.top + priceChartHeight,
      );
      gradient.addColorStop(0, "rgba(0, 231, 1, 0.26)");
      gradient.addColorStop(1, "rgba(0, 231, 1, 0.03)");
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.strokeStyle = "#00e701";
      ctx.lineWidth = 2.2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(points[0]?.x ?? padding.left, points[0]?.y ?? padding.top);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      if (lastPoint) ctx.lineTo(lastPoint.x, lastPoint.y);
      ctx.stroke();

      ctx.fillStyle = "#00e701";
      const markerRadius = 3;
      const markerStep = Math.max(1, Math.ceil(len / 14));
      for (let i = 0; i < len; i += markerStep) {
        const x = points[i].x;
        const y = points[i].y;
        ctx.beginPath();
        ctx.arc(x, y, markerRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#141d29";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      const currentY =
        padding.top +
        priceChartHeight -
        ((currentPrice - chartMin) / adjustedRange) * priceChartHeight;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#ff5c7c";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, currentY);
      ctx.lineTo(canvas.width - padding.right, currentY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ff5c7c";
      ctx.fillRect(
        canvas.width - padding.right,
        currentY - 12,
        padding.right - 5,
        24,
      );
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 11px Roboto";
      ctx.textAlign = "center";
      ctx.fillText(
        `$${currentPrice.toFixed(3)}`,
        canvas.width - padding.right / 2,
        currentY + 4,
      );

    };

    const resizeObserver = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        draw();
      }
    });

    resizeObserver.observe(container);

    if (container.clientWidth > 0 && container.clientHeight > 0) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      draw();
    }

    return () => resizeObserver.disconnect();
  }, [
    ticker,
    priceHistory,
    timeHistory,
    currentPrice,
    targetPrice,
    viewEndIndex,
  ]);

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const fullSeries = getFullSeries();
    const maxEnd = Math.max(0, fullSeries.length - 1);
    dragStartXRef.current = event.clientX;
    dragStartEndRef.current = viewEndIndex ?? maxEnd;
    setIsDragging(true);
  };

  const processMouseMove = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const fullSeries = getFullSeries();
    const fullTimeline = buildSessionTimeline(fullSeries.length);
    const { start, end } = getVisibleWindow(fullSeries.length);
    const series = fullSeries.slice(start, end + 1);

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const padding = { top: 40, right: 80, bottom: 80, left: 60 };
    const chartWidth = rect.width - padding.left - padding.right;
    const visibleLen = series.length;
    const chartHeight = rect.height - padding.top - padding.bottom;
    const priceChartHeight = chartHeight;

    if (isDragging) {
      const deltaX = clientX - dragStartXRef.current;
      const pointsPerPixel = (visibleLen - 1) / Math.max(1, chartWidth);
      const shiftPoints = Math.round(deltaX * pointsPerPixel);
      const maxEnd = Math.max(0, fullSeries.length - 1);
      const nextEnd = clamp(dragStartEndRef.current - shiftPoints, 0, maxEnd);
      setViewEndIndex((prev) => (prev === nextEnd ? prev : nextEnd));
      setHoverTooltip(null);
      setHoverMarker(null);
      return;
    }

    const clampedX = Math.max(
      padding.left,
      Math.min(rect.width - padding.right, x),
    );
    const ratio = (clampedX - padding.left) / (chartWidth || 1);
    const idx = Math.round(ratio * (visibleLen - 1));
    const safeIndex = Math.max(0, Math.min(visibleLen - 1, idx));
    const pointX =
      padding.left + (safeIndex / Math.max(1, visibleLen - 1)) * chartWidth;

    const boundCandidates = [...series, currentPrice];
    if (typeof targetPrice === "number") boundCandidates.push(targetPrice);
    const minPrice = Math.min(...boundCandidates);
    const maxPrice = Math.max(...boundCandidates);
    const range = Math.max(1e-6, maxPrice - minPrice);
    const pad = range * 0.1;
    const chartMin = minPrice - pad;
    const chartMax = maxPrice + pad;
    const adjustedRange = chartMax - chartMin || 1;
    const pointY =
      padding.top +
      priceChartHeight -
      ((series[safeIndex] - chartMin) / adjustedRange) * priceChartHeight;

    const priceText = `$${series[safeIndex].toFixed(3)}`;
    const timeText =
      fullTimeline[start + safeIndex]?.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZoneName: "short",
      }) || "";

    const tooltipWidth = 164;
    const tooltipHeight = 52;
    const rawLeft = x + 12;
    const rawTop = clientY - rect.top - tooltipHeight - 10;
    const left = Math.max(8, Math.min(rect.width - tooltipWidth - 8, rawLeft));
    const top = Math.max(8, Math.min(rect.height - tooltipHeight - 8, rawTop));
    setHoverTooltip({ left, top, price: priceText, time: timeText });
    setHoverMarker({ x: pointX, y: pointY, top: padding.top, height: priceChartHeight });
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    pendingPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
    if (hoverRafRef.current !== null) return;
    hoverRafRef.current = requestAnimationFrame(() => {
      hoverRafRef.current = null;
      const pending = pendingPointerRef.current;
      if (!pending) return;
      processMouseMove(pending.clientX, pending.clientY);
    });
  };

  const stopDrag = () => {
    setIsDragging(false);
  };

  return (
    <div ref={containerRef} className="w-full h-full relative bg-[#141d29]">
      {showTitle ? (
        <div className="absolute top-1 left-4 z-10 pointer-events-none">
          <span className="text-[14px] font-black text-[#d9e5f7] uppercase tracking-[0.08em]">
            {ramNames[ticker] || `LIVE ${ticker} SPOT`}
          </span>
        </div>
      ) : null}

      {onTickerChange && selectedTicker && (
        <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
          <div className="pointer-events-auto absolute top-3 left-3 right-3 bg-[#161f2b] border border-[#2a394a] rounded flex items-center h-14 px-3">
            <div className="relative flex items-center h-full">
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-3 h-10 px-4 bg-[#1f2c3a] border border-[#2f445b] rounded text-[#63f3d0] hover:bg-[#2a3a4d] transition-all z-10"
              >
                <div className="w-5 h-5 bg-[#00e701] rounded-sm flex items-center justify-center shrink-0">
                  <span className="text-[#0b1b10] font-bold text-[10px]">
                    {selectedTicker[0]}
                  </span>
                </div>
                <span className="text-[13px] font-bold tracking-tight uppercase whitespace-nowrap">
                  {selectedTicker}/USD
                </span>
                <svg
                  className={`w-4 h-4 text-[#9fb1c5] transition-transform ${isOpen ? "rotate-180" : ""}`}
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
                  <div className="absolute top-full left-0 mt-1.5 w-48 bg-[#161f2b] border border-[#2a394a] rounded shadow-[0_12px_40px_rgba(0,0,0,0.7)] z-[100] overflow-hidden">
                    <div className="py-1">
                      {tickers.map((t) => (
                        <button
                          key={t}
                          onClick={() => {
                            onTickerChange?.(t);
                            setIsOpen(false);
                          }}
                          className={`w-full px-4 py-2.5 text-left text-[12px] font-bold transition-all flex items-center justify-between ${selectedTicker === t ? "text-[#63f3d0] bg-[#1f2c3a]" : "text-[#9fb1c5] hover:bg-[#223144] hover:text-[#63f3d0]"}`}
                        >
                          <span>{t}/USD</span>
                          {selectedTicker === t && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#00e701]"></span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="w-[1px] h-full bg-[#2a394a] mx-4" />

            <div className="flex items-center gap-6 ml-auto">
              <div className="flex items-center gap-3">
                <span className="text-[18px] font-bold text-[#63f3d0] leading-none">
                  ${stats.price}
                </span>
                <span
                  className={`text-[12px] font-bold ${stats.change.startsWith("+") ? "text-[#00e701]" : "text-rose-500"}`}
                >
                  {stats.change}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}



      <div className="absolute top-2 right-2 z-20 pointer-events-none">
        <div className="rounded px-2 py-1 border border-[#2a394a] bg-[#0b1522]/90 text-[9px] font-bold tracking-[0.08em] uppercase text-[#9fb1c5]">
          Mock Data
        </div>
      </div>      <canvas
        ref={canvasRef}
        className={`w-full h-full ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={() => {
          if (hoverRafRef.current !== null) {
            cancelAnimationFrame(hoverRafRef.current);
            hoverRafRef.current = null;
          }
          pendingPointerRef.current = null;
          stopDrag();
          setHoverTooltip(null);
          setHoverMarker(null);
        }}
      />
      {hoverMarker ? (
        <>
          <div
            className="absolute pointer-events-none z-20 w-px bg-[#67b7ff]/70"
            style={{
              left: hoverMarker.x,
              top: hoverMarker.top,
              height: hoverMarker.height,
            }}
          />
          <div
            className="absolute pointer-events-none z-20 w-2 h-2 rounded-full bg-[#67b7ff] border border-[#141d29]"
            style={{
              left: hoverMarker.x - 4,
              top: hoverMarker.y - 4,
            }}
          />
        </>
      ) : null}
      {hoverTooltip ? (
        <div
          className="absolute pointer-events-none z-30 w-[164px] rounded-md border border-[#3a4b62] bg-[#0b1522]/95 px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
          style={{ left: hoverTooltip.left, top: hoverTooltip.top }}
        >
          <div className="text-[12px] font-bold text-[#d5e8ff] leading-none">
            {hoverTooltip.price}
          </div>
          <div className="mt-1 text-[11px] font-medium text-[#8fa5be] leading-none">
            {hoverTooltip.time}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MarketChart;



















