import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Mic, MicOff, Volume2, Loader2, MessageSquare, User, Bot } from 'lucide-react';
import './App.css';

function App() {
  /* ---------- state & refs ---------- */
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const streamRef = useRef(null);

  /* ---------- speech-to-text ---------- */
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = e => {
        let finalTx = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finalTx += e.results[i][0].transcript;
        }
        if (finalTx) setTranscript(finalTx);
      };

      recognitionRef.current.onerror = e => {
        console.error('STT error:', e.error);
        setError('Speech recognition error: ' + e.error);
      };
    }
  }, []);

  /* ---------- record helpers ---------- */
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setIsRecording(true);
      setError('');
      setTranscript('');
      audioChunksRef.current = [];

      recognitionRef.current?.start();

      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.ondataavailable = e => {
        if (e.data.size) audioChunksRef.current.push(e.data);
      };
      mediaRecorderRef.current.start(1000);
    } catch (err) {
      setError('Microphone access denied: ' + err.message);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    setIsRecording(false);

    // Stop recorder + mic
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach(t => t.stop());

    // Call the API only after STT truly finishes
    if (recognitionRef.current) {
      recognitionRef.current.onend = () => {
        recognitionRef.current.onend = null; // clean up handler
        if (!transcript.trim()) {
          setError('No speech detected. Please try again.');
          return;
        }
        processAudioForAPI(); // single, reliable call
      };
      recognitionRef.current.stop();
    }
  };

  /* ---------- talk to backend ---------- */
  const processAudioForAPI = async () => {
    setIsProcessing(true);

    try {
      const { data } = await axios.post('http://localhost:5000/api/voice-chat', {
        userText: transcript.trim()
      });

      if (!data.success) throw new Error('Backend returned failure');

      await playAudioResponse(data.audioResponse, data.textResponse);

      setConversation(prev => [
        ...prev,
        { type: 'user', text: transcript },
        { type: 'bot', text: data.textResponse }
      ]);

    } catch (err) {
      setError('Request failed: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  /* ---------- browser TTS ---------- */
  const speakBrowserTTS = text => {
    if (!('speechSynthesis' in window)) {
      setIsPlaying(false);
      setError('Text-to-speech not supported');
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const selectVoice = () => {
      const voices = speechSynthesis.getVoices();
      return voices.find(v =>
        v.name.includes('Google') ||
        v.name.includes('Microsoft') ||
        v.lang === 'en-US'
      ) || voices[0];
    };
    utterance.voice = selectVoice();
    utterance.rate = 0.9;
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);
    speechSynthesis.speak(utterance);
  };

  /* ---------- audio playback ---------- */
  const playAudioResponse = async (base64Audio, textResp) => {
    setIsPlaying(true);
    if (!base64Audio) {
      speakBrowserTTS(textResp);
      return;
    }

    try {
      const byteStr = atob(base64Audio);
      const buf = new Uint8Array(byteStr.length).map((_, i) => byteStr.charCodeAt(i));
      const blob = new Blob([buf], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        speakBrowserTTS(textResp);
      };
      await audio.play();
    } catch {
      speakBrowserTTS(textResp);
    }
  };

  const getButtonContent = () => {
    if (isProcessing) return <><Loader2 className="icon spin" /> Processing...</>;
    if (isPlaying) return <><Volume2 className="icon" /> Speaking...</>;
    if (isRecording) return <><MicOff className="icon" /> Stop Recording</>;
    return <><Mic className="icon" /> Start Recording</>;
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <h1 className="header-title">My Voice Assistant</h1>
          <p className="header-subtitle">Powered by AI • Speak naturally and receive instant responses, as if you're talking to the real Yaksh.</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="main">
        {/* Voice Controls */}
        <div className="voice-controls">
          <button
            className={`voice-btn ${isRecording ? 'recording' : ''} ${(isProcessing || isPlaying) ? 'disabled' : ''}`}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing || isPlaying}
          >
            {getButtonContent()}
          </button>

          {/* Status Indicators */}
          {isRecording && (
            <div className="status-indicator">
              <div className="pulse-dot"></div>
              <span>Listening...</span>
            </div>
          )}

          {transcript && (
            <div className="transcript-display">
              <p className="transcript-label">You said:</p>
              <p className="transcript-text">"{transcript}"</p>
            </div>
          )}

          {error && (
            <div className="error-message">
              <p>{error}</p>
            </div>
          )}
        </div>

        {/* Conversation */}
        {conversation.length > 0 && (
          <div className="conversation-section">
            <div className="conversation-header">
              <MessageSquare className="icon" />
              <h2>Conversation</h2>
            </div>

            <div className="conversation">
              {conversation.map((message, index) => (
                <div key={index} className={`message-wrapper ${message.type}`}>
                  <div className="message-avatar">
                    {message.type === 'user' ? (
                      <User className="icon" />
                    ) : (
                      <Bot className="icon" />
                    )}
                  </div>

                  <div className="message-content">
                    <div className="message-bubble">
                      <p>{message.text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Welcome Message */}
        {conversation.length === 0 && (
          <div className="welcome-card">
            <h3 className="welcome-title">Ready to begin our conversation?</h3>
            <p className="welcome-description">
              Click the recording button and speak naturally. The AI me will listen,
              understand your responses, and ask relevant follow-up questions.
            </p>
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon">
                  <Mic className="icon" />
                </div>
                <p className="feature-title">Speak Clearly</p>
                <p className="feature-description">Express your thoughts naturally</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">
                  <Bot className="icon" />
                </div>
                <p className="feature-title">AI Analysis</p>
                <p className="feature-description">Intelligent response processing</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">
                  <Volume2 className="icon" />
                </div>
                <p className="feature-title">Audio Response</p>
                <p className="feature-description">Hear questions and feedback</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
