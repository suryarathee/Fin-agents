import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  createChart,
  type IChartApi,
  type CandlestickSeriesPartialOptions,
  type CandlestickData,
} from "lightweight-charts";

interface StockCandle extends CandlestickData {
  time: string; // Lightweight Charts accepts string date
}

interface ApiStockPoint {
  date: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

export const StockChart: React.FC = () => {
  const [symbol, setSymbol] = useState("AAPL");
  const [data, setData] = useState<StockCandle[]>([]);
  const [loading, setLoading] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<
    ReturnType<IChartApi["addCandlestickSeries"]> | null
  >(null);

  const fetchStockData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `http://127.0.0.1:8000/api/stock?symbol=${symbol}&period=6mo`
      );

      const chartData: StockCandle[] = res.data.prices.map((d: ApiStockPoint) => ({
        time: d.date,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));

      setData(chartData);
    } catch (err) {
      console.error(err);
      setData([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: "#ffffff" },
        textColor: "#333",
      },
      grid: {
        vertLines: { color: "#f0f0f0" },
        horzLines: { color: "#f0f0f0" },
      },
      timeScale: {
        borderColor: "#cccccc",
      },
    });

    chartRef.current = chart;

    const seriesOptions: CandlestickSeriesPartialOptions = {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderDownColor: "#ef5350",
      borderUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      wickUpColor: "#26a69a",
    };

    const candleSeries = chart.addCandlestickSeries(seriesOptions);
    candlestickSeriesRef.current = candleSeries;

    const handleResize = () => {
      chart.applyOptions({
        width: chartContainerRef.current!.clientWidth,
      });
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (candlestickSeriesRef.current && data.length > 0) {
      candlestickSeriesRef.current.setData(data);
      chartRef.current?.timeScale().fitContent();
    }
  }, [data]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Stock Price Viewer</h2>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          className="border px-3 py-2 rounded w-full"
        />
        <button
          onClick={fetchStockData}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
        >
          {loading ? "Loading..." : "Fetch"}
        </button>
      </div>

      <div ref={chartContainerRef} className="border rounded-md" />

      {data.length === 0 && !loading && (
        <p className="text-gray-600 text-center mt-4">
          No data to display. Click "Fetch".
        </p>
      )}
    </div>
  );
};
