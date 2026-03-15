export interface Task {
  id: number;
  title: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
}

export interface PomodoroSession {
  id: string;
  taskId: number;
  startTime: number;
  duration: number;
  actualDuration?: number;
  isBreak: boolean;
  completed: boolean;
  pausedAt?: number;
  totalPausedTime?: number;
}

export interface TimerPreset {
  name: string;
  workDuration: number;
  breakDuration: number;
  isDefault?: boolean;
}

export interface Config {
  workDuration: number;
  breakDuration: number;
  longBreakDuration: number;
  autoStartBreak: boolean;
  soundEnabled: boolean;
  soundType: 'bell' | 'chime' | 'ding' | 'none';
  desktopNotifications: boolean;
  presets: TimerPreset[];
  hooks: {
    onSessionStart?: string;
    onSessionComplete?: string;
    onBreakStart?: string;
    onBreakComplete?: string;
  };
}

export interface DailyStats {
  date: string;
  completedSessions: number;
  totalFocusTime: number;
  tasksCompleted: number;
}

export interface PomodoroState {
  tasks: Task[];
  sessions: PomodoroSession[];
  currentSession: PomodoroSession | null;
}

export interface OutputFormat {
  format: 'plain' | 'json';
  status?: boolean;
}

export const DEFAULT_CONFIG: Config = {
  workDuration: 25 * 60 * 1000,
  breakDuration: 5 * 60 * 1000,
  longBreakDuration: 15 * 60 * 1000,
  autoStartBreak: false,
  soundEnabled: true,
  soundType: 'bell',
  desktopNotifications: true,
  presets: [
    { name: 'Standard', workDuration: 25 * 60 * 1000, breakDuration: 5 * 60 * 1000, isDefault: true },
    { name: 'Short Work', workDuration: 15 * 60 * 1000, breakDuration: 3 * 60 * 1000 },
    { name: 'Long Work', workDuration: 50 * 60 * 1000, breakDuration: 10 * 60 * 1000 },
    { name: 'Quick Break', workDuration: 25 * 60 * 1000, breakDuration: 1 * 60 * 1000 },
  ],
  hooks: {},
};

export const PRESET_NAMES = ['standard', 'short', 'long', 'quick'] as const;
export type PresetName = (typeof PRESET_NAMES)[number];
