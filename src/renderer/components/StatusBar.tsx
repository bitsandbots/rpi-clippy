import { useChat } from "../contexts/ChatContext";
import { useSharedState } from "../contexts/SharedStateContext";

export function StatusBar() {
  const { status, isModelLoaded } = useChat();
  const { settings } = useSharedState();

  const statusText = getStatusText(status, isModelLoaded);
  const modelText =
    isModelLoaded && settings.selectedModel
      ? settings.selectedModel
      : "No model";

  return (
    <div className="sc-statusbar">
      <span>{statusText}</span>
      <span>{modelText}</span>
    </div>
  );
}

export function getStatusText(status: string, isLoaded: boolean): string {
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
