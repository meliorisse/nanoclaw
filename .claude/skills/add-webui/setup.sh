#!/bin/bash

# NanoClaw Web UI Setup Script
# This script sets up the web UI channel for NanoClaw

echo "=== NANOCLAW WEBUI SETUP ==="
echo "Setting up web UI channel..."

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "ERROR: Node.js 18+ required. Found $(node -v)"
    exit 1
fi

echo "NODE_OK=true"

# Create web UI directory structure
mkdir -p src/channels/webui
mkdir -p public

# Install dependencies
echo "Installing web UI dependencies..."
npm install express ws ejs --save 2>&1 | tail -5

if [ $? -eq 0 ]; then
    echo "DEPS_OK=true"
else
    echo "DEPS_OK=false"
    echo "See logs for details"
fi

echo "STATUS=success"
echo "=== END ==="
