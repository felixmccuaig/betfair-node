import {
  HeartbeatState,
  createHeartbeatState,
  startHeartbeat,
  stopHeartbeat,
  refreshHeartbeat,
  updateHeartbeatInterval,
  isHeartbeatActive,
  getHeartbeatInterval,
} from '../src/heartbeat';

describe('Heartbeat Functions', () => {
  let mockOnHeartAttack: jest.Mock;
  let initialState: HeartbeatState;

  beforeEach(() => {
    mockOnHeartAttack = jest.fn();
    initialState = createHeartbeatState(5000, mockOnHeartAttack);
    jest.clearAllMocks();
    
    // Mock console.log to avoid cluttering test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Clean up any active timers to prevent leaks
    if (jest.getTimerCount() > 0) {
      jest.runAllTimers();
      jest.clearAllTimers();
    }
    if (jest.isMockFunction(setTimeout)) {
      jest.useRealTimers();
    }
  });

  describe('createHeartbeatState', () => {
    it('should create initial heartbeat state', () => {
      expect(initialState.isBeating).toBe(false);
      expect(initialState.heartbeatMs).toBe(5000);
      expect(initialState.onHeartAttack).toBe(mockOnHeartAttack);
      expect(initialState.timeout).toBeUndefined();
    });
  });

  describe('startHeartbeat', () => {
    it('should start heartbeat and set timeout', () => {
      let state = initialState;
      try {
        state = startHeartbeat(state);
        expect(state.isBeating).toBe(true);
        expect(state.timeout).toBeDefined();
      } finally {
        state = stopHeartbeat(state);
      }
    });

    it('should not restart if already beating', () => {
      let state = startHeartbeat(initialState);
      const originalTimeout = state.timeout;
      try {
        const notRestartedState = startHeartbeat(state);
        expect(notRestartedState.timeout).toBe(originalTimeout);
        expect(notRestartedState.isBeating).toBe(true);
      } finally {
        state = stopHeartbeat(state);
      }
    });

    it('should call onHeartAttack after timeout period', (done) => {
      jest.useFakeTimers();
      const shortHeartbeatState = createHeartbeatState(50, mockOnHeartAttack);
      startHeartbeat(shortHeartbeatState);
      
      // Fast forward past the timeout (50ms + 2000ms buffer)
      jest.advanceTimersByTime(2100);
      
      expect(mockOnHeartAttack).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
      done();
    });

    it('should add 2 second buffer to timeout', () => {
      jest.useFakeTimers();
      let state = createHeartbeatState(1000, mockOnHeartAttack);
      state = startHeartbeat(state);
      
      // Advance timer by 1000ms (heartbeat interval)
      jest.advanceTimersByTime(1000);
      expect(mockOnHeartAttack).not.toHaveBeenCalled();
      
      // Advance timer by additional 2000ms (buffer)
      jest.advanceTimersByTime(2000);
      expect(mockOnHeartAttack).toHaveBeenCalledTimes(1);
      
      jest.useRealTimers();
      state = stopHeartbeat(state);
    });
  });

  describe('stopHeartbeat', () => {
    it('should stop heartbeat and clear timeout', () => {
      const beatingState = startHeartbeat(initialState);
      const stoppedState = stopHeartbeat(beatingState);
      
      expect(stoppedState.isBeating).toBe(false);
      expect(stoppedState.timeout).toBeUndefined();
    });

    it('should not error if already stopped', () => {
      const stoppedState = stopHeartbeat(initialState);
      
      expect(stoppedState.isBeating).toBe(false);
      expect(stoppedState.timeout).toBeUndefined();
    });

    it('should prevent heart attack after stopping', () => {
      jest.useFakeTimers();
      const beatingState = startHeartbeat(initialState);
      stopHeartbeat(beatingState);
      
      // Advance past the original timeout period
      jest.advanceTimersByTime(10000);
      
      expect(mockOnHeartAttack).not.toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('refreshHeartbeat', () => {
    it('should refresh active heartbeat', () => {
      let state = startHeartbeat(initialState);
      try {
        state = refreshHeartbeat(state);
        expect(state.isBeating).toBe(true);
      } finally {
        state = stopHeartbeat(state);
      }
    });

    it('should not change state when heartbeat is not active', () => {
      const refreshedState = refreshHeartbeat(initialState);
      
      expect(refreshedState.isBeating).toBe(false);
      expect(refreshedState).toEqual(initialState);
    });

    it('should extend timeout when refreshed', () => {
      jest.useFakeTimers();
      const beatingState = startHeartbeat(initialState);
      
      // Advance time partway through timeout period
      jest.advanceTimersByTime(3000);
      
      // Refresh heartbeat
      refreshHeartbeat(beatingState);
      
      // Advance past original timeout but not past refreshed timeout
      jest.advanceTimersByTime(3000);
      expect(mockOnHeartAttack).not.toHaveBeenCalled();
      
      jest.useRealTimers();
    });
  });

  describe('updateHeartbeatInterval', () => {
    it('should update interval for inactive heartbeat', () => {
      const updatedState = updateHeartbeatInterval(initialState, 3000);
      
      expect(updatedState.heartbeatMs).toBe(3000);
      expect(updatedState.isBeating).toBe(false);
    });

    it('should restart heartbeat with new interval when active', () => {
      let state = startHeartbeat(initialState);
      try {
        state = updateHeartbeatInterval(state, 3000);
        
        expect(state.heartbeatMs).toBe(3000);
        expect(state.isBeating).toBe(true);
      } finally {
        state = stopHeartbeat(state);
      }
    });

    it('should use new interval for timeout calculation', () => {
      jest.useFakeTimers();
      const beatingState = startHeartbeat(initialState);
      const updatedState = updateHeartbeatInterval(beatingState, 1000);
      
      // Clear any previous calls from the restart
      mockOnHeartAttack.mockClear();
      
      // Should not trigger before new interval (1000ms + 2000ms buffer)
      jest.advanceTimersByTime(2500);
      expect(mockOnHeartAttack).not.toHaveBeenCalled();
      
      // Should trigger at new interval (1000ms + 2000ms buffer = 3000ms total)
      jest.advanceTimersByTime(1000);
      expect(mockOnHeartAttack).toHaveBeenCalledTimes(1);
      
      jest.useRealTimers();
    });
  });

  describe('isHeartbeatActive', () => {
    it('should return false for inactive heartbeat', () => {
      expect(isHeartbeatActive(initialState)).toBe(false);
    });

    it('should return true for active heartbeat', () => {
      let state = startHeartbeat(initialState);
      try {
        expect(isHeartbeatActive(state)).toBe(true);
      } finally {
        state = stopHeartbeat(state);
      }
    });

    it('should return false after stopping', () => {
      let state = startHeartbeat(initialState);
      state = stopHeartbeat(state);
      expect(isHeartbeatActive(state)).toBe(false);
    });
  });

  describe('getHeartbeatInterval', () => {
    it('should return current heartbeat interval', () => {
      expect(getHeartbeatInterval(initialState)).toBe(5000);
    });

    it('should return updated interval', () => {
      const updatedState = updateHeartbeatInterval(initialState, 3000);
      expect(getHeartbeatInterval(updatedState)).toBe(3000);
    });
  });

  describe('Integration tests', () => {
    it('should handle complete lifecycle', () => {
      let state = initialState;
      try {
        // Start heartbeat
        state = startHeartbeat(state);
        expect(isHeartbeatActive(state)).toBe(true);
        
        // Refresh heartbeat
        state = refreshHeartbeat(state);
        expect(isHeartbeatActive(state)).toBe(true);
        
        // Update interval
        state = updateHeartbeatInterval(state, 2000);
        expect(getHeartbeatInterval(state)).toBe(2000);
        expect(isHeartbeatActive(state)).toBe(true);
      } finally {
        // Stop heartbeat
        state = stopHeartbeat(state);
        expect(isHeartbeatActive(state)).toBe(false);
      }
    });

    it('should handle multiple start/stop cycles', () => {
      let state = initialState;
      
      for (let i = 0; i < 3; i++) {
        state = startHeartbeat(state);
        expect(isHeartbeatActive(state)).toBe(true);
        
        state = stopHeartbeat(state);
        expect(isHeartbeatActive(state)).toBe(false);
      }
    });
  });
});