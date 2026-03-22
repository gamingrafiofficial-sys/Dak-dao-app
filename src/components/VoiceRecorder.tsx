import React, { useState, useRef } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

interface VoiceRecorderProps {
  onTranscription: (text: string) => void;
  onTranscribing: (isTranscribing: boolean) => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onTranscription, onTranscribing }) => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (event) => {
        audioChunks.current.push(event.data);
      };

      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          onTranscribing(true);
          try {
            // This would call the geminiService
            // For now, I'll just pass the base64 to the parent
            // But I'll implement the actual call in the parent or here
            // Let's assume the parent handles the API call for cleaner separation
            onTranscription(base64Audio);
          } catch (error) {
            console.error('Transcription failed', error);
          } finally {
            onTranscribing(false);
          }
        };
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={isRecording ? stopRecording : startRecording}
        className={`p-6 rounded-full shadow-lg transition-colors ${
          isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-indigo-600 text-white hover:bg-indigo-700'
        }`}
      >
        {isRecording ? <Square size={32} /> : <Mic size={32} />}
      </motion.button>
      <p className="text-sm font-medium text-gray-600">
        {isRecording ? 'Recording... Tap to stop' : 'Tap to speak (Bengali/English)'}
      </p>
    </div>
  );
};
