import "./css/App.css";
import "../../../node_modules/98.css/dist/98.css";
import "./css/98.extended.css";
import "./css/Theme.css";

import { Clippy } from "./Clippy";
import { ChatProvider } from "../contexts/ChatContext";
import { Bubble } from "./BubbleWindow";
import { SharedStateProvider } from "../contexts/SharedStateContext";
import { BubbleViewProvider } from "../contexts/BubbleViewContext";
import { DebugProvider } from "../contexts/DebugContext";
import { VoiceProvider } from "../contexts/VoiceContext";
import { useChat } from "../contexts/ChatContext";

function ClippyLayout() {
  const { isChatWindowOpen } = useChat();

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        right: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {/* Chat bubble overlay — positioned above the sprite */}
      {isChatWindowOpen && (
        <div
          style={{
            position: "absolute",
            bottom: "110px",
            right: "10px",
            width: "450px",
            height: "650px",
            pointerEvents: "auto",
          }}
        >
          <Bubble />
        </div>
      )}

      {/* Clippy sprite — always visible */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          pointerEvents: "auto",
        }}
      >
        <Clippy />
      </div>
    </div>
  );
}

export function App() {
  return (
    <DebugProvider>
      <SharedStateProvider>
        <ChatProvider>
          <VoiceProvider>
            <BubbleViewProvider>
              <div className="clippy">
                <ClippyLayout />
              </div>
            </BubbleViewProvider>
          </VoiceProvider>
        </ChatProvider>
      </SharedStateProvider>
    </DebugProvider>
  );
}
