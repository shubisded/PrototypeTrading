import React, { useEffect, useRef } from "react";

interface Props {
  ticker: string;
  priceHistory: number[];
  currentPrice: number;
  targetPrice?: number;
  selectedTicker?: string;
  onTickerChange?: (ticker: string) => void;
  tickerPrices?: Record<string, number>;
}

const MarketChart: React.FC<Props> = ({
  ticker,
  priceHistory,
  currentPrice,
  targetPrice,
  selectedTicker = "",
  onTickerChange,
  tickerPrices = {},
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const tickers = ["DDR5", "DDR4", "GDDR5", "GDDR6"];
  const ramNames: Record<string, string> = {
    DDR5: "LIVE DDR5 SPOT",
    DDR4: "LIVE DDR4 SPOT",
    GDDR5: "LIVE GDDR5 SPOT",
    GDDR6: "LIVE GDDR6 SPOT",
  };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      if (!ctx || canvas.width <= 0 || canvas.height <= 0) return;

      // background
      ctx.fillStyle = "#040b0b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const series =
        priceHistory && priceHistory.length >= 2
          ? priceHistory
          : Array.from({ length: 20 }, (_, i) => {
              const jitter = (i - 10) * 0.002;
              return parseFloat((currentPrice * (1 + jitter)).toFixed(6));
            });

      const len = series.length;
      const padding = { top: 40, right: 80, bottom: 50, left: 60 };
      const chartWidth = canvas.width - padding.left - padding.right;
      const chartHeight = canvas.height - padding.top - padding.bottom;

      const minPrice = Math.min(...series);
      const maxPrice = Math.max(...series);
      const range = Math.max(1e-6, maxPrice - minPrice);
      const pad = range * 0.1;
      const chartMin = minPrice - pad;
      const chartMax = maxPrice + pad;
      const adjustedRange = chartMax - chartMin || 1;

      // Grid (same as synthetic)
      ctx.strokeStyle = "#1a2e2e";
      ctx.lineWidth = 0.5;

      const verticalGridCount = 6;
      for (let i = 0; i <= verticalGridCount; i++) {
        const x = padding.left + (chartWidth / verticalGridCount) * i;
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, canvas.height - padding.bottom);
        ctx.stroke();

        // time label
        ctx.font = "9px JetBrains Mono";
        ctx.fillStyle = "#7f8c8d";
        ctx.textAlign = "center";
        const timeLabel = `${Math.floor(i * (len / verticalGridCount))}`;
        ctx.fillText(timeLabel, x, canvas.height - padding.bottom + 20);
      }

      const horizontalGridCount = 5;
      for (let i = 0; i <= horizontalGridCount; i++) {
        const y = padding.top + (chartHeight / horizontalGridCount) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(canvas.width - padding.right, y);
        ctx.stroke();

        const price = chartMax - (i / horizontalGridCount) * adjustedRange;
        ctx.font = "bold 10px JetBrains Mono";
        ctx.fillStyle = "#7f8c8d";
        ctx.textAlign = "right";
        ctx.fillText(`$${price.toFixed(2)}`, padding.left - 10, y + 4);
      }

      // Filled area
      ctx.beginPath();
      ctx.moveTo(
        padding.left,
        padding.top +
          chartHeight -
          ((series[0] - chartMin) / adjustedRange) * chartHeight,
      );
      for (let i = 0; i < len; i++) {
        const x = padding.left + (i / (len - 1 || 1)) * chartWidth;
        const y =
          padding.top +
          chartHeight -
          ((series[i] - chartMin) / adjustedRange) * chartHeight;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
      ctx.lineTo(padding.left, padding.top + chartHeight);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(
        0,
        padding.top,
        0,
        padding.top + chartHeight,
      );
      gradient.addColorStop(0, "rgba(46, 211, 183, 0.3)");
      gradient.addColorStop(1, "rgba(46, 211, 183, 0.05)");
      ctx.fillStyle = gradient;
      ctx.fill();

      // Line
      ctx.strokeStyle = "#2ed3b7";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < len; i++) {
        const x = padding.left + (i / (len - 1 || 1)) * chartWidth;
        const y =
          padding.top +
          chartHeight -
          ((series[i] - chartMin) / adjustedRange) * chartHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Markers
      ctx.fillStyle = "#2ed3b7";
      const markerRadius = 4;
      const markerStep = Math.max(1, Math.ceil(len / 12));
      for (let i = 0; i < len; i += markerStep) {
        const x = padding.left + (i / (len - 1 || 1)) * chartWidth;
        const y =
          padding.top +
          chartHeight -
          ((series[i] - chartMin) / adjustedRange) * chartHeight;
        ctx.beginPath();
        ctx.arc(x, y, markerRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#040b0b";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Current price line & tag
      const currentY =
        padding.top +
        chartHeight -
        ((currentPrice - chartMin) / adjustedRange) * chartHeight;
      const targetOverlapsCurrent =
        typeof targetPrice === "number" &&
        Math.abs(targetPrice - currentPrice) < 0.0005;
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = "#e11d48";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, currentY);
      ctx.lineTo(canvas.width - padding.right, currentY);
      ctx.stroke();
      ctx.setLineDash([]);

      if (!targetOverlapsCurrent) {
        ctx.fillStyle = "#e11d48";
        ctx.fillRect(
          canvas.width - padding.right,
          currentY - 12,
          padding.right - 5,
          24,
        );
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px JetBrains Mono";
        ctx.textAlign = "center";
        ctx.fillText(
          `$${currentPrice.toFixed(3)}`,
          canvas.width - padding.right / 2,
          currentY + 4,
        );
      }

      // Target price line & tag for prediction market
      if (typeof targetPrice === "number") {
        const targetY =
          padding.top +
          chartHeight -
          ((targetPrice - chartMin) / adjustedRange) * chartHeight;

        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding.left, targetY);
        ctx.lineTo(canvas.width - padding.right, targetY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "#22c55e";
        ctx.fillRect(
          canvas.width - padding.right,
          targetY - 12,
          padding.right - 5,
          24,
        );
        ctx.fillStyle = "#04100a";
        ctx.font = "bold 11px JetBrains Mono";
        ctx.textAlign = "center";
        ctx.fillText(
          `$${targetPrice.toFixed(3)}`,
          canvas.width - padding.right / 2,
          targetY + 4,
        );
      }
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
  }, [ticker, priceHistory, currentPrice, targetPrice]);

  return (
    <div ref={containerRef} className="w-full h-full relative bg-[#040b0b]">
      <div className="absolute top-1 left-4 z-10 pointer-events-none">
        <span className="text-[15px] font-black text-[#9be7db] uppercase tracking-[0.08em]">
          {ramNames[ticker] || `LIVE ${ticker} SPOT`}
        </span>
      </div>

      {onTickerChange && selectedTicker && (
        <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
          <div className="pointer-events-auto absolute top-3 left-3 right-3 bg-[#0c1515] border border-[#1a2e2e] rounded flex items-center h-14 px-3">
            <div className="relative flex items-center h-full">
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-3 h-10 px-4 bg-[#1a2e2e] border border-[#253d3d] rounded text-[#2ed3b7] hover:bg-[#253d3d] transition-all z-10"
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
                            onTickerChange?.(t);
                            setIsOpen(false);
                          }}
                          className={`w-full px-4 py-2.5 text-left text-[12px] font-bold transition-all flex items-center justify-between ${selectedTicker === t ? "text-[#2ed3b7] bg-[#1a2e2e]/50" : "text-[#7f8c8d] hover:bg-[#1a2e2e] hover:text-[#2ed3b7]"}`}
                        >
                          <span>{t}/USD</span>
                          {selectedTicker === t && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2ed3b7]"></span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="w-[1px] h-full bg-[#1a2e2e] mx-4" />

            <div className="flex items-center gap-6 ml-auto">
              <div className="flex items-center gap-3">
                <span className="text-[18px] font-bold text-[#2ed3b7] leading-none">
                  ${stats.price}
                </span>
                <span
                  className={`text-[12px] font-bold ${stats.change.startsWith("+") ? "text-[#2ed3b7]" : "text-rose-500"}`}
                >
                  {stats.change}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};

export default MarketChart;
