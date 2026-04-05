import { useState, useEffect } from "react";
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
  } = useVoice();

  const voiceList = Object.values(voices);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);

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
                onChange={(e) => selectVoice(e.target.value)}
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

        {/* Download Voices */}
        <div
          className="sunken-panel"
          style={{ marginTop: "8px", padding: "8px" }}
        >
          <strong>Download Voices</strong>
          <p
            style={{ fontSize: "0.9em", marginTop: "4px", marginBottom: "6px" }}
          >
            Run one of the following commands on the Pi to download Piper voice
            models:
          </p>
          <code style={{ display: "block", fontSize: "0.9em" }}>
            bash scripts/setup_voices.sh &nbsp;&nbsp;&nbsp;# starter voices
          </code>
          <code
            style={{ display: "block", fontSize: "0.9em", marginTop: "2px" }}
          >
            bash scripts/setup_voices.sh all &nbsp;# all voices
          </code>
          <button style={{ marginTop: "8px" }} onClick={rescan}>
            Rescan after download
          </button>
        </div>
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
