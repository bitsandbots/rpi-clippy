import "./css/App.css";
import "../../../node_modules/98.css/dist/98.css";
import "./css/98.extended.css";
import "./css/Theme.css";
import "./css/Win95Enhanced.css";

import { Clippy } from "./Clippy";
import { ChatProvider } from "../contexts/ChatContext";
import { Bubble } from "./BubbleWindow";
import { SharedStateProvider } from "../contexts/SharedStateContext";
import { BubbleViewProvider } from "../contexts/BubbleViewContext";
import { DebugProvider } from "../contexts/DebugContext";
import { VoiceProvider } from "../contexts/VoiceContext";
import { useChat } from "../contexts/ChatContext";
import { useSharedState } from "../contexts/SharedStateContext";

function ClippyLayout() {
  const { isChatWindowOpen } = useChat();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          pointerEvents: "none",
        }}
      >
        {/* Chat bubble — above the sprite */}
        {isChatWindowOpen && (
          <div
            style={{
              width: "450px",
              height: "650px",
              pointerEvents: "auto",
            }}
          >
            <Bubble />
          </div>
        )}

        {/* Clippy sprite — always visible */}
        <div style={{ pointerEvents: "auto" }}>
          <Clippy />
        </div>
      </div>
    </div>
  );
}

function ClippyRoot({ children }: { children: React.ReactNode }) {
  const { settings } = useSharedState();
  return (
    <div
      className="clippy"
      style={
        {
          "--font-size": `${settings.defaultFontSize}px`,
        } as React.CSSProperties
      }
      data-font={settings.defaultFont}
    >
      {children}
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
              <ClippyRoot>
                <ClippyLayout />
              </ClippyRoot>
            </BubbleViewProvider>
          </VoiceProvider>
        </ChatProvider>
      </SharedStateProvider>
    </DebugProvider>
  );
}
