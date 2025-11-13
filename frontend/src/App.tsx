// App.tsx
import React, { useState, useRef, useEffect } from 'react';
import { StockChart } from "./components/StockChart"; // Assume this component exists
import axios from 'axios';
import './App.css';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

const App: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([
      {
        id: Date.now(),
        text: "Hello! I am your financial agent. Ask me about stock analysis, market trends, or any financial questions.",
        sender: 'bot',
        timestamp: new Date(),
      }
    ]);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // --- THIS FUNCTION HAS BEEN UPDATED ---
  const pollForResult = async (taskId: string) => {
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
        setLoading(false);
        return; // Stop polling
      }

      // 2. Try to get the status
      try {
        const response = await axios.get(
          `http://localhost:8000/api/chat/status/${taskId}/`
        );
        const { status, result } = response.data;

        // Reset error count on a successful network request
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
          setLoading(false);
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
          setLoading(false);
        }
        // If status is 'PENDING', do nothing and let the interval continue

      } catch (error) {
        consecutiveErrors++; // Increment error count

        // 3. Check if we've exceeded max errors
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
          setLoading(false);
        }
        // If < max errors, just let the next poll attempt run
      }
    }, POLLING_INTERVAL);
  };
  // --- END OF UPDATED FUNCTION ---

  const sendMessage = async () => {
    if (!inputValue.trim()) return;
    const newUserMessage: Message = {
      id: Date.now(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newUserMessage]);
    const currentInput = inputValue;
    setInputValue('');
    setLoading(true);

    try {
      const startResponse = await axios.post(
        'http://localhost:8000/api/chat/',
        {
          message: currentInput,
        }
      );
      const { task_id } = startResponse.data;
      if (task_id) {
        await pollForResult(task_id);
      } else {
        throw new Error('Failed to get a task ID from the server.');
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          text: 'Sorry, could not connect to the agent.',
          sender: 'bot',
          timestamp: new Date(),
        },
      ]);
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="App">
      <header className="header">
        <h1>FINANCIAL ANALYSIS</h1>
      </header>
      <main className="main">
        {/* Integrated StockChart from previous code */}
        <div className="chart-container">
          <StockChart />
        </div>
        <p style={{ marginTop: '20px' }}>Welcome to the Financial Analysis dashboard. Here you can explore charts, reports, and insights.</p>
      </main>

      {/* Toggle Button */}
      <button className="toggle-btn" onClick={toggleSidebar} title="Open Chatbot">
        💬
      </button>

      {/* Sidebar Chatbot - Enhanced with API logic */}
      <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h3>Chatbot Assistant</h3>
          <button className="close-btn" onClick={toggleSidebar}>×</button>
        </div>
        <div className="chat-container">
          <div className="chat-messages">
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.sender === 'user' ? 'user-message' : 'bot-message'}`}>
                <p>{msg.text}</p>
                <span className="timestamp">
                  {msg.timestamp.toLocaleTimeString()}
                </span>
              </div>
            ))}
            {loading && (
              <div className="message bot-message">
                <p>Typing...</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="chat-input">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type your message..."
              onKeyPress={handleKeyPress}
              rows={3}
              disabled={loading}
            />
            <button onClick={sendMessage} disabled={loading || !inputValue.trim()}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;