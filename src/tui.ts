import {
  createTestBackendState,
  createTestBackend,
  testBackendToString,
  createTerminal,
  terminalDraw,
  frameRenderWidget,
  createLayout,
  lengthConstraint,
  fillConstraint,
  splitLayout,
  blockBordered,
  createTitle,
  createParagraph,
  renderParagraph,
  createList,
  renderList,
  createStyle,
  styleFg,
  Color,
  gaugePercent,
  renderGauge,
  type Frame,
  type Rect,
} from 'terminui';
import type { PomodoroState } from './types.js';
import {
  formatTime,
  getSessionProgress,
  getSessionTimeRemaining,
  getCompletedSessionsCount,
} from './pomodoro.js';

export const renderTUI = (state: PomodoroState): void => {
  const width = process.stdout.columns || 80;
  const height = process.stdout.rows || 24;

  const backendState = createTestBackendState(width, height);
  const backend = createTestBackend(backendState);
  const terminal = createTerminal(backend);

  terminalDraw(terminal, (frame) => {
    const mainLayout = createLayout([lengthConstraint(3), fillConstraint(1), lengthConstraint(3)]);
    const areas = splitLayout(mainLayout, frame.area);
    const headerArea = areas[0];
    const contentArea = areas[1];
    const footerArea = areas[2];

    if (headerArea && contentArea && footerArea) {
      renderHeader(frame, headerArea);
      renderContent(frame, contentArea, state);
      renderFooter(frame, footerArea);
    }
  });

  console.log(testBackendToString(backendState));
};

const renderHeader = (frame: Frame, area: Rect): void => {
  const header = createParagraph('🍅 Clidoro - Pomodoro Timer', {
    block: blockBordered({ titles: [createTitle('Pomodoro')] }),
    alignment: 'center',
  });
  frameRenderWidget(frame, renderParagraph(header), area);
};

const renderContent = (frame: Frame, area: Rect, state: PomodoroState): void => {
  if (state.currentSession) {
    renderActiveSession(frame, area, state);
  } else {
    renderTaskList(frame, area, state);
  }
};

const renderActiveSession = (frame: Frame, area: Rect, state: PomodoroState): void => {
  const session = state.currentSession!;
  const task = state.tasks.find((t) => t.id === session.taskId);
  const progress = getSessionProgress(session);
  const remaining = getSessionTimeRemaining(session);
  const timeStr = formatTime(remaining);
  const sessionType = session.isBreak ? 'Break' : 'Work';

  const layout = createLayout([lengthConstraint(5), fillConstraint(1)]);
  const areas = splitLayout(layout, area);
  const timerArea = areas[0];
  const gaugeArea = areas[1];

  if (timerArea && gaugeArea) {
    const timerDisplay = createParagraph(`${timeStr}\n\n#${task?.id} ${task?.title || 'Unknown'}`, {
      block: blockBordered({ titles: [createTitle(`${sessionType} Session`)] }),
      alignment: 'center',
    });

    frameRenderWidget(frame, renderParagraph(timerDisplay), timerArea);

    const gaugeColor = session.isBreak ? Color.Cyan : Color.Green;
    const gauge = gaugePercent(Math.round(progress * 100), {
      block: blockBordered({ titles: [createTitle('Progress')] }),
      useUnicode: true,
      gaugeStyle: styleFg(createStyle(), gaugeColor),
    });

    frameRenderWidget(frame, renderGauge(gauge), gaugeArea);
  }
};

const renderTaskList = (frame: Frame, area: Rect, state: PomodoroState): void => {
  if (state.tasks.length === 0) {
    const emptyMsg = createParagraph('No tasks yet.\nAdd one with: clidoro add "Task name"', {
      block: blockBordered({ titles: [createTitle('Tasks')] }),
      alignment: 'center',
    });
    frameRenderWidget(frame, renderParagraph(emptyMsg), area);
    return;
  }

  const taskItems = state.tasks.map((task) => {
    const sessions = getCompletedSessionsCount(state, task.id);
    const status = task.completed ? '✓' : '○';
    return `#${task.id} ${status} ${task.title} (${sessions} pomodoros)`;
  });

  const list = createList(taskItems, {
    block: blockBordered({ titles: [createTitle('Tasks')] }),
    highlightStyle: styleFg(createStyle(), Color.Yellow),
    highlightSymbol: '▶ ',
  });

  frameRenderWidget(frame, renderList(list), area);
};

const renderFooter = (frame: Frame, area: Rect): void => {
  const footer = createParagraph('clidoro start <id> | clidoro list | clidoro status', {
    block: blockBordered({ titles: [createTitle('Commands')] }),
    alignment: 'center',
  });
  frameRenderWidget(frame, renderParagraph(footer), area);
};
