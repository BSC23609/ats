#!/usr/bin/env bash
# Runs every time you (re)attach to the Codespace.
sudo service postgresql start >/dev/null 2>&1 || true
