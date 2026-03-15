import type { Task, PomodoroState } from './types.js';
import { getCompletedSessionsCount, getTotalFocusTime, formatTime, isSessionPaused } from './pomodoro.js';

export const formatPlainTasks = (state: PomodoroState): string => {
  if (state.tasks.length === 0) {
    return 'No tasks';
  }

  return state.tasks
    .map((task) => {
      const sessions = getCompletedSessionsCount(state, task.id);
      const focusTime = getTotalFocusTime(state, task.id);
      const status = task.completed ? '[✓]' : '[ ]';
      const timeStr = focusTime > 0 ? ` - ${formatTime(focusTime)}` : '';
      return `#${task.id} ${status} ${task.title} (${sessions} pomodoros${timeStr})`;
    })
    .join('\n');
};

export const formatJsonTasks = (state: PomodoroState): string => {
  const tasks = state.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    completed: task.completed,
    completedAt: task.completedAt ? new Date(task.completedAt).toISOString() : null,
    pomodoros: getCompletedSessionsCount(state, task.id),
    focusTimeMs: getTotalFocusTime(state, task.id),
    createdAt: new Date(task.createdAt).toISOString(),
  }));

  return JSON.stringify({ tasks, count: tasks.length }, null, 2);
};

export const formatPlainStatus = (state: PomodoroState): string => {
  if (!state.currentSession) {
    return 'idle';
  }

  const session = state.currentSession;
  if (isSessionPaused(state)) {
    return 'paused';
  }
  const type = session.isBreak ? 'break' : 'work';
  return type;
};

export const formatJsonStatus = (state: PomodoroState): string => {
  if (!state.currentSession) {
    return JSON.stringify({ status: 'idle', activeSession: null }, null, 2);
  }

  const session = state.currentSession;
  const task = state.tasks.find((t) => t.id === session.taskId);
  const paused = isSessionPaused(state);

  return JSON.stringify(
    {
      status: paused ? 'paused' : (session.isBreak ? 'break' : 'work'),
      paused,
      activeSession: {
        id: session.id,
        taskId: session.taskId,
        taskTitle: task?.title || 'Unknown',
        type: session.isBreak ? 'break' : 'work',
        startTime: new Date(session.startTime).toISOString(),
        durationMs: session.duration,
        paused: paused,
      },
    },
    null,
    2,
  );
};

export const formatTaskAdded = (task: Task, format: 'plain' | 'json'): string => {
  if (format === 'json') {
    return JSON.stringify(
      {
        success: true,
        task: {
          id: task.id,
          title: task.title,
          createdAt: new Date(task.createdAt).toISOString(),
        },
      },
      null,
      2,
    );
  }
  return `Added: #${task.id} ${task.title}`;
};

export const formatTaskRemoved = (taskId: number, format: 'plain' | 'json'): string => {
  if (format === 'json') {
    return JSON.stringify({ success: true, removedId: taskId }, null, 2);
  }
  return `Removed task: #${taskId}`;
};

export const formatError = (message: string, format: 'plain' | 'json'): string => {
  if (format === 'json') {
    return JSON.stringify({ success: false, error: message }, null, 2);
  }
  return `Error: ${message}`;
};
