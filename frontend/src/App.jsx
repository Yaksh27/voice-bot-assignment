import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [botResponse, setBotResponse] = useState(''); // Renamed from 'response'
  const [isLoading, setIsLoading] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [error, setError] = useState('');
  
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);

  // Send message to backend (moved up and wrapped in useCallback)
  const handleSendMessage = useCallback(async (message) => {
    if (!message.trim()) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/chat', {
        message: message.trim()
      });

      const aiResponse = response.data.response;
      setBotResponse(aiResponse);
      
      // Add to conversation history
      setConversation(prev => [...prev, 
        { type: 'user', text: message },
        { type: 'bot', text: aiResponse }
      ]);

      // Speak the response
      speakText(aiResponse);

    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to get response. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []); // Empty dependency array since it doesn't depend on state/props

  // Text to speech
  const speakText = useCallback((text) => {
    if (synthRef.current) {
      // Cancel any ongoing speech
      synthRef.current.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      synthRef.current.speak(utterance);
    }
  }, []);

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        const lastResult = event.results[event.results.length - 1];
        const spokenText = lastResult[0].transcript;
        setTranscript(spokenText);
        handleSendMessage(spokenText);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setError('Speech recognition error. Please try again.');
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    } else {
      setError('Speech recognition not supported in this browser.');
    }
  }, [handleSendMessage]); // Now includes handleSendMessage dependency

  // Start listening
  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      setError('');
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  // Stop listening
  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  // Manual text input
  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (transcript.trim()) {
      handleSendMessage(transcript);
      setTranscript('');
    }
  };

  return (
    <div className="App">
      <header className="app-header">
        <h1>🎤 Voice Interview Bot</h1>
        <p>AI Agent Team Interview - 100x</p>
      </header>

      <main className="main-content">
        {/* Voice Controls */}
        <div className="voice-controls">
          <button 
            className={`voice-btn ${isListening ? 'listening' : ''}`}
            onClick={isListening ? stopListening : startListening}
            disabled={isLoading}
          >
            {isListening ? '🔴 Stop Listening' : '🎤 Start Voice Chat'}
          </button>
          
          {isListening && (
            <div className="listening-indicator">
              <span>Listening...</span>
              <div className="pulse-animation"></div>
            </div>
          )}
        </div>

        {/* Manual Text Input */}
        <form onSubmit={handleTextSubmit} className="text-input-form">
          <input
            type="text"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Or type your question here..."
            className="text-input"
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading || !transcript.trim()}>
            Send
          </button>
        </form>

        {/* Loading State */}
        {isLoading && (
          <div className="loading">
            <div className="spinner"></div>
            <span>Thinking...</span>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="error">
            <p>{error}</p>
          </div>
        )}

        {/* Conversation History */}
        <div className="conversation">
          {conversation.length === 0 && (
            <div className="welcome-message">
              <h3>Welcome! 👋</h3>
              <p>Ask me interview questions like:</p>
              <ul>
                <li>"What should we know about your life story?"</li>
                <li>"What's your number one superpower?"</li>
                <li>"What are your top 3 growth areas?"</li>
                <li>"How do you push your boundaries?"</li>
              </ul>
            </div>
          )}
          
          {conversation.map((msg, index) => (
            <div key={index} className={`message ${msg.type}`}>
              <div className="message-content">
                <strong>{msg.type === 'user' ? 'Interviewer:' : 'You:'}</strong>
                <p>{msg.text}</p>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;
