import { useCallback } from "react";

import { Chat } from "./Chat";
import { Settings } from "./Settings";
import { useBubbleView } from "../contexts/BubbleViewContext";
import { Chats } from "./Chats";
import { useChat } from "../contexts/ChatContext";
import { StatusBar } from "./StatusBar";
import { useSharedState } from "../contexts/SharedStateContext";

export function Bubble() {
  const { currentView, setCurrentView } = useBubbleView();
  const { setIsChatWindowOpen, status } = useChat();
  const { settings } = useSharedState();

  const themeClass = settings.uiTheme === "expressive" ? "expressive" : "";

  const containerStyle = {
    width: "calc(100% - 6px)",
    height: "calc(100% - 6px)",
    margin: 0,
    overflow: "hidden",
  };

  const chatStyle = {
    padding: "15px",
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "flex-end",
    minHeight: "calc(100% - 35px)",
    overflowAnchor: "none" as const,
  };

  const scrollAnchoredAtBottomStyle = {
    display: "flex",
    flexDirection: "column-reverse" as const,
  };

  let content = null;

  if (currentView === "chat") {
    content = <Chat style={chatStyle} />;
  } else if (currentView.startsWith("settings")) {
    content = <Settings onClose={() => setCurrentView("chat")} />;
  } else if (currentView === "chats") {
    content = <Chats onClose={() => setCurrentView("chat")} />;
  }

  const handleSettingsClick = useCallback(() => {
    if (currentView.startsWith("settings")) {
      setCurrentView("chat");
    } else {
      setCurrentView("settings");
    }
  }, [setCurrentView, currentView]);

  const handleChatsClick = useCallback(() => {
    if (currentView === "chats") {
      setCurrentView("chat");
    } else {
      setCurrentView("chats");
    }
  }, [setCurrentView, currentView]);

  const isActivityPulse = status === "thinking" || status === "responding";

  const showStatusBar = currentView === "chat";

  return (
    <div
      className={`bubble-container window${isActivityPulse ? " activity-pulse" : ""}${themeClass ? ` ${themeClass}` : ""}`}
      style={{
        ...containerStyle,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="title-bar">
        <div className="title-bar-text">Chat with Sprout</div>
        <div className="title-bar-controls">
          <button
            style={{
              marginRight: "8px",
              paddingLeft: "8px",
              paddingRight: "8px",
            }}
            onClick={handleChatsClick}
          >
            Chats
          </button>
          <button
            style={{
              marginRight: "8px",
              paddingLeft: "8px",
              paddingRight: "8px",
            }}
            onClick={handleSettingsClick}
          >
            Settings
          </button>
          <button
            aria-label="Close"
            onClick={() => setIsChatWindowOpen(false)}
          ></button>
        </div>
      </div>
      <div
        className="window-content"
        style={{
          ...(currentView === "chat" ? scrollAnchoredAtBottomStyle : {}),
          flex: 1,
          overflow: "auto",
        }}
      >
        {content}
      </div>
      {showStatusBar && <StatusBar />}
    </div>
  );
}
