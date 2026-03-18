#!/bin/zsh
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "usage: $0 <output-path>" >&2
  exit 1
fi

printf 'placeholder screenshot for Agent Manager\n' > "$1"
