import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  ColorType,
} from "lightweight-charts";

interface StockCandle {
  time: number; // unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

const API_BASE_URL = "https://fin-agents-a0zk.onrender.com/api/stock-history/";
const WS_API_KEY = import.meta.env.VITE_FINNHUB_API_KEY;

type Resolution = '1s' | '1' | '5' | '15' | '60' | 'D';

interface StockChartProps {
  symbol: string;
}

export const StockChart = ({ symbol }: StockChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const [data, setData] = useState<StockCandle[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolution, setResolution] = useState<Resolution>('1');
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("disconnected");

  // Ref to hold data to avoid stale closures in WS callback
  const dataRef = useRef<StockCandle[]>([]);
  const isChartFittedRef = useRef(false);

  // Keep track of current resolution for WS
  const resolutionRef = useRef(resolution);
  useEffect(() => { resolutionRef.current = resolution; }, [resolution]);

  // Reset fitted state when symbol changes
  useEffect(() => {
    isChartFittedRef.current = false;
    setData([]);
    dataRef.current = [];
  }, [symbol]);

  // Fetch Historical Data
  const fetchStockData = async () => {
    if (!symbol) return;

    // For 1s, we don't fetch history (not available/reliable for free)
    if (resolution === '1s') {
      setData([]);
      dataRef.current = [];
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}?symbol=${symbol}&resolution=${resolution}`);
      if (Array.isArray(response.data)) {
        // Sort
        const sortedData = response.data.sort((a: any, b: any) => (a.time - b.time));

        // Dedup
        const uniqueData: StockCandle[] = [];
        const times = new Set();
        for (const candle of sortedData) {
          if (!times.has(candle.time)) {
            times.add(candle.time);
            uniqueData.push(candle);
          }
        }

        setData(uniqueData);
        dataRef.current = uniqueData;
      }
    } catch (error) {
      console.error("Failed to fetch history", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStockData();
  }, [symbol, resolution]);

  // WebSocket Connection
  useEffect(() => {
    if (!symbol || !WS_API_KEY) return;

    setWsStatus("connecting");
    const ws = new WebSocket(`wss://ws.finnhub.io?token=${WS_API_KEY}`);

    ws.onopen = () => {
      setWsStatus("connected");
      ws.send(JSON.stringify({ type: "subscribe", symbol: symbol }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "trade" && message.data) {
        console.log("WS Trades:", message.data.length);
        processTrades(message.data);
      }
    };

    ws.onerror = (e) => {
      console.error("WS Error", e);
      setWsStatus("error");
    };

    ws.onclose = () => {
      setWsStatus("disconnected");
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "unsubscribe", symbol: symbol }));
        ws.close();
      }
    };
  }, [symbol]);

  // Process Live Trades
  const processTrades = (trades: any[]) => {
    const currentRes = resolutionRef.current;
    if (!candlestickSeriesRef.current) return;

    // Determine interval in seconds
    let intervalSeconds = 60;
    if (currentRes === '1s') intervalSeconds = 1;
    if (currentRes === '1') intervalSeconds = 60;
    if (currentRes === '5') intervalSeconds = 5 * 60;
    if (currentRes === '15') intervalSeconds = 15 * 60;
    if (currentRes === '60') intervalSeconds = 60 * 60;
    if (currentRes === 'D') intervalSeconds = 24 * 60 * 60;

    const lastCandles = dataRef.current; // Working with ref directly for state
    let lastCandle = lastCandles[lastCandles.length - 1];

    trades.forEach((trade) => {
      const price = trade.p;
      const volume = trade.v;
      const time = trade.t / 1000; // trade time in seconds

      const candleTime = Math.floor(time / intervalSeconds) * intervalSeconds;
      // console.log("Trade:", time, "Candle:", candleTime, "Price:", price);

      // Check if we need to update the last candle or create a new one
      if (lastCandle && lastCandle.time === candleTime) {
        // Update existing candle object (note: this mutates the ref's object, which is fine for .update)
        lastCandle = {
          ...lastCandle,
          high: Math.max(lastCandle.high, price),
          low: Math.min(lastCandle.low, price),
          close: price,
          volume: (lastCandle.volume || 0) + volume
        };

        // Update the array in ref directly (swap the last item)
        lastCandles[lastCandles.length - 1] = lastCandle;

        // Efficient Update: Just update the latest candle on the chart
        candlestickSeriesRef.current?.update(lastCandle);

      } else if (!lastCandle || candleTime > lastCandle.time) {
        // New Candle
        const newCandle: StockCandle = {
          time: candleTime,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: volume
        };

        lastCandles.push(newCandle);
        lastCandle = newCandle; // Update local tracker

        // Update Chart
        candlestickSeriesRef.current?.update(newCandle);
      }
    });

    // No need to call setData() which triggers re-render + full repaint
    // We just keep the ref in sync for when/if a full re-render happens (e.g. resolution change)
    dataRef.current = lastCandles;
  };

  // Initialize & Update Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart if not exists
    if (!chartRef.current) {
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "#111827" },
          textColor: "#9CA3AF",
        },
        grid: {
          vertLines: { color: "#374151" },
          horzLines: { color: "#374151" },
        },
        width: chartContainerRef.current.clientWidth,
        height: 500,
        timeScale: {
          timeVisible: true,
          secondsVisible: true, // Always show seconds for versatility
        },
      });

      const series = chart.addCandlestickSeries({
        upColor: '#10B981',
        downColor: '#EF4444',
        borderUpColor: '#10B981',
        borderDownColor: '#EF4444',
        wickUpColor: '#10B981',
        wickDownColor: '#EF4444',
      });

      chartRef.current = chart;
      candlestickSeriesRef.current = series;

      chart.timeScale().fitContent();

      const handleResize = () => {
        chart.applyOptions({ width: chartContainerRef.current?.clientWidth || 0 });
      };
      window.addEventListener("resize", handleResize);

      return () => { // This clean up is for when component unmounts entirely
        window.removeEventListener("resize", handleResize);
        chart.remove();
        chartRef.current = null;
      }
    }
  }, []);

  // Update Data on Chart
  useEffect(() => {
    if (candlestickSeriesRef.current) {
      candlestickSeriesRef.current.setData(data as CandlestickData[]);

      if (data.length > 0) {
        // Fit content only once per symbol/resolution change interaction start
        if (!isChartFittedRef.current && chartRef.current) {
          chartRef.current.timeScale().fitContent();
          isChartFittedRef.current = true;
        }
      }
    }
  }, [data]);

  return (
    <div className="p-6 w-full bg-gray-900 text-white">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Market Live Chart</h2>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-gray-400">Real-time data</p>
            <span className={`w-2 h-2 rounded-full ${wsStatus === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`}></span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe Selectors */}
          <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
            {(['1s', '1', '5', '15', '60', 'D'] as Resolution[]).map((res) => (
              <button
                key={res}
                onClick={() => setResolution(res)}
                className={`px-3 py-1 text-xs font-medium rounded transition-all ${resolution === res
                  ? 'bg-blue-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
              >
                {res === '1s' ? '1s' : res === 'D' ? '1D' : `${res}m`}
              </button>
            ))}
          </div>

          <button
            onClick={fetchStockData}
            disabled={loading}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition-colors"
            title="Reload History"
          >
            <svg className={`w-4 h-4 text-gray-400 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="relative border border-gray-800 rounded-xl overflow-hidden shadow-2xl bg-[#111827]">
        {/* Header Overlay */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-3 bg-[#111827]/90 backdrop-blur-md p-2 rounded-lg border border-gray-800 shadow-sm">
          <div className="font-bold text-lg text-white">{symbol}</div>
          <div className="text-xs text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded border border-blue-400/20 font-mono">
            {resolution === '1s' ? 'REAL-TIME' : resolution === 'D' ? 'DAILY' : `${resolution} MIN`}
          </div>
        </div>

        <div ref={chartContainerRef} className="w-full h-[500px]" />

        {data.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm pointer-events-none">
            <p className="text-gray-400 animate-pulse">Waiting for live data...</p>
          </div>
        )}
      </div>
    </div>
  );
};
