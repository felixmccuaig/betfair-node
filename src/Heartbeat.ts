// Functional heartbeat implementation
export interface HeartbeatState {
  isBeating: boolean;
  timeout?: NodeJS.Timeout;
  heartbeatMs: number;
  onHeartAttack: () => void;
}

/**
 * Creates a new heartbeat state
 * @param heartbeatMs - Heartbeat interval in milliseconds
 * @param onHeartAttack - Callback function when heartbeat fails
 * @returns Initial heartbeat state
 */
export const createHeartbeatState = (
  heartbeatMs: number,
  onHeartAttack: () => void
): HeartbeatState => ({
  isBeating: false,
  heartbeatMs,
  onHeartAttack,
});

/**
 * Starts the heartbeat monitoring
 * @param state - Current heartbeat state
 * @returns Updated heartbeat state
 */
export const startHeartbeat = (state: HeartbeatState): HeartbeatState => {
  if (state.isBeating) {
    return state; // Already beating
  }

  // Starting heartbeat
  
  // Add extra 2 seconds to reduce chance of accidental heart attack
  const timeout = setTimeout(state.onHeartAttack, state.heartbeatMs + 2000);

  return {
    ...state,
    isBeating: true,
    timeout,
  };
};

/**
 * Stops the heartbeat monitoring
 * @param state - Current heartbeat state
 * @returns Updated heartbeat state
 */
export const stopHeartbeat = (state: HeartbeatState): HeartbeatState => {
  if (!state.isBeating) {
    return state; // Already stopped
  }

  // Stopping heartbeat

  if (state.timeout) {
    clearTimeout(state.timeout);
  }

  return {
    ...state,
    isBeating: false,
    timeout: undefined,
  };
};

/**
 * Refreshes the heartbeat timer
 * @param state - Current heartbeat state
 * @returns Updated heartbeat state
 */
export const refreshHeartbeat = (state: HeartbeatState): HeartbeatState => {
  if (!state.isBeating) {
    console.warn('Heart is not beating!');
    return state;
  }

  // Heartbeat refresh

  if (state.timeout) {
    // Refresh the existing timeout
    state.timeout.refresh();
  }

  return state;
};

/**
 * Updates the heartbeat interval
 * @param state - Current heartbeat state
 * @param newHeartbeatMs - New heartbeat interval in milliseconds
 * @returns Updated heartbeat state
 */
export const updateHeartbeatInterval = (
  state: HeartbeatState,
  newHeartbeatMs: number
): HeartbeatState => {
  const updatedState = { ...state, heartbeatMs: newHeartbeatMs };
  
  if (state.isBeating) {
    // Restart with new interval
    const stoppedState = stopHeartbeat(updatedState);
    return startHeartbeat(stoppedState);
  }
  
  return updatedState;
};

/**
 * Checks if the heartbeat is currently active
 * @param state - Current heartbeat state
 * @returns True if heartbeat is active
 */
export const isHeartbeatActive = (state: HeartbeatState): boolean => {
  return state.isBeating;
};

/**
 * Gets the current heartbeat interval
 * @param state - Current heartbeat state
 * @returns Heartbeat interval in milliseconds
 */
export const getHeartbeatInterval = (state: HeartbeatState): number => {
  return state.heartbeatMs;
};