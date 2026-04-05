import { useState, useEffect, useRef, useCallback } from "react";
import { useChat } from "../contexts/ChatContext";
import { useVoice } from "../contexts/VoiceContext";

export type ChatInputProps = {
  onSend: (message: string) => void;
  onAbort: () => void;
};

export function ChatInput({ onSend, onAbort }: ChatInputProps) {
  const { status, isModelLoaded } = useChat();
  const { ttsEnabled, sttEnabled, setTtsEnabled, setSttEnabled, transcribe } = useVoice();
  const [message, setMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (trimmed) {
      onSend(trimmed);
      setMessage("");
    }
  }, [message, onSend]);

  const handleAbort = useCallback(() => {
    setMessage("");
    onAbort();
  }, [onAbort]);

  const handleSendOrAbort = useCallback(() => {
    if (status === "responding") handleAbort();
    else handleSend();
  }, [status, handleSend, handleAbort]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      const trimmed = message.trim();
      if (trimmed) {
        onSend(trimmed);
        setMessage("");
      }
      e.preventDefault();
      e.stopPropagation();
    }
  };

  useEffect(() => {
    if (isModelLoaded && textareaRef.current) textareaRef.current.focus();
  }, [isModelLoaded]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true },
      });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);
        setIsTranscribing(true);
        try {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const base64 = await blobToBase64(blob);
          const text = await transcribe(base64);
          if (text) setMessage((prev) => (prev ? prev + " " + text : text));
        } finally {
          setIsTranscribing(false);
          textareaRef.current?.focus();
        }
      };
      recorder.start(250);
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      // Mic permission denied or unavailable — silently ignore
    }
  }, [transcribe]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }, []);

  const toggleMic = useCallback(() => {
    if (isRecording) stopRecording();
    else startRecording();
  }, [isRecording, startRecording, stopRecording]);

  const micLabel = isTranscribing ? "…" : isRecording ? "■" : "🎤";
  const micTitle = isTranscribing
    ? "Transcribing…"
    : isRecording
      ? "Stop recording"
      : sttEnabled
        ? "Record voice input"
        : "Enable mic (Speech-to-Text off)";

  const ttsTitle = ttsEnabled ? "Mute voice responses (TTS on)" : "Unmute voice responses (TTS off)";

  const placeholder = isModelLoaded
    ? "Type a message, press Enter to send..."
    : "Waiting for a model to load…";

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "4px" }}>
      <textarea
        rows={1}
        ref={textareaRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={!isModelLoaded}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={{ flex: 1, resize: "vertical", minHeight: "23px", width: 80 }}
      />
      {/* TTS speaker toggle — always visible */}
      <button
        title={ttsTitle}
        onClick={() => setTtsEnabled(!ttsEnabled)}
        style={{
          alignSelf: "flex-end",
          height: "23px",
          minWidth: "28px",
          opacity: ttsEnabled ? 1 : 0.4,
        }}
      >
        🔊
      </button>
      {/* Mic button — always visible; click enables STT then starts recording */}
      <button
        title={micTitle}
        disabled={isTranscribing}
        onClick={sttEnabled ? toggleMic : () => setSttEnabled(true)}
        style={{
          alignSelf: "flex-end",
          height: "23px",
          minWidth: "28px",
          opacity: sttEnabled ? 1 : 0.4,
          background: isRecording ? "#c00" : undefined,
          color: isRecording ? "#fff" : undefined,
        }}
      >
        {micLabel}
      </button>
      <button
        disabled={!isModelLoaded}
        style={{ alignSelf: "flex-end", height: "23px" }}
        onClick={handleSendOrAbort}
      >
        {status === "responding" ? "Abort" : "Send"}
      </button>
    </div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
