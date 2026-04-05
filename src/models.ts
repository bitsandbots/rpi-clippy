import type { DownloadState } from "./sharedState";

export interface Model {
  name: string;
  size: number;
  company?: string;
  url?: string;
  /** Ollama model tag used for inference and `ollama pull`. */
  ollamaTag?: string;
  description?: string;
  homepage?: string;
}

export interface ManagedModel extends Model {
  path: string;
  downloaded?: boolean;
  downloadState?: DownloadState;
  imported?: boolean;
}

export type ModelState = Record<string, ManagedModel>;

export const BUILT_IN_MODELS: Model[] = [
  {
    name: "Gemma 3 (1B)",
    company: "Google",
    size: 806,
    ollamaTag: "gemma3:1b",
    description:
      "Gemma 3, Google's state-of-the-art models in 1B–27B sizes. 128K context window, multilingual support. Fast on Pi 5.",
  },
  {
    name: "Gemma 3 (4B)",
    company: "Google",
    size: 2490,
    ollamaTag: "gemma3:4b",
    description:
      "Gemma 3 4B — better quality than 1B, still runs well on an 8GB Pi 5.",
  },
  {
    name: "Gemma 3 (12B)",
    company: "Google",
    size: 5600,
    ollamaTag: "gemma3:12b",
    description:
      "Gemma 3 12B — high quality, slow on Pi 5. Recommended only with SSD and patience.",
  },
  {
    name: "Phi-4 Mini (3.8B)",
    company: "Microsoft",
    size: 2490,
    ollamaTag: "phi4-mini",
    description:
      "Phi-4-mini is a 3.8B dense decoder-only transformer. Strong reasoning and coding ability in a compact size.",
    homepage:
      "https://azure.microsoft.com/en-us/blog/empowering-innovation-the-next-generation-of-the-phi-family/",
  },
  {
    name: "Qwen3 (4B)",
    company: "Qwen",
    size: 2500,
    ollamaTag: "qwen3:4b",
    description:
      "Qwen3 4B — strong reasoning and multilingual support. A good all-rounder for Pi 5.",
    homepage: "https://qwenlm.github.io/blog/qwen3/",
  },
  {
    name: "Llama 3.2 (1B Instruct)",
    company: "Meta",
    size: 808,
    ollamaTag: "llama3.2:1b",
    description:
      "Llama 3.2 1B — the lightest capable Llama model. Fast responses on Pi 5, good for quick tasks.",
    homepage:
      "https://ai.meta.com/blog/llama-3-2-connect-2024-vision-edge-mobile-devices/",
  },
  {
    name: "Llama 3.2 (3B Instruct)",
    company: "Meta",
    size: 2020,
    ollamaTag: "llama3.2:3b",
    description:
      "Llama 3.2 3B — best quality-to-speed tradeoff on an 8GB Pi 5. Recommended for most users.",
    homepage:
      "https://ai.meta.com/blog/llama-3-2-connect-2024-vision-edge-mobile-devices/",
  },
  {
    name: "TinyLlama (1.1B)",
    company: "TinyLlama",
    size: 637,
    ollamaTag: "tinyllama",
    description:
      "TinyLlama 1.1B — the fastest model option. Great for testing and very constrained hardware.",
  },
];
