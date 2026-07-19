#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
selfhost_dir=$(cd -- "$script_dir/.." && pwd)
unit_dir="$HOME/.config/systemd/user"

mkdir -p "$unit_dir"
cp "$selfhost_dir/systemd/maopu-mongodb.service" "$unit_dir/"
cp "$selfhost_dir/systemd/maopu-api.service" "$unit_dir/"
cp "$selfhost_dir/systemd/maopu-gateway.service" "$unit_dir/"
systemctl --user daemon-reload

echo "Installed user services."
echo "Before enabling API, create selfhost/.env with JWT_SECRET and WeChat credentials."
echo "Enable MongoDB/API: systemctl --user enable --now maopu-mongodb maopu-api"
echo "Enable gateway only after the existing 8787 service has moved to 8789:"
echo "  systemctl --user enable --now maopu-gateway"
