import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity, TrendingUp, TrendingDown, Globe, X, Search,
  AlertCircle, Wifi, WifiOff, Loader2, BarChart2, Send, Minimize2, Maximize2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// import API_URL from './config';
import LoadingScreen from './components/LoadingScreen';
import MarketClock from './components/MarketClock';
import SentimentTreemap from './components/SentimentTreemap';
import { TradingViewWidget } from './components/TradingViewWidget';
let API_URL = 'https://fin-agents-a0zk.onrender.com/'
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
  exchange?: string;
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

import { StockChart } from './components/StockChart';

// 3. Symbol Search Component
const SymbolSearch = ({ onSelect, placeholder = "Search symbol..." }: { onSelect: (symbol: string) => void, placeholder?: string }) => {
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
      // Logic changed: allow search even if apiKey is missing, 
      // or we can remove apiKey prop requirement effectively since we proxy via backend.
      // But query length check remains.
      if (query.trim().length > 0) {
        setIsLoading(true);
        try {
          const response = await fetch(`${API_URL}api/search/?q=${query}`);
          const data = await response.json();
          if (data && data.result) {
            setResults(data.result);
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
  }, [query]); // Removed apiKey dependency

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
          {results.map((item, index) => (
            <button
              // Using index as fallback key since symbols can be duplicated across exchanges
              key={`${item.symbol}-${index}`}
              onClick={() => handleSelect(item.symbol)}
              className="w-full text-left px-4 py-3 hover:bg-gray-700/50 flex flex-col transition-colors border-b border-gray-700/50 last:border-0"
            >
              <div className="flex justify-between items-center w-full">
                <span className="font-bold text-white text-sm">{item.symbol}</span>
                <span className="text-[10px] uppercase bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">{item.type} • {item.exchange || 'N/A'}</span>
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
  const [isLoading, setIsLoading] = useState(true);
  const [apiKey] = useState<string>(import.meta.env.VITE_FINNHUB_API_KEY || '');
  const [symbols, setSymbols] = useState<string[]>([
    'AAPL', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA', 'NFLX',
    'AMD', 'INTC', 'BABA', 'PYPL', 'SHOP', 'SNAP', 'UBER', 'LYFT',
    'COIN', 'SQ', 'PLTR', 'RIVN'
  ]);
  const [stockData, setStockData] = useState<Record<string, StockData>>({});
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [activeSymbol, setActiveSymbol] = useState<string>('SPY');
  const [sentimentData, setSentimentData] = useState<any[]>([]);
  const [isSentimentLoading, setIsSentimentLoading] = useState(true);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  // Chatbot State
  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(false);
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
        id: Date.now() + 1,
        text: "⚠️ Note: The first response may take up to 3 minutes while the server initializes. Retry until you get a response.",
        sender: 'bot',
        timestamp: new Date(),
      }
    ]);

    // Fetch Sentiment Data
    const fetchSentiment = async () => {
      try {
        const response = await fetch(`${API_URL}api/market-sentiment/`);
        if (response.ok) {
          const data = await response.json();
          setSentimentData(data);
        }
      } catch (e) {
        console.error("Failed to fetch sentiment map", e);
      } finally {
        setIsSentimentLoading(false);
      }
    };

    fetchSentiment();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const pollChatResult = async (taskId: string) => {
    const startTime = Date.now();
    const TIMEOUT_MS = 120000; // 2 minutes
    const POLLING_INTERVAL = 3000; // 3 seconds
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;
    let isDone = false; // guard: prevents duplicate messages from concurrent async ticks

    const intervalId = setInterval(async () => {
      // Already handled — skip this tick
      if (isDone) return;

      // 1. Check for total timeout
      if (Date.now() - startTime > TIMEOUT_MS) {
        isDone = true;
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
        const pollUrl = `${API_URL}api/chat/status/${taskId}/`;
        console.log('Polling chat status from:', pollUrl);
        const response = await fetch(pollUrl);
        if (!response.ok) throw new Error('Network response was not ok');

        const data = await response.json();
        console.log('Poll response data:', data);
        const { status, result } = data;

        consecutiveErrors = 0;

        if (status === 'SUCCESS') {
          if (isDone) return; // another tick already handled it
          isDone = true;
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
          if (isDone) return;
          isDone = true;
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
          if (isDone) return;
          isDone = true;
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

  const processMessage = async (messageText: string) => {
    setChatLoading(true);

    const MAX_RETRIES = 10;
    const RETRY_BASE_DELAY = 5000; // 5s base, doubles up to 60s
    const WARMING_MSG_ID = -999; // stable ID for the warming-up message

    // Show a warming-up indicator (only once)
    let warmingShown = false;

    const showWarming = () => {
      if (!warmingShown) {
        warmingShown = true;
        setMessages((prev) => [
          ...prev,
          {
            id: WARMING_MSG_ID,
            text: '⏳ Server is warming up… retrying automatically, please wait.',
            sender: 'bot' as const,
            timestamp: new Date(),
          },
        ]);
      }
    };

    const removeWarming = () => {
      setMessages((prev) => prev.filter((m) => m.id !== WARMING_MSG_ID));
    };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const requestUrl = `${API_URL}api/chat/`;
        console.log(`[attempt ${attempt + 1}] Sending chat to:`, requestUrl);
        const response = await fetch(requestUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: messageText }),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const { task_id } = data;

        if (!task_id) throw new Error('No task_id returned.');

        // Success — remove warming indicator and start polling
        removeWarming();
        await pollChatResult(task_id);
        return; // done

      } catch (error) {
        console.warn(`[attempt ${attempt + 1}] Chat POST failed:`, error);

        if (attempt === MAX_RETRIES) {
          // All retries exhausted
          removeWarming();
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now() + 1,
              text: '❌ Could not reach the server after several retries. Please try again later.',
              sender: 'bot' as const,
              timestamp: new Date(),
            },
          ]);
          setChatLoading(false);
          return;
        }

        // Show warming indicator on first failure
        showWarming();

        // Exponential backoff: 5s, 10s, 20s, 40s, 60s, 60s, …
        const delay = Math.min(RETRY_BASE_DELAY * Math.pow(2, attempt), 60000);
        console.log(`Retrying in ${delay / 1000}s…`);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  };

  const hasInitialized = useRef(false);

  useEffect(() => {
    // Send silent "hey" on mount, but only once
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      processMessage("hey");
    }
  }, []);

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

    await processMessage(currentInput);
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
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans selection:bg-blue-500/30">

      {isLoading && <LoadingScreen onComplete={() => setIsLoading(false)} />}


      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-md sticky top-0 z-40">
        <MarketClock />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-2.5 rounded-xl shadow-lg shadow-blue-500/20">
              <Globe className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Fin-agents</h1>
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
            <SymbolSearch onSelect={handleAddSymbol} placeholder="Add symbol (e.g. NVDA)" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="sm:hidden mb-6">
          <SymbolSearch onSelect={handleAddSymbol} placeholder="Search symbol..." />
        </div>

        {/* Main layout: chart+chat on left, stocks sidebar on right */}
        <div className="flex gap-6">
          {/* Left column: chart + chat */}
          <div className="flex-1 min-w-0">
            {apiKey && (
              <div className="mb-8 relative">
                <div className="flex justify-end mb-4">
                  <button
                    onClick={() => setIsLiveMode(!isLiveMode)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all ${isLiveMode
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20'
                      : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
                      }`}
                  >
                    {isLiveMode ? (
                      <>
                        <Activity className="w-4 h-4" /> Live Mode Active
                      </>
                    ) : (
                      <>
                        <Wifi className="w-4 h-4" /> Go Live
                      </>
                    )}
                  </button>
                </div>

                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-2xl h-[500px]">
                  {!isLiveMode && (
                    <div className="h-full w-full">
                      <TradingViewWidget symbol={activeSymbol} />
                    </div>
                  )}
                  <div style={{ display: isLiveMode ? 'block' : 'none', height: '100%' }}>
                    <StockChart symbol={activeSymbol} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar: Compact Stock List */}
          <div className="w-72 flex-shrink-0">
            <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl overflow-hidden backdrop-blur-sm sticky top-24">
              {/* Sidebar Header */}
              <div className="px-4 py-3 border-b border-gray-700/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-bold text-white">Watchlist</span>
                </div>
                <span className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${status === 'connected'
                  ? 'text-green-400 bg-green-400/10 border-green-400/20'
                  : 'text-red-400 bg-red-400/10 border-red-400/20'
                  }`}>
                  {status === 'connected' ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                  {status === 'connected' ? 'Live' : 'Off'}
                </span>
              </div>

              {/* Stock Rows */}
              <div className="overflow-y-auto max-h-[calc(100vh-180px)] divide-y divide-gray-700/40">
                {symbols.map((symbol) => {
                  const d = stockData[symbol];
                  const isPos = d ? d.percentChange >= 0 : true;
                  const isActive = activeSymbol === symbol;
                  return (
                    <div
                      key={symbol}
                      onClick={() => setActiveSymbol(symbol)}
                      className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-all duration-150 group
                        ${isActive ? 'bg-blue-600/20 border-l-2 border-blue-500' : 'hover:bg-gray-700/40 border-l-2 border-transparent'}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${d ? (isPos ? 'bg-green-400' : 'bg-red-400') : 'bg-gray-600 animate-pulse'}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{symbol}</p>
                          {d && (
                            <p className={`text-[10px] font-medium ${isPos ? 'text-green-400' : 'text-red-400'}`}>
                              {d.percentChange > 0 ? '+' : ''}{d.percentChange.toFixed(2)}%
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        {d ? (
                          <>
                            <p className="text-sm font-mono text-white">${d.price.toFixed(2)}</p>
                            <p className={`text-[10px] font-mono ${isPos ? 'text-green-400' : 'text-red-400'}`}>
                              {d.change > 0 ? '+' : ''}{d.change.toFixed(2)}
                            </p>
                          </>
                        ) : (
                          <div className="space-y-1">
                            <div className="h-3.5 w-14 bg-gray-700 rounded animate-pulse" />
                            <div className="h-2.5 w-10 bg-gray-700 rounded animate-pulse" />
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeSymbol(symbol); }}
                        className="ml-2 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Add Symbol */}
              <div className="p-2 border-t border-gray-700/60">
                <SymbolSearch onSelect={handleAddSymbol} placeholder="+ Add symbol" />
              </div>
            </div>
          </div>
        </div>
        {/* Chat section below the main+sidebar layout */}
        <div className="mt-8 mb-8">
          <div className={`w-full ${isSidebarExpanded ? 'h-[820px]' : 'h-[620px]'} border border-gray-700/60 rounded-2xl shadow-2xl flex flex-col transition-all duration-300 overflow-hidden`} style={{ background: 'linear-gradient(145deg, #0f172a 0%, #111827 100%)' }}>

            {/* Chat Header */}
            <div className="flex-shrink-0 px-6 py-4 flex justify-between items-center border-b border-gray-700/50" style={{ background: 'linear-gradient(90deg, rgba(37,99,235,0.15) 0%, rgba(99,102,241,0.08) 100%)' }}>
              <div className="flex items-center gap-3">
                {/* Bot Avatar */}
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #2563eb, #6366f1)' }}>
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-gray-900" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base tracking-tight">Fin-Agent AI</h3>
                  <p className="text-xs text-green-400 flex items-center gap-1.5 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                    Online · Powered by Gemini
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500 hidden sm:block">Press Enter to send</span>
                <button
                  onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
                  className="text-gray-400 hover:text-white hover:bg-white/10 p-2 rounded-lg transition-all hidden sm:block"
                  title={isSidebarExpanded ? "Collapse" : "Expand"}
                >
                  {isSidebarExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5" style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent' }}>
              {messages.map((msg) => (
                <div key={msg.id} className={`flex items-end gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>

                  {/* Bot avatar */}
                  {msg.sender === 'bot' && (
                    <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center mb-1" style={{ background: 'linear-gradient(135deg, #2563eb, #6366f1)' }}>
                      <TrendingUp className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}

                  <div className={`max-w-[78%] flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-md ${msg.sender === 'user'
                        ? 'text-white rounded-br-sm'
                        : 'text-gray-100 border border-gray-700/60 rounded-bl-sm backdrop-blur-sm'
                        }`}
                      style={msg.sender === 'user'
                        ? { background: 'linear-gradient(135deg, #2563eb, #4f46e5)' }
                        : { background: 'rgba(31, 41, 55, 0.85)' }
                      }
                    >
                      <div className="prose prose-sm max-w-none prose-invert">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ node, ...props }: any) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
                            ul: ({ node, ...props }: any) => <ul className="list-disc ml-4 mb-2 space-y-0.5" {...props} />,
                            ol: ({ node, ...props }: any) => <ol className="list-decimal ml-4 mb-2 space-y-0.5" {...props} />,
                            li: ({ node, ...props }: any) => <li className="text-sm" {...props} />,
                            strong: ({ node, ...props }: any) => <strong className="font-semibold text-white" {...props} />,
                            em: ({ node, ...props }: any) => <em className="italic text-blue-300" {...props} />,
                            h1: ({ node, ...props }: any) => <h1 className="text-base font-bold text-white mb-2 mt-1" {...props} />,
                            h2: ({ node, ...props }: any) => <h2 className="text-sm font-bold text-white mb-1.5 mt-1" {...props} />,
                            h3: ({ node, ...props }: any) => <h3 className="text-sm font-semibold text-blue-300 mb-1 mt-1" {...props} />,
                            a: ({ node, ...props }: any) => <a className="text-blue-400 hover:text-blue-200 underline underline-offset-2 transition-colors" target="_blank" rel="noopener noreferrer" {...props} />,
                            blockquote: ({ node, ...props }: any) => <blockquote className="border-l-2 border-blue-500/60 pl-3 py-0.5 my-2 text-gray-300 italic bg-blue-500/5 rounded-r" {...props} />,
                            hr: ({ node, ...props }: any) => <hr className="border-gray-600 my-2" {...props} />,
                            table: ({ node, ...props }: any) => <div className="overflow-x-auto my-2"><table className="w-full text-xs border-collapse" {...props} /></div>,
                            th: ({ node, ...props }: any) => <th className="border border-gray-600 px-2 py-1 bg-gray-700/50 font-semibold text-left" {...props} />,
                            td: ({ node, ...props }: any) => <td className="border border-gray-700 px-2 py-1" {...props} />,
                            code: ({ node, inline, className, children, ...props }: any) => {
                              return inline ? (
                                <code className="bg-gray-700 text-blue-300 px-1.5 py-0.5 rounded text-[12px] font-mono border border-gray-600/50" {...props}>
                                  {children}
                                </code>
                              ) : (
                                <code className="block bg-gray-950/80 text-green-300 p-3 rounded-lg text-[12px] font-mono my-2 whitespace-pre-wrap overflow-x-auto border border-gray-700/50" {...props}>
                                  {children}
                                </code>
                              );
                            },
                          }}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                    </div>
                    <p className={`text-[10px] mt-1.5 px-1 ${msg.sender === 'user' ? 'text-gray-400' : 'text-gray-500'}`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  {/* User avatar */}
                  {msg.sender === 'user' && (
                    <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center mb-1 bg-gray-700 border border-gray-600">
                      <span className="text-[11px] font-bold text-gray-200">U</span>
                    </div>
                  )}
                </div>
              ))}

              {chatLoading && (
                <div className="flex items-end gap-3 justify-start">
                  <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #2563eb, #6366f1)' }}>
                    <TrendingUp className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl rounded-bl-sm border border-gray-700/60 backdrop-blur-sm" style={{ background: 'rgba(31, 41, 55, 0.85)' }}>
                    <div className="flex gap-1.5 items-center h-4">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '160ms' }} />
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '320ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="flex-shrink-0 px-4 pb-4 pt-3 border-t border-gray-700/50" style={{ background: 'rgba(15, 23, 42, 0.8)' }}>
              <div className="flex gap-2 items-end p-1.5 rounded-xl border border-gray-600/50 bg-gray-800/60 backdrop-blur-sm focus-within:border-blue-500/60 focus-within:bg-gray-800/80 transition-all">
                <textarea
                  value={chatInputValue}
                  onChange={(e) => setChatInputValue(e.target.value)}
                  onKeyDown={handleChatKeyPress}
                  placeholder="Ask about stocks, market trends, analysis..."
                  disabled={chatLoading}
                  rows={1}
                  className="flex-1 bg-transparent text-white text-sm pl-3 py-2 outline-none resize-none min-h-[36px] max-h-32 placeholder-gray-500 leading-relaxed"
                  style={{ scrollbarWidth: 'none' }}
                />
                <button
                  onClick={sendChatMessage}
                  disabled={chatLoading || !chatInputValue.trim()}
                  className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: chatInputValue.trim() ? 'linear-gradient(135deg, #2563eb, #6366f1)' : '#374151' }}
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
              <p className="text-[10px] text-gray-600 mt-2 text-center tracking-wide">
                AI responses are for informational purposes only · Not financial advice
              </p>
            </div>
          </div>
        </div>
      </main>

    </div>
  );
}