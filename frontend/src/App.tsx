import { useState, useEffect } from 'react';
import axios from 'axios';

function App() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    axios.get('http://localhost:8000/api/hello/')
      .then(res => setMessage(res.data.message));
  }, []);

  return <h1>Message from Django: {message || 'Loading...'}</h1>;
}

export default App;