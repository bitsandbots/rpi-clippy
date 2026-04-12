import { useState, useEffect, useCallback } from "react";
import { useSharedState } from "../contexts/SharedStateContext";
import { clippyApi } from "../clippyApi";
import {
  getOllamaStatus,
  setOllamaUrl,
  discoverOllama,
  type OllamaStatus,
  type OllamaInstance,
} from "../api";

export const SettingsLLM: React.FC = () => {
  const { settings } = useSharedState();

  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [urlInput, setUrlInput] = useState(
    settings.ollamaUrl ?? "http://localhost:11434",
  );
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<OllamaInstance[]>([]);
  const [showDiscovery, setShowDiscovery] = useState(false);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const s = await getOllamaStatus();
      setStatus(s);
      setUrlInput(s.url);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleApplyUrl = async () => {
    await setOllamaUrl(urlInput);
    await checkStatus();
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    setShowDiscovery(true);
    try {
      const instances = await discoverOllama();
      setDiscovered(instances);
    } finally {
      setDiscovering(false);
    }
  };

  const handleSelectInstance = async (url: string) => {
    setUrlInput(url);
    await setOllamaUrl(url);
    await checkStatus();
    setShowDiscovery(false);
  };

  const connectedColor = status?.connected ? "#007700" : "#cc0000";
  const connectedLabel = checking
    ? "Checking…"
    : status?.connected
      ? "Connected"
      : "Disconnected";

  const modelKeys = Object.keys(useSharedState().models ?? {});
  const { models } = useSharedState();
  const loadedModel = modelKeys
    .map((k) => models[k as keyof typeof models])
    .find((m) => m?.name === settings.selectedModel);

  return (
    <div>
      {/* ── Connection ────────────────────────────────── */}
      <fieldset>
        <legend>Local LLM (Ollama)</legend>

        <div className="field-row" style={{ marginBottom: "6px" }}>
          <label style={{ width: 70 }}>URL:</label>
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            style={{ flex: 1, marginRight: "6px" }}
            onKeyDown={(e) => e.key === "Enter" && handleApplyUrl()}
          />
          <button onClick={handleApplyUrl}>Apply</button>
        </div>

        <div className="field-row" style={{ marginBottom: "6px" }}>
          <label style={{ width: 70 }}>Status:</label>
          <span style={{ color: connectedColor, fontWeight: "bold" }}>
            {connectedLabel}
          </span>
          <button
            style={{ marginLeft: "10px" }}
            disabled={checking}
            onClick={checkStatus}
          >
            Refresh
          </button>
        </div>

        {status?.activeModel && (
          <div className="field-row" style={{ marginBottom: "6px" }}>
            <label style={{ width: 70 }}>Running:</label>
            <code>{status.activeModel}</code>
          </div>
        )}

        {loadedModel && (
          <div className="field-row" style={{ marginBottom: "6px" }}>
            <label style={{ width: 70 }}>Model:</label>
            <span>{loadedModel.name}</span>
            {loadedModel.ollamaTag && (
              <code style={{ marginLeft: "8px", color: "#555" }}>
                {loadedModel.ollamaTag}
              </code>
            )}
          </div>
        )}

        <div className="field-row" style={{ marginTop: "10px" }}>
          <button onClick={handleDiscover} disabled={discovering}>
            {discovering ? "Scanning LAN…" : "Discover Ollama on LAN"}
          </button>
          <span style={{ marginLeft: "8px", fontSize: "0.9em", color: "#555" }}>
            Find local and remote Ollama instances
          </span>
        </div>

        {showDiscovery && (
          <div
            className="sunken-panel"
            style={{ marginTop: "8px", padding: "8px", minHeight: "40px" }}
          >
            {discovering ? (
              <span>Scanning subnet…</span>
            ) : discovered.length === 0 ? (
              <span style={{ color: "#888" }}>No instances found.</span>
            ) : (
              <>
                <div style={{ marginBottom: "4px", fontWeight: "bold" }}>
                  Found {discovered.length} instance(s):
                </div>
                {discovered.map((inst) => (
                  <div
                    key={inst.url}
                    className="field-row"
                    style={{ marginBottom: "4px" }}
                  >
                    <code style={{ flex: 1 }}>{inst.url}</code>
                    <button
                      style={{ marginLeft: "8px" }}
                      onClick={() => handleSelectInstance(inst.url)}
                    >
                      Use
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </fieldset>

      {/* ── Active session ────────────────────────────── */}
      <fieldset>
        <legend>Active Model</legend>
        <p style={{ marginTop: 0 }}>
          Use the <strong>Model</strong> tab to download and select which model
          Clippy uses. The selected model is loaded on next chat session.
        </p>
        <div className="field-row">
          <label style={{ width: 70 }}>Selected:</label>
          <span>{settings.selectedModel ?? <em>none</em>}</span>
        </div>
        <div className="field-row" style={{ marginTop: "6px" }}>
          <button
            onClick={() => clippyApi.setState("settings.selectedModel", null)}
            disabled={!settings.selectedModel}
          >
            Clear selection
          </button>
        </div>
      </fieldset>
    </div>
  );
};
