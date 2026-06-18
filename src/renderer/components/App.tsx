import "./css/App.css";
import "./css/SproutTheme.css";

import { Sprout } from "./Sprout";
import { ChatProvider } from "../contexts/ChatContext";
import { Bubble } from "./BubbleWindow";
import { SharedStateProvider } from "../contexts/SharedStateContext";
import { BubbleViewProvider } from "../contexts/BubbleViewContext";
import { DebugProvider } from "../contexts/DebugContext";
import { VoiceProvider } from "../contexts/VoiceContext";
import { useChat } from "../contexts/ChatContext";
import { useSharedState } from "../contexts/SharedStateContext";

function SproutLayout() {
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

        <div style={{ pointerEvents: "auto" }}>
          <Sprout />
        </div>
      </div>
    </div>
  );
}

function SproutRoot({ children }: { children: React.ReactNode }) {
  const { settings } = useSharedState();
  return (
    <div
      className="sprout"
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
              <SproutRoot>
                <SproutLayout />
              </SproutRoot>
            </BubbleViewProvider>
          </VoiceProvider>
        </ChatProvider>
      </SharedStateProvider>
    </DebugProvider>
  );
}
