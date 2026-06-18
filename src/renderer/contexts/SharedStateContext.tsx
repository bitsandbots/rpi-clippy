import { createContext, useContext, useEffect, useRef, useState } from "react";
import { EMPTY_SHARED_STATE, SharedState } from "../../sharedState";
import { sproutApi } from "../sproutApi";
import { subscribePullProgress } from "../api";

export const SharedStateContext =
  createContext<SharedState>(EMPTY_SHARED_STATE);

export const SharedStateProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [sharedState, setSharedState] =
    useState<SharedState>(EMPTY_SHARED_STATE);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchState = async () => {
    const state = await sproutApi.getFullState();
    setSharedState(state);
  };

  // Initial fetch + polling every 2 s
  useEffect(() => {
    fetchState().catch(console.error);
    pollRef.current = setInterval(
      () => fetchState().catch(console.error),
      2000,
    );
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Subscribe to pull-progress SSE — refetch state on each event so the
  // download progress bar updates in real time
  useEffect(() => {
    const unsubscribe = subscribePullProgress(() => {
      fetchState();
    });
    return unsubscribe;
  }, []);

  return (
    <SharedStateContext.Provider value={sharedState}>
      {children}
    </SharedStateContext.Provider>
  );
};

export const useSharedState = () => {
  const sharedState = useContext(SharedStateContext);

  if (!sharedState) {
    throw new Error("useSharedState must be used within a SharedStateProvider");
  }

  return sharedState;
};
