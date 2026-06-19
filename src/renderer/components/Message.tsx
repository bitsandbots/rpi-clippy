import Markdown from "react-markdown";
import questionIcon from "../images/icons/question.png";
import defaultSproutIcon from "../images/animations/sprout_flower_preview.png";
import { MessageRecord } from "../../types/interfaces";

export interface Message extends MessageRecord {
  id: string;
  content?: string;
  children?: React.ReactNode;
  createdAt: number;
  sender: "user" | "sprout";
}

export function Message({ message }: { message: Message }) {
  const assistantIcon = defaultSproutIcon;

  return (
    <div
      className="message"
      data-sender={message.sender}
      style={{ display: "flex", alignItems: "flex-start" }}
    >
      <img
        src={message.sender === "user" ? questionIcon : assistantIcon}
        alt={message.sender === "user" ? "You" : "Sprout"}
        style={{ width: "24px", height: "24px", marginRight: "8px" }}
      />
      <div className="message-content">
        {message.children ? (
          message.children
        ) : (
          <Markdown
            components={{
              a: ({ node, ...props }) => (
                <a target="_blank" rel="noopener noreferrer" {...props} />
              ),
            }}
          >
            {message.content}
          </Markdown>
        )}
      </div>
    </div>
  );
}
