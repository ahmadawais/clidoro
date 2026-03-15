import type { Task, PomodoroSession, PomodoroState, Config, DailyStats, TimerPreset } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

const generateId = (): string => Math.random().toString(36).substring(2, 11);

export const createTask = (title: string, id: number): Task => ({
  id,
  title,
  completed: false,
  createdAt: Date.now(),
});

export const addTask = (state: PomodoroState, title: string): Task => {
  const nextId = state.tasks.length > 0 ? Math.max(...state.tasks.map((t) => t.id)) + 1 : 1;
  const task = createTask(title, nextId);
  state.tasks.push(task);
  return task;
};

export const removeTask = (state: PomodoroState, taskId: number): boolean => {
  const index = state.tasks.findIndex((t) => t.id === taskId);
  if (index === -1) return false;
  state.tasks.splice(index, 1);
  return true;
};

export const getTask = (state: PomodoroState, taskId: number): Task | undefined => {
  return state.tasks.find((t) => t.id === taskId);
};

export const completeTask = (state: PomodoroState, taskId: number): boolean => {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return false;
  task.completed = true;
  task.completedAt = Date.now();
  return true;
};

export const startSession = (
  state: PomodoroState,
  taskId: number,
  isBreak: boolean = false,
  config: Config = DEFAULT_CONFIG,
  duration?: number,
): PomodoroSession => {
  const sessionDuration = duration ?? (isBreak ? config.breakDuration : config.workDuration);
  const session: PomodoroSession = {
    id: generateId(),
    taskId,
    startTime: Date.now(),
    duration: sessionDuration,
    isBreak,
    completed: false,
    totalPausedTime: 0,
  };
  state.currentSession = session;
  state.sessions.push(session);
  return session;
};

export const startSessionWithPreset = (
  state: PomodoroState,
  taskId: number,
  presetName: string,
  config: Config = DEFAULT_CONFIG,
): PomodoroSession | null => {
  const preset = config.presets.find(
    (p) => p.name.toLowerCase() === presetName.toLowerCase(),
  );
  if (!preset) return null;
  return startSession(state, taskId, false, config, preset.workDuration);
};

export const pauseSession = (state: PomodoroState): boolean => {
  if (!state.currentSession || state.currentSession.pausedAt) return false;
  state.currentSession.pausedAt = Date.now();
  return true;
};

export const resumeSession = (state: PomodoroState): boolean => {
  if (!state.currentSession || !state.currentSession.pausedAt) return false;
  const pausedDuration = Date.now() - state.currentSession.pausedAt;
  state.currentSession.totalPausedTime = (state.currentSession.totalPausedTime || 0) + pausedDuration;
  state.currentSession.pausedAt = undefined;
  return true;
};

export const isSessionPaused = (state: PomodoroState): boolean => {
  return state.currentSession?.pausedAt !== undefined;
};

export const completeSession = (state: PomodoroState): PomodoroSession | null => {
  if (!state.currentSession) return null;
  const session = state.currentSession;
  const elapsed = getElapsedTime(session);
  const actual = { ...session, completed: true, actualDuration: elapsed };
  const idx = state.sessions.findIndex((s) => s.id === session.id);
  if (idx !== -1) {
    state.sessions[idx] = actual;
  }
  state.currentSession = null;
  return actual;
};

export const cancelSession = (state: PomodoroState): void => {
  if (!state.currentSession) return;
  const session = state.currentSession;
  const idx = state.sessions.findIndex((s) => s.id === session.id);
  if (idx !== -1) {
    state.sessions.splice(idx, 1);
  }
  state.currentSession = null;
};

export const getSessionProgress = (session: PomodoroSession): number => {
  const elapsed = getElapsedTime(session);
  return Math.min(elapsed / session.duration, 1);
};

export const getElapsedTime = (session: PomodoroSession): number => {
  const now = Date.now();
  let elapsed = now - session.startTime;
  if (session.pausedAt) {
    elapsed = session.pausedAt - session.startTime - (session.totalPausedTime || 0);
  } else if (session.totalPausedTime) {
    elapsed = now - session.startTime - session.totalPausedTime;
  }
  return Math.max(elapsed, 0);
};

export const getSessionTimeRemaining = (session: PomodoroSession): number => {
  const elapsed = getElapsedTime(session);
  return Math.max(session.duration - elapsed, 0);
};

export const formatTime = (ms: number): string => {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const getCompletedSessionsCount = (state: PomodoroState, taskId: number): number => {
  return state.sessions.filter((s) => s.taskId === taskId && s.completed && !s.isBreak).length;
};

export const getTotalFocusTime = (state: PomodoroState, taskId: number): number => {
  return state.sessions
    .filter((s) => s.taskId === taskId && s.completed && !s.isBreak)
    .reduce((sum, s) => sum + (s.actualDuration ?? s.duration), 0);
};

export const getDailyStats = (state: PomodoroState, date?: Date): DailyStats => {
  const targetDate = date || new Date();
  const dateParts = targetDate.toISOString().split('T');
  const dateStr = dateParts[0] ?? targetDate.toISOString().slice(0, 10);
  const dayStart = new Date(dateStr).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  const daySessions = state.sessions.filter(
    (s) => s.completed && !s.isBreak && s.startTime >= dayStart && s.startTime < dayEnd,
  );

  const completedTaskIds = new Set(
    state.tasks.filter((t) => t.completed && t.completedAt && t.completedAt >= dayStart && t.completedAt < dayEnd).map((t) => t.id),
  );

  return {
    date: dateStr,
    completedSessions: daySessions.length,
    totalFocusTime: daySessions.reduce((sum, s) => sum + (s.actualDuration ?? s.duration), 0),
    tasksCompleted: completedTaskIds.size,
  };
};

export const getWeeklyStats = (state: PomodoroState): DailyStats[] => {
  const stats: DailyStats[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    stats.push(getDailyStats(state, date));
  }
  return stats;
};

export const getAllTimeStats = (state: PomodoroState): { totalSessions: number; totalFocusTime: number; tasksCompleted: number } => {
  const completedSessions = state.sessions.filter((s) => s.completed && !s.isBreak);
  return {
    totalSessions: completedSessions.length,
    totalFocusTime: completedSessions.reduce((sum, s) => sum + (s.actualDuration ?? s.duration), 0),
    tasksCompleted: state.tasks.filter((t) => t.completed).length,
  };
};

export const getStreak = (state: PomodoroState): number => {
  let streak = 0;
  const today = new Date();
  
  for (let i = 0; i < 365; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const stats = getDailyStats(state, date);
    
    if (stats.completedSessions > 0) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  
  return streak;
};

export const getHistory = (state: PomodoroState, limit: number = 50): PomodoroSession[] => {
  return [...state.sessions]
    .filter((s) => s.completed)
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, limit);
};

export const getPresets = (config: Config): TimerPreset[] => {
  return config.presets;
};

export const addPreset = (config: Config, preset: TimerPreset): Config => {
  const newConfig = { ...config };
  newConfig.presets = [...newConfig.presets, preset];
  return newConfig;
};

export const removePreset = (config: Config, presetName: string): Config => {
  const newConfig = { ...config };
  newConfig.presets = newConfig.presets.filter(
    (p) => p.name.toLowerCase() !== presetName.toLowerCase(),
  );
  return newConfig;
};

export const setDefaultPreset = (config: Config, presetName: string): Config => {
  const newConfig = { ...config };
  newConfig.presets = newConfig.presets.map((p) => ({
    ...p,
    isDefault: p.name.toLowerCase() === presetName.toLowerCase(),
  }));
  return newConfig;
};

export const shouldTakeLongBreak = (state: PomodoroState, config: Config): boolean => {
  const todayStats = getDailyStats(state);
  return todayStats.completedSessions > 0 && todayStats.completedSessions % 4 === 0;
};

export const getLongBreakInterval = (config: Config): number => {
  return 4; // every 4 sessions
};
