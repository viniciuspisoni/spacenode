#!/bin/sh
# Builds and runs the portable core tests (no Archicad, no DevKit, no network).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
out=${TMPDIR:-/tmp}/spacenode-archicad-unit
mkdir -p "$out"
${CXX:-c++} -std=c++20 -Wall -Wextra -Wpedantic -Werror -O1 -g -pthread \
  "$here"/core_tests.cpp "$here"/../core/*.cpp -o "$out/core_tests"
exec "$out/core_tests" "$@"
