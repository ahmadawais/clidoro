import { describe, it, expect, beforeEach } from 'vitest';
import type { PomodoroState, Config } from './types.js';
import { DEFAULT_CONFIG } from './types.js';
import {
  addTask,
  removeTask,
  getTask,
  completeTask,
  startSession,
  startSessionWithPreset,
  pauseSession,
  resumeSession,
  isSessionPaused,
  completeSession,
  cancelSession,
  getElapsedTime,
  getSessionProgress,
  getSessionTimeRemaining,
  formatTime,
  getCompletedSessionsCount,
  getTotalFocusTime,
  getDailyStats,
  getAllTimeStats,
  getStreak,
  getHistory,
  shouldTakeLongBreak,
} from './pomodoro.js';

const emptyState = (): PomodoroState => ({
  tasks: [],
  sessions: [],
  currentSession: null,
});

describe('Task Management', () => {
  let state: PomodoroState;
  beforeEach(() => { state = emptyState(); });

  it('adds a task with auto-increment id', () => {
    const t1 = addTask(state, 'First');
    const t2 = addTask(state, 'Second');
    expect(t1.id).toBe(1);
    expect(t2.id).toBe(2);
    expect(state.tasks).toHaveLength(2);
  });

  it('gets a task by id', () => {
    addTask(state, 'Find me');
    expect(getTask(state, 1)?.title).toBe('Find me');
    expect(getTask(state, 99)).toBeUndefined();
  });

  it('removes a task', () => {
    addTask(state, 'Remove me');
    expect(removeTask(state, 1)).toBe(true);
    expect(state.tasks).toHaveLength(0);
    expect(removeTask(state, 1)).toBe(false);
  });

  it('completes a task', () => {
    addTask(state, 'Complete me');
    expect(completeTask(state, 1)).toBe(true);
    expect(state.tasks[0]?.completed).toBe(true);
    expect(state.tasks[0]?.completedAt).toBeDefined();
  });

  it('returns false completing nonexistent task', () => {
    expect(completeTask(state, 99)).toBe(false);
  });

  it('auto-increments after removal', () => {
    addTask(state, 'A');
    addTask(state, 'B');
    removeTask(state, 1);
    const t3 = addTask(state, 'C');
    expect(t3.id).toBe(3);
  });
});

describe('Session Lifecycle', () => {
  let state: PomodoroState;
  beforeEach(() => {
    state = emptyState();
    addTask(state, 'Work task');
  });

  it('starts a work session', () => {
    const session = startSession(state, 1, false, DEFAULT_CONFIG);
    expect(session.taskId).toBe(1);
    expect(session.isBreak).toBe(false);
    expect(session.duration).toBe(25 * 60 * 1000);
    expect(session.completed).toBe(false);
    expect(state.currentSession).toBe(session);
    expect(state.sessions).toHaveLength(1);
  });

  it('starts a break session', () => {
    const session = startSession(state, 1, true, DEFAULT_CONFIG);
    expect(session.isBreak).toBe(true);
    expect(session.duration).toBe(5 * 60 * 1000);
  });

  it('starts with custom duration', () => {
    const session = startSession(state, 1, false, DEFAULT_CONFIG, 10 * 60 * 1000);
    expect(session.duration).toBe(10 * 60 * 1000);
  });

  it('starts with preset', () => {
    const session = startSessionWithPreset(state, 1, 'Long Work', DEFAULT_CONFIG);
    expect(session).not.toBeNull();
    expect(session!.duration).toBe(50 * 60 * 1000);
  });

  it('returns null for unknown preset', () => {
    const session = startSessionWithPreset(state, 1, 'nonexistent', DEFAULT_CONFIG);
    expect(session).toBeNull();
  });

  it('completes a session with actual duration', () => {
    const session = startSession(state, 1, false, DEFAULT_CONFIG);
    // Simulate some elapsed time
    session.startTime = Date.now() - 5 * 60 * 1000;

    const completed = completeSession(state);
    expect(completed).not.toBeNull();
    expect(completed!.completed).toBe(true);
    expect(completed!.actualDuration).toBeGreaterThan(0);
    expect(completed!.actualDuration).toBeLessThan(6 * 60 * 1000);
    expect(state.currentSession).toBeNull();
  });

  it('cancels a session and removes from history', () => {
    startSession(state, 1, false, DEFAULT_CONFIG);
    expect(state.sessions).toHaveLength(1);
    cancelSession(state);
    expect(state.currentSession).toBeNull();
    expect(state.sessions).toHaveLength(0);
  });

  it('completeSession returns null when no session', () => {
    expect(completeSession(state)).toBeNull();
  });
});

describe('Pause / Resume', () => {
  let state: PomodoroState;
  beforeEach(() => {
    state = emptyState();
    addTask(state, 'Pause test');
    startSession(state, 1, false, DEFAULT_CONFIG);
  });

  it('pauses and resumes', () => {
    expect(isSessionPaused(state)).toBe(false);
    expect(pauseSession(state)).toBe(true);
    expect(isSessionPaused(state)).toBe(true);
    expect(resumeSession(state)).toBe(true);
    expect(isSessionPaused(state)).toBe(false);
  });

  it('cannot pause when already paused', () => {
    pauseSession(state);
    expect(pauseSession(state)).toBe(false);
  });

  it('cannot resume when not paused', () => {
    expect(resumeSession(state)).toBe(false);
  });

  it('tracks paused time', () => {
    const session = state.currentSession!;
    session.startTime = Date.now() - 10000;
    pauseSession(state);
    session.pausedAt = Date.now() - 5000;
    resumeSession(state);
    expect(session.totalPausedTime).toBeGreaterThan(4000);
  });
});

describe('Time Calculations', () => {
  it('calculates elapsed time', () => {
    const session = {
      id: 'test', taskId: 1, startTime: Date.now() - 10000,
      duration: 25 * 60 * 1000, isBreak: false, completed: false, totalPausedTime: 0,
    };
    const elapsed = getElapsedTime(session);
    expect(elapsed).toBeGreaterThanOrEqual(9000);
    expect(elapsed).toBeLessThanOrEqual(11000);
  });

  it('calculates elapsed time when paused', () => {
    const now = Date.now();
    const session = {
      id: 'test', taskId: 1, startTime: now - 20000,
      duration: 25 * 60 * 1000, isBreak: false, completed: false,
      pausedAt: now - 5000, totalPausedTime: 3000,
    };
    const elapsed = getElapsedTime(session);
    // paused: elapsed = pausedAt - startTime - totalPausedTime = 15000 - 3000 = 12000
    expect(elapsed).toBeGreaterThanOrEqual(11000);
    expect(elapsed).toBeLessThanOrEqual(13000);
  });

  it('calculates progress', () => {
    const session = {
      id: 'test', taskId: 1, startTime: Date.now() - 12.5 * 60 * 1000,
      duration: 25 * 60 * 1000, isBreak: false, completed: false, totalPausedTime: 0,
    };
    const progress = getSessionProgress(session);
    expect(progress).toBeGreaterThan(0.45);
    expect(progress).toBeLessThan(0.55);
  });

  it('caps progress at 1', () => {
    const session = {
      id: 'test', taskId: 1, startTime: Date.now() - 30 * 60 * 1000,
      duration: 25 * 60 * 1000, isBreak: false, completed: false, totalPausedTime: 0,
    };
    expect(getSessionProgress(session)).toBe(1);
  });

  it('calculates remaining time', () => {
    const session = {
      id: 'test', taskId: 1, startTime: Date.now() - 10 * 60 * 1000,
      duration: 25 * 60 * 1000, isBreak: false, completed: false, totalPausedTime: 0,
    };
    const remaining = getSessionTimeRemaining(session);
    expect(remaining).toBeGreaterThan(14 * 60 * 1000);
    expect(remaining).toBeLessThan(16 * 60 * 1000);
  });

  it('remaining never goes negative', () => {
    const session = {
      id: 'test', taskId: 1, startTime: Date.now() - 30 * 60 * 1000,
      duration: 25 * 60 * 1000, isBreak: false, completed: false, totalPausedTime: 0,
    };
    expect(getSessionTimeRemaining(session)).toBe(0);
  });
});

describe('formatTime', () => {
  it('formats minutes and seconds', () => {
    expect(formatTime(25 * 60 * 1000)).toBe('25:00');
    expect(formatTime(5 * 60 * 1000)).toBe('05:00');
    expect(formatTime(90 * 1000)).toBe('01:30');
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(500)).toBe('00:01');
  });
});

describe('Stats', () => {
  let state: PomodoroState;
  beforeEach(() => {
    state = emptyState();
    addTask(state, 'Stats task');
  });

  it('counts completed sessions per task', () => {
    expect(getCompletedSessionsCount(state, 1)).toBe(0);

    // Add completed work session
    state.sessions.push({
      id: 's1', taskId: 1, startTime: Date.now(), duration: 25 * 60 * 1000,
      actualDuration: 20 * 60 * 1000, isBreak: false, completed: true,
    });
    expect(getCompletedSessionsCount(state, 1)).toBe(1);

    // Break sessions don't count
    state.sessions.push({
      id: 's2', taskId: 1, startTime: Date.now(), duration: 5 * 60 * 1000,
      isBreak: true, completed: true,
    });
    expect(getCompletedSessionsCount(state, 1)).toBe(1);
  });

  it('calculates focus time using actualDuration', () => {
    state.sessions.push({
      id: 's1', taskId: 1, startTime: Date.now(), duration: 25 * 60 * 1000,
      actualDuration: 12 * 60 * 1000, isBreak: false, completed: true,
    });
    // Should use actualDuration (12min), not duration (25min)
    expect(getTotalFocusTime(state, 1)).toBe(12 * 60 * 1000);
  });

  it('falls back to duration when no actualDuration', () => {
    state.sessions.push({
      id: 's1', taskId: 1, startTime: Date.now(), duration: 25 * 60 * 1000,
      isBreak: false, completed: true,
    });
    expect(getTotalFocusTime(state, 1)).toBe(25 * 60 * 1000);
  });

  it('calculates daily stats', () => {
    state.sessions.push({
      id: 's1', taskId: 1, startTime: Date.now(), duration: 25 * 60 * 1000,
      actualDuration: 25 * 60 * 1000, isBreak: false, completed: true,
    });
    const daily = getDailyStats(state);
    expect(daily.completedSessions).toBe(1);
    expect(daily.totalFocusTime).toBe(25 * 60 * 1000);
  });

  it('calculates all-time stats', () => {
    state.sessions.push(
      { id: 's1', taskId: 1, startTime: Date.now(), duration: 25 * 60 * 1000, actualDuration: 10 * 60 * 1000, isBreak: false, completed: true },
      { id: 's2', taskId: 1, startTime: Date.now(), duration: 25 * 60 * 1000, actualDuration: 15 * 60 * 1000, isBreak: false, completed: true },
    );
    const stats = getAllTimeStats(state);
    expect(stats.totalSessions).toBe(2);
    expect(stats.totalFocusTime).toBe(25 * 60 * 1000);
  });

  it('calculates streak', () => {
    // No sessions = no streak
    expect(getStreak(state)).toBe(0);

    // Add session today
    state.sessions.push({
      id: 's1', taskId: 1, startTime: Date.now(), duration: 25 * 60 * 1000,
      isBreak: false, completed: true,
    });
    expect(getStreak(state)).toBe(1);
  });

  it('gets history sorted by most recent', () => {
    const now = Date.now();
    state.sessions.push(
      { id: 's1', taskId: 1, startTime: now - 2000, duration: 25 * 60 * 1000, isBreak: false, completed: true },
      { id: 's2', taskId: 1, startTime: now - 1000, duration: 25 * 60 * 1000, isBreak: false, completed: true },
      { id: 's3', taskId: 1, startTime: now, duration: 25 * 60 * 1000, isBreak: false, completed: false },
    );
    const history = getHistory(state, 10);
    expect(history).toHaveLength(2); // only completed
    expect(history[0]?.id).toBe('s2'); // most recent first
  });
});

describe('Long Break Logic', () => {
  it('suggests long break after every 4 sessions', () => {
    const state = emptyState();
    addTask(state, 'task');
    expect(shouldTakeLongBreak(state, DEFAULT_CONFIG)).toBe(false);

    // Add 4 completed sessions today
    for (let i = 0; i < 4; i++) {
      state.sessions.push({
        id: `s${i}`, taskId: 1, startTime: Date.now(), duration: 25 * 60 * 1000,
        isBreak: false, completed: true,
      });
    }
    expect(shouldTakeLongBreak(state, DEFAULT_CONFIG)).toBe(true);

    // 5 sessions — not a multiple of 4
    state.sessions.push({
      id: 's4', taskId: 1, startTime: Date.now(), duration: 25 * 60 * 1000,
      isBreak: false, completed: true,
    });
    expect(shouldTakeLongBreak(state, DEFAULT_CONFIG)).toBe(false);
  });
});
