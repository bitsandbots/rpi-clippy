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

  return (
    <div>
      {/* ── Text-to-Speech ─────────────────────────────── */}
      <fieldset>
        <legend>Text-to-Speech (Piper)</legend>
        <div className="field-row">
          <input
            id="ttsEnabled"
            type="checkbox"
            checked={ttsEnabled}
            onChange={(e) => setTtsEnabled(e.target.checked)}
          />
          <label htmlFor="ttsEnabled">Speak Clippy's responses aloud</label>
        </div>

        {voiceList.length > 0 ? (
          <>
            <div className="field-row" style={{ marginTop: "8px" }}>
              <label htmlFor="voiceSelect" style={{ marginRight: "8px" }}>
                Voice:
              </label>
              <select
                id="voiceSelect"
                value={currentVoice ?? ""}
                onChange={(e) => selectVoice(e.target.value)}
                disabled={!ttsEnabled}
              >
                {voiceList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.gender}, {v.style})
                  </option>
                ))}
              </select>
            </div>
            <div className="field-row" style={{ marginTop: "8px" }}>
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
            </div>
          </>
        ) : (
          <p style={{ marginTop: "8px" }}>
            No voices found in <code>~/.config/Clippy/voices/</code>.
            <br />
            Run <code>bash scripts/setup_voices.sh</code> to download starter
            voices, then click Rescan.
          </p>
        )}

        <div className="field-row" style={{ marginTop: "8px" }}>
          <button onClick={rescan}>Rescan Voices</button>
        </div>
      </fieldset>

      {/* ── Speech-to-Text ─────────────────────────────── */}
      <fieldset style={{ marginTop: "12px" }}>
        <legend>Speech-to-Text (Whisper)</legend>
        <div className="field-row">
          <input
            id="sttEnabled"
            type="checkbox"
            checked={sttEnabled}
            onChange={(e) => setSttEnabled(e.target.checked)}
          />
          <label htmlFor="sttEnabled">Show mic button (🎤) in chat input</label>
        </div>
        <div className="field-row" style={{ marginTop: "8px" }}>
          <label htmlFor="sttModel" style={{ marginRight: "8px" }}>
            Model:
          </label>
          <select
            id="sttModel"
            value={sttModel}
            onChange={(e) => changeSttModel(e.target.value)}
            disabled={!sttEnabled}
          >
            {availableSttModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <p style={{ marginTop: "4px", fontSize: "11px" }}>
          <b>tiny</b> — fastest, ~39 MB. <b>base</b> — better accuracy, ~74 MB.
          <b> small</b> — best quality, ~244 MB. Model downloads on first use.
          Requires <code>ffmpeg</code> in PATH.
        </p>
      </fieldset>
    </div>
  );
};
