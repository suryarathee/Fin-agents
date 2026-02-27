import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity, TrendingUp, TrendingDown, Globe, X, Search,
  Wifi, WifiOff, Loader2, BarChart2, Send,
  MessageSquare, ChevronUp, ChevronDown, PieChart
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import LoadingScreen from './components/LoadingScreen';
import SentimentTreemap from './components/SentimentTreemap';
import { TradingViewWidget } from './components/TradingViewWidget';
import { StockChart } from './components/StockChart';

let API_URL = 'https://fin-agents-a0zk.onrender.com/';

// --- Types ---
interface StockData {
  symbol: string;
  price: number;
  change: number;
  percentChange: number;
  high: number;
  low: number;
  open: number;
}

interface FinnhubTrade {
  s: string;
  p: number;
  t: number;
  v: number;
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

// ── Market Clock Pill Data ──────────────────────────────────────────
interface MarketInfo {
  id: string;
  shortName: string;
  flag: string;
  timezone: string;
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
}

const MARKETS: MarketInfo[] = [
  { id: 'nyse', shortName: 'NYSE', flag: '🇺🇸', timezone: 'America/New_York', openHour: 9, openMinute: 30, closeHour: 16, closeMinute: 0 },
  { id: 'nse', shortName: 'NSE', flag: '🇮🇳', timezone: 'Asia/Kolkata', openHour: 9, openMinute: 15, closeHour: 15, closeMinute: 30 },
  { id: 'lse', shortName: 'LSE', flag: '🇬🇧', timezone: 'Europe/London', openHour: 8, openMinute: 0, closeHour: 16, closeMinute: 30 },
  { id: 'tse', shortName: 'TSE', flag: '🇯🇵', timezone: 'Asia/Tokyo', openHour: 9, openMinute: 0, closeHour: 15, closeMinute: 0 },
];

function isMarketOpen(market: MarketInfo, now: Date): boolean {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: market.timezone, hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short',
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '0';
  const weekday = get('weekday');
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const cur = parseInt(get('hour')) * 60 + parseInt(get('minute'));
  return cur >= market.openHour * 60 + market.openMinute && cur < market.closeHour * 60 + market.closeMinute;
}

const MarketClockPills: React.FC = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="hidden md:flex items-center gap-2">
      {MARKETS.map(m => {
        const open = isMarketOpen(m, now);
        const timeStr = new Intl.DateTimeFormat('en-US', {
          timeZone: m.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
        }).format(now);
        return (
          <div
            key={m.id}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono tabular-nums transition-colors
              ${open
                ? 'border-green-500/30 bg-green-950/30 text-green-300'
                : 'border-gray-700/60 bg-gray-800/40 text-gray-400'}`}
            title={`${m.shortName} — ${open ? 'Open' : 'Closed'}`}
          >
            <span className="text-sm leading-none">{m.flag}</span>
            <span className="font-bold text-[10px] text-gray-400 tracking-wider hidden lg:inline">{m.shortName}</span>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${open ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]' : 'bg-gray-600'}`} />
            <span className="hidden lg:inline">{timeStr}</span>
          </div>
        );
      })}
    </div>
  );
};

// ── Symbol Search ────────────────────────────────────────────────────
const SymbolSearch = ({ onSelect, placeholder = 'Search symbol...' }: { onSelect: (s: string) => void; placeholder?: string }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const id = setTimeout(async () => {
      if (query.trim().length > 0) {
        setIsLoading(true);
        try {
          const res = await fetch(`${API_URL}api/search/?q=${query}`);
          const data = await res.json();
          if (data?.result) { setResults(data.result); setIsOpen(true); }
        } catch { /* ignore */ }
        finally { setIsLoading(false); }
      } else { setResults([]); setIsOpen(false); }
    }, 500);
    return () => clearTimeout(id);
  }, [query]);

  const handleSelect = (sym: string) => { onSelect(sym); setQuery(''); setIsOpen(false); };

  return (
    <div ref={wrapperRef} className="relative w-full max-w-xs">
      <div className="relative group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
        <input
          type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder}
          className="w-full bg-gray-800 border border-gray-700 text-sm rounded-lg pl-10 pr-8 py-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none text-white placeholder-gray-500 transition-all"
        />
        {isLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />}
      </div>
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden max-h-72 overflow-y-auto">
          {results.map((item, i) => (
            <button key={`${item.symbol}-${i}`} onClick={() => handleSelect(item.symbol)}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-700/50 flex flex-col transition-colors border-b border-gray-700/50 last:border-0">
              <div className="flex justify-between items-center w-full">
                <span className="font-bold text-white text-sm">{item.symbol}</span>
                <span className="text-[10px] uppercase bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">{item.type} · {item.exchange || 'N/A'}</span>
              </div>
              <span className="text-xs text-gray-400 truncate">{item.description}</span>
            </button>
          ))}
        </div>
      )}
      {isOpen && results.length === 0 && !isLoading && query.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-4 text-center text-gray-400 text-sm">No symbols found</div>
      )}
    </div>
  );
};

// ── Stock Card ────────────────────────────────────────────────────────
const StockCard = ({ data, onRemove, onClick, isActive }: { data: StockData; onRemove: (s: string) => void; onClick: () => void; isActive: boolean }) => {
  const price = data.price ?? 0;
  const change = data.change ?? 0;
  const percentChange = data.percentChange ?? 0;
  const isPositive = percentChange >= 0;
  const [flash, setFlash] = useState<'green' | 'red' | null>(null);
  const prevPrice = useRef(price);

  useEffect(() => {
    if (price > prevPrice.current) setFlash('green');
    else if (price < prevPrice.current) setFlash('red');
    const t = setTimeout(() => setFlash(null), 300);
    prevPrice.current = price;
    return () => clearTimeout(t);
  }, [price]);

  return (
    <div onClick={onClick}
      className={`relative bg-gray-800 rounded-xl p-5 border transition-all duration-300 cursor-pointer group
        ${isActive ? 'ring-2 ring-blue-500 border-transparent' : ''}
        ${flash === 'green' ? 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.25)]'
          : flash === 'red' ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.25)]'
            : 'border-gray-700 hover:border-gray-500 hover:shadow-lg hover:shadow-blue-500/10'}`}>
      <button onClick={e => { e.stopPropagation(); onRemove(data.symbol); }}
        className="absolute top-3 right-3 text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 z-10">
        <X className="w-3.5 h-3.5" />
      </button>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide">{data.symbol}</h3>
          <span className="text-[10px] font-medium text-gray-400 px-1.5 py-0.5 bg-gray-900 rounded mt-0.5 inline-block">LIVE</span>
        </div>
        <div className={`p-1.5 rounded-full ${isPositive ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          {isPositive ? <TrendingUp className="w-4 h-4 text-green-500" /> : <TrendingDown className="w-4 h-4 text-red-500" />}
        </div>
      </div>
      <div className="mb-3">
        <div className={`text-2xl font-bold tabular-nums transition-colors duration-300 ${flash === 'green' ? 'text-green-400' : flash === 'red' ? 'text-red-400' : 'text-white'}`}>
          ${price.toFixed(2)}
        </div>
        <div className={`flex items-center mt-0.5 text-xs font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
          <span>{change > 0 ? '+' : ''}{change.toFixed(2)}</span>
          <span className="mx-1.5">·</span>
          <span>{percentChange.toFixed(2)}%</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-gray-700 pt-3 text-xs">
        <div>
          <p className="text-gray-500 uppercase mb-0.5">Open</p>
          <p className="text-gray-300 font-mono">{(data.open ?? 0).toFixed(2)}</p>
        </div>
        <div>
          <p className="text-gray-500 uppercase mb-0.5">High</p>
          <p className="text-gray-300 font-mono">{(data.high ?? 0).toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
};

// ── Compact Watchlist Row (for Chart tab sidebar) ─────────────────────
const WatchlistRow = ({ symbol, data, isActive, onClick, onRemove }: {
  symbol: string; data?: StockData; isActive: boolean;
  onClick: () => void; onRemove: (s: string) => void;
}) => {
  const isPos = data ? data.percentChange >= 0 : true;
  return (
    <div onClick={onClick}
      className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-all duration-150 group
        ${isActive ? 'bg-blue-600/20 border-l-2 border-blue-500' : 'hover:bg-gray-700/40 border-l-2 border-transparent'}`}>
      <div className="flex items-center gap-2 min-w-0">
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${data ? (isPos ? 'bg-green-400' : 'bg-red-400') : 'bg-gray-600 animate-pulse'}`} />
        <div className="min-w-0">
          <p className="text-sm font-bold text-white truncate">{symbol}</p>
          {data && <p className={`text-[10px] font-medium ${isPos ? 'text-green-400' : 'text-red-400'}`}>{data.percentChange > 0 ? '+' : ''}{data.percentChange.toFixed(2)}%</p>}
        </div>
      </div>
      <div className="text-right flex-shrink-0 ml-2">
        {data ? (
          <>
            <p className="text-sm font-mono text-white">${data.price.toFixed(2)}</p>
            <p className={`text-[10px] font-mono ${isPos ? 'text-green-400' : 'text-red-400'}`}>{data.change > 0 ? '+' : ''}{data.change.toFixed(2)}</p>
          </>
        ) : (
          <div className="space-y-1">
            <div className="h-3.5 w-14 bg-gray-700 rounded animate-pulse" />
            <div className="h-2.5 w-10 bg-gray-700 rounded animate-pulse" />
          </div>
        )}
      </div>
      <button onClick={e => { e.stopPropagation(); onRemove(symbol); }}
        className="ml-2 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

// ── Chat Messages Renderer ─────────────────────────────────────────────
const ChatBubble = ({ msg }: { msg: ChatMessage }) => {
  const isUser = msg.sender === 'user';
  return (
    <div className={`flex items-end gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center mb-1" style={{ background: 'linear-gradient(135deg,#2563eb,#6366f1)' }}>
          <TrendingUp className="w-3.5 h-3.5 text-white" />
        </div>
      )}
      <div className={`max-w-[78%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-md ${isUser ? 'text-white rounded-br-sm' : 'text-gray-100 border border-gray-700/60 rounded-bl-sm backdrop-blur-sm'}`}
          style={isUser ? { background: 'linear-gradient(135deg,#2563eb,#4f46e5)' } : { background: 'rgba(31,41,55,0.85)' }}>
          <div className="prose prose-sm max-w-none prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}
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
                code: ({ node, inline, className, children, ...props }: any) =>
                  inline
                    ? <code className="bg-gray-700 text-blue-300 px-1.5 py-0.5 rounded text-[12px] font-mono border border-gray-600/50" {...props}>{children}</code>
                    : <code className="block bg-gray-950/80 text-green-300 p-3 rounded-lg text-[12px] font-mono my-2 whitespace-pre-wrap overflow-x-auto border border-gray-700/50" {...props}>{children}</code>,
                table: ({ node, ...props }: any) => <div className="overflow-x-auto my-2"><table className="w-full text-xs border-collapse" {...props} /></div>,
                th: ({ node, ...props }: any) => <th className="border border-gray-600 px-2 py-1 bg-gray-700/50 font-semibold text-left" {...props} />,
                td: ({ node, ...props }: any) => <td className="border border-gray-700 px-2 py-1" {...props} />,
              }}>
              {msg.text}
            </ReactMarkdown>
          </div>
        </div>
        <p className={`text-[10px] mt-1.5 px-1 ${isUser ? 'text-gray-400' : 'text-gray-500'}`}>
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center mb-1 bg-gray-700 border border-gray-600">
          <span className="text-[11px] font-bold text-gray-200">U</span>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════
// Main App
// ══════════════════════════════════════════════════════════════════════
type Tab = 'markets' | 'chart' | 'ai' | 'sentiment';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [apiKey] = useState<string>(import.meta.env.VITE_FINNHUB_API_KEY || '');
  const [symbols, setSymbols] = useState<string[]>([
    'AAPL', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NVDA', 'NFLX',
    'AMD', 'INTC', 'BABA', 'PYPL', 'SHOP', 'SNAP', 'UBER', 'LYFT',
    'COIN', 'SQ', 'PLTR', 'RIVN',
  ]);
  const [stockData, setStockData] = useState<Record<string, StockData>>({});
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [activeSymbol, setActiveSymbol] = useState<string>('SPY');
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerRef = useRef<HTMLElement>(null);
  const socketRef = useRef<WebSocket | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>('markets');

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInputValue, setChatInputValue] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [isDockOpen, setIsDockOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  // Sentiment state
  const [sentimentData, setSentimentData] = useState<any[]>([]);
  const [isSentimentLoading, setIsSentimentLoading] = useState(true);

  // Tailwind CDN injection
  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const s = document.createElement('script');
      s.id = 'tailwind-cdn';
      s.src = 'https://cdn.tailwindcss.com';
      s.async = true;
      document.head.appendChild(s);
    }
  }, []);

  // ── Chat logic ──────────────────────────────────────────────────────
  useEffect(() => {
    setMessages([{
      id: Date.now() + 1,
      text: '⚠️ Note: The first response may take up to 3 minutes while the server initializes. Retry until you get a response.',
      sender: 'bot',
      timestamp: new Date(),
    }]);
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Sentiment fetch ───────────────────────────────────────────────
  useEffect(() => {
    const fetchSentiment = async () => {
      try {
        const res = await fetch(`${API_URL}api/market-sentiment/`);
        if (res.ok) setSentimentData(await res.json());
        // 500 = backend error (e.g. Render cold start) — silently leave data empty
      } catch { /* network error — leave data empty */ }
      finally { setIsSentimentLoading(false); }
    };
    fetchSentiment();
  }, []);

  const pollChatResult = async (taskId: string) => {
    const startTime = Date.now();
    const TIMEOUT = 120000;
    const INTERVAL = 3000;
    let errors = 0;
    let done = false;

    const id = setInterval(async () => {
      if (done) return;
      if (Date.now() - startTime > TIMEOUT) {
        done = true; clearInterval(id);
        setMessages(prev => [...prev, { id: Date.now(), text: 'Sorry, the agent took too long to respond.', sender: 'bot', timestamp: new Date() }]);
        setChatLoading(false); return;
      }
      try {
        const res = await fetch(`${API_URL}api/chat/status/${taskId}/`);

        // 404 = task no longer exists (server restarted & lost in-memory task state)
        if (res.status === 404) {
          done = true; clearInterval(id);
          setMessages(prev => [...prev, {
            id: Date.now(),
            text: '⚠️ The server restarted and lost your task. Please send your message again.',
            sender: 'bot', timestamp: new Date(),
          }]);
          setChatLoading(false); return;
        }

        // 502/503 = transient — treat as a network error and keep polling
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const { status: st, result } = await res.json();
        errors = 0;
        if (st === 'SUCCESS') {
          done = true; clearInterval(id);
          setMessages(prev => [...prev, {
            id: Date.now(),
            text: typeof result?.message === 'string' ? result.message : 'Received an invalid response from the agent.',
            sender: 'bot', timestamp: new Date(),
          }]);
          setChatLoading(false);
        } else if (st === 'FAILURE') {
          done = true; clearInterval(id);
          setMessages(prev => [...prev, { id: Date.now(), text: 'Sorry, the task failed on the server.', sender: 'bot', timestamp: new Date() }]);
          setChatLoading(false);
        }
        // PENDING → keep polling
      } catch {
        if (++errors > 5) {
          done = true; clearInterval(id);
          setMessages(prev => [...prev, { id: Date.now(), text: 'Sorry, there was a connection error while fetching the response.', sender: 'bot', timestamp: new Date() }]);
          setChatLoading(false);
        }
      }
    }, INTERVAL);
  };

  const processMessage = async (text: string) => {
    setChatLoading(true);
    const MAX = 10; const BASE = 5000;
    let warmingShown = false;
    const WARM_ID = -999;
    const showWarm = () => { if (!warmingShown) { warmingShown = true; setMessages(p => [...p, { id: WARM_ID, text: '⏳ Server is warming up… retrying automatically.', sender: 'bot' as const, timestamp: new Date() }]); } };
    const removeWarm = () => setMessages(p => p.filter(m => m.id !== WARM_ID));
    for (let i = 0; i <= MAX; i++) {
      try {
        const res = await fetch(`${API_URL}api/chat/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { task_id } = await res.json();
        if (!task_id) throw new Error('No task_id');
        removeWarm();
        await pollChatResult(task_id);
        return;
      } catch {
        if (i === MAX) { removeWarm(); setMessages(p => [...p, { id: Date.now() + 1, text: '❌ Could not reach the server after several retries.', sender: 'bot' as const, timestamp: new Date() }]); setChatLoading(false); return; }
        showWarm();
        await new Promise(r => setTimeout(r, Math.min(BASE * Math.pow(2, i), 60000)));
      }
    }
  };

  useEffect(() => {
    if (!hasInitialized.current) { hasInitialized.current = true; processMessage('hey'); }
  }, []);

  const sendChatMessage = async () => {
    if (!chatInputValue.trim()) return;
    setMessages(prev => [...prev, { id: Date.now(), text: chatInputValue, sender: 'user', timestamp: new Date() }]);
    const msg = chatInputValue;
    setChatInputValue('');
    await processMessage(msg);
  };

  const handleChatKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
  };

  // ── Market data ────────────────────────────────────────────────────
  const fetchInitialData = useCallback(async (symbol: string) => {
    if (!apiKey) return;
    try {
      const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`);
      const d = await res.json();
      if (!d || typeof d.c !== 'number') return;
      setStockData(prev => ({ ...prev, [symbol]: { symbol, price: d.c || 0, change: d.d || 0, percentChange: d.dp || 0, high: d.h || 0, low: d.l || 0, open: d.o || 0 } }));
    } catch { /* ignore */ }
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey) return;
    symbols.forEach(s => fetchInitialData(s));
    setStatus('connecting');
    const ws = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`);
    socketRef.current = ws;
    ws.onopen = () => {
      setStatus('connected');
      symbols.forEach(sym => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'subscribe', symbol: sym })));
    };
    ws.onmessage = event => {
      try {
        const msg: FinnhubMessage = JSON.parse(event.data);
        if (msg.type === 'trade' && msg.data) {
          setStockData(cur => {
            const next = { ...cur };
            msg.data.forEach(t => {
              const sym = t.s;
              if (next[sym]) {
                const o = next[sym].open || t.p;
                const ch = t.p - o;
                next[sym] = { ...next[sym], price: t.p, change: ch, percentChange: o !== 0 ? (ch / o) * 100 : 0, high: Math.max(next[sym].high || t.p, t.p), low: Math.min(next[sym].low || t.p, t.p) };
              }
            });
            return next;
          });
        }
      } catch { /* ignore */ }
    };
    ws.onclose = () => setStatus('disconnected');
    ws.onerror = () => setStatus('disconnected');
    return () => { if (ws.readyState === WebSocket.OPEN) ws.close(); };
  }, [apiKey, symbols, fetchInitialData]);

  const handleAddSymbol = (sym: string) => {
    if (sym && !symbols.includes(sym)) { setSymbols(prev => [...prev, sym]); fetchInitialData(sym); }
  };
  const removeSymbol = (sym: string) => {
    setSymbols(prev => prev.filter(s => s !== sym));
    if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ type: 'unsubscribe', symbol: sym }));
    setStockData(prev => { const n = { ...prev }; delete n[sym]; return n; });
  };

  useEffect(() => {
    const measure = () => { if (headerRef.current) setHeaderHeight(headerRef.current.getBoundingClientRect().height); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const lastBotMsg = [...messages].reverse().find(m => m.sender === 'bot');

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans selection:bg-blue-500/30">
      {isLoading && <LoadingScreen onComplete={() => setIsLoading(false)} />}

      {/* ── Header ─────────────────────────────────────────── */}
      <header ref={headerRef} className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-2 rounded-xl shadow-lg shadow-blue-500/20">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight leading-none">Fin-agents</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-gray-400">Global Real-Time Data</span>
                {status === 'connected'
                  ? <span className="flex items-center gap-0.5 text-[9px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded border border-green-400/20 uppercase font-bold tracking-wider"><Wifi className="w-2.5 h-2.5" /> Live</span>
                  : <span className="flex items-center gap-0.5 text-[9px] text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded border border-red-400/20 uppercase font-bold tracking-wider"><WifiOff className="w-2.5 h-2.5" /> Off</span>}
              </div>
            </div>
          </div>

          {/* Market Clock Pills */}
          <div className="flex-1 flex justify-center">
            <MarketClockPills />
          </div>

          {/* Search */}
          <div className="flex-shrink-0 w-56 hidden sm:block">
            <SymbolSearch onSelect={handleAddSymbol} placeholder="Add symbol…" />
          </div>
        </div>

        {/* ── Tab Bar ─────────────────────────────────────── */}
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 flex gap-0 border-t border-gray-800/60">
          {([
            { id: 'markets', label: 'Markets', icon: BarChart2 },
            { id: 'chart', label: 'Chart', icon: TrendingUp },
            { id: 'sentiment', label: 'Sentiment', icon: PieChart },
            { id: 'ai', label: 'AI Analyst', icon: MessageSquare },
          ] as { id: Tab; label: string; icon: any }[]).map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all relative
                ${activeTab === id
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-300'}`}>
              <Icon className="w-4 h-4" />
              {label}
              {activeTab === id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </header>

      {/* ── Tab Content ──────────────────────────────────────── */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">

        {/* Mobile search */}
        <div className="sm:hidden mb-5">
          <SymbolSearch onSelect={handleAddSymbol} placeholder="Search symbol…" />
        </div>

        {/* ═══ MARKETS TAB ════════════════════════════════════ */}
        {activeTab === 'markets' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">Watchlist</h2>
                <p className="text-sm text-gray-400 mt-0.5">{symbols.length} symbols tracked · {status === 'connected' ? 'Live prices' : 'Connecting…'}</p>
              </div>
              <SymbolSearch onSelect={handleAddSymbol} placeholder="+ Add symbol" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {symbols.map(sym => {
                const d = stockData[sym];
                const placeholder: StockData = { symbol: sym, price: 0, change: 0, percentChange: 0, high: 0, low: 0, open: 0 };
                return (
                  <StockCard
                    key={sym}
                    data={d || placeholder}
                    isActive={activeSymbol === sym}
                    onClick={() => { setActiveSymbol(sym); setActiveTab('chart'); }}
                    onRemove={removeSymbol}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ CHART TAB ══════════════════════════════════════ */}
        {activeTab === 'chart' && (
          <div className="flex gap-6">
            {/* Left: Chart */}
            <div className="flex-1 min-w-0">
              {apiKey ? (
                <div className="mb-4 relative">
                  <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
                    <div className="flex items-center gap-3">
                      <div>
                        <h2 className="text-xl font-bold text-white">{activeSymbol}</h2>
                        <p className="text-xs text-gray-500 mt-0.5">Live Candlestick Chart</p>
                      </div>
                      {/* Inline symbol switcher */}
                      <SymbolSearch
                        onSelect={(sym) => {
                          setActiveSymbol(sym);
                          if (!symbols.includes(sym)) handleAddSymbol(sym);
                        }}
                        placeholder="Change symbol…"
                      />
                    </div>
                    <button
                      onClick={() => setIsLiveMode(!isLiveMode)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all
                        ${isLiveMode ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20' : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'}`}>
                      {isLiveMode ? <><Activity className="w-4 h-4" /> Live Mode</> : <><Wifi className="w-4 h-4" /> Go Live</>}
                    </button>
                  </div>

                  {!isChartExpanded && (
                    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-2xl h-[550px]">
                      {!isLiveMode && <div className="h-full w-full"><TradingViewWidget symbol={activeSymbol} /></div>}
                      {isLiveMode && <StockChart symbol={activeSymbol} isExpanded={false} onToggleExpand={() => setIsChartExpanded(true)} />}
                    </div>
                  )}
                  {isChartExpanded && isLiveMode && (
                    <div className="h-[550px] bg-gray-800 rounded-xl border border-gray-700 flex items-center justify-center">
                      <p className="text-gray-500 text-sm">Chart expanded ↗</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-[550px] bg-gray-800 rounded-xl border border-gray-700 flex items-center justify-center">
                  <p className="text-gray-500 text-sm">No API key — add VITE_FINNHUB_API_KEY to .env</p>
                </div>
              )}
            </div>

            {/* Right: Watchlist sidebar */}
            <div className="w-64 flex-shrink-0">
              <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl overflow-hidden backdrop-blur-sm sticky top-36">
                <div className="px-4 py-3 border-b border-gray-700/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-bold text-white">Watchlist</span>
                  </div>
                  <span className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider
                    ${status === 'connected' ? 'text-green-400 bg-green-400/10 border-green-400/20' : 'text-red-400 bg-red-400/10 border-red-400/20'}`}>
                    {status === 'connected' ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                    {status === 'connected' ? 'Live' : 'Off'}
                  </span>
                </div>
                <div className="overflow-y-auto max-h-[calc(100vh-260px)] divide-y divide-gray-700/40">
                  {symbols.map(sym => (
                    <WatchlistRow key={sym} symbol={sym} data={stockData[sym]} isActive={activeSymbol === sym} onClick={() => setActiveSymbol(sym)} onRemove={removeSymbol} />
                  ))}
                </div>
                <div className="p-2 border-t border-gray-700/60">
                  <SymbolSearch onSelect={handleAddSymbol} placeholder="+ Add symbol" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Expanded chart overlay */}
        {isChartExpanded && isLiveMode && activeTab === 'chart' && (
          <div className="fixed inset-x-0 bottom-0 z-30 bg-gray-900" style={{ top: headerHeight > 0 ? `${headerHeight}px` : '0px' }}>
            <StockChart symbol={activeSymbol} isExpanded={true} onToggleExpand={() => setIsChartExpanded(false)} />
          </div>
        )}

        {/* ═══ SENTIMENT TAB ══════════════════════════════════ */}
        {activeTab === 'sentiment' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">Market Sentiment Map</h2>
                <p className="text-sm text-gray-400 mt-0.5">Stocks sized by market cap · colored by daily % change</p>
              </div>
              <button
                onClick={() => {
                  setIsSentimentLoading(true);
                  fetch(`${API_URL}api/market-sentiment/`)
                    .then(r => r.json()).then(d => setSentimentData(d))
                    .catch(() => { })
                    .finally(() => setIsSentimentLoading(false));
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-300 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mb-4 text-xs text-gray-400">
              <span className="font-medium text-gray-300">Change color:</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#1e8845' }} /> &gt;+2%</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#16a34a' }} /> 0–2%</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#4b5563' }} /> 0%</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#931f1f' }} /> 0 to −2%</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#b73a3a' }} /> &lt;−2%</span>
            </div>

            <SentimentTreemap data={sentimentData} isLoading={isSentimentLoading} />
          </div>
        )}

        {/* ═══ AI ANALYST TAB ═════════════════════════════════ */}
        {activeTab === 'ai' && (
          <div className="w-full h-[calc(100vh-220px)] min-h-[500px] border border-gray-700/60 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ background: 'linear-gradient(145deg,#0f172a 0%,#111827 100%)' }}>
            {/* Chat header */}
            <div className="flex-shrink-0 px-6 py-4 flex justify-between items-center border-b border-gray-700/50"
              style={{ background: 'linear-gradient(90deg,rgba(37,99,235,0.15) 0%,rgba(99,102,241,0.08) 100%)' }}>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg,#2563eb,#6366f1)' }}>
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-gray-900" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base tracking-tight">Fin-Agent AI</h3>
                  <p className="text-xs text-green-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                    Online · Powered by Gemini
                  </p>
                </div>
              </div>
              <span className="text-[11px] text-gray-500 hidden sm:block">Press Enter to send</span>
            </div>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5" style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent' }}>
              {messages.map(msg => <ChatBubble key={msg.id} msg={msg} />)}
              {chatLoading && (
                <div className="flex items-end gap-2.5 justify-start">
                  <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#2563eb,#6366f1)' }}>
                    <TrendingUp className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl rounded-bl-sm border border-gray-700/60" style={{ background: 'rgba(31,41,55,0.85)' }}>
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
            {/* Input */}
            <div className="flex-shrink-0 px-4 pb-4 pt-3 border-t border-gray-700/50" style={{ background: 'rgba(15,23,42,0.8)' }}>
              <div className="flex gap-2 items-end p-1.5 rounded-xl border border-gray-600/50 bg-gray-800/60 backdrop-blur-sm focus-within:border-blue-500/60 transition-all">
                <textarea value={chatInputValue} onChange={e => setChatInputValue(e.target.value)} onKeyDown={handleChatKey}
                  placeholder="Ask about stocks, market trends, analysis…" disabled={chatLoading} rows={1}
                  className="flex-1 bg-transparent text-white text-sm pl-3 py-2 outline-none resize-none min-h-[36px] max-h-32 placeholder-gray-500 leading-relaxed"
                  style={{ scrollbarWidth: 'none' }} />
                <button onClick={sendChatMessage} disabled={chatLoading || !chatInputValue.trim()}
                  className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: chatInputValue.trim() ? 'linear-gradient(135deg,#2563eb,#6366f1)' : '#374151' }}>
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
              <p className="text-[10px] text-gray-600 mt-2 text-center tracking-wide">
                AI responses are for informational purposes only · Not financial advice
              </p>
            </div>
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════════════
          Bottom Chat Dock (Markets & Chart tabs only)
      ══════════════════════════════════════════════════════════ */}
      {activeTab !== 'ai' && activeTab !== 'sentiment' && (
        <div className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out
          ${isDockOpen ? 'h-[480px]' : 'h-14'}`}
          style={{ background: isDockOpen ? 'linear-gradient(145deg,#0f172a 0%,#111827 100%)' : 'rgba(15,23,42,0.95)', borderTop: '1px solid rgba(55,65,81,0.6)', backdropFilter: 'blur(12px)' }}>

          {/* Dock Header (always visible) */}
          <div
            className="h-14 flex items-center px-4 sm:px-6 cursor-pointer"
            onClick={() => setIsDockOpen(o => !o)}>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="relative flex-shrink-0">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow" style={{ background: 'linear-gradient(135deg,#2563eb,#6366f1)' }}>
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-gray-900" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white leading-none">Fin-Agent AI</p>
                {!isDockOpen && lastBotMsg && (
                  <p className="text-xs text-gray-400 truncate mt-0.5 max-w-[300px] sm:max-w-[600px]">{lastBotMsg.text.slice(0, 80)}{lastBotMsg.text.length > 80 ? '…' : ''}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {!isDockOpen && chatLoading && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
              <span className="text-xs text-gray-400 hidden sm:block">{isDockOpen ? 'Collapse' : 'Open Chat'}</span>
              {isDockOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
            </div>
          </div>

          {/* Dock Chat Content */}
          {isDockOpen && (
            <div className="flex flex-col h-[calc(480px-56px)] border-t border-gray-700/50">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#374151 transparent' }}>
                {messages.map(msg => <ChatBubble key={msg.id} msg={msg} />)}
                {chatLoading && (
                  <div className="flex items-end gap-2.5 justify-start">
                    <div className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#2563eb,#6366f1)' }}>
                      <TrendingUp className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="px-4 py-3 rounded-2xl rounded-bl-sm border border-gray-700/60" style={{ background: 'rgba(31,41,55,0.85)' }}>
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
              {/* Input */}
              <div className="flex-shrink-0 px-4 pb-3 pt-2 border-t border-gray-700/50" style={{ background: 'rgba(15,23,42,0.8)' }}>
                <div className="flex gap-2 items-end p-1.5 rounded-xl border border-gray-600/50 bg-gray-800/60 backdrop-blur-sm focus-within:border-blue-500/60 transition-all">
                  <textarea value={chatInputValue} onChange={e => setChatInputValue(e.target.value)} onKeyDown={handleChatKey}
                    placeholder="Ask about stocks, market trends, analysis…" disabled={chatLoading} rows={1}
                    className="flex-1 bg-transparent text-white text-sm pl-3 py-2 outline-none resize-none min-h-[36px] max-h-24 placeholder-gray-500 leading-relaxed"
                    style={{ scrollbarWidth: 'none' }} />
                  <button onClick={sendChatMessage} disabled={chatLoading || !chatInputValue.trim()}
                    className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: chatInputValue.trim() ? 'linear-gradient(135deg,#2563eb,#6366f1)' : '#374151' }}>
                    <Send className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}