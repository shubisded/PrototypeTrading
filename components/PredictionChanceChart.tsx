import React, { useEffect, useMemo, useRef } from "react";

interface Props {
  baseChance: number;
  seedKey: string;
  chanceSeries?: number[];
}

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

  const series = useMemo(
    () =>
      chanceSeries.length >= 2
        ? chanceSeries
        : buildMockChanceSeries(baseChance, seedKey),
    [baseChance, seedKey, chanceSeries],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      if (!ctx || canvas.width <= 0 || canvas.height <= 0) return;

      ctx.fillStyle = "#040b0b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const padding = { top: 56, right: 70, bottom: 44, left: 26 };
      const chartWidth = canvas.width - padding.left - padding.right;
      const chartHeight = canvas.height - padding.top - padding.bottom;
      const len = series.length;

      const min = 0;
      const max = 100;
      const range = max - min;

      ctx.strokeStyle = "#1a2e2e";
      ctx.lineWidth = 0.6;

      for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(canvas.width - padding.right, y);
        ctx.stroke();

        const label = `${Math.round(max - (i / 5) * range)}%`;
        ctx.font = "bold 10px JetBrains Mono";
        ctx.fillStyle = "#6f8383";
        ctx.textAlign = "left";
        ctx.fillText(label, canvas.width - padding.right + 10, y + 3);
      }

      for (let i = 0; i <= 6; i++) {
        const x = padding.left + (chartWidth / 6) * i;
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, canvas.height - padding.bottom);
        ctx.stroke();
      }

      ctx.strokeStyle = "#1aa4ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < len; i++) {
        const x = padding.left + (i / (len - 1 || 1)) * chartWidth;
        const y =
          padding.top + chartHeight - ((series[i] - min) / range) * chartHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Markers for the mock/live chance series
      ctx.fillStyle = "#1aa4ff";
      const markerStep = Math.max(1, Math.ceil(len / 10));
      for (let i = 0; i < len; i += markerStep) {
        const x = padding.left + (i / (len - 1 || 1)) * chartWidth;
        const y =
          padding.top + chartHeight - ((series[i] - min) / range) * chartHeight;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      const last = series[len - 1];
      const lx = padding.left + chartWidth;
      const ly = padding.top + chartHeight - ((last - min) / range) * chartHeight;
      ctx.fillStyle = "#1aa4ff";
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
  }, [series]);

  return (
    <div ref={containerRef} className="w-full h-full relative bg-[#040b0b]">
      <div className="absolute top-3 left-5 z-10 pointer-events-none">
        <span className="text-[32px] leading-none font-black text-[#1aa4ff]">
          {Math.round(baseChance)}% chance
        </span>
      </div>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};

export default PredictionChanceChart;
