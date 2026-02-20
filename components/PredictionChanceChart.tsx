import React, { useEffect, useMemo, useRef, useState } from "react";

interface Props {
  baseChance: number;
  seedKey: string;
  chanceSeries?: number[];
}

const SESSION_SLOTS_MINUTES = [8 * 60 + 30, 12 * 60, 15 * 60 + 30];
const VISIBLE_POINTS = 10;

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

const buildMockChanceSeries = (baseChance: number, seedKey: string) => {
  let seed = 0;
  for (let i = 0; i < seedKey.length; i++) {
    seed = (seed * 31 + seedKey.charCodeAt(i)) % 2147483647;
  }

  const nextRand = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };

  const points = 64;
  const series: number[] = [];
  let current = clamp(baseChance + (nextRand() - 0.5) * 8, 5, 95);

  for (let i = 0; i < points; i++) {
    const drift = (nextRand() - 0.5) * 3.2;
    current = clamp(current + drift, 1, 99);
    series.push(parseFloat(current.toFixed(2)));
  }

  series[series.length - 1] = clamp(baseChance, 1, 99);
  return series;
};

const PredictionChanceChart: React.FC<Props> = ({
  baseChance,
  seedKey,
  chanceSeries = [],
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverTooltip, setHoverTooltip] = useState<{
    left: number;
    top: number;
    chance: string;
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

  const fullSeries = useMemo(
    () =>
      chanceSeries.length >= 1
        ? chanceSeries
        : buildMockChanceSeries(baseChance, seedKey),
    [baseChance, seedKey, chanceSeries],
  );

  const firstChance = fullSeries[0] ?? baseChance;
  const chanceChange = baseChance - firstChance;
  const chanceChangeLabel = `${chanceChange >= 0 ? "+" : ""}${chanceChange.toFixed(2)}%`;

  const buildSessionTimeline = (points: number) => {
    const timeline: Date[] = [];
    if (points <= 0) return timeline;

    const now = new Date();
    const cursor = new Date(now);
    let slotIdx = -1;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    for (let i = SESSION_SLOTS_MINUTES.length - 1; i >= 0; i--) {
      if (SESSION_SLOTS_MINUTES[i] <= nowMinutes) {
        slotIdx = i;
        break;
      }
    }
    if (slotIdx < 0) {
      cursor.setDate(cursor.getDate() - 1);
      slotIdx = SESSION_SLOTS_MINUTES.length - 1;
    }

    for (let i = points - 1; i >= 0; i--) {
      const day = new Date(cursor);
      const slotMinutes = SESSION_SLOTS_MINUTES[slotIdx];
      day.setHours(Math.floor(slotMinutes / 60), slotMinutes % 60, 0, 0);
      timeline[i] = day;

      slotIdx -= 1;
      if (slotIdx < 0) {
        slotIdx = SESSION_SLOTS_MINUTES.length - 1;
        cursor.setDate(cursor.getDate() - 1);
      }
    }
    return timeline;
  };

  const formatSessionTime = (date: Date) =>
    date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  const formatSessionDate = (date: Date) =>
    date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });

  const formatSessionLabel = (date: Date, prevDate?: Date) => {
    if (prevDate && prevDate.toDateString() === date.toDateString()) {
      return formatSessionTime(date);
    }
    return `${formatSessionDate(date)} ${formatSessionTime(date)}`;
  };

  const getVisibleWindow = (fullLen: number) => {
    const maxEnd = Math.max(0, fullLen - 1);
    const end = clamp(viewEndIndex ?? maxEnd, 0, maxEnd);
    const start = Math.max(0, end - VISIBLE_POINTS + 1);
    return { start, end };
  };

  useEffect(() => {
    setViewEndIndex(null);
    setHoverTooltip(null);
    setHoverMarker(null);
  }, [fullSeries.length, seedKey]);

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

      const fullTimeline = buildSessionTimeline(fullSeries.length);
      const { start, end } = getVisibleWindow(fullSeries.length);
      const series = fullSeries.slice(start, end + 1);
      const sessionTimeline = fullTimeline.slice(start, end + 1);

      const padding = { top: 88, right: 70, bottom: 44, left: 26 };
      const chartWidth = canvas.width - padding.left - padding.right;
      const chartHeight = canvas.height - padding.top - padding.bottom;
      const len = series.length;

      const min = 0;
      const max = 100;
      const range = max - min;
      const points = Array.from({ length: len }, (_, i) => {
        const x = padding.left + (i / (len - 1 || 1)) * chartWidth;
        const y =
          padding.top + chartHeight - ((series[i] - min) / range) * chartHeight;
        return { x, y };
      });

      ctx.strokeStyle = "#2a3a4d";
      ctx.lineWidth = 0.8;

      const horizontalGridCount = 5;
      for (let i = 0; i <= horizontalGridCount; i++) {
        const y = padding.top + (chartHeight / horizontalGridCount) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(canvas.width - padding.right, y);
        ctx.stroke();

        const label = `${Math.round(max - (i / horizontalGridCount) * range)}%`;
        ctx.font = "600 10px Roboto";
        ctx.fillStyle = "#8fa5be";
        ctx.textAlign = "left";
        ctx.fillText(label, canvas.width - padding.right + 10, y + 3);
      }

      const verticalGridCount = 9;
      for (let i = 0; i <= verticalGridCount; i++) {
        const x = padding.left + (chartWidth / verticalGridCount) * i;
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, canvas.height - padding.bottom);
        ctx.stroke();

        const labelIndex = Math.min(
          len - 1,
          Math.round((i / verticalGridCount) * (len - 1)),
        );
        const prevLabelIndex =
          i > 0
            ? Math.min(
                len - 1,
                Math.round(((i - 1) / verticalGridCount) * (len - 1)),
              )
            : undefined;
        const timeLabel = formatSessionLabel(
          sessionTimeline[labelIndex],
          prevLabelIndex !== undefined ? sessionTimeline[prevLabelIndex] : undefined,
        );
        ctx.font = "500 9px Roboto";
        ctx.fillStyle = "#8fa5be";
        ctx.textAlign = "center";
        ctx.fillText(timeLabel, x, canvas.height - padding.bottom + 18, 96);
      }

      ctx.strokeStyle = "#2ea8ff";
      ctx.lineWidth = 2.2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      if (points.length > 1) {
        ctx.moveTo(points[0].x, points[0].y);
        // Catmull-Rom to Bezier conversion so the smoothed curve passes through points.
        for (let i = 0; i < points.length - 1; i++) {
          const p0 = points[i - 1] || points[i];
          const p1 = points[i];
          const p2 = points[i + 1];
          const p3 = points[i + 2] || p2;

          const cp1x = p1.x + (p2.x - p0.x) / 6;
          const cp1y = p1.y + (p2.y - p0.y) / 6;
          const cp2x = p2.x - (p3.x - p1.x) / 6;
          const cp2y = p2.y - (p3.y - p1.y) / 6;

          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
      } else if (points.length === 1) {
        ctx.moveTo(points[0].x, points[0].y);
      }
      ctx.stroke();

      ctx.fillStyle = "#66c7ff";
      const markerStep = Math.max(1, Math.ceil(len / 10));
      for (let i = 0; i < len; i += markerStep) {
        ctx.beginPath();
        ctx.arc(points[i].x, points[i].y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      const lx = points[points.length - 1]?.x ?? padding.left;
      const ly = points[points.length - 1]?.y ?? padding.top;
      ctx.fillStyle = "#2ea8ff";
      ctx.beginPath();
      ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.fill();

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
  }, [fullSeries, viewEndIndex]);

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const maxEnd = Math.max(0, fullSeries.length - 1);
    dragStartXRef.current = event.clientX;
    dragStartEndRef.current = viewEndIndex ?? maxEnd;
    setIsDragging(true);
  };

  const processMouseMove = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const fullTimeline = buildSessionTimeline(fullSeries.length);
    const { start, end } = getVisibleWindow(fullSeries.length);
    const series = fullSeries.slice(start, end + 1);
    const visibleLen = series.length;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const padding = { top: 88, right: 70, bottom: 44, left: 26 };
    const chartWidth = rect.width - padding.left - padding.right;

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
    const chartHeight = rect.height - padding.top - padding.bottom;
    const pointX =
      padding.left + (safeIndex / Math.max(1, visibleLen - 1)) * chartWidth;
    const pointY =
      padding.top + chartHeight - ((series[safeIndex] - 0) / 100) * chartHeight;

    const chanceText = `${series[safeIndex].toFixed(2)}%`;
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
    setHoverTooltip({ left, top, chance: chanceText, time: timeText });
    setHoverMarker({ x: pointX, y: pointY, top: padding.top, height: chartHeight });
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
      <div className="absolute top-3 left-5 z-10 pointer-events-none">
        <span className="text-[28px] leading-none font-black text-[#66c7ff]">
          {Math.round(baseChance)}% chance
        </span>
        <div
          className={`mt-1 text-[11px] font-bold uppercase tracking-[0.1em] ${
            chanceChange >= 0 ? "text-[#66c7ff]" : "text-rose-400"
          }`}
        >
          {chanceChange >= 0 ? "Risen by " : "Dropped by "}
          {chanceChangeLabel}
        </div>
      </div>
      <canvas
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
            {hoverTooltip.chance}
          </div>
          <div className="mt-1 text-[11px] font-medium text-[#8fa5be] leading-none">
            {hoverTooltip.time}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PredictionChanceChart;
