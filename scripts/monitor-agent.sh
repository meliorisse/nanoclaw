#!/bin/bash
# Nanoclaw Agent Monitor Script
# Monitors agent-runner processes and restarts if unresponsive

AGENT_MAIN_PIDFILE="/tmp/agent-runner-main.pid"
AGENT_IPC_PIDFILE="/tmp/agent-runner-ipc.pid"
NANOCLOW_PATH="/Users/unitybox/nanoclaw/container/agent-runner/dist/index.js"
IPC_PATH="/Users/unitybox/nanoclaw/container/agent-runner/dist/ipc-mcp-stdio.js"
LOG_FILE="/Users/unitybox/nanoclaw/logs/agent-monitor.log"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

check_and_restart_agent() {
    local pid_file="$1"
    local process_type="$2"
    local node_path="$3"

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            log "Agent $process_type (PID $pid) is running normally"
            return 0
        else
            log "WARNING: Agent $process_type (PID $pid) is not responding, restarting..."
        fi
    else
        log "INFO: No PID file for $process_type, checking processes directly"
    fi

    # Check if any process matching the path is running
    local current_pids=$(pgrep -f "$node_path" 2>/dev/null)
    if [ -z "$current_pids" ]; then
        log "Agent $process_type not found, starting..."
        cd /Users/unitybox/nanoclaw
        NODE_ENV=production node "$node_path" >> "$LOG_FILE" 2>&1 &
        local new_pid=$!
        echo $new_pid > "$pid_file"
        log "Started $process_type with PID $new_pid"
    else
        log "Agent $process_type (PID $current_pids) is running, just updated pid file"
        echo "$current_pids" | head -1 > "$pid_file"
    fi
}

# Ensure log directory exists
mkdir -p /Users/unitybox/nanoclaw/logs

log "=== Agent monitor check started ==="

check_and_restart_agent "$AGENT_MAIN_PIDFILE" "main" "$NANOCLOW_PATH"
check_and_restart_agent "$AGENT_IPC_PIDFILE" "ipc-mcp-stdio" "$IPC_PATH"

exit 0
