import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  ColorType,
} from "lightweight-charts";
import { Maximize2, Minimize2 } from "lucide-react";

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
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

/** Returns the interval in seconds for a given resolution */
function getIntervalSeconds(res: Resolution): number {
  if (res === '1s') return 1;
  if (res === '1') return 60;
  if (res === '5') return 5 * 60;
  if (res === '15') return 15 * 60;
  if (res === '60') return 60 * 60;
  return 24 * 60 * 60; // 'D'
}

export const StockChart = ({ symbol, isExpanded = false, onToggleExpand }: StockChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const [data, setData] = useState<StockCandle[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolution, setResolution] = useState<Resolution>('1');
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("disconnected");

  // TTL countdown: seconds remaining until the next candle boundary
  const [ttl, setTtl] = useState<number>(0);

  // Live clock
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const formatTime = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      setCurrentTime(`${hh}:${mm}:${ss}`);
    };
    formatTime();
    const id = setInterval(formatTime, 1000);
    return () => clearInterval(id);
  }, []);

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

  // ── TTL Countdown ──────────────────────────────────────────────────
  useEffect(() => {
    const intervalSecs = getIntervalSeconds(resolution);

    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const secondsIntoCandle = now % intervalSecs;
      setTtl(intervalSecs - secondsIntoCandle);
    };

    tick(); // immediate call
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [resolution]);

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

    const intervalSeconds = getIntervalSeconds(currentRes);

    const lastCandles = dataRef.current;
    let lastCandle = lastCandles[lastCandles.length - 1];

    trades.forEach((trade) => {
      const price = trade.p;
      const volume = trade.v;
      const time = trade.t / 1000;

      const candleTime = Math.floor(time / intervalSeconds) * intervalSeconds;

      if (lastCandle && lastCandle.time === candleTime) {
        lastCandle = {
          ...lastCandle,
          high: Math.max(lastCandle.high, price),
          low: Math.min(lastCandle.low, price),
          close: price,
          volume: (lastCandle.volume || 0) + volume
        };
        lastCandles[lastCandles.length - 1] = lastCandle;
        candlestickSeriesRef.current?.update(lastCandle);
      } else if (!lastCandle || candleTime > lastCandle.time) {
        const newCandle: StockCandle = {
          time: candleTime,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: volume
        };
        lastCandles.push(newCandle);
        lastCandle = newCandle;
        candlestickSeriesRef.current?.update(newCandle);
      }
    });

    dataRef.current = lastCandles;
  };

  // Initialize & Update Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    if (!chartRef.current) {
      const showSeconds = resolution === '1s' || resolution === '1';
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
        height: chartContainerRef.current.clientHeight || 500,
        localization: {
          timeFormatter: (time: number) => {
            const d = new Date(time * 1000);
            return d.toLocaleTimeString('en-US', {
              hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
            });
          },
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: showSeconds,
          tickMarkFormatter: (time: number) => {
            const d = new Date(time * 1000);
            if (resolution === '1s') {
              return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            }
            if (resolution === '1' || resolution === '5' || resolution === '15') {
              return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            }
            if (resolution === '60') {
              return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            }
            // Daily
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          },
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
        if (!chartContainerRef.current) return;
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 500,
        });
      };
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        chart.remove();
        chartRef.current = null;
      };
    }
  }, []);

  // Resize chart when expanded state changes
  useEffect(() => {
    if (!chartRef.current || !chartContainerRef.current) return;
    // Let the DOM settle then resize
    const t = setTimeout(() => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 500,
        });
        chartRef.current.timeScale().fitContent();
      }
    }, 50);
    return () => clearTimeout(t);
  }, [isExpanded]);

  // Update Data on Chart
  useEffect(() => {
    if (candlestickSeriesRef.current) {
      candlestickSeriesRef.current.setData(data as CandlestickData[]);

      if (data.length > 0) {
        if (!isChartFittedRef.current && chartRef.current) {
          chartRef.current.timeScale().fitContent();
          isChartFittedRef.current = true;
        }
      }
    }
  }, [data]);

  // TTL formatting helpers
  const formatTtl = (secs: number) => {
    if (secs >= 3600) {
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
    }
    if (secs >= 60) {
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return `${m}m ${String(s).padStart(2, '0')}s`;
    }
    return `${secs}s`;
  };

  const ttlPercent = resolution === '1s'
    ? 0
    : Math.round(((getIntervalSeconds(resolution) - ttl) / getIntervalSeconds(resolution)) * 100);

  return (
    <div className="p-6 w-full h-full bg-gray-900 text-white flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4 flex-shrink-0">
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

          {/* Reload button */}
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

          {/* Expand / Collapse button */}
          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition-colors"
              title={isExpanded ? "Collapse chart" : "Expand chart"}
            >
              {isExpanded
                ? <Minimize2 className="w-4 h-4 text-gray-400" />
                : <Maximize2 className="w-4 h-4 text-gray-400" />}
            </button>
          )}
        </div>
      </div>

      {/* TTL Bar */}
      {resolution !== '1s' && (
        <div className="flex items-center gap-3 mb-4 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 whitespace-nowrap">
            <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Next candle in</span>
            <span className="font-mono font-bold text-blue-300">{formatTtl(ttl)}</span>
          </div>
          <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full transition-all duration-1000"
              style={{ width: `${ttlPercent}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-500 font-mono whitespace-nowrap">{ttlPercent}% filled</span>
        </div>
      )}

      <div className="relative border border-gray-800 rounded-xl overflow-hidden shadow-2xl bg-[#111827] flex-1 min-h-0">
        {/* Header Overlay */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-3 bg-[#111827]/90 backdrop-blur-md px-3 py-2 rounded-lg border border-gray-800 shadow-sm">
          <div className="font-bold text-lg text-white">{symbol}</div>
          <div className="text-xs text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded border border-blue-400/20 font-mono">
            {resolution === '1s' ? 'REAL-TIME' : resolution === 'D' ? 'DAILY' : `${resolution} MIN`}
          </div>
          {currentTime && (
            <div className="flex items-center gap-1.5 border-l border-gray-700 pl-3">
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-mono text-sm font-semibold text-gray-200 tabular-nums tracking-wider">
                {currentTime}
              </span>
            </div>
          )}
        </div>

        <div ref={chartContainerRef} className="w-full h-full" />

        {data.length === 0 && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm pointer-events-none">
            <p className="text-gray-400 animate-pulse">Waiting for live data...</p>
          </div>
        )}
      </div>
    </div>
  );
};
