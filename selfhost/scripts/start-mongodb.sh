#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
selfhost_dir=$(cd -- "$script_dir/.." && pwd)
runtime_dir="$selfhost_dir/.runtime"
mongod="$runtime_dir/mongodb/bin/mongod"
pid_file="$runtime_dir/mongod.pid"

if [ ! -x "$mongod" ]; then
  echo "MongoDB binary is missing: $mongod" >&2
  echo "Download/extract MongoDB into selfhost/.runtime/mongodb first." >&2
  exit 1
fi

if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
  echo "MongoDB is already running (pid $(cat "$pid_file"))."
  exit 0
fi

mkdir -p "$runtime_dir/mongo-data" "$runtime_dir/mongo-log"
"$mongod" \
  --dbpath "$runtime_dir/mongo-data" \
  --logpath "$runtime_dir/mongo-log/mongod.log" \
  --pidfilepath "$pid_file" \
  --bind_ip 127.0.0.1 \
  --port 27017 \
  --fork

echo "MongoDB is listening on 127.0.0.1:27017."
