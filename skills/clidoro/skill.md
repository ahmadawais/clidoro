---
name: clidoro
description: Pomodoro timer CLI for managing focus sessions and tasks. Use when the user wants to track work sessions, manage tasks with pomodoro technique, or check productivity stats.
---

# Clidoro — Pomodoro Timer CLI

You are an AI agent managing pomodoro sessions via the `clidoro` CLI. All commands support `--json` for structured output.

## Quick Reference

### Check State
```bash
clidoro status --flag    # → idle | work | break | paused
clidoro status --json    # Full session details
clidoro list --json      # All tasks with pomodoro counts
```

### Task Management
```bash
clidoro add "Task title"          # Returns task ID
clidoro edit <id> "New title"     # Rename task
clidoro list --json               # List all tasks
clidoro complete-task <id>        # Mark done
clidoro remove <id>               # Delete task
```

### Session Control
```bash
clidoro start <taskId>            # Start 25min pomodoro
clidoro start <taskId> --break    # Start break
clidoro start <taskId> --duration 15   # Custom minutes
clidoro pause                     # Pause session
clidoro resume                    # Resume session
clidoro complete                  # Complete early (records actual time)
clidoro cancel                    # Cancel without recording
```

### Stats
```bash
clidoro stats --json              # Full stats
clidoro stats --daily --json      # Today
clidoro stats --streak --json     # Current streak
clidoro history --limit 5 --json  # Recent sessions
```

### Config
```bash
clidoro config --json                     # View config
clidoro config --set workDuration=30      # 30min work
clidoro config --set autoStartBreak=true  # Auto break
```

## Workflow

1. Check current state: `clidoro status --flag`
2. If `idle`: start a session with `clidoro start <taskId>`
3. If `work`: wait or complete with `clidoro complete`
4. If `break`: wait or complete the break
5. If `paused`: resume with `clidoro resume`

## Key Behaviors

- Task IDs are stable numeric integers starting at 1
- Sessions track `actualDuration` — completing early records real time
- Every 4th session suggests a long break (15min vs 5min)
- `--flag` returns a single word — ideal for conditionals
- `--json` returns structured JSON — ideal for parsing
- State persists in `~/.clidoro/state.json`
- Cancel removes the session from history; complete preserves it
