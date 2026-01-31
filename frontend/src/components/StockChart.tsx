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

const MarketStatus: React.FC = () => {
  const [times, setTimes] = useState<{
    us: { time: string; status: string; color: string };
    in: { time: string; status: string; color: string };
  }>({
    us: { time: "--:--:--", status: "Loading", color: "text-gray-500" },
    in: { time: "--:--:--", status: "Loading", color: "text-gray-500" },
  });

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();

      // Helper to format time
      const formatTime = (date: Date, timeZone: string) => {
        return new Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
          timeZone,
        }).format(date);
      };

      // Helper to check market status
      const getStatus = (date: Date, timeZone: string, openHour: number, openMin: number, closeHour: number, closeMin: number) => {
        const options: Intl.DateTimeFormatOptions = {
          timeZone,
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
          hour12: false,
          weekday: 'short'
        };
        const formatter = new Intl.DateTimeFormat('en-US', options);
        const parts = formatter.formatToParts(date);
        const part = (type: string) => parts.find(p => p.type === type)?.value;

        const hour = parseInt(part('hour') || '0', 10);
        const minute = parseInt(part('minute') || '0', 10);
        const weekday = part('weekday');

        if (weekday === 'Sat' || weekday === 'Sun') {
          return { status: "Closed (Weekend)", color: "text-red-600" };
        }

        const currentMinutes = hour * 60 + minute;
        const openMinutes = openHour * 60 + openMin;
        const closeMinutes = closeHour * 60 + closeMin;

        if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
          return { status: "Market Open", color: "text-green-600" };
        } else if (currentMinutes >= openMinutes - 60 && currentMinutes < openMinutes) {
          return { status: "Pre-Market", color: "text-orange-500" };
        } else {
          return { status: "Market Closed", color: "text-red-600" };
        }
      };

      const usTime = formatTime(now, "America/New_York");
      const inTime = formatTime(now, "Asia/Kolkata");

      // US Market: 9:30 - 16:00 ET
      const usStatus = getStatus(now, "America/New_York", 9, 30, 16, 0);

      // Indian Market: 9:15 - 15:30 IST
      const inStatus = getStatus(now, "Asia/Kolkata", 9, 15, 15, 30);

      setTimes({
        us: { time: usTime, ...usStatus },
        in: { time: inTime, ...inStatus },
      });
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex gap-4 mb-4 text-sm">
      <div className="border p-2 rounded bg-gray-50 shadow-sm flex-1">
        <h3 className="font-semibold text-gray-700">🇺🇸 US Market (NYSE)</h3>
        <p className="text-xl font-mono">{times.us.time}</p>
        <p className={`font-medium ${times.us.color}`}>{times.us.status}</p>
      </div>
      <div className="border p-2 rounded bg-gray-50 shadow-sm flex-1">
        <h3 className="font-semibold text-gray-700">🇮🇳 Indian Market (NSE)</h3>
        <p className="text-xl font-mono">{times.in.time}</p>
        <p className={`font-medium ${times.in.color}`}>{times.in.status}</p>
      </div>
    </div>
  );
};

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

      <MarketStatus />

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
