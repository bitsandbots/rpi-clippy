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
  const currentVoiceRef = useRef<string | null>(null);
  currentVoiceRef.current = currentVoice;

  useEffect(() => {
    getVoiceState().then((state) => {
      console.log("[VoiceContext] Initial state loaded:", state);
      setTtsEnabledState(state.tts.enabled);
      setSttEnabledState(state.stt.enabled);
      // Only set currentVoice from API if not already set (e.g., by user selection)
      // This prevents the initial API load from overriding user selections
      if (currentVoiceRef.current === null && state.tts.currentVoice) {
        setCurrentVoice(state.tts.currentVoice);
        console.log(
          "[VoiceContext] Set initial currentVoice from API:",
          state.tts.currentVoice,
        );
      }
      setVoices(state.tts.voices);
      setSttModelState(state.stt.model);
      setAvailableSttModels(state.stt.available_models);
      console.log(
        "[VoiceContext] After initial load - currentVoice:",
        currentVoiceRef.current,
        "voices count:",
        Object.keys(state.tts.voices).length,
      );
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
    console.log("[VoiceContext] selectVoice called with:", voiceId);
    console.log(
      "[VoiceContext] currentVoice BEFORE API call:",
      currentVoiceRef.current,
    );
    const result = await setVoice(voiceId);
    console.log("[VoiceContext] selectVoice result:", result);
    console.log(
      "[VoiceContext] result.error:",
      result.error,
      "result.status:",
      result.status,
    );
    // Only update state if the voice was successfully loaded
    // Check for both error AND successful status
    if (!result.error && result.status === "loaded") {
      console.log("[VoiceContext] Calling setCurrentVoice to:", voiceId);
      setCurrentVoice(voiceId);
      console.log(
        "[VoiceContext] currentVoice AFTER setCurrentVoice:",
        voiceId,
      );
    } else {
      console.log("[VoiceContext] Voice load failed, not updating state");
    }
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
