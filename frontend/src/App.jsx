import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
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

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setTranscript(finalTranscript);
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
      };
    }
  }, []);

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      streamRef.current = stream;
      setIsRecording(true);
      setError('');
      setTranscript('');
      audioChunksRef.current = [];

      // Start visual transcript
      if (recognitionRef.current) {
        recognitionRef.current.start();
      }

      // Start audio recording
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        processAudioForAPI();
      };

      mediaRecorderRef.current.start(1000); // Collect data every second

    } catch (error) {
      setError('Microphone access denied: ' + error.message);
      setIsRecording(false);
    }
  };

  // Stop recording
  const stopRecording = () => {
    setIsRecording(false);
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Stop all audio tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  // Process audio for API
  const processAudioForAPI = async () => {
    setIsProcessing(true);

    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      
      // Convert to base64 for sending to backend
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1]; // Remove data:audio/webm;base64, prefix

        console.log('🎤 Sending audio to backend...');

        try {
          // Send to backend
          const response = await axios.post('http://localhost:5000/api/voice-chat', {
            audioData: base64Audio,
            sessionId: Date.now().toString()
          });

          if (response.data.success && response.data.audioResponse) {
            // Play audio response
            await playAudioResponse(response.data.audioResponse);
            
            // Add to conversation
            setConversation(prev => [...prev, 
              { type: 'user', text: transcript || 'Voice message' },
              { type: 'bot', text: '🎵 AI Voice Response' }
            ]);
          } else if (response.data.textResponse) {
            // Fallback to text response
            setConversation(prev => [...prev, 
              { type: 'user', text: transcript || 'Voice message' },
              { type: 'bot', text: response.data.textResponse }
            ]);
          } else {
            throw new Error('No response received');
          }

        } catch (error) {
          console.error('API call error:', error);
          setError('Voice processing failed: ' + error.message);
        }
      };

      reader.readAsDataURL(audioBlob);

    } catch (error) {
      console.error('Audio processing error:', error);
      setError('Audio processing failed: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Play audio response
  const playAudioResponse = async (base64AudioData) => {
    try {
      setIsPlaying(true);
      
      // Convert base64 to blob
      const binaryString = atob(base64AudioData);
      const arrayBuffer = new ArrayBuffer(binaryString.length);
      const uint8Array = new Uint8Array(arrayBuffer);
      
      for (let i = 0; i < binaryString.length; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
      }
      
      const audioBlob = new Blob([arrayBuffer], { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(audioBlob);
      
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };
      
      audio.onerror = () => {
        setIsPlaying(false);
        setError('Failed to play audio response');
        URL.revokeObjectURL(audioUrl);
      };
      
      await audio.play();

    } catch (error) {
      console.error('Audio playback error:', error);
      setError('Failed to play audio response');
      setIsPlaying(false);
    }
  };

  return (
    <div className="App">
      <header className="app-header">
        <h1>🎤 Native Voice Interview</h1>
        <p>100x AI Agent Team | Powered by Gemini Live API</p>
        <div className="status-badges">
          <span className="badge native-audio">🎵 Native Audio</span>
          <span className="badge real-time">⚡ Real-time</span>
          <span className="badge human-like">🗣️ Human-like</span>
        </div>
      </header>

      <main className="main-content">
        {/* Voice Controls */}
        <div className="voice-controls">
          <button 
            className={`voice-btn ${isRecording ? 'recording' : ''} ${isProcessing ? 'processing' : ''} ${isPlaying ? 'playing' : ''}`}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing || isPlaying}
          >
            {isRecording ? '🔴 Stop Recording' : 
             isProcessing ? '🤖 AI Thinking...' :
             isPlaying ? '🎵 Speaking...' :
             '🎤 Start Voice Interview'}
          </button>
          
          {isRecording && (
            <div className="recording-indicator">
              <span>🎤 Recording... Click "Stop Recording" when done</span>
              <div className="pulse-animation"></div>
            </div>
          )}

          {isProcessing && (
            <div className="processing-indicator">
              <span>🤖 Processing with AI...</span>
            </div>
          )}

          {isPlaying && (
            <div className="playing-indicator">
              <span>🎵 Playing AI response...</span>
            </div>
          )}
        </div>

        {/* Real-time transcript */}
        {transcript && (
          <div className="transcript">
            <h4>You said:</h4>
            <p>"{transcript}"</p>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="error">
            <p>{error}</p>
            <button onClick={() => setError('')}>Clear</button>
          </div>
        )}

        {/* Conversation History */}
        <div className="conversation">
          {conversation.length === 0 && (
            <div className="welcome-message">
              <h3>🎤 Ready for Voice Interview!</h3>
              <p><strong>This uses AI for natural conversation!</strong></p>
              <p>Try asking:</p>
              <ul>
                <li>🗣️ "Tell me about your background"</li>
                <li>🗣️ "What's your superpower?"</li>
                <li>🗣️ "What are your growth areas?"</li>
                <li>🗣️ "How do you push boundaries?"</li>
              </ul>
            </div>
          )}
          
          {conversation.map((msg, index) => (
            <div key={index} className={`message ${msg.type}`}>
              <div className="message-content">
                <strong>{msg.type === 'user' ? '🎤 Interviewer:' : '🤖 Yaksh:'}</strong>
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
