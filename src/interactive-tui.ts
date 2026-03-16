import type { PomodoroState } from './types.js';
import { loadState, saveState, loadConfig } from './storage.js';
import {
  formatTime,
  getSessionTimeRemaining,
  getSessionProgress,
  getCompletedSessionsCount,
  startSession,
  startSessionWithPreset,
  pauseSession,
  resumeSession,
  isSessionPaused,
  completeSession,
  cancelSession,
  getDailyStats,
  addTask,
  completeTask,
  removeTask,
  shouldTakeLongBreak,
} from './pomodoro.js';
import { notifySessionComplete, notifySessionStart, runHook } from './notifications.js';

// Pomodoro-orange color palette
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  gray: '\x1b[90m',
  tomato: '\x1b[38;2;255;99;71m',    // header, work bar
  orange: '\x1b[38;2;255;165;0m',    // selected marker, accent
  peach: '\x1b[38;2;255;200;150m',   // break bar, secondary
  green: '\x1b[38;2;130;200;100m',   // completed tasks, focus label
  amber: '\x1b[38;2;255;191;0m',     // pause label
  red: '\x1b[38;2;240;70;60m',       // delete confirm
};

type Mode = 'tasks' | 'presets' | 'add' | 'session';

const backspaceKeys = new Set(['\u007f', '\u0008', '\b']);
const deletePreviousWordKeys = new Set(['\u0017', '\u001b\u007f', '\u001b\u0008', '\u001b\b']);

interface TUIState {
  selectedIndex: number;
  running: boolean;
  mode: Mode;
  presetSelectedIndex: number;
  addInput: string;
  showDone: boolean;
  pendingDelete: number | null;
}

// Strip ANSI codes to get visible character count
const visLen = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '').length;

export const deletePreviousWord = (input: string): string => {
  const withoutTrailingWhitespace = input.replace(/\s+$/, '');
  if (!withoutTrailingWhitespace) return '';

  const lastWordStart = withoutTrailingWhitespace.search(/\S+$/);
  return lastWordStart === -1 ? '' : withoutTrailingWhitespace.slice(0, lastWordStart);
};

export const isDeletePreviousWordKey = (key: string): boolean => deletePreviousWordKeys.has(key);

// Truncate a string with ANSI codes to maxVisible characters
const truncate = (s: string, maxVisible: number): string => {
  let visible = 0;
  let i = 0;
  while (i < s.length && visible < maxVisible) {
    if (s[i] === '\x1b') {
      const end = s.indexOf('m', i);
      if (end !== -1) { i = end + 1; continue; }
    }
    visible++;
    i++;
  }
  // Include any trailing ANSI codes (like reset)
  while (i < s.length && s[i] === '\x1b') {
    const end = s.indexOf('m', i);
    if (end !== -1) { i = end + 1; } else { break; }
  }
  return s.slice(0, i);
};

export const runInteractiveTUI = async (): Promise<void> => {
  const tuiState: TUIState = {
    selectedIndex: 0,
    running: true,
    mode: 'tasks',
    presetSelectedIndex: 0,
    addInput: '',
    showDone: false,
    pendingDelete: null,
  };

  let pomodoro = loadState();
  let config = loadConfig();


  // Alternate screen buffer — no scrollback pollution
  const enterAltScreen = () => process.stdout.write('\x1b[?1049h');
  const leaveAltScreen = () => process.stdout.write('\x1b[?1049l');
  const cursorHome = () => process.stdout.write('\x1b[H');
  const clearBelow = () => process.stdout.write('\x1b[J');
  const hideCursor = () => process.stdout.write('\x1b[?25l');
  const showCursor = () => process.stdout.write('\x1b[?25h');

  const exit = () => {
    clearInterval(timer);
    showCursor();
    leaveAltScreen();
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
    process.exit(0);
  };

  const key = (k: string) => `${c.dim}[${c.reset}${c.gray}${k}${c.reset}${c.dim}]${c.reset}`;

  const getControls = (): string => {
    switch (tuiState.mode) {
      case 'add':
        return `${key('enter')}${c.dim} save${c.reset}  ${key('ctrl+w')}${c.dim} del word${c.reset}  ${key('esc')}${c.dim} cancel${c.reset}`;
      case 'presets':
        return `${key('↑↓')}${c.dim} select${c.reset}  ${key('enter')}${c.dim} use${c.reset}  ${key('esc')}${c.dim} back${c.reset}`;
      case 'session': {
        const isPaused = isSessionPaused(pomodoro);
        return `${key('space')}${c.dim} ${isPaused ? 'resume' : 'pause'}${c.reset}  ${key('c')}${c.dim} complete${c.reset}  ${key('x')}${c.dim} stop${c.reset}  ${key('b')}${c.dim} break${c.reset}`;
      }
      default: {
        const doneCount = pomodoro.tasks.filter(t => t.completed).length;
        const doneHint = doneCount > 0
          ? (tuiState.showDone ? `  ${key('h')}${c.dim} hide${c.reset}` : `  ${key('h')}${c.dim} show${c.reset}`)
          : '';
        return `${key('a')}${c.dim} add${c.reset}  ${key('c')}${c.dim} complete${c.reset}  ${key('d')}${c.dim} del${c.reset}  ${key('b')}${c.dim} break${c.reset}  ${key('q')}${c.dim} quit${c.reset}${doneHint}`;
      }
    }
  };

  const render = (): void => {
    const W = process.stdout.columns || 80;
    const contentW = W - 4;
    const pad = '  ';

    const line = (s: string) => pad + truncate(s, contentW);
    const rule = () => pad + c.dim + '─'.repeat(Math.max(0, contentW)) + c.reset;

    const lines: string[] = [];

    // Header
    lines.push('');
    lines.push(line(`${c.bold}${c.tomato}🍅 Clidoro${c.reset}`));
    lines.push(rule());
    lines.push('');

    // Content
    if (pomodoro.currentSession && tuiState.mode !== 'add' && tuiState.mode !== 'presets') {
      renderActiveSession(lines, line, contentW);
    } else if (tuiState.mode === 'presets') {
      renderPresets(lines, line);
    } else {
      renderTaskList(lines, line);
    }

    // Stats
    lines.push(rule());
    const stats = getDailyStats(pomodoro);
    const mins = Math.floor(stats.totalFocusTime / 60000);
    lines.push(line(`${c.dim}Today: ${stats.completedSessions} done · ${mins}min focus${c.reset}`));

    // Controls
    lines.push(rule());
    lines.push(line(getControls()));
    lines.push('');

    // Vertically center: pad top so content sits in the middle of the screen
    const H = process.stdout.rows || 24;
    const topPad = Math.max(0, Math.floor((H - lines.length) / 2));

    cursorHome();
    for (let i = 0; i < topPad; i++) {
      process.stdout.write('\x1b[K\n');
    }
    for (const l of lines) {
      process.stdout.write(l + '\x1b[K\n');
    }
    clearBelow();
  };

  const renderActiveSession = (lines: string[], line: (s: string) => string, contentW: number): void => {
    const session = pomodoro.currentSession!;
    const task = pomodoro.tasks.find(t => t.id === session.taskId);
    const remaining = getSessionTimeRemaining(session);
    const progress = getSessionProgress(session);
    const isBreak = session.isBreak;
    const paused = isSessionPaused(pomodoro);

    let labelColor: string;
    let label: string;
    if (paused) {
      labelColor = c.orange;
      label = '⏸ PAUSED';
    } else if (isBreak) {
      labelColor = c.peach;
      label = '☕ Break';
    } else {
      labelColor = c.green;
      label = '⏱ Focus';
    }

    const sessionCount = task ? getCompletedSessionsCount(pomodoro, task.id) : 0;
    const pomNum = isBreak ? '' : `  ${c.dim}Pomodoro #${sessionCount + 1}${c.reset}`;

    lines.push(line(`${labelColor}${c.bold}${label}${c.reset}  #${task?.id} ${task?.title || '?'}${pomNum}`));
    lines.push('');

    const timeStr = formatTime(remaining);
    lines.push(line(`${c.bold}${timeStr}${c.reset}`));
    lines.push('');

    // Progress bar with half-block precision
    const barWidth = Math.max(contentW - 10, 20);
    const exact = progress * barWidth;
    const full = Math.floor(exact);
    const frac = exact - full;
    const half = frac >= 0.5 ? '▌' : '';
    const empty = barWidth - full - (half ? 1 : 0);
    const barColor = isBreak ? c.peach : c.green;
    const pct = Math.round(progress * 100);
    lines.push(line(`${barColor}${'█'.repeat(full)}${half}${c.gray}${'░'.repeat(Math.max(0, empty))}${c.reset} ${pct}%`));
    lines.push('');
  };

  const renderTaskList = (lines: string[], line: (s: string) => string): void => {
    const tasks = pomodoro.tasks;
    const activeTasks = tasks.filter(t => !t.completed);
    const doneTasks = tasks.filter(t => t.completed);
    const adding = tuiState.mode === 'add';

    if (tasks.length === 0 && !adding) {
      lines.push(line('No tasks yet'));
      lines.push(line(`${c.dim}press a to add first task${c.reset}`));
      lines.push('');
      return;
    }

    activeTasks.forEach((task, i) => {
      const sel = tuiState.selectedIndex === i;
      const cnt = getCompletedSessionsCount(pomodoro, task.id);
      const delPending = tuiState.pendingDelete === task.id;
      const mark = sel ? `${c.orange}${c.bold}▶${c.reset}` : ' ';

      if (delPending) {
        lines.push(line(`${mark} #${task.id} ${task.title} ${c.red}[d] confirm?${c.reset}`));
      } else {
        const tomatoes = cnt > 0 ? (cnt <= 3 ? ` ${'🍅'.repeat(cnt)}` : ` 🍅 ${cnt}`) : '';
        const hint = sel ? `  ${c.dim}enter to start${c.reset}` : '';
        lines.push(line(`${mark} #${task.id} ${task.title}${tomatoes}${hint}`));
      }
    });

    if (doneTasks.length > 0) {
      if (tuiState.showDone) {
        doneTasks.forEach((task, i) => {
          const sel = tuiState.selectedIndex === activeTasks.length + i;
          const delPend = tuiState.pendingDelete === task.id;
          const mark = sel ? `${c.orange}${c.bold}▶${c.reset}` : ' ';
          if (delPend) {
            lines.push(line(`${mark} ✓ #${task.id} ${task.title} ${c.red}[d] confirm?${c.reset}`));
          } else {
            lines.push(line(`${mark} ${c.green}${c.dim}✓ #${task.id} ${task.title}${c.reset}`));
          }
        });
      } else {
        lines.push(line(`${c.dim}  ${doneTasks.length} done · h show${c.reset}`));
      }
    }

    if (adding) {
      lines.push(line(`${c.peach}>${c.reset} ${tuiState.addInput}_`));
    }

    lines.push('');
  };

  const renderPresets = (lines: string[], line: (s: string) => string): void => {
    config.presets.forEach((preset, i) => {
      const sel = i === tuiState.presetSelectedIndex;
      const mark = sel ? `${c.orange}${c.bold}▶${c.reset}` : ' ';
      const def = preset.isDefault ? ` ${c.green}✓${c.reset}` : '';
      const w = Math.round(preset.workDuration / 60000);
      const b = Math.round(preset.breakDuration / 60000);
      lines.push(line(`${mark} ${preset.name}${def} ${c.dim}${w}m/${b}m${c.reset}`));
    });
    lines.push('');
  };

  // Map selectedIndex (visual position) to the actual task
  const getSelectedTask = () => {
    const active = pomodoro.tasks.filter(t => !t.completed);
    const done = pomodoro.tasks.filter(t => t.completed);
    if (tuiState.selectedIndex < active.length) return active[tuiState.selectedIndex];
    if (tuiState.showDone) return done[tuiState.selectedIndex - active.length];
    return undefined;
  };

  const handleKey = (key: string): void => {
    if (key === 'q' || key === '\u0003') return exit();

    if (key !== 'd' && key !== 'Delete') {
      tuiState.pendingDelete = null;
    }

    pomodoro = loadState();
    config = loadConfig();
    const hasSession = pomodoro.currentSession && tuiState.mode !== 'add' && tuiState.mode !== 'presets';

    if (tuiState.mode === 'add') {
      if (key === '\u001b') {
        tuiState.mode = 'tasks';
        tuiState.addInput = '';
      } else if (key === '\r') {
        if (tuiState.addInput.trim()) {
          const activeBefore = pomodoro.tasks.filter(t => !t.completed).length;
          addTask(pomodoro, tuiState.addInput.trim());
          saveState(pomodoro);
          tuiState.selectedIndex = activeBefore;
        }
        tuiState.mode = 'tasks';
        tuiState.addInput = '';
      } else if (isDeletePreviousWordKey(key)) {
        tuiState.addInput = deletePreviousWord(tuiState.addInput);
      } else if (backspaceKeys.has(key)) {
        tuiState.addInput = tuiState.addInput.slice(0, -1);
      } else if (key.length === 1 && !key.startsWith('\u001b')) {
        tuiState.addInput += key;
      }
      render();
      return;
    }

    if (tuiState.mode === 'presets') {
      if (key === '\u001b[A' || key === 'k') {
        tuiState.presetSelectedIndex = Math.max(0, tuiState.presetSelectedIndex - 1);
      } else if (key === '\u001b[B' || key === 'j') {
        tuiState.presetSelectedIndex = Math.min(config.presets.length - 1, tuiState.presetSelectedIndex + 1);
      } else if (key === 't' || key === '\u001b') {
        tuiState.mode = 'tasks';
      } else if (key === '\r' || key === ' ') {
        const preset = config.presets[tuiState.presetSelectedIndex];
        const task = getSelectedTask();
        if (task && preset) {
          startSessionWithPreset(pomodoro, task.id, preset.name, config);
          saveState(pomodoro);
          notifySessionStart(false, config.desktopNotifications);
          runHook(config.hooks.onSessionStart);
          tuiState.mode = 'session';
        }
      }
      render();
      return;
    }

    if (hasSession) {
      if (key === ' ') {
        if (isSessionPaused(pomodoro)) {
          resumeSession(pomodoro);
        } else {
          pauseSession(pomodoro);
        }
        saveState(pomodoro);
      } else if (key === 'x') {
        cancelSession(pomodoro);
        saveState(pomodoro);
        tuiState.mode = 'tasks';
      } else if (key === 'b') {
        const taskId = pomodoro.currentSession!.taskId;
        cancelSession(pomodoro);
        startSession(pomodoro, taskId, true, config);
        saveState(pomodoro);
        notifySessionStart(true, config.desktopNotifications);
        runHook(config.hooks.onBreakStart);
      } else if (key === 'c') {
        // Complete session early — record actual time, animate bar fill
        const completed = completeSession(pomodoro);
        saveState(pomodoro);

        if (completed) {
          notifySessionComplete(completed.isBreak, config.soundEnabled, config.soundType, config.desktopNotifications);
          if (completed.isBreak) {
            runHook(config.hooks.onBreakComplete);
          } else {
            runHook(config.hooks.onSessionComplete);
          }

          // Brief fill animation — show 100% then return to tasks
          tuiState.mode = 'tasks';
        }
      } else if (key === '\u001b') {
        cancelSession(pomodoro);
        saveState(pomodoro);
        tuiState.mode = 'tasks';
      }
      render();
      return;
    }

    if (key === '\u001b[A' || key === 'k') {
      const activeCount = pomodoro.tasks.filter(t => !t.completed).length;
      const doneCount = pomodoro.tasks.filter(t => t.completed).length;

      if (tuiState.showDone && doneCount > 0 && tuiState.selectedIndex === activeCount) {
        tuiState.showDone = false;
        tuiState.selectedIndex = activeCount - 1;
      } else {
        tuiState.selectedIndex = Math.max(0, tuiState.selectedIndex - 1);
      }
    } else if (key === '\u001b[B' || key === 'j') {
      const activeCount = pomodoro.tasks.filter(t => !t.completed).length;
      const doneCount = pomodoro.tasks.filter(t => t.completed).length;

      if (!tuiState.showDone && doneCount > 0 && tuiState.selectedIndex >= activeCount - 1) {
        tuiState.showDone = true;
        tuiState.selectedIndex = activeCount;
      } else {
        const maxIndex = tuiState.showDone
          ? pomodoro.tasks.length - 1
          : Math.max(0, activeCount - 1);
        tuiState.selectedIndex = Math.min(maxIndex, tuiState.selectedIndex + 1);
      }
    } else if (key === 'h' || key === 'e') {
      tuiState.showDone = !tuiState.showDone;
    } else if (key === '\r' || key === ' ') {
      const activeCount = pomodoro.tasks.filter(t => !t.completed).length;
      const doneCount = pomodoro.tasks.filter(t => t.completed).length;

      if (doneCount > 0 && !tuiState.showDone && tuiState.selectedIndex >= activeCount) {
        tuiState.showDone = true;
      } else {
        const task = getSelectedTask();
        if (task && !task.completed) {
          startSession(pomodoro, task.id, false, config);
          saveState(pomodoro);
          notifySessionStart(false, config.desktopNotifications);
          runHook(config.hooks.onSessionStart);
          tuiState.mode = 'session';
        }
      }
    } else if (key === 'a' || key === 'n') {
      tuiState.mode = 'add';
      tuiState.addInput = '';
    } else if (key === 'c') {
      const task = getSelectedTask();
      if (task && !task.completed) {
        completeTask(pomodoro, task.id);
        saveState(pomodoro);
      }
    } else if (key === 'd' || key === 'Delete') {
      const task = getSelectedTask();
      if (task) {
        if (tuiState.pendingDelete === task.id) {
          removeTask(pomodoro, task.id);
          saveState(pomodoro);
          tuiState.selectedIndex = Math.min(tuiState.selectedIndex, pomodoro.tasks.length - 1);
          tuiState.pendingDelete = null;
        } else {
          tuiState.pendingDelete = task.id;
        }
      }
    } else if (key === 'p') {
      tuiState.mode = 'presets';
      tuiState.presetSelectedIndex = config.presets.findIndex(p => p.isDefault) || 0;
    } else if (key === 'b') {
      const task = getSelectedTask();
      if (task) {
        startSession(pomodoro, task.id, true, config);
        saveState(pomodoro);
        notifySessionStart(true, config.desktopNotifications);
        runHook(config.hooks.onBreakStart);
        tuiState.mode = 'session';
      }
    }

    render();
  };

  enterAltScreen();
  hideCursor();
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (chunk) => handleKey(chunk.toString()));
  }

  // Re-render on terminal resize
  process.stdout.on('resize', () => render());

  let lastSecond = -1;

  const timer = setInterval(() => {
    if (!tuiState.running) return;

    if (pomodoro.currentSession && !isSessionPaused(pomodoro)) {
      const remaining = getSessionTimeRemaining(pomodoro.currentSession);
      const currentSecond = Math.floor(remaining / 1000);

      if (currentSecond !== lastSecond) {
        lastSecond = currentSecond;

        if (remaining <= 0) {
          const session = pomodoro.currentSession;
          const completed = completeSession(pomodoro);
          saveState(pomodoro);

          if (completed) {
            notifySessionComplete(completed.isBreak, config.soundEnabled, config.soundType, config.desktopNotifications);
            if (completed.isBreak) {
              runHook(config.hooks.onBreakComplete);
            } else {
              runHook(config.hooks.onSessionComplete);
            }
            if (config.autoStartBreak && !completed.isBreak) {
              const breakDuration = shouldTakeLongBreak(pomodoro, config) ? config.longBreakDuration : config.breakDuration;
              startSession(pomodoro, session.taskId, true, config, breakDuration);
              saveState(pomodoro);
              notifySessionStart(true, config.desktopNotifications);
            } else {
              tuiState.mode = 'tasks';
            }
          }
        }
        pomodoro = loadState();
        render();
      }
    }
  }, 1000);

  process.on('SIGINT', exit);
  render();
};
