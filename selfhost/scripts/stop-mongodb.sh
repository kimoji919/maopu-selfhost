#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
pid_file="$script_dir/../.runtime/mongod.pid"

if [ ! -f "$pid_file" ]; then
  echo "MongoDB is not running."
  exit 0
fi

pid=$(cat "$pid_file")
if kill -0 "$pid" 2>/dev/null; then
  kill "$pid"
  echo "Stopped MongoDB (pid $pid)."
else
  echo "Removed stale MongoDB pid file."
fi
rm -f "$pid_file"
