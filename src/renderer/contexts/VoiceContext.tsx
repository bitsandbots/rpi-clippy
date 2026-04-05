import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  getVoiceState,
  toggleTts,
  toggleStt,
  setVoice,
  speakText,
  transcribeAudio,
  setSttModel,
  rescanVoices,
  type VoiceInfo,
} from "../api";

type VoiceContextType = {
  ttsEnabled: boolean;
  sttEnabled: boolean;
  currentVoice: string | null;
  voices: Record<string, VoiceInfo>;
  sttModel: string;
  availableSttModels: string[];
  isSpeaking: boolean;
  setTtsEnabled: (enabled: boolean) => Promise<void>;
  setSttEnabled: (enabled: boolean) => Promise<void>;
  selectVoice: (voiceId: string) => Promise<void>;
  changeSttModel: (model: string) => Promise<void>;
  speak: (text: string) => Promise<void>;
  transcribe: (audioBase64: string) => Promise<string>;
  stopSpeaking: () => void;
  rescan: () => Promise<void>;
};

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [ttsEnabled, setTtsEnabledState] = useState(false);
  const [sttEnabled, setSttEnabledState] = useState(false);
  const [currentVoice, setCurrentVoice] = useState<string | null>(null);
  const [voices, setVoices] = useState<Record<string, VoiceInfo>>({});
  const [sttModel, setSttModelState] = useState("tiny");
  const [availableSttModels, setAvailableSttModels] = useState([
    "tiny",
    "base",
    "small",
  ]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioBlobRef = useRef<string | null>(null);

  useEffect(() => {
    getVoiceState().then((state) => {
      setTtsEnabledState(state.tts.enabled);
      setSttEnabledState(state.stt.enabled);
      setCurrentVoice(state.tts.currentVoice);
      setVoices(state.tts.voices);
      setSttModelState(state.stt.model);
      setAvailableSttModels(state.stt.available_models);
    });
  }, []);

  const setTtsEnabled = useCallback(async (enabled: boolean) => {
    const result = await toggleTts(enabled);
    setTtsEnabledState(result.enabled);
  }, []);

  const setSttEnabled = useCallback(async (enabled: boolean) => {
    const result = await toggleStt(enabled);
    setSttEnabledState(result.enabled);
  }, []);

  const selectVoice = useCallback(async (voiceId: string) => {
    await setVoice(voiceId);
    setCurrentVoice(voiceId);
  }, []);

  const changeSttModel = useCallback(async (model: string) => {
    await setSttModel(model);
    setSttModelState(model);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioBlobRef.current) {
      URL.revokeObjectURL(audioBlobRef.current);
      audioBlobRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      stopSpeaking();
      let url: string | null;
      try {
        url = await speakText(text);
      } catch (err) {
        console.error("TTS speak failed:", err);
        return;
      }
      if (!url) return;

      audioBlobRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      setIsSpeaking(true);

      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioBlobRef.current = null;
        audioRef.current = null;
        setIsSpeaking(false);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        audioBlobRef.current = null;
        audioRef.current = null;
        setIsSpeaking(false);
      };

      audio.play().catch(() => setIsSpeaking(false));
    },
    [stopSpeaking],
  );

  const transcribe = useCallback(
    async (audioBase64: string): Promise<string> => {
      const result = await transcribeAudio(audioBase64);
      return result.text ?? "";
    },
    [],
  );

  const rescan = useCallback(async () => {
    const state = await rescanVoices();
    setVoices(state.voices);
    if (state.currentVoice) setCurrentVoice(state.currentVoice);
  }, []);

  return (
    <VoiceContext.Provider
      value={{
        ttsEnabled,
        sttEnabled,
        currentVoice,
        voices,
        sttModel,
        availableSttModels,
        isSpeaking,
        setTtsEnabled,
        setSttEnabled,
        selectVoice,
        changeSttModel,
        speak,
        transcribe,
        stopSpeaking,
        rescan,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextType {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used within a VoiceProvider");
  return ctx;
}
