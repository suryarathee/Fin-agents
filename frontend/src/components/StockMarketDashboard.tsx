import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  createChart,
  type IChartApi,
  type CandlestickData,
  type Time,
  ColorType,
  CrosshairMode,
  LineStyle,
} from "lightweight-charts";
import axios from "axios";

interface StockInfo {
  symbol: string;
  name: string;
  exchange?: string;
  country?: string;
}

interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  marketCap?: number;
  high?: number;
  low?: number;
  open?: number;
  previousClose?: number;
}

interface CandleData extends CandlestickData {
  time: Time;
}

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

// Free API endpoints - You can replace with your preferred API
const ALPHA_VANTAGE_API_KEY = import.meta.env.VITE_ALPHA_VANTAGE_API_KEY || "demo";

export const StockMarketDashboard: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockInfo | null>(null);
  const [stockQuote, setStockQuote] = useState<StockQuote | null>(null);
  const [candleData, setCandleData] = useState<CandleData[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingChart, setLoadingChart] = useState<boolean>(false);
  const [timeframe, setTimeframe] = useState<"1D" | "1W" | "1M" | "3M" | "6M" | "1Y">("1M");
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ReturnType<IChartApi["addCandlestickSeries"]> | null>(null);
  const priceLineRef = useRef<ReturnType<ReturnType<IChartApi["addCandlestickSeries"]>["createPriceLine"]> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const chartInitialized = useRef<boolean>(false);

  // Search for stocks using Alpha Vantage or alternative
  const searchStocks = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 1) {
      setSearchResults([]);
      return;
    }

    try {
      // Try using Alpha Vantage search endpoint
      const response = await axios.get(
        `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${ALPHA_VANTAGE_API_KEY}`
      );

      if (response.data.bestMatches) {
        const results: SearchResult[] = response.data.bestMatches.map((match: any) => ({
          symbol: match["1. symbol"],
          name: match["2. name"],
          exchange: match["4. region"],
          type: match["3. type"],
        }));
        setSearchResults(results.slice(0, 10)); // Limit to 10 results
        setShowSearchResults(true);
      }
    } catch (error) {
      console.error("Search error:", error);
      // Fallback: Create mock results for demo
      if (query.length >= 1) {
        const mockResults: SearchResult[] = [
          { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", type: "Equity" },
          { symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", type: "Equity" },
          { symbol: "GOOGL", name: "Alphabet Inc.", exchange: "NASDAQ", type: "Equity" },
          { symbol: "AMZN", name: "Amazon.com Inc.", exchange: "NASDAQ", type: "Equity" },
          { symbol: "TSLA", name: "Tesla Inc.", exchange: "NASDAQ", type: "Equity" },
          { symbol: "META", name: "Meta Platforms Inc.", exchange: "NASDAQ", type: "Equity" },
          { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", type: "Equity" },
          { symbol: "JPM", name: "JPMorgan Chase & Co.", exchange: "NYSE", type: "Equity" },
          { symbol: "V", name: "Visa Inc.", exchange: "NYSE", type: "Equity" },
          { symbol: "JNJ", name: "Johnson & Johnson", exchange: "NYSE", type: "Equity" },
        ].filter(item => 
          item.symbol.toLowerCase().includes(query.toLowerCase()) ||
          item.name.toLowerCase().includes(query.toLowerCase())
        );
        setSearchResults(mockResults);
        setShowSearchResults(true);
      }
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchStocks(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchStocks]);

  // Fetch stock quote
  const fetchStockQuote = async (symbol: string) => {
    setLoading(true);
    setError("");
    try {
      // Try using your backend API first
      try {
        const response = await axios.get(
          `http://127.0.0.1:8000/api/stock?symbol=${symbol}&period=6mo`
        );
        
        if (response.data && response.data.prices && response.data.prices.length > 0) {
          const latest = response.data.prices[response.data.prices.length - 1];
          const previous = response.data.prices[response.data.prices.length - 2] || latest;
          const change = latest.close - previous.close;
          const changePercent = (change / previous.close) * 100;
          
          setStockQuote({
            symbol: symbol,
            name: selectedStock?.name || symbol,
            price: latest.close,
            change: change,
            changePercent: changePercent,
            high: latest.high,
            low: latest.low,
            open: latest.open,
          });
        }
      } catch (backendError) {
        // Fallback to Alpha Vantage
        const quoteResponse = await axios.get(
          `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`
        );

        if (quoteResponse.data["Global Quote"]) {
          const quote = quoteResponse.data["Global Quote"];
          setStockQuote({
            symbol: quote["01. symbol"],
            name: selectedStock?.name || quote["01. symbol"],
            price: parseFloat(quote["05. price"]),
            change: parseFloat(quote["09. change"]),
            changePercent: parseFloat(quote["10. change percent"].replace("%", "")),
            high: parseFloat(quote["03. high"]),
            low: parseFloat(quote["04. low"]),
            open: parseFloat(quote["02. open"]),
            previousClose: parseFloat(quote["08. previous close"]),
            volume: parseInt(quote["06. volume"]),
          });
        } else {
          setError("Unable to fetch stock data. Please try again.");
        }
      }
    } catch (error) {
      console.error("Error fetching quote:", error);
      setError("Failed to fetch stock quote. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch candlestick data
  const fetchCandleData = async (symbol: string) => {
    setLoadingChart(true);
    setError("");
    try {
      // Try backend API first
      try {
        const periodMap: Record<string, string> = {
          "1D": "1d",
          "1W": "1w",
          "1M": "1mo",
          "3M": "3mo",
          "6M": "6mo",
          "1Y": "1y",
        };
        
        const response = await axios.get(
          `http://127.0.0.1:8000/api/stock?symbol=${symbol}&period=${periodMap[timeframe]}`
        );

        if (response.data && response.data.prices) {
          const candles: CandleData[] = response.data.prices.map((d: any) => ({
            time: d.date as Time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
          }));
          setCandleData(candles);
        }
      } catch (backendError) {
        // Fallback to Alpha Vantage
        const interval = timeframe === "1D" ? "60min" : timeframe === "1W" ? "60min" : "daily";
        const outputSize = timeframe === "1D" || timeframe === "1W" ? "compact" : "full";
        
        const response = await axios.get(
          `https://www.alphavantage.co/query?function=TIME_SERIES_${interval === "daily" ? "DAILY" : "INTRADAY"}&symbol=${symbol}&interval=${interval}&outputsize=${outputSize}&apikey=${ALPHA_VANTAGE_API_KEY}`
        );

        const timeSeriesKey = interval === "daily" 
          ? "Time Series (Daily)"
          : `Time Series (${interval})`;

        if (response.data[timeSeriesKey]) {
          const timeSeries = response.data[timeSeriesKey];
          const candles: CandleData[] = Object.entries(timeSeries)
            .map(([time, data]: [string, any]) => ({
              time: (interval === "daily" ? time : time.replace(" ", "T")) as Time,
              open: parseFloat(data["1. open"]),
              high: parseFloat(data["2. high"]),
              low: parseFloat(data["3. low"]),
              close: parseFloat(data["4. close"]),
            }))
            .sort((a, b) => {
              const timeA = typeof a.time === "string" ? new Date(a.time).getTime() : (a.time as number);
              const timeB = typeof b.time === "string" ? new Date(b.time).getTime() : (b.time as number);
              return timeA - timeB;
            });

          // Filter based on timeframe
          const now = Date.now();
          const filterTime = {
            "1D": 24 * 60 * 60 * 1000,
            "1W": 7 * 24 * 60 * 60 * 1000,
            "1M": 30 * 24 * 60 * 60 * 1000,
            "3M": 90 * 24 * 60 * 60 * 1000,
            "6M": 180 * 24 * 60 * 60 * 1000,
            "1Y": 365 * 24 * 60 * 60 * 1000,
          }[timeframe];

          const filtered = candles.filter((candle) => {
            const candleTime = typeof candle.time === "string" ? new Date(candle.time).getTime() : (candle.time as number) * 1000;
            return now - candleTime <= filterTime;
          });

          setCandleData(filtered);
        } else {
          setError("No chart data available for this symbol.");
        }
      }
    } catch (error) {
      console.error("Error fetching candle data:", error);
      setError("Failed to load chart data.");
    } finally {
      setLoadingChart(false);
    }
  };

  // Handle stock selection
  const handleStockSelect = (result: SearchResult) => {
    const stockInfo: StockInfo = {
      symbol: result.symbol,
      name: result.name,
      exchange: result.exchange,
    };
    setSelectedStock(stockInfo);
    setSearchQuery(result.symbol);
    setShowSearchResults(false);
    setCandleData([]); // Clear previous data
    fetchStockQuote(result.symbol);
    fetchCandleData(result.symbol);
  };

  // Initialize chart - only once
  useEffect(() => {
    if (!chartContainerRef.current || chartInitialized.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 600,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#333",
        fontSize: 12,
      },
      grid: {
        vertLines: {
          color: "#e0e0e0",
          style: LineStyle.SparseDotted,
        },
        horzLines: {
          color: "#e0e0e0",
          style: LineStyle.SparseDotted,
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          width: 1,
          color: "#758696",
          style: LineStyle.Solid,
          labelBackgroundColor: "#758696",
          labelVisible: true,
        },
        horzLine: {
          width: 1,
          color: "#758696",
          style: LineStyle.Solid,
          labelBackgroundColor: "#758696",
          labelVisible: true,
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      rightPriceScale: {
        borderColor: "#cccccc",
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor: "#cccccc",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderDownColor: "#ef5350",
      borderUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      wickUpColor: "#26a69a",
      priceFormat: {
        type: "price",
        precision: 2,
        minMove: 0.01,
      },
    });

    seriesRef.current = candlestickSeries;
    chartInitialized.current = true;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        chartInitialized.current = false;
      }
    };
  }, []);

  // Update chart data when it changes
  useEffect(() => {
    if (seriesRef.current && candleData.length > 0 && chartRef.current) {
      seriesRef.current.setData(candleData);
      chartRef.current.timeScale().fitContent();

      // Add current price line
      if (stockQuote) {
        if (priceLineRef.current) {
          seriesRef.current.removePriceLine(priceLineRef.current);
        }
        priceLineRef.current = seriesRef.current.createPriceLine({
          price: stockQuote.price,
          color: "#2962FF",
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "Current Price",
        });
      }
    }
  }, [candleData, stockQuote]);

  // Refresh data when timeframe changes
  useEffect(() => {
    if (selectedStock) {
      fetchCandleData(selectedStock.symbol);
    }
  }, [timeframe]);

  // Handle click outside to close search results
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="w-full min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            📈 Live Stock Market Dashboard
          </h1>
          <p className="text-gray-600">Search and analyze stocks from around the world</p>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6" ref={searchContainerRef}>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchResults(true);
                }}
                onFocus={() => setShowSearchResults(true)}
                placeholder="Search for stocks (e.g., AAPL, MSFT, TSLA)..."
                className="w-full px-4 py-3 text-lg border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition"
              />
              {showSearchResults && searchResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-96 overflow-y-auto">
                  {searchResults.map((result, index) => (
                    <div
                      key={index}
                      onClick={() => handleStockSelect(result)}
                      className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition"
                    >
                      <div className="font-semibold text-gray-800">{result.symbol}</div>
                      <div className="text-sm text-gray-600">{result.name}</div>
                      <div className="text-xs text-gray-500">{result.exchange} • {result.type}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                if (searchQuery.trim()) {
                  handleStockSelect({
                    symbol: searchQuery.trim().toUpperCase(),
                    name: searchQuery.trim(),
                    exchange: "Unknown",
                    type: "Equity",
                  });
                }
              }}
              disabled={loading || !searchQuery.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? "Loading..." : "Search"}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Stock Quote Card */}
        {stockQuote && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-1">
                  {stockQuote.name} ({stockQuote.symbol})
                </h2>
                {selectedStock?.exchange && (
                  <p className="text-sm text-gray-500">{selectedStock.exchange}</p>
                )}
              </div>
              <div className="mt-4 md:mt-0 text-right">
                <div className="text-3xl font-bold text-gray-800 mb-1">
                  ${stockQuote.price.toFixed(2)}
                </div>
                <div
                  className={`text-lg font-semibold ${
                    stockQuote.change >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {stockQuote.change >= 0 ? "+" : ""}
                  {stockQuote.change.toFixed(2)} ({stockQuote.changePercent >= 0 ? "+" : ""}
                  {stockQuote.changePercent.toFixed(2)}%)
                </div>
              </div>
            </div>
            {stockQuote.high && stockQuote.low && (
              <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Open:</span>
                  <span className="ml-2 font-semibold">${stockQuote.open?.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-500">High:</span>
                  <span className="ml-2 font-semibold text-green-600">${stockQuote.high.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Low:</span>
                  <span className="ml-2 font-semibold text-red-600">${stockQuote.low.toFixed(2)}</span>
                </div>
                {stockQuote.volume && (
                  <div>
                    <span className="text-gray-500">Volume:</span>
                    <span className="ml-2 font-semibold">{stockQuote.volume.toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Chart Container */}
        {selectedStock && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            {/* Timeframe Selector */}
            <div className="flex flex-wrap gap-2 mb-4">
              {(["1D", "1W", "1M", "3M", "6M", "1Y"] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-4 py-2 rounded-lg font-medium transition ${
                    timeframe === tf
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Chart */}
            {loadingChart ? (
              <div className="flex items-center justify-center h-96">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                  <p className="text-gray-600">Loading chart data...</p>
                </div>
              </div>
            ) : (
              <div
                ref={chartContainerRef}
                className="w-full border border-gray-200 rounded-lg overflow-hidden"
                style={{ height: "600px", minHeight: "600px" }}
              />
            )}

            {!loadingChart && candleData.length === 0 && !error && (
              <div className="flex items-center justify-center h-96 text-gray-500">
                <p>No chart data available for this timeframe.</p>
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        {!selectedStock && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
            <p className="text-gray-700 text-lg">
              🔍 Start by searching for a stock symbol above (e.g., AAPL, MSFT, TSLA)
            </p>
            <p className="text-gray-600 text-sm mt-2">
              You can search for stocks from various exchanges worldwide
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
