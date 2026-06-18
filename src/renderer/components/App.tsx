import "./css/App.css";
import "./css/SproutTheme.css";

import { Sprout } from "./Sprout";
import { ChatProvider } from "../contexts/ChatContext";
import { Bubble } from "./BubbleWindow";
import { SharedStateProvider } from "../contexts/SharedStateContext";
import { BubbleViewProvider } from "../contexts/BubbleViewContext";
import { DebugProvider } from "../contexts/DebugContext";
import { VoiceProvider } from "../contexts/VoiceContext";
import { useSharedState } from "../contexts/SharedStateContext";

function SproutLayout() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
        width: "100vw",
        height: "100vh",
      }}
    >
      <div style={{ flex: 1, minWidth: "320px", display: "flex", flexDirection: "column" }}>
        <Bubble />
      </div>
      <div style={{ width: "372px", flexShrink: 0, display: "flex", alignItems: "flex-end" }}>
        <Sprout />
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
