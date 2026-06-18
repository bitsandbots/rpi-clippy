import Markdown from "react-markdown";
import questionIcon from "../images/icons/question.png";
import defaultClippyIcon from "../images/animations/Default.png";
import defaultSproutIcon from "../images/animations/sprout/Default.png";
import { MessageRecord } from "../../types/interfaces";
import { useSharedState } from "../contexts/SharedStateContext";
import { CHARACTERS, DEFAULT_CHARACTER } from "../character-animations";

export interface Message extends MessageRecord {
  id: string;
  content?: string;
  children?: React.ReactNode;
  createdAt: number;
  sender: "user" | "sprout";
}

const DEFAULT_ICONS: Record<string, string> = {
  clippy: defaultClippyIcon,
  sprout: defaultSproutIcon,
};

export function Message({ message }: { message: Message }) {
  const { settings } = useSharedState();
  const characterId = settings.character || DEFAULT_CHARACTER;
  const character = CHARACTERS[characterId] || CHARACTERS[DEFAULT_CHARACTER];
  const assistantIcon = DEFAULT_ICONS[character.id] || defaultSproutIcon;

  return (
    <div
      className="message"
      data-sender={message.sender}
      style={{ display: "flex", alignItems: "flex-start" }}
    >
      <img
        src={message.sender === "user" ? questionIcon : assistantIcon}
        alt={`${message.sender === "user" ? "You" : character.name}`}
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
