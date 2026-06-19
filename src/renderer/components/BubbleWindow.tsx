import { useCallback } from "react";

import { Chat } from "./Chat";
import { Settings } from "./Settings";
import { useBubbleView } from "../contexts/BubbleViewContext";
import { Chats } from "./Chats";
import { useChat } from "../contexts/ChatContext";
import { StatusBar } from "./StatusBar";

export function Bubble() {
  const { currentView, setCurrentView } = useBubbleView();
  const { status } = useChat();

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

  const isActive = status === "thinking" || status === "responding";
  const showStatusBar = currentView === "chat";

  return (
    <div
      className={`chat-panel${isActive ? " chat-panel--active" : ""}`}
      style={{ width: "100%", height: "100%" }}
    >
      <div className="chat-nav-bar">
        <button
          className={
            currentView === "chats" ? "chat-nav-btn active" : "chat-nav-btn"
          }
          onClick={handleChatsClick}
        >
          Chats
        </button>
        <button
          className={
            currentView.startsWith("settings")
              ? "chat-nav-btn active"
              : "chat-nav-btn"
          }
          onClick={handleSettingsClick}
          aria-label="Settings"
          title="Settings"
        >
          ⚙
        </button>
      </div>
      <div
        className="chat-panel-body"
        style={currentView === "chat" ? scrollAnchoredAtBottomStyle : {}}
      >
        {content}
      </div>
      {showStatusBar && <StatusBar />}
    </div>
  );
}
