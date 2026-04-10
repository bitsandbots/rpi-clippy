# Frontend Components

## Architecture

### Component Hierarchy

```
App (root)
├── DebugProvider
├── SharedStateProvider
│   └── ChatContext
│       ├── VoiceProvider
│       ├── BubbleViewProvider
│       ├── ClippyRoot (theming)
│       │   └── ClippyLayout
│       │       ├── BubbleWindow (chat bubble)
│       │       │   ├── TabList (settings tabs)
│       │       │   ├── BubbleWindowBottomBar (settings controls)
│       │       │   └── Chat (chat messages)
│       │       └── Clippy (animated sprite)
│       │           ├── ClippySprite (SVG animation)
│       │           └── ChatToggle (button)
│       └── Settings (modal)
```

### React Context Providers

| Provider           | File                   | State Managed                     |
| ------------------ | ---------------------- | --------------------------------- |
| DebugProvider      | DebugContext.tsx       | Debug flags, polling interval     |
| SharedStateContext | SharedStateContext.tsx | Models list, settings             |
| ChatProvider       | ChatContext.tsx        | Messages, chat history, animation |
| VoiceProvider      | VoiceContext.tsx       | TTS/STT state, audio playback     |
| BubbleViewProvider | BubbleViewContext.tsx  | Active settings tab               |

## Core Components

### Clippy.tsx

**Location**: `src/renderer/components/Clippy.tsx`

The animated Clippy sprite with mouse hover effects.

**Props**:

```typescript
type ClippyProps = {
  style?: React.CSSProperties;
  onClick?: () => void;
};
```

**Key Features**:

- CSS-based animations via `animation` property
- Mouse hover triggers animation change
- Click opens/closes chat bubble

### Chat.tsx

**Location**: `src/renderer/components/Chat.tsx`

The main chat interface with message list and input.

**Props**:

```typescript
type ChatProps = {
  style?: React.CSSProperties;
};
```

**State**:

- `status`: "idle" | "thinking" | "responding"
- `streamingMessageContent`: Text being streamed
- `lastRequestUUID`: Current request ID

**Callbacks**:

- `handleSendMessage(message: string)` - Send user message
- `handleAbortMessage()` - Stop streaming

### ChatInput.tsx

**Location**: `src/renderer/components/ChatInput.tsx`

Text input area with TTS toggle, mic button, and send button.

**Props**:

```typescript
type ChatInputProps = {
  onSend: (message: string) => void;
  onAbort: () => void;
};
```

**Controls**:

- Textarea - Message input
- TTS toggle - Mute/unmute voice responses
- Mic button - Record voice (if STT enabled)
- Send/Abort button - Depends on current status

### Message.tsx

**Location**: `src/renderer/components/Message.tsx`

Renders individual messages with markdown support.

**Props**:

```typescript
type MessageProps = {
  message: {
    id: string;
    content?: string;
    children?: React.ReactNode;
    sender: "user" | "clippy";
    createdAt: number;
  };
};
```

**Features**:

- `react-markdown` for message content
- Different styles for user vs clippy
- Timestamp display

### Settings.tsx

**Location**: `src/renderer/components/Settings.tsx`

Main settings modal with tab navigation.

**State**:

- `activeTab`: "appearance" | "voice" | "llm" | "advanced" | "about"
- `showBubbleView`: bubble view state

**Tabs**:

1. **Appearance** - Font size/family, bubble toggle
2. **Voice** - TTS/STT enable, voice selection, STT model
3. **LLM** - Model selection, temperature, topK, system prompt
4. **Advanced** - Ollama URL discovery
5. **About** - Version info, acknowledgements

## Sub-Components

### SettingsAppearance.tsx

Font size slider (8-24px) and font family selector.

**Controls**:

- Font size slider with preview
- Font family dropdown
- "Live preview" - Changes apply immediately

### SettingsVoice.tsx

TTS and STT configuration.

**Controls**:

- TTS toggle (enabled/disabled)
- Voice selector dropdown
- "Test Voice" button
- STT toggle
- STT model selector (tiny/base/small/medium/large)
- "Rescan Voices" button

### SettingsLLM.tsx

LLM model and generation settings.

**Controls**:

- Model selector (with download status)
- Temperature slider (0.0-1.0)
- TopK slider (1-100)
- System prompt editor

### BubbleWindow.tsx

**Location**: `src/renderer/components/BubbleWindow.tsx`

The chat bubble container window.

**State**:

- `isChatWindowOpen`: Toggle visibility
- `bubbleView`: "chat" or "settings"

### ClippyRoot.tsx

**Location**: `src/renderer/components/App.tsx`

Root component with theming.

**Features**:

- Sets `--font-size` CSS variable
- Sets `data-font` attribute for font family
- Scopes styles to `.clippy` class

## Context Hooks

### useChat()

Access chat state and actions.

```typescript
const {
  messages, // Message[]
  addMessage, // (message: Message) => Promise<void>
  setMessages, // (messages: Message[]) => void
  animationKey, // string (e.g., "Wave")
  setAnimationKey, // (key: string) => void
  status, // "idle" | "thinking" | "responding"
  setStatus, // (status: ClippyNamedStatus) => void
  isModelLoaded, // boolean
  isChatWindowOpen, // boolean
  setIsChatWindowOpen, // (open: boolean) => void
  chatRecords, // Record<string, ChatRecord>
  currentChatRecord, // ChatRecord
  selectChat, // (chatId: string) => Promise<void>
  startNewChat, // () => Promise<void>
  deleteChat, // (chatId: string) => Promise<void>
  deleteAllChats, // () => Promise<void>
} = useChat();
```

### useVoice()

Access voice state and actions.

```typescript
const {
  ttsEnabled, // boolean
  sttEnabled, // boolean
  currentVoice, // string | null
  voices, // Record<string, VoiceInfo>
  sttModel, // string
  availableSttModels, // string[]
  isSpeaking, // boolean
  setTtsEnabled, // (enabled: boolean) => Promise<void>
  setSttEnabled, // (enabled: boolean) => Promise<void>
  selectVoice, // (voiceId: string) => Promise<void>
  changeSttModel, // (model: string) => Promise<void>
  speak, // (text: string) => Promise<void>
  transcribe, // (audioBase64: string) => Promise<string>
  stopSpeaking, // () => void
  rescan, // () => Promise<void>
} = useVoice();
```

### useSharedState()

Access global state (models + settings).

```typescript
const {
  models, // ModelState
  settings, // SettingsState
} = useSharedState();
```

## Animation System

### Animation Keys

Animations are controlled by keywords in LLM responses:

| Keyword      | Animation        |
| ------------ | ---------------- |
| `[Wave]`     | Waving hand      |
| `[Idle]`     | Standing still   |
| `[Thinking]` | Thinking bubble  |
| `[Happy]`    | Happy expression |
| `[Sad]`      | Sad expression   |
| `[Listen]`   | Listening pose   |

### Animation Helpers

**Location**: `src/renderer/clippy-animation-helpers.tsx`

```typescript
// Available animations
const ANIMATION_KEYS = Object.keys(ANIMATIONS);
const ANIMATION_KEYS_BRACKETS = ANIMATION_KEYS.map(k => `[${k}]`);
const IDLE_ANIMATION_KEYS = ANIMATION_KEYS.filter(k => k.startsWith("Idle"));

// Random selection
getRandomAnimation(keys: string[], current?: Animation);
getRandomIdleAnimation(current?: Animation);
```

### Animation JSON Format

```json
{
  "Wave": {
    "src": "data:image/gif;base64,R0lGOD...",
    "length": 10,
    "fps": 3
  }
}
```

## API Client

### clippyApi.tsx

**Location**: `src/renderer/clippyApi.tsx`

Compatibility shim that re-exports API functions.

```typescript
import { clippyApi, electronAi } from "./clippyApi";
```

**clippyApi Interface**:

```typescript
{
  // Models
  updateModelState: () => Promise<void>;
  downloadModelByName: (name: string) => Promise<void>;
  deleteModelByName: (name: string) => Promise<boolean>;
  deleteAllModels: () => Promise<boolean>;

  // State
  getFullState: () => Promise<SharedState>;
  getState: (key: string) => Promise<unknown>;
  setState: (key: string, value: unknown) => Promise<void>;

  // Chats
  getChatRecords: () => Promise<Record<string, ChatRecord>>;
  getChatWithMessages: (id: string) => Promise<ChatWithMessages | null>;
  writeChatWithMessages: (data) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  deleteAllChats: () => Promise<void>;

  // LLM
  llmCreate: (options) => Promise<void>;
  llmDestroy: () => Promise<void>;
  llmAbort: (uuid: string) => Promise<void>;

  // Versions
  getVersions: () => Promise<Record<string, string>>;
}
```

**electronAi Interface**:

```typescript
{
  create: (options) => Promise<void>
  destroy: () => Promise<void>
  abortRequest: (uuid: string) => Promise<void>
  promptStreaming: (
    message: string,
    options: { requestUUID: string },
    callbacks: { onChunk, onDone, onError }
  ) => void
}
```

## Styling

### CSS Structure

```
src/renderer/
├── css/
│   ├── App.css           # Main app styles
│   ├── 98.extended.css   # 98.css extensions
│   └── Theme.css         # Clippy-specific theming
├── components/           # Component styles (inlined or CSS modules)
```

### Theming Variables

```css
/* Set by ClippyRoot */
.clippy {
  --font-size: 16px;
  --font-family: Tahoma;
}

/* Color scheme */
--clippy-color-bg: #c0c0c0;
--clippy-color-border: #808080;
--clippy-color-text: #000000;
--clippy-color-highlight: #ffffff;
--clippy-color-shadow: #808080;
```

## Responsive Design

### Layout Strategy

```css
/* Centered layout in viewport */
.chat-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

/* Bubble sizing */
.bubble-window {
  width: 450px;
  height: 650px;
}
```

### Mobile Considerations

- Touch targets minimum: 44px
- Font size responsive via settings slider
- Bubble can be resized by user
