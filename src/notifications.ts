import { exec, execFile } from 'child_process';
import { platform } from 'os';

export const playSound = (soundType: 'bell' | 'chime' | 'ding' | 'none'): void => {
  if (soundType === 'none') return;

  const sounds: Record<string, string> = {
    bell: 'Glass',
    chime: 'Pop',
    ding: 'Submarine',
  };

  const sound = sounds[soundType] || 'Glass';
  
  if (platform() === 'darwin') {
    exec(`afplay /System/Library/Sounds/${sound}.aiff`, (err) => {
      if (err) {
        console.log('\x07');
      }
    });
  } else if (platform() === 'linux') {
    exec('paplay /usr/share/sounds/freedesktop/stereo/complete.ogg', (err) => {
      if (err) {
        console.log('\x07');
      }
    });
  } else {
    console.log('\x07');
  }
};

export const sendDesktopNotification = (
  title: string,
  body: string,
  onClick?: () => void,
): void => {
  if (platform() === 'darwin') {
    execFile('osascript', ['-e', `display notification "${body}" with title "${title}"`], (err) => {
      if (err) {
        console.log(`${title}: ${body}`);
      }
      if (onClick) onClick();
    });
  } else if (platform() === 'linux') {
    execFile('notify-send', [title, body], (err) => {
      if (err) {
        console.log(`${title}: ${body}`);
      }
      if (onClick) onClick();
    });
  } else {
    console.log(`${title}: ${body}`);
  }
};

export const notifySessionComplete = (
  isBreak: boolean,
  soundEnabled: boolean,
  soundType: 'bell' | 'chime' | 'ding' | 'none',
  desktopNotifications: boolean,
): void => {
  const title = isBreak ? 'Break Complete!' : 'Work Session Complete!';
  const body = isBreak
    ? 'Time to get back to work!'
    : 'Great job! Take a break.';

  if (soundEnabled && soundType !== 'none') {
    playSound(soundType);
  }

  if (desktopNotifications) {
    sendDesktopNotification(title, body);
  }
};

export const notifySessionStart = (
  isBreak: boolean,
  desktopNotifications: boolean,
): void => {
  if (!desktopNotifications) return;

  const title = isBreak ? 'Break Started' : 'Work Session Started';
  const body = isBreak
    ? 'Enjoy your break!'
    : 'Focus time!';

  sendDesktopNotification(title, body);
};

export const runHook = (command?: string): void => {
  if (!command) return;
  
  exec(command, (err) => {
    if (err) {
      console.error(`Hook failed: ${err.message}`);
    }
  });
};
