import { useChat } from "../contexts/ChatContext";
import { useSharedState } from "../contexts/SharedStateContext";

/**
 * StatusBar — Authentic Windows 95 status bar component
 * Displays current status and model information
 */
export function StatusBar() {
  const { status, isModelLoaded } = useChat();
  const { settings } = useSharedState();

  const statusText = getStatusText(status, isModelLoaded);
  const modelText =
    isModelLoaded && settings.selectedModel
      ? settings.selectedModel
      : "No model";

  return (
    <div className="status-bar" style={{ marginTop: "auto" }}>
      <div className="status-bar-field">{statusText}</div>
      <div
        className="status-bar-field"
        style={{ flexGrow: 1, textAlign: "right" }}
      >
        {modelText}
      </div>
    </div>
  );
}

function getStatusText(status: string, isLoaded: boolean): string {
  if (!isLoaded) return "Loading model...";
  switch (status) {
    case "thinking":
      return "Thinking...";
    case "responding":
      return "Responding...";
    case "welcome":
      return "Welcome!";
    default:
      return "Ready";
  }
}
