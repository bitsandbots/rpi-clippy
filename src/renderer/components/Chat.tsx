import { useState } from "react";

import { Message } from "./Message";
import { ChatInput } from "./ChatInput";
import {
  ANIMATION_KEYS,
  ANIMATION_KEYS_BRACKETS,
} from "../sprout-animation-helpers";
import { useChat } from "../contexts/ChatContext";
import { useVoice } from "../contexts/VoiceContext";
import { electronAi } from "../sproutApi";
import { randomUUID } from "../helpers/uuid";

export type ChatProps = {
  style?: React.CSSProperties;
};

export function Chat({ style }: ChatProps) {
  const { setAnimationKey, setStatus, status, messages, addMessage } =
    useChat();
  const { ttsEnabled, speak } = useVoice();
  const [streamingMessageContent, setStreamingMessageContent] =
    useState<string>("");
  const [lastRequestUUID, setLastRequestUUID] = useState<string>(randomUUID());

  const handleAbortMessage = () => {
    electronAi.abortRequest(lastRequestUUID);
  };

  const handleSendMessage = async (message: string) => {
    if (status !== "idle") {
      return;
    }

    const userMessage: Message = {
      id: randomUUID(),
      content: message,
      sender: "user",
      createdAt: Date.now(),
    };

    await addMessage(userMessage);
    setStreamingMessageContent("");
    setStatus("thinking");

    const requestUUID = randomUUID();
    setLastRequestUUID(requestUUID);

    let fullContent = "";
    let filteredContent = "";
    let hasSetAnimationKey = false;

    electronAi.promptStreaming(
      message,
      { requestUUID },
      {
        onChunk: (chunk: string) => {
          if (fullContent === "") {
            setStatus("responding");
          }

          if (!hasSetAnimationKey) {
            const { text, animationKey } = filterMessageContent(
              fullContent + chunk,
            );
            filteredContent = text;
            fullContent = fullContent + chunk;
            if (animationKey) {
              setAnimationKey(animationKey);
              hasSetAnimationKey = true;
            }
          } else {
            filteredContent += chunk;
            fullContent += chunk;
          }

          setStreamingMessageContent(filteredContent);
        },
        onDone: () => {
          addMessage({
            id: randomUUID(),
            content: filteredContent,
            sender: "sprout",
            createdAt: Date.now(),
          });
          setStreamingMessageContent("");
          setStatus("idle");
          if (ttsEnabled && filteredContent) {
            speak(filteredContent);
          }
        },
        onError: (error: string) => {
          console.error("LLM error:", error);
          addMessage({
            id: randomUUID(),
            content: `_Could not get a response — ${error}_`,
            sender: "sprout",
            createdAt: Date.now(),
          });
          setStreamingMessageContent("");
          setStatus("idle");
        },
      },
    );
  };

  return (
    <div style={style} className="chat-container">
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
      {status === "responding" && (
        <Message
          message={{
            id: "streaming",
            content: streamingMessageContent,
            sender: "sprout",
            createdAt: Date.now(),
          }}
        />
      )}
      <ChatInput onSend={handleSendMessage} onAbort={handleAbortMessage} />
    </div>
  );
}

/**
 * Filter the message content to get the text and animation key
 *
 * @param content - The content of the message
 * @returns The text and animation key
 */
function filterMessageContent(content: string): {
  text: string;
  animationKey: string;
} {
  let text = content;
  let animationKey = "";

  if (content === "[") {
    text = "";
  } else if (/^\[[A-Za-z]*$/m.test(content)) {
    text = content.replace(/^\[[A-Za-z]*$/m, "").trim();
  } else {
    // Check for animation keys in brackets (preferred format)
    for (const key of ANIMATION_KEYS_BRACKETS) {
      if (content.startsWith(key)) {
        animationKey = key.slice(1, -1);
        text = content.slice(key.length).trim();
        break;
      }
    }

    // Fallback: check for animation keys without brackets but followed by colon
    // This handles cases where LLM doesn't follow the bracket format exactly
    if (!animationKey) {
      for (const key of ANIMATION_KEYS) {
        const keyWithColon = `${key}:`;
        if (content.startsWith(keyWithColon)) {
          animationKey = key;
          text = content.slice(keyWithColon.length).trim();
          break;
        }
      }
    }
  }

  return { text, animationKey };
}
