import { useState, useEffect, useRef } from "react";

// --- StockData Interface (from quote endpoint) ---
interface StockData {
  symbol: string;
  longName?: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketTime: number;
}

// --- Finnhub API Data Types ---
interface FinnhubQuote {
  c: number; // Current price
  d: number; // Change
  dp: number; // Percent change
  t: number; // Timestamp
}

interface FinnhubProfile {
  name: string;
  ticker: string;
}

// --- NEW: Chart Data Types ---
type ChartType = "line" | "candle";
type ChartRange = "1D" | "1W" | "1M" | "1Y";

interface ChartData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// --- Load API key from .env file ---
const FINNHUB_API_KEY = import.meta.env.VITE_FINNHUB_API_KEY;

// --- NEW: Helper function to get timestamps for chart range ---
const getTimestamps = (range: ChartRange) => {
  const to = Math.floor(Date.now() / 1000);
  let from = 0;
  let resolution = "D";
  const day = 60 * 60 * 24;

  switch (range) {
    case "1D":
      from = to - 1 * day;
      resolution = "15"; // 15 min intervals
      break;
    case "1W":
      from = to - 7 * day;
      resolution = "60"; // 60 min intervals
      break;
    case "1M":
      from = to - 30 * day;
      resolution = "D"; // Daily intervals
      break;
    case "1Y":
      from = to - 365 * day;
      resolution = "D"; // Daily intervals
      break;
    default:
      from = to - 30 * day;
      resolution = "D";
  }
  return { from, to, resolution };
};

export default function TraderView() {
  const [symbol, setSymbol] = useState<string>("");
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // --- NEW: State for Chart ---
  const [chartData, setChartData] = useState<ChartData[] | null>(null);
  const [chartType, setChartType] = useState<ChartType>("line");
  const [chartRange, setChartRange] = useState<ChartRange>("1M");
  const [loadingChart, setLoadingChart] = useState<boolean>(false);
  const [isScriptLoaded, setIsScriptLoaded] = useState<boolean>(false);

  // --- NEW: Refs for Chart ---
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<{ chart: any; series: any } | null>(null);

  // --- NEW: Effect to load Lightweight Charts script from CDN ---
  useEffect(() => {
    if (window.LightweightCharts) {
      setIsScriptLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js";
    script.async = true;
    script.onload = () => {
      setIsScriptLoaded(true);
    };
    script.onerror = () => {
      setError("Failed to load charting library.");
    };

    document.body.appendChild(script);

    return () => {
      // Clean up script if component unmounts
      try {
        document.body.removeChild(script);
      } catch (e) {
        // ignore
      }
    };
  }, []);

  // --- Original fetch for stock quote ---
  const fetchStockData = async () => {
    if (!symbol) return;
    if (!FINNHUB_API_KEY || FINNHUB_API_KEY === "YOUR_FINNHUB_API_KEY_HERE") {
      setError(
        "Finnhub API key not found. Please add VITE_FINNHUB_API_KEY to your .env file."
      );
      return;
    }

    setLoading(true);
    setError("");
    setStockData(null);
    setChartData(null); // Clear previous chart data

    try {
      const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`;
      const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`;

      const [quoteRes, profileRes] = await Promise.all([
        fetch(quoteUrl),
        fetch(profileUrl),
      ]);

      if (!quoteRes.ok || !profileRes.ok) {
        throw new Error("Failed to fetch data from Finnhub");
      }

      const quoteData = (await quoteRes.json()) as FinnhubQuote;
      const profileData = (await profileRes.json()) as FinnhubProfile;

      if (
        !profileData.name ||
        (quoteData.c === 0 && quoteData.d === 0 && quoteData.dp === 0)
      ) {
        setError("Stock not found");
      } else {
        const combinedData: StockData = {
          symbol: profileData.ticker,
          longName: profileData.name,
          regularMarketPrice: quoteData.c,
          regularMarketChange: quoteData.d,
          regularMarketChangePercent: quoteData.dp,
          regularMarketTime: quoteData.t,
        };
        setStockData(combinedData);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to fetch stock data.");
    } finally {
      setLoading(false);
    }
  };

  // --- NEW: Effect to fetch chart data when stock or range changes ---
  useEffect(() => {
    if (!stockData || !isScriptLoaded) return;

    const fetchChartData = async () => {
      setLoadingChart(true);
      setChartData(null); // Clear old chart data

      const { from, to, resolution } = getTimestamps(chartRange);
      const url = `https://finnhub.io/api/v1/stock/candle?symbol=${stockData.symbol}&resolution=${resolution}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;

      try {
        const res = await fetch(url);
        const data = await res.json();

        if (data.s === "ok" && data.t.length > 0) {
          const formattedData = data.t.map((timestamp: number, index: number) => ({
            time: timestamp,
            open: data.o[index],
            high: data.h[index],
            low: data.l[index],
            close: data.c[index],
          }));
          setChartData(formattedData);
        } else {
          setChartData(null); // No data found
        }
      } catch (err) {
        console.error("Failed to fetch chart data:", err);
      } finally {
        setLoadingChart(false);
      }
    };

    fetchChartData();
  }, [stockData, chartRange, isScriptLoaded]); // Re-fetch if these change

  // --- NEW: Effect to render/update the chart ---
  useEffect(() => {
    if (
      !chartData ||
      !isScriptLoaded ||
      !chartContainerRef.current ||
      !window.LightweightCharts
    ) {
      return;
    }

    const { createChart, ColorType } = window.LightweightCharts;

    // Clean up previous chart instance
    if (chartRef.current) {
      chartRef.current.chart.remove();
      chartRef.current = null;
    }

    // Create new chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#333",
      },
      grid: {
        vertLines: { color: "#f0f0f0" },
        horzLines: { color: "#f0f0f0" },
      },
      timeScale: {
        borderColor: "#cccccc",
        timeVisible: true,
        secondsVisible: chartRange === "1D",
      },
      rightPriceScale: {
        borderColor: "#cccccc",
      },
    });

    // Add the correct series type
    let series;
    if (chartType === "line") {
      series = chart.addLineSeries({ color: "#2962FF", lineWidth: 2 });
      series.setData(
        chartData.map((d) => ({ time: d.time, value: d.close }))
      );
    } else {
      series = chart.addCandlestickSeries({
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderDownColor: "#ef5350",
        borderUpColor: "#26a69a",
        wickDownColor: "#ef5350",
        wickUpColor: "#26a69a",
      });
      series.setData(chartData);
    }

    chart.timeScale().fitContent();
    chartRef.current = { chart, series };

    // Handle chart resizing
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0 || entries[0].target !== chartContainerRef.current) {
        return;
      }
      const { width } = entries[0].contentRect;
      chart.applyOptions({ width });
    });

    resizeObserver.observe(chartContainerRef.current);

    // Cleanup on unmount or re-render
    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.chart.remove();
        chartRef.current = null;
      }
    };
  }, [chartData, chartType, isScriptLoaded, chartRange]); // Re-render if these change

  // --- Helper to style active buttons ---
  const getButtonClass = (isActive: boolean) => {
    return isActive
      ? "bg-blue-600 text-white"
      : "bg-gray-200 text-gray-700 hover:bg-gray-300";
  };

  return (
    <div className="w-full bg-gray-50 py-10 px-5 flex flex-col items-center min-h-screen font-sans">
      <h1 className="text-3xl font-bold mb-4 text-gray-800">
        📊 Trader View — Live Stock Search
      </h1>
      <p className="text-gray-600 mb-6">Powered by Finnhub.io</p>

      {/* --- Search Bar --- */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6 w-full max-w-md">
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Enter stock symbol (e.g., AAPL, MSFT)"
          className="flex-grow border border-gray-300 rounded-lg px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
        />
        <button
          onClick={fetchStockData}
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg text-lg font-semibold hover:bg-blue-700 transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {/* --- Loading & Error Messages --- */}
      {loading && <p className="text-gray-500 text-lg">Loading...</p>}
      {error && <p className="text-red-500 text-lg font-semibold">{error}</p>}

      {/* --- Stock Quote Data --- */}
      {stockData && (
        <div className="bg-white shadow-xl rounded-xl p-6 w-full max-w-md text-gray-800 animate-fade-in mb-6">
          <h2 className="text-2xl font-semibold mb-3">
            {stockData.longName || stockData.symbol}
          </h2>
          <div className="space-y-2">
            <p className="text-lg">
              <span className="font-medium text-gray-600">Symbol:</span>{" "}
              {stockData.symbol}
            </p>
            <p className="text-lg">
              <span className="font-medium text-gray-600">Price:</span>{" "}
              <span className="font-bold text-2xl">
                ${stockData.regularMarketPrice.toFixed(2)}
              </span>
            </p>
            <p className="text-lg">
              <span className="font-medium text-gray-600">Change:</span>{" "}
              <span
                className={`font-bold text-xl ${
                  stockData.regularMarketChange >= 0
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {stockData.regularMarketChange.toFixed(2)} (
                {stockData.regularMarketChangePercent.toFixed(2)}%)
              </span>
            </p>
          </div>
          <p className="text-sm text-gray-500 mt-4 pt-4 border-t border-gray-200">
            Market Time:{" "}
            {new Date(stockData.regularMarketTime * 1000).toLocaleString()}
          </p>
        </div>
      )}

      {/* --- NEW: Chart Section --- */}
      {stockData && (
        <div className="w-full max-w-4xl bg-white shadow-xl rounded-xl p-6 animate-fade-in">
          {/* Chart Controls */}
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
            {/* Range Selector */}
            <div className="flex gap-2 rounded-lg p-1 bg-gray-100">
              {(["1D", "1W", "1M", "1Y"] as ChartRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setChartRange(range)}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition ${getButtonClass(
                    chartRange === range
                  )}`}
                >
                  {range}
                </button>
              ))}
            </div>

            {/* Type Selector */}
            <div className="flex gap-2 rounded-lg p-1 bg-gray-100">
              {(["line", "candle"] as ChartType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setChartType(type)}
                  className={`px-4 py-2 rounded-md font-medium text-sm transition ${getButtonClass(
                    chartType === type
                  )} capitalize`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Chart Container */}
          {loadingChart && (
            <div className="flex justify-center items-center h-96">
              <p className="text-gray-500">Loading chart data...</p>
            </div>
          )}

          {/* This div is where the chart will be rendered */}
          <div
            ref={chartContainerRef}
            className={`w-full h-[400px] ${loadingChart ? "hidden" : ""}`}
          ></div>

          {!loadingChart && !chartData && (
            <div className="flex justify-center items-center h-96">
                <p className="text-gray-500">No chart data available for this range.</p>
            </div>
          )}
        </div>
      )}

      {/* Basic styling for the fade-in animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

