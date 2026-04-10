import { useState, useEffect, useCallback, useRef } from "react";
import { useVoice } from "../contexts/VoiceContext";

export const SettingsVoice: React.FC = () => {
  const {
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
    stopSpeaking,
    rescan,
    importVoice,
  } = useVoice();

  const voiceList = Object.values(voices);
  console.log(
    "[SettingsVoice] Render - currentVoice:",
    currentVoice,
    "ttsEnabled:",
    ttsEnabled,
    "voices count:",
    Object.keys(voices).length,
    "voiceList:",
    voiceList.map((v) => v.id).join(", "),
  );
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);

  // Log when component mounts/unmounts
  useEffect(() => {
    console.log("[SettingsVoice] Component mounted");
    return () => {
      console.log("[SettingsVoice] Component unmounted");
    };
  }, []);

  // Enumerate browser audio output devices
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      setAudioDevices(devices.filter((d) => d.kind === "audiooutput"));
    });
  }, []);

  return (
    <div>
      {/* ── Voice Service ─────────────────────────────── */}
      <fieldset>
        <legend>Voice Service</legend>
        <div className="field-row">
          <input
            id="ttsEnabled"
            type="checkbox"
            checked={ttsEnabled}
            onChange={(e) => setTtsEnabled(e.target.checked)}
          />
          <label htmlFor="ttsEnabled">Enable Text-to-Speech (Piper TTS)</label>
        </div>
        <div className="field-row" style={{ marginTop: "6px" }}>
          <input
            id="sttEnabled"
            type="checkbox"
            checked={sttEnabled}
            onChange={(e) => setSttEnabled(e.target.checked)}
          />
          <label htmlFor="sttEnabled">Enable Speech-to-Text (Whisper)</label>
        </div>
      </fieldset>

      {/* ── Wake Word ─────────────────────────────────── */}
      <fieldset style={{ marginTop: "12px" }}>
        <legend>Wake Word</legend>
        <div className="field-row" style={{ marginBottom: "6px" }}>
          <input id="wakewordEnabled" type="checkbox" disabled />
          <label htmlFor="wakewordEnabled" style={{ color: "#888" }}>
            Wake Word detection (not yet configured)
          </label>
        </div>
        <div className="field-row">
          <label style={{ width: 80 }}>Keyword:</label>
          <input
            type="text"
            disabled
            placeholder='e.g. "Computer"'
            style={{ flex: 1 }}
          />
        </div>
        <p style={{ fontSize: "0.9em", color: "#888", marginTop: "4px" }}>
          Wake word support requires OpenWakeWord or Porcupine. Configure in a
          future release.
        </p>
      </fieldset>

      {/* ── Audio Output ──────────────────────────────── */}
      <fieldset style={{ marginTop: "12px" }}>
        <legend>Audio Output</legend>
        {audioDevices.length > 0 ? (
          <>
            <div className="field-row" style={{ marginBottom: "6px" }}>
              <label style={{ width: 80 }}>Device:</label>
              <select style={{ flex: 1 }}>
                {audioDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Output ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
            <p style={{ fontSize: "0.9em", color: "#555", margin: 0 }}>
              {audioDevices.length} output device(s) detected.
            </p>
          </>
        ) : (
          <p style={{ color: "#888", margin: 0, fontSize: "0.9em" }}>
            No labelled output devices found. Grant microphone permission to
            enumerate devices, or your browser may not support this API.
          </p>
        )}
      </fieldset>

      {/* ── TTS Voice ─────────────────────────────────── */}
      <fieldset style={{ marginTop: "12px" }}>
        <legend>TTS Voice</legend>
        {voiceList.length > 0 ? (
          <>
            <div className="field-row" style={{ marginBottom: "6px" }}>
              <label htmlFor="voiceSelect" style={{ width: 60 }}>
                Voice:
              </label>
              <select
                id="voiceSelect"
                value={currentVoice ?? ""}
                onChange={(e) => {
                  console.log(
                    "[SettingsVoice] onChange fired, selected:",
                    e.target.value,
                  );
                  selectVoice(e.target.value);
                }}
                disabled={!ttsEnabled}
                style={{ flex: 1 }}
              >
                {voiceList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} — {v.gender}, {v.style}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-row" style={{ marginBottom: "6px" }}>
              {isSpeaking ? (
                <button onClick={stopSpeaking}>Stop</button>
              ) : (
                <button
                  disabled={!ttsEnabled || !currentVoice}
                  onClick={() => speak("It looks like you need some help!")}
                >
                  Test Voice
                </button>
              )}
              <button style={{ marginLeft: "6px" }} onClick={rescan}>
                Rescan Voices
              </button>
            </div>
          </>
        ) : (
          <p style={{ margin: 0 }}>
            No voices found in <code>~/.config/Clippy/voices/</code>.
          </p>
        )}

        {/* Import Custom Voice */}
        <ImportVoiceSection importVoice={importVoice} />
      </fieldset>

      {/* ── Speech-to-Text ────────────────────────────── */}
      <fieldset style={{ marginTop: "12px" }}>
        <legend>Speech-to-Text (Whisper)</legend>
        <div className="field-row" style={{ marginBottom: "6px" }}>
          <label htmlFor="sttModel" style={{ width: 60 }}>
            Model:
          </label>
          <select
            id="sttModel"
            value={sttModel}
            onChange={(e) => changeSttModel(e.target.value)}
            disabled={!sttEnabled}
            style={{ flex: 1 }}
          >
            {availableSttModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <p style={{ fontSize: "0.9em", color: "#555", margin: 0 }}>
          <b>tiny</b> (~39 MB) · <b>base</b> (~74 MB) · <b>small</b> (~244 MB).
          Model downloads on first use. Requires <code>ffmpeg</code> in PATH.
        </p>
      </fieldset>
    </div>
  );
};

// ── Import Custom Voice ──────────────────────────────────────────────────────

interface ImportVoiceSectionProps {
  importVoice: (
    model: File,
    config?: File,
    meta?: File,
  ) => Promise<{
    status?: string;
    voice?: string;
    name?: string;
    error?: string;
  }>;
}

function ImportVoiceSection({ importVoice }: ImportVoiceSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const onnxFile = Array.from(files).find((f) => f.name.endsWith(".onnx"));
      if (!onnxFile) {
        setStatus({
          type: "error",
          message: "Please select a .onnx voice model file",
        });
        return;
      }

      const configFile = Array.from(files).find((f) =>
        f.name.endsWith(".onnx.json"),
      );
      const metaFile = Array.from(files).find((f) =>
        f.name.endsWith(".meta.json"),
      );

      setIsLoading(true);
      setStatus(null);

      try {
        const result = await importVoice(onnxFile, configFile, metaFile);
        if (result.error) {
          setStatus({ type: "error", message: result.error });
        } else {
          setStatus({
            type: "success",
            message: `Imported "${result.name}" successfully! Select it from the voice dropdown above.`,
          });
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      } catch (err) {
        setStatus({ type: "error", message: `Import failed: ${err}` });
      } finally {
        setIsLoading(false);
      }
    },
    [importVoice],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  return (
    <div className="sunken-panel" style={{ marginTop: "8px", padding: "8px" }}>
      <div
        style={{ cursor: "pointer", userSelect: "none" }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <strong>{isExpanded ? "▼" : "▶"} Import Custom Voice</strong>
      </div>

      {isExpanded && (
        <div style={{ marginTop: "8px" }}>
          <p
            style={{ fontSize: "0.9em", marginTop: "4px", marginBottom: "6px" }}
          >
            Drop <code>.onnx</code> voice model files here, or click to select.
            You can also include optional <code>.onnx.json</code> config and{" "}
            <code>.meta.json</code> metadata files.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".onnx,.onnx.json,.meta.json"
            multiple
            style={{ display: "none" }}
            onChange={(e) => handleFiles(e.target.files)}
          />

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? "#2b7de9" : "#888"}`,
              borderRadius: "4px",
              padding: "16px",
              textAlign: "center",
              cursor: "pointer",
              background: isDragging ? "rgba(43,125,233,0.1)" : "transparent",
              transition: "background 0.2s, border-color 0.2s",
            }}
          >
            {isLoading ? (
              <span>Importing...</span>
            ) : (
              <span style={{ color: "#555" }}>
                Drop files here or click to browse
              </span>
            )}
          </div>

          {status && (
            <p
              style={{
                fontSize: "0.9em",
                marginTop: "8px",
                marginBottom: 0,
                color:
                  status.type === "error"
                    ? "#cc0000"
                    : status.type === "success"
                      ? "#008800"
                      : "#555",
              }}
            >
              {status.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
