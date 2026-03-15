import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { PomodoroState, Config } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

const getDirPath = (): string => {
  const configDir = join(homedir(), '.clidoro');
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  return configDir;
};

const getStatePath = (): string => join(getDirPath(), 'state.json');
const getConfigPath = (): string => join(getDirPath(), 'config.json');

export const loadState = (): PomodoroState => {
  const path = getStatePath();
  if (!existsSync(path)) {
    return { tasks: [], sessions: [], currentSession: null };
  }
  try {
    const data = readFileSync(path, 'utf-8');
    return JSON.parse(data) as PomodoroState;
  } catch {
    return { tasks: [], sessions: [], currentSession: null };
  }
};

export const saveState = (state: PomodoroState): void => {
  const path = getStatePath();
  writeFileSync(path, JSON.stringify(state, null, 2), 'utf-8');
};

export const loadConfig = (): Config => {
  const path = getConfigPath();
  if (!existsSync(path)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const data = readFileSync(path, 'utf-8');
    const loaded = JSON.parse(data) as Partial<Config>;
    return { ...DEFAULT_CONFIG, ...loaded };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
};

export const saveConfig = (config: Config): void => {
  const path = getConfigPath();
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf-8');
};

export const resetConfig = (): Config => {
  const config = { ...DEFAULT_CONFIG };
  saveConfig(config);
  return config;
};

export const resetAll = (): void => {
  const dir = join(homedir(), '.clidoro');
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
};
