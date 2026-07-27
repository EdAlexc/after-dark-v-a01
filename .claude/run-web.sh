#!/bin/sh
# Starts the AfterDark web app for local preview (Browser pane / launch.json).
cd "$(dirname "$0")/../anything/apps/web" || exit 1
exec ../../.yarn/releases/yarn-4.12.0.cjs dev
