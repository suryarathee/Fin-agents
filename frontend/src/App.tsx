import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity, TrendingUp, TrendingDown, Globe, X, Search,
  AlertCircle, Wifi, WifiOff, Loader2, BarChart2, MessageSquare, Send, Minimize2
} from 'lucide-react';
import API_URL from './config';
// let API_URL = ' http://127.0.0.1:8000/'
// --- Types ---
interface StockData {
  symbol: string;
  price: number;
  change: number; // Daily change
  percentChange: number; // Daily percent change
  high: number;
  low: number;
  open: number;
}

interface FinnhubTrade {
  s: string; // Symbol
  p: number; // Price
  t: number; // Timestamp
  v: number; // Volume
}

interface FinnhubMessage {
  type: string;
  data: FinnhubTrade[];
}

interface SearchResult {
  description: string;
  displaySymbol: string;
  symbol: string;
  type: string;
}

interface FinnhubSearchResponse {
  count: number;
  result: SearchResult[];
}

interface ChatMessage {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

declare global {
  interface Window {
    TradingView: any;
  }
}

// --- Components ---

// 2. TradingView Widget Component
const TradingViewWidget = ({ symbol }: { symbol: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = "tradingview_widget";

  useEffect(() => {
    const initWidget = () => {
      if (window.TradingView && containerRef.current) {
        containerRef.current.innerHTML = "";
        const div = document.createElement("div");
        div.id = widgetId;
        div.style.height = "100%";
        div.style.width = "100%";
        containerRef.current.appendChild(div);

        new window.TradingView.widget({
          "autosize": true,
          "symbol": symbol,
          "interval": "D",
          "timezone": "Etc/UTC",
          "theme": "dark",
          "style": "1",
          "locale": "en",
          "enable_publishing": false,
          "allow_symbol_change": true,
          "container_id": widgetId,
          "hide_side_toolbar": false,
          "details": true,
          "toolbar_bg": "#1f2937",
        });
      }
    };

    const scriptId = 'tradingview-widget-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = initWidget;
      document.head.appendChild(script);
    } else {
      if (window.TradingView) {
        initWidget();
      } else {
        const checkExist = setInterval(() => {
          if (window.TradingView) {
            initWidget();
            clearInterval(checkExist);
          }
        }, 100);
      }
    }
  }, [symbol]);

  return (
    <div className="relative w-full h-[500px] bg-gray-800 rounded-xl overflow-hidden border border-gray-700 shadow-2xl mb-8">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};

// 3. Symbol Search Component
const SymbolSearch = ({ apiKey, onSelect, placeholder = "Search symbol..." }: { apiKey: string, onSelect: (symbol: string) => void, placeholder?: string }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  useEffect(() => {
    const timeOutId = setTimeout(async () => {
      if (query.trim().length > 0 && apiKey) {
        setIsLoading(true);
        try {
          const response = await fetch(`https://finnhub.io/api/v1/search?q=${query}&token=${apiKey}`);
          const data: FinnhubSearchResponse = await response.json();
          if (data && data.result) {
            setResults(data.result.slice(0, 8));
            setIsOpen(true);
          }
        } catch (error) {
          console.error("Search failed", error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setResults([]);
        setIsOpen(false);
      }
    }, 500);

    return () => clearTimeout(timeOutId);
  }, [query, apiKey]);

  const handleSelect = (symbol: string) => {
    onSelect(symbol);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative w-full max-w-md">
      <div className="relative group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-gray-800 border border-gray-700 text-sm rounded-lg pl-10 pr-10 py-2.5 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-white placeholder-gray-500"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden max-h-80 overflow-y-auto">
          {results.map((item) => (
            <button
              key={`${item.symbol}-${item.type}`}
              onClick={() => handleSelect(item.symbol)}
              className="w-full text-left px-4 py-3 hover:bg-gray-700/50 flex flex-col transition-colors border-b border-gray-700/50 last:border-0"
            >
              <div className="flex justify-between items-center w-full">
                <span className="font-bold text-white text-sm">{item.displaySymbol}</span>
                <span className="text-[10px] uppercase bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">{item.type}</span>
              </div>
              <span className="text-xs text-gray-400 truncate w-full">{item.description}</span>
            </button>
          ))}
        </div>
      )}

      {isOpen && results.length === 0 && !isLoading && query.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-4 text-center text-gray-400 text-sm">
          No symbols found
        </div>
      )}
    </div>
  );
};

// 4. Stock Card
const StockCard = ({ data, onRemove, onClick, isActive }: { data: StockData; onRemove: (s: string) => void; onClick: () => void; isActive: boolean }) => {
  const price = data.price ?? 0;
  const change = data.change ?? 0;
  const percentChange = data.percentChange ?? 0;
  const open = data.open ?? 0;
  const high = data.high ?? 0;

  const isPositive = percentChange >= 0;
  const [flash, setFlash] = useState<'green' | 'red' | null>(null);
  const prevPrice = useRef(price);

  useEffect(() => {
    if (price > prevPrice.current) setFlash('green');
    else if (price < prevPrice.current) setFlash('red');

    const timer = setTimeout(() => setFlash(null), 300);
    prevPrice.current = price;
    return () => clearTimeout(timer);
  }, [price]);

  return (
    <div
      onClick={onClick}
      className={`relative bg-gray-800 rounded-xl p-6 border transition-all duration-300 cursor-pointer group 
        ${isActive ? 'ring-2 ring-blue-500 border-transparent' : ''}
        ${flash === 'green' ? 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : flash === 'red' ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'border-gray-700 hover:border-gray-500 hover:shadow-lg hover:shadow-blue-500/10'}
      `}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(data.symbol);
        }}
        className="absolute top-4 right-4 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 z-10"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-white tracking-wide">{data.symbol}</h3>
          <span className="text-xs font-medium text-gray-400 px-2 py-1 bg-gray-900 rounded mt-1 inline-block">
            LIVE
          </span>
        </div>
        <div className={`p-2 rounded-full ${isPositive ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          {isPositive ? (
            <TrendingUp className="w-6 h-6 text-green-500" />
          ) : (
            <TrendingDown className="w-6 h-6 text-red-500" />
          )}
        </div>
      </div>

      <div className="mb-4">
        <div className={`text-3xl font-bold transition-colors duration-300 ${flash === 'green' ? 'text-green-400' : flash === 'red' ? 'text-red-400' : 'text-white'}`}>
          {price.toFixed(2)}
        </div>
        <div className={`flex items-center mt-1 text-sm font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
          <span>{change > 0 ? '+' : ''}{change.toFixed(2)}</span>
          <span className="mx-2">•</span>
          <span>{percentChange.toFixed(2)}%</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-gray-700 pt-4">
        <div>
          <p className="text-gray-500 text-xs uppercase mb-1">Open</p>
          <p className="text-gray-300 font-mono">{open.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs uppercase mb-1">High</p>
          <p className="text-gray-300 font-mono">{high.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
};

// 5. Main Dashboard App (Includes Chatbot Logic)
export default function App() {
  const [apiKey] = useState<string>(import.meta.env.VITE_FINNHUB_API_KEY || '');
  const [symbols, setSymbols] = useState<string[]>(['AAPL', 'BINANCE:BTCUSDT', 'TSLA', 'MSFT', 'AMZN']);
  const [stockData, setStockData] = useState<Record<string, StockData>>({});
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [activeSymbol, setActiveSymbol] = useState<string>('SPY');
  const socketRef = useRef<WebSocket | null>(null);

  // Chatbot State
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInputValue, setChatInputValue] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Style Fix: Inject Tailwind CSS ---
  useEffect(() => {
    // Check if Tailwind is already loaded
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = "https://cdn.tailwindcss.com";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  // --- Chatbot Logic ---

  useEffect(() => {
    // Initial welcome message
    setMessages([
      {
        id: Date.now(),
        text: "Hello! I am your financial agent. Ask me about stock analysis, market trends, or any financial questions.",
        sender: 'bot',
        timestamp: new Date(),
      }
    ]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSidebarOpen]);

  const pollChatResult = async (taskId: string) => {
    const startTime = Date.now();
    const TIMEOUT_MS = 120000; // 2 minutes
    const POLLING_INTERVAL = 3000; // 3 seconds
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;

    const intervalId = setInterval(async () => {
      // 1. Check for total timeout
      if (Date.now() - startTime > TIMEOUT_MS) {
        clearInterval(intervalId);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            text: 'Sorry, the agent took too long to respond.',
            sender: 'bot',
            timestamp: new Date(),
          },
        ]);
        setChatLoading(false);
        return;
      }

      // 2. Try to get the status
      try {
        const pollUrl = `${API_URL}/api/chat/status/${taskId}/`;
        console.log('Polling chat status from:', pollUrl);
        const response = await fetch(pollUrl);
        if (!response.ok) throw new Error('Network response was not ok');

        const data = await response.json();
        console.log('Poll response data:', data);
        const { status, result } = data;

        consecutiveErrors = 0;

        if (status === 'SUCCESS') {
          clearInterval(intervalId);
          if (result && typeof result.message === 'string') {
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now(),
                text: result.message,
                sender: 'bot',
                timestamp: new Date(),
              },
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now(),
                text: 'Received an invalid response from the agent.',
                sender: 'bot',
                timestamp: new Date(),
              },
            ]);
          }
          setChatLoading(false);
        } else if (status === 'FAILURE') {
          clearInterval(intervalId);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now(),
              text: 'Sorry, the task failed on the server.',
              sender: 'bot',
              timestamp: new Date(),
            },
          ]);
          setChatLoading(false);
        }
        // If 'PENDING', continue polling

      } catch (error) {
        console.error('Error polling chat status:', error);
        consecutiveErrors++;
        if (consecutiveErrors > MAX_CONSECUTIVE_ERRORS) {
          clearInterval(intervalId);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now(),
              text: 'Sorry, there was a connection error while fetching the response.',
              sender: 'bot',
              timestamp: new Date(),
            },
          ]);
          setChatLoading(false);
        }
      }
    }, POLLING_INTERVAL);
  };

  const sendChatMessage = async () => {
    if (!chatInputValue.trim()) return;

    const newUserMessage: ChatMessage = {
      id: Date.now(),
      text: chatInputValue,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, newUserMessage]);
    const currentInput = chatInputValue;
    setChatInputValue('');
    setChatLoading(true);

    try {
      const requestUrl = `${API_URL}/api/chat/`;
      console.log('Sending chat message to:', requestUrl, 'Payload:', { message: currentInput });
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: currentInput }),
      });

      if (!response.ok) throw new Error('Network response was not ok');

      const data = await response.json();
      console.log('Chat message sent, response:', data);
      const { task_id } = data;

      if (task_id) {
        await pollChatResult(task_id);
      } else {
        throw new Error('Failed to get a task ID from the server.');
      }
    } catch (error) {
      console.error('Error in sendChatMessage:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          text: 'Sorry, could not connect to the agent. Ensure your local backend is running at 127.0.0.1:8000.',
          sender: 'bot',
          timestamp: new Date(),
        },
      ]);
      setChatLoading(false);
    }
  };

  const handleChatKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  // --- End Chatbot Logic ---

  // --- Market Data Logic ---
  const fetchInitialData = useCallback(async (symbol: string) => {
    if (!apiKey) return;
    try {
      const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`);
      const data = await response.json();

      if (!data || typeof data.c !== 'number') return;

      setStockData(prev => ({
        ...prev,
        [symbol]: {
          symbol,
          price: data.c || 0,
          change: data.d || 0,
          percentChange: data.dp || 0,
          high: data.h || 0,
          low: data.l || 0,
          open: data.o || 0
        }
      }));
    } catch (error) {
      console.error(`Error fetching initial data for ${symbol}:`, error);
    }
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey) return;

    symbols.forEach(sym => fetchInitialData(sym));

    setStatus('connecting');
    const ws = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`);
    socketRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      symbols.forEach(symbol => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'subscribe', symbol }));
        }
      });
    };

    ws.onmessage = (event) => {
      try {
        const message: FinnhubMessage = JSON.parse(event.data);
        if (message.type === 'trade' && message.data) {
          const updates = message.data;
          setStockData(currentData => {
            const newData = { ...currentData };
            updates.forEach(trade => {
              const sym = trade.s;
              if (newData[sym]) {
                const currentOpen = newData[sym].open || trade.p;
                const tradePrice = trade.p;
                const change = tradePrice - currentOpen;
                const percentChange = currentOpen !== 0 ? (change / currentOpen) * 100 : 0;
                newData[sym] = {
                  ...newData[sym],
                  price: tradePrice,
                  change: change,
                  percentChange: percentChange,
                  high: Math.max(newData[sym].high || tradePrice, tradePrice),
                  low: Math.min(newData[sym].low || tradePrice, tradePrice)
                };
              }
            });
            return newData;
          });
        }
      } catch (e) {
        console.error("Error processing WebSocket message", e);
      }
    };

    ws.onclose = () => setStatus('disconnected');
    ws.onerror = (e) => {
      console.error("WebSocket Error", e);
      setStatus('disconnected');
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [apiKey, symbols, fetchInitialData]);

  const handleAddSymbol = (newSymbol: string) => {
    if (newSymbol && !symbols.includes(newSymbol)) {
      setSymbols(prev => [...prev, newSymbol]);
      fetchInitialData(newSymbol);
    }
  };

  const removeSymbol = (symbolToRemove: string) => {
    setSymbols(prev => prev.filter(s => s !== symbolToRemove));
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'unsubscribe', symbol: symbolToRemove }));
    }
    setStockData(prev => {
      const next = { ...prev };
      delete next[symbolToRemove];
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans selection:bg-blue-500/30 overflow-hidden">


      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-2.5 rounded-xl shadow-lg shadow-blue-500/20">
              <Globe className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">MarketFlow</h1>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-medium">Global Real-Time Data</span>
                {status === 'connected' ? (
                  <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded border border-green-400/20 uppercase font-bold tracking-wider">
                    <Wifi className="w-3 h-3" /> Live
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded border border-red-400/20 uppercase font-bold tracking-wider">
                    <WifiOff className="w-3 h-3" /> Offline
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="hidden sm:block w-72">
            <SymbolSearch apiKey={apiKey} onSelect={handleAddSymbol} placeholder="Add symbol (e.g. NVDA)" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="sm:hidden mb-6">
          <SymbolSearch apiKey={apiKey} onSelect={handleAddSymbol} placeholder="Search symbol..." />
        </div>

        {/* Chart Section */}
        {apiKey && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-bold text-white">Market Analysis: <span className="text-blue-400">{activeSymbol}</span></h2>
            </div>
            <TradingViewWidget symbol={activeSymbol} />
          </div>
        )}

        {Object.keys(stockData).length === 0 && apiKey && (
          <div className="flex flex-col items-center justify-center py-10 text-gray-500">
            <div className="animate-spin mb-4">
              <Activity className="w-8 h-8 text-blue-500" />
            </div>
            <p>Connecting to global exchanges...</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {symbols.map((symbol) => (
            stockData[symbol] ? (
              <StockCard
                key={symbol}
                data={stockData[symbol]}
                onRemove={removeSymbol}
                onClick={() => setActiveSymbol(symbol)}
                isActive={activeSymbol === symbol}
              />
            ) : (
              <div key={symbol} className="bg-gray-800/50 rounded-xl p-6 border border-gray-700/50 animate-pulse relative">
                <div className="h-6 bg-gray-700 rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-gray-700 rounded w-1/4 mb-6"></div>
                <div className="h-8 bg-gray-700 rounded w-1/2 mb-2"></div>
                <div className="h-4 bg-gray-700 rounded w-1/3"></div>
                <button onClick={() => removeSymbol(symbol)} className="absolute top-4 right-4 text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )
          ))}
        </div>

        <div className="mt-12 border-t border-gray-800 pt-8 text-center sm:text-left mb-20">
          <div className="bg-blue-900/20 border border-blue-900/50 rounded-lg p-4 inline-flex items-start gap-3 max-w-2xl">
            <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-200/80">
              <p className="font-semibold text-blue-100 mb-1">Market Data Note</p>
              <p>US Stocks, Forex (e.g., <code className="bg-blue-900/40 px-1 rounded">IC MARKETS:1</code>), and Crypto (e.g., <code className="bg-blue-900/40 px-1 rounded">BINANCE:BTCUSDT</code>) update in real-time via WebSocket. Other international exchanges may be delayed by 15 minutes or require polling depending on your Finnhub plan.</p>
            </div>
          </div>
        </div>
      </main>

      {/* --- Chatbot UI --- */}

      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsSidebarOpen(true)}
        className={`fixed bottom-6 right-6 p-4 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg shadow-blue-500/30 transition-all duration-300 z-50 ${isSidebarOpen ? 'opacity-0 scale-75 pointer-events-none' : 'opacity-100 scale-100'}`}
      >
        <MessageSquare className="w-6 h-6" />
      </button>

      {/* Sidebar Container */}
      <div className={`fixed inset-y-0 right-0 w-full sm:w-96 bg-gray-900 border-l border-gray-700 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-800">
            <div className="flex items-center gap-2">
              <div className="bg-blue-600/20 p-2 rounded-lg">
                <Activity className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="font-bold text-white">Financial Assistant</h3>
                <p className="text-xs text-green-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span> Online
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="text-gray-400 hover:text-white hover:bg-gray-700 p-2 rounded-lg transition-colors"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-900/95">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${msg.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-gray-800 text-gray-200 border border-gray-700 rounded-tl-sm'
                    }`}
                >
                  <p>{msg.text}</p>
                  <p className={`text-[10px] mt-1 ${msg.sender === 'user' ? 'text-blue-200' : 'text-gray-500'}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}

            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 bg-gray-800 border-t border-gray-700">
            <div className="flex gap-2 relative">
              <textarea
                value={chatInputValue}
                onChange={(e) => setChatInputValue(e.target.value)}
                onKeyDown={handleChatKeyPress}
                placeholder="Ask about market trends..."
                disabled={chatLoading}
                className="w-full bg-gray-900 text-white border border-gray-700 rounded-xl pl-4 pr-12 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none h-12 min-h-[48px] max-h-32 scrollbar-hide"
              />
              <button
                onClick={sendChatMessage}
                disabled={chatLoading || !chatInputValue.trim()}
                className="absolute right-2 top-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mt-2 text-center">
              AI responses may vary. Not financial advice.
            </p>
          </div>
        </div>
      </div>

      {/* Overlay for mobile when sidebar is open */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/50 z-40 sm:hidden backdrop-blur-sm"
        />
      )}

    </div>
  );
}