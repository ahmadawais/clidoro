#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { loadState, saveState, loadConfig, saveConfig, resetConfig, resetAll } from './storage.js';
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
  getSessionTimeRemaining,
  getDailyStats,
  getWeeklyStats,
  getAllTimeStats,
  getStreak,
  getHistory,
  getPresets,
  addPreset,
  removePreset,
  setDefaultPreset,
  formatTime,
  getTotalFocusTime,
  shouldTakeLongBreak,
} from './pomodoro.js';
import {
  formatPlainTasks,
  formatJsonTasks,
  formatPlainStatus,
  formatJsonStatus,
  formatTaskAdded,
  formatTaskRemoved,
  formatError,
} from './output.js';
import { renderTUI } from './tui.js';
import { runInteractiveTUI } from './interactive-tui.js';
import { notifySessionComplete, notifySessionStart, runHook } from './notifications.js';
import type { Config } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

const program = new Command();

program
  .name('clidoro')
  .description('🍅 Pomodoro timer CLI with beautiful TUI')
  .version(packageJson.version)
  .exitOverride()
  .enablePositionalOptions(false)
  .showHelpAfterError(false)
  .passThroughOptions(false);

program
  .command('add <title>')
  .description('Add a new task')
  .option('--json', 'Output as JSON')
  .action((title: string, options: { json?: boolean }) => {
    const state = loadState();
    const format = options.json ? 'json' : 'plain';

    if (!title.trim()) {
      console.log(formatError('Task title cannot be empty', format));
      process.exit(1);
    }
    if (title.length > 200) {
      console.log(formatError('Task title too long (max 200 chars)', format));
      process.exit(1);
    }

    const task = addTask(state, title);
    saveState(state);

    console.log(formatTaskAdded(task, format));
  });

program
  .command('remove <taskId>')
  .description('Remove a task')
  .option('--json', 'Output as JSON')
  .action((taskIdStr: string, options: { json?: boolean }) => {
    const state = loadState();
    const format = options.json ? 'json' : 'plain';
    const taskId = parseInt(taskIdStr, 10);

    if (Number.isNaN(taskId)) {
      console.log(formatError('Invalid task ID', format));
      process.exit(1);
    }

    if (!removeTask(state, taskId)) {
      console.log(formatError('Task not found', format));
      process.exit(1);
    }

    saveState(state);
    console.log(formatTaskRemoved(taskId, format));
  });

program
  .command('complete-task <taskId>')
  .description('Mark a task as completed')
  .option('--json', 'Output as JSON')
  .action((taskIdStr: string, options: { json?: boolean }) => {
    const state = loadState();
    const format = options.json ? 'json' : 'plain';
    const taskId = parseInt(taskIdStr, 10);

    if (Number.isNaN(taskId)) {
      console.log(formatError('Invalid task ID', format));
      process.exit(1);
    }

    if (!completeTask(state, taskId)) {
      console.log(formatError('Task not found', format));
      process.exit(1);
    }

    saveState(state);
    console.log(format === 'json' 
      ? JSON.stringify({ success: true, message: 'Task completed' }, null, 2)
      : 'Task completed!'
    );
  });

program
  .command('edit <taskId> <newTitle>')
  .description('Edit a task title')
  .option('--json', 'Output as JSON')
  .action((taskIdStr: string, newTitle: string, options: { json?: boolean }) => {
    const state = loadState();
    const format = options.json ? 'json' : 'plain';
    const taskId = parseInt(taskIdStr, 10);

    if (Number.isNaN(taskId)) {
      console.log(formatError('Invalid task ID', format));
      process.exit(1);
    }

    const task = getTask(state, taskId);
    if (!task) {
      console.log(formatError('Task not found', format));
      process.exit(1);
    }

    task.title = newTitle;
    saveState(state);

    if (format === 'json') {
      console.log(JSON.stringify({ success: true, task: { id: task.id, title: task.title } }, null, 2));
    } else {
      console.log(`Updated: #${taskId} ${newTitle}`);
    }
  });

program
  .command('list')
  .description('List all tasks')
  .option('--json', 'Output as JSON')
  .action((options: { json?: boolean }) => {
    const state = loadState();
    const format = options.json ? 'json' : 'plain';

    if (format === 'json') {
      console.log(formatJsonTasks(state));
    } else {
      console.log(formatPlainTasks(state));
    }
  });

program
  .command('start <taskId>')
  .description('Start a Pomodoro session for a task')
  .option('--break', 'Start a break session instead')
  .option('--preset <name>', 'Use a timer preset (standard, short, long, quick)')
  .option('--duration <minutes>', 'Custom duration in minutes')
  .option('--json', 'Output as JSON')
  .action((taskIdStr: string, options: { break?: boolean; preset?: string; duration?: string; json?: boolean }) => {
    const state = loadState();
    const config = loadConfig();
    const format = options.json ? 'json' : 'plain';
    const taskId = parseInt(taskIdStr, 10);

    if (Number.isNaN(taskId)) {
      console.log(formatError('Invalid task ID', format));
      process.exit(1);
    }

    const task = getTask(state, taskId);
    if (!task) {
      console.log(formatError('Task not found', format));
      process.exit(1);
    }

    let duration: number | undefined;
    if (options.duration) {
      const mins = parseInt(options.duration, 10);
      if (!Number.isNaN(mins)) {
        duration = mins * 60 * 1000;
      }
    }

    const isBreak = options.break ?? false;
    let session;

    if (options.preset && !isBreak) {
      session = startSessionWithPreset(state, taskId, options.preset, config);
      if (!session) {
        console.log(formatError(`Preset "${options.preset}" not found`, format));
        process.exit(1);
      }
    } else {
      session = startSession(state, taskId, isBreak, config, duration);
    }
    
    saveState(state);

    const config2 = loadConfig();
    notifySessionStart(isBreak, config2.desktopNotifications);
    runHook(config2.hooks.onSessionStart);

    if (format === 'json') {
      console.log(
        JSON.stringify(
          {
            success: true,
            session: {
              id: session.id,
              taskId: session.taskId,
              taskTitle: task.title,
              type: session.isBreak ? 'break' : 'work',
              durationMs: session.duration,
              preset: options.preset || null,
            },
          },
          null,
          2,
        ),
      );
    } else {
      const type = isBreak ? 'Break' : 'Work';
      const presetInfo = options.preset ? ` (${options.preset})` : '';
      console.log(`Started ${type} session for: #${taskId} ${task.title}${presetInfo}`);
    }
  });

program
  .command('pause')
  .description('Pause the current session')
  .option('--json', 'Output as JSON')
  .action((options: { json?: boolean }) => {
    const state = loadState();
    const format = options.json ? 'json' : 'plain';

    if (!state.currentSession) {
      console.log(formatError('No active session', format));
      process.exit(1);
    }

    if (isSessionPaused(state)) {
      console.log(formatError('Session already paused', format));
      process.exit(1);
    }

    pauseSession(state);
    saveState(state);

    console.log(format === 'json'
      ? JSON.stringify({ success: true, message: 'Session paused' }, null, 2)
      : 'Session paused. Use "clidoro resume" to continue.'
    );
  });

program
  .command('resume')
  .description('Resume a paused session')
  .option('--json', 'Output as JSON')
  .action((options: { json?: boolean }) => {
    const state = loadState();
    const format = options.json ? 'json' : 'plain';

    if (!state.currentSession) {
      console.log(formatError('No active session', format));
      process.exit(1);
    }

    if (!isSessionPaused(state)) {
      console.log(formatError('Session is not paused', format));
      process.exit(1);
    }

    resumeSession(state);
    saveState(state);

    console.log(format === 'json'
      ? JSON.stringify({ success: true, message: 'Session resumed' }, null, 2)
      : 'Session resumed!'
    );
  });

program
  .command('complete')
  .description('Complete the current session')
  .option('--json', 'Output as JSON')
  .action((options: { json?: boolean }) => {
    const state = loadState();
    const config = loadConfig();
    const format = options.json ? 'json' : 'plain';

    if (!state.currentSession) {
      console.log(formatError('No active session', format));
      process.exit(1);
    }

    const completedSession = completeSession(state);
    saveState(state);

    if (completedSession) {
      notifySessionComplete(
        completedSession.isBreak,
        config.soundEnabled,
        config.soundType,
        config.desktopNotifications,
      );
      
      if (completedSession.isBreak) {
        runHook(config.hooks.onBreakComplete);
      } else {
        runHook(config.hooks.onSessionComplete);
      }

      if (config.autoStartBreak && !completedSession.isBreak) {
        const breakDuration = shouldTakeLongBreak(state, config) ? config.longBreakDuration : config.breakDuration;
        const newSession = startSession(state, completedSession.taskId, true, config, breakDuration);
        saveState(state);
        notifySessionStart(true, config.desktopNotifications);

        const isLong = breakDuration === config.longBreakDuration;
        if (format === 'json') {
          console.log(JSON.stringify({
            success: true,
            message: isLong ? 'Session completed! Long break started.' : 'Session completed! Break started.',
            autoBreakStarted: true,
            longBreak: isLong,
          }, null, 2));
        } else {
          console.log(isLong ? 'Session completed! Long break started automatically.' : 'Session completed! Break started automatically.');
        }
        return;
      }
    }

    const actualTime = completedSession?.actualDuration;
    const timeStr = actualTime ? ` (${formatTime(actualTime)} focused)` : '';

    if (format === 'json') {
      console.log(JSON.stringify({
        success: true,
        message: 'Session completed',
        actualDurationMs: actualTime ?? null,
      }, null, 2));
    } else {
      console.log(`Session completed!${timeStr}`);
    }
  });

program
  .command('cancel')
  .description('Cancel the current session')
  .option('--json', 'Output as JSON')
  .action((options: { json?: boolean }) => {
    const state = loadState();
    const format = options.json ? 'json' : 'plain';

    if (!state.currentSession) {
      console.log(formatError('No active session', format));
      process.exit(1);
    }

    cancelSession(state);
    saveState(state);

    console.log(format === 'json'
      ? JSON.stringify({ success: true, message: 'Session cancelled' }, null, 2)
      : 'Session cancelled.'
    );
  });

program
  .command('status')
  .description('Show current status')
  .option('--json', 'Output as JSON')
  .option('--flag', 'Output as single word for agent integration')
  .action((options: { json?: boolean; flag?: boolean }) => {
    const state = loadState();

    if (options.flag) {
      if (state.currentSession) {
        const paused = isSessionPaused(state);
        console.log(paused ? 'paused' : (state.currentSession.isBreak ? 'break' : 'work'));
      } else {
        console.log('idle');
      }
    } else if (options.json) {
      console.log(formatJsonStatus(state));
    } else {
      const active = state.tasks.filter(t => !t.completed).length;
      const done = state.tasks.filter(t => t.completed).length;
      const taskSummary = `${active} active, ${done} done`;

      if (!state.currentSession) {
        console.log(`idle · ${taskSummary}`);
      } else {
        const remaining = getSessionTimeRemaining(state.currentSession);
        const paused = isSessionPaused(state);
        const type = state.currentSession.isBreak ? 'break' : 'focus';
        const status = paused ? 'paused' : type;
        const task = state.tasks.find((t) => t.id === state.currentSession?.taskId);
        console.log(`${status} · #${task?.id} ${task?.title || '?'} · ${formatTime(remaining)} left · ${taskSummary}`);
      }
    }
  });

program
  .command('stats')
  .description('Show productivity statistics')
  .option('--daily', 'Show daily stats for today')
  .option('--weekly', 'Show weekly stats')
  .option('--all', 'Show all-time stats')
  .option('--streak', 'Show current streak')
  .option('--json', 'Output as JSON')
  .action((options: { daily?: boolean; weekly?: boolean; all?: boolean; streak?: boolean; json?: boolean }) => {
    const state = loadState();
    const format = options.json ? 'json' : 'plain';

    if (options.daily) {
      const stats = getDailyStats(state);
      if (format === 'json') {
        console.log(JSON.stringify(stats, null, 2));
      } else {
        console.log(`\n📊 Daily Stats (${stats.date})`);
        console.log(`   Sessions: ${stats.completedSessions}`);
        console.log(`   Focus time: ${formatTime(stats.totalFocusTime)}`);
        console.log(`   Tasks completed: ${stats.tasksCompleted}\n`);
      }
    } else if (options.weekly) {
      const stats = getWeeklyStats(state);
      if (format === 'json') {
        console.log(JSON.stringify(stats, null, 2));
      } else {
        console.log('\n📊 Weekly Stats');
        stats.forEach((day) => {
          console.log(`   ${day.date}: ${day.completedSessions} sessions, ${formatTime(day.totalFocusTime)}`);
        });
        console.log('');
      }
    } else if (options.streak) {
      const streak = getStreak(state);
      if (format === 'json') {
        console.log(JSON.stringify({ streak }, null, 2));
      } else {
        console.log(`\n🔥 Current streak: ${streak} day${streak !== 1 ? 's' : ''}\n`);
      }
    } else if (options.all) {
      const stats = getAllTimeStats(state);
      const streak = getStreak(state);
      if (format === 'json') {
        console.log(JSON.stringify({ ...stats, streak }, null, 2));
      } else {
        console.log('\n📊 All-Time Stats');
        console.log(`   Total sessions: ${stats.totalSessions}`);
        console.log(`   Total focus time: ${formatTime(stats.totalFocusTime)}`);
        console.log(`   Tasks completed: ${stats.tasksCompleted}`);
        console.log(`   Current streak: ${streak} day${streak !== 1 ? 's' : ''}\n`);
      }
    } else {
      const daily = getDailyStats(state);
      const weekly = getWeeklyStats(state);
      const allTime = getAllTimeStats(state);
      const streak = getStreak(state);
      const weekTotal = weekly.reduce((sum, d) => sum + d.completedSessions, 0);
      const weekTime = weekly.reduce((sum, d) => sum + d.totalFocusTime, 0);

      if (format === 'json') {
        console.log(JSON.stringify({ daily, weekly, allTime, streak }, null, 2));
      } else {
        console.log('\n📊 Productivity Stats');
        console.log('\nToday:');
        console.log(`   Sessions: ${daily.completedSessions}`);
        console.log(`   Focus time: ${formatTime(daily.totalFocusTime)}`);
        console.log(`   Tasks: ${daily.tasksCompleted}`);
        console.log('\nThis Week:');
        console.log(`   Sessions: ${weekTotal}`);
        console.log(`   Focus time: ${formatTime(weekTime)}`);
        console.log('\nAll Time:');
        console.log(`   Sessions: ${allTime.totalSessions}`);
        console.log(`   Focus time: ${formatTime(allTime.totalFocusTime)}`);
        console.log(`   Tasks: ${allTime.tasksCompleted}`);
        console.log(`\n🔥 Streak: ${streak} day${streak !== 1 ? 's' : ''}\n`);
      }
    }
  });

program
  .command('history')
  .description('Show session history')
  .option('--limit <number>', 'Number of sessions to show', '20')
  .option('--json', 'Output as JSON')
  .action((options: { limit: string; json?: boolean }) => {
    const state = loadState();
    const format = options.json ? 'json' : 'plain';
    const limit = parseInt(options.limit, 10) || 20;

    const history = getHistory(state, limit);

    if (format === 'json') {
      console.log(JSON.stringify(history, null, 2));
    } else {
      if (history.length === 0) {
        console.log('No completed sessions yet.\n');
        return;
      }
      console.log('\n📜 Session History\n');
      history.forEach((session) => {
        const task = state.tasks.find((t) => t.id === session.taskId);
        const date = new Date(session.startTime).toLocaleDateString();
        const type = session.isBreak ? 'Break' : 'Work';
        console.log(`   ${date} - ${type}: ${task?.title || 'Unknown'} (${formatTime(session.duration)})`);
      });
      console.log('');
    }
  });

program
  .command('presets')
  .description('List available timer presets')
  .option('--json', 'Output as JSON')
  .action((options: { json?: boolean }) => {
    const config = loadConfig();
    const format = options.json ? 'json' : 'plain';
    const presets = getPresets(config);

    if (format === 'json') {
      console.log(JSON.stringify(presets, null, 2));
    } else {
      console.log('\n⏱️  Timer Presets\n');
      presets.forEach((p) => {
        const marker = p.isDefault ? ' ✓' : '';
        console.log(`   ${p.name}: ${p.workDuration / 60000}min work / ${p.breakDuration / 60000}min break${marker}`);
      });
      console.log('\n   Use: clidoro start <taskId> --preset <name>\n');
    }
  });

program
  .command('config')
  .description('View or update configuration')
  .option('--get <key>', 'Get a config value')
  .option('--set <key=value>', 'Set a config value')
  .option('--reset', 'Reset config to defaults')
  .option('--json', 'Output as JSON')
  .action((options: { get?: string; set?: string; reset?: boolean; json?: boolean }) => {
    if (options.reset) {
      const config = resetConfig();
      console.log(options.json ? JSON.stringify(config, null, 2) : 'Config reset to defaults.');
      return;
    }

    let config = loadConfig();

    if (options.set) {
      const [key, value] = options.set.split('=');
      if (!key || value === undefined) {
        console.log('Invalid format. Use: --set key=value');
        process.exit(1);
      }

      switch (key) {
        case 'workDuration':
          config.workDuration = parseInt(value, 10) * 60 * 1000;
          break;
        case 'breakDuration':
          config.breakDuration = parseInt(value, 10) * 60 * 1000;
          break;
        case 'longBreakDuration':
          config.longBreakDuration = parseInt(value, 10) * 60 * 1000;
          break;
        case 'autoStartBreak':
          config.autoStartBreak = value === 'true';
          break;
        case 'soundEnabled':
          config.soundEnabled = value === 'true';
          break;
        case 'soundType':
          if (['bell', 'chime', 'ding', 'none'].includes(value)) {
            config.soundType = value as 'bell' | 'chime' | 'ding' | 'none';
          } else {
            console.log('Invalid sound type. Use: bell, chime, ding, or none');
            process.exit(1);
          }
          break;
        case 'desktopNotifications':
          config.desktopNotifications = value === 'true';
          break;
        case 'onSessionStart':
          config.hooks.onSessionStart = value;
          break;
        case 'onSessionComplete':
          config.hooks.onSessionComplete = value;
          break;
        default:
          console.log(`Unknown config key: ${key}`);
          process.exit(1);
      }

      saveConfig(config);
      console.log(options.json 
        ? JSON.stringify(config, null, 2)
        : `Set ${key} = ${value}`
      );
      return;
    }

    if (options.get) {
      const key = options.get as keyof Config;
      const value = config[key];
      console.log(options.json 
        ? JSON.stringify({ [key]: value }, null, 2)
        : `${key}: ${JSON.stringify(value)}`
      );
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(config, null, 2));
    } else {
      console.log('\n⚙️  Configuration\n');
      console.log(`   Work duration: ${config.workDuration / 60000}min`);
      console.log(`   Break duration: ${config.breakDuration / 60000}min`);
      console.log(`   Long break: ${config.longBreakDuration / 60000}min`);
      console.log(`   Auto-start break: ${config.autoStartBreak ? 'Yes' : 'No'}`);
      console.log(`   Sound: ${config.soundEnabled ? config.soundType : 'off'}`);
      console.log(`   Desktop notifications: ${config.desktopNotifications ? 'On' : 'Off'}`);
      if (config.hooks.onSessionStart) console.log(`   onSessionStart: ${config.hooks.onSessionStart}`);
      if (config.hooks.onSessionComplete) console.log(`   onSessionComplete: ${config.hooks.onSessionComplete}`);
      console.log('\n   Use: clidoro config --set key=value\n');
    }
  });

program
  .command('reset')
  .description('Delete all tasks, sessions, and config')
  .option('--json', 'Output as JSON')
  .action((options: { json?: boolean }) => {
    resetAll();
    if (options.json) {
      console.log(JSON.stringify({ success: true, message: 'All data deleted' }, null, 2));
    } else {
      console.log('All data deleted. Starting fresh.');
    }
  });

program
  .command('view')
  .description('Show Termini TUI dashboard (static)')
  .action(() => {
    const state = loadState();
    renderTUI(state);
  });

program
  .command('interactive')
  .alias('i')
  .description('Interactive Termini TUI with task selection and real timer')
  .action(async () => {
    await runInteractiveTUI();
  });

program
  .command('dashboard')
  .description('Show text dashboard')
  .action(() => {
    const state = loadState();

    if (state.tasks.length === 0) {
      console.log('No tasks. Add one with: clidoro add "Task name"');
      process.exit(0);
    }

    if (state.currentSession) {
      const task = state.tasks.find((t) => t.id === state.currentSession?.taskId);
      const remaining = getSessionTimeRemaining(state.currentSession);
      const paused = isSessionPaused(state);
      const type = state.currentSession.isBreak ? 'Break' : 'Work';
      console.log(`\n${paused ? '⏸' : '▶'} ${type} Session Active`);
      console.log(`Task: #${task?.id} ${task?.title || 'Unknown'}`);
      console.log(`Time remaining: ${formatTime(remaining)}${paused ? ' (PAUSED)' : ''}\n`);
    } else {
      console.log('\nNo active session\n');
    }

    console.log('Tasks:');
    state.tasks.forEach((task) => {
      const sessions = state.sessions.filter((s) => s.taskId === task.id && s.completed && !s.isBreak)
        .length;
      const status = task.completed ? '✓' : '○';
      console.log(`#${task.id} ${status} ${task.title} (${sessions} pomodoros)`);
    });

    const stats = getDailyStats(state);
    console.log(`\nToday: ${stats.completedSessions} sessions, ${formatTime(stats.totalFocusTime)}\n`);
  });

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === 'i' || args[0] === 'interactive') {
  setTimeout(() => {
    runInteractiveTUI().catch(console.error);
  }, 0);
} else {
  try {
    program.parse(process.argv);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code: string }).code;
      if (code === 'commander.helpDisplayed' || code === 'commander.version') {
        process.exit(0);
      }
    }
    throw err;
  }
}
