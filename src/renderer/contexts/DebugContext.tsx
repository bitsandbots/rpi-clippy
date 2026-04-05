import { createContext, useContext, useEffect, useState } from "react";

import { clippyApi } from "../clippyApi";
import { DebugState, EMPTY_DEBUG_STATE } from "../../debugState";

export const DebugContext = createContext<DebugState>(EMPTY_DEBUG_STATE);

export const DebugProvider = ({ children }: { children: React.ReactNode }) => {
  const [debugState, setDebugState] = useState<DebugState>(EMPTY_DEBUG_STATE);

  useEffect(() => {
    const fetchDebugState = async () => {
      const state = await clippyApi.getFullDebugState();
      setDebugState(state);
    };
    fetchDebugState();

    // Poll every 5 s — debug state changes rarely
    const id = setInterval(fetchDebugState, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <DebugContext.Provider value={debugState}>{children}</DebugContext.Provider>
  );
};

export const useDebugState = () => {
  const context = useContext(DebugContext);

  if (!context) {
    throw new Error("useDebugState must be used within a DebugProvider");
  }

  return context;
};
