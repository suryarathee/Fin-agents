import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './App.css';

// Define the structure of a message
interface Message {
  id: number;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Updated function to poll for the task result
const pollForResult = async (taskId: string) => {
  const intervalId = setInterval(async () => {
    try {
      const response = await axios.get(`http://localhost:8000/api/chat/status/${taskId}/`);
      const { status, result } = response.data;

      if (status === 'SUCCESS') {
        clearInterval(intervalId); // Stop polling

        // Defensively check for the correct property: 'result.message'
        if (result && typeof result.message === 'string') {
          const agentMessage: Message = {
            id: Date.now(),
            // ✅ CHANGE THIS LINE: Access result.message directly
            text: result.message,
            sender: 'agent',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, agentMessage]);
        } else {
          // This will catch any future unexpected formats
          console.error("Received SUCCESS but the result format is invalid:", result);
          const errorMessage: Message = {
            id: Date.now(),
            text: "Received an invalid response from the agent.",
            sender: 'agent',
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, errorMessage]);
        }

        setLoading(false);
      } else if (status === 'FAILURE') {
        clearInterval(intervalId);
        console.error("Task failed on the server:", result);
        const errorMessage: Message = {
          id: Date.now(),
          text: 'Sorry, the task failed on the server.',
          sender: 'agent',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
        setLoading(false);
      }
    } catch (error) {
      clearInterval(intervalId);
      console.error('Error during polling:', error);
      const errorMessage: Message = {
        id: Date.now(),
        text: 'Sorry, there was an error fetching the response.',
        sender: 'agent',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      setLoading(false);
    }
  }, 2000);
};

  // Main function to send a message
  const sendMessage = async () => {
    if (!input.trim()) return;

    // 1. Immediately display the user's message
    const userMessage: Message = {
      id: Date.now(),
      text: input,
      sender: 'user',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true); // Show the "Thinking..." indicator

    try {
      // 2. Send the initial request to start the task
      const startResponse = await axios.post('http://localhost:8000/api/chat/', {
        message: input,
      });

      // 3. Get the task_id from the response
      const { task_id } = startResponse.data;
      if (task_id) {
        // 4. Start polling for the result using the task_id
        await pollForResult(task_id);
      } else {
        throw new Error('Failed to get a task ID from the server.');
      }
    } catch (error) {
      console.error('Error sending initial message:', error);
      const errorMessage: Message = {
        id: Date.now() + 1,
        text: 'Sorry, could not connect to the agent.',
        sender: 'agent',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="App">
      <header className="app-header">
        <h1>Financial Agent</h1>
      </header>

      <div className="chat-container">
        <div className="messages">
          {messages.map(msg => (
            <div key={msg.id} className={`message ${msg.sender}`}>
              <div className="message-content">
                <p>{msg.text}</p>
                <span className="timestamp">
                  {msg.timestamp.toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
          {loading && (
            <div className="message agent">
              <div className="message-content">
                <p className="loading">Thinking...</p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about financial analysis, portfolio management..."
            rows={3}
            disabled={loading}
          />
          <button onClick={sendMessage} disabled={loading || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;