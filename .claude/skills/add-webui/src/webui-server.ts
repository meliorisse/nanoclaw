#!/usr/bin/env node

/**
 * NanoClaw Web UI Server
 *
 * A simple web-based chat interface for NanoClaw.
 * Access at http://localhost:3000
 */

import { WebUIChannel } from './channels/webui/webui-channel.js';

const PORT = parseInt(process.env.WEBUI_PORT || '3000', 10);

async function main() {
  console.log('Starting NanoClaw Web UI...');
  console.log(`Port: ${PORT}`);

  const webui = new WebUIChannel(PORT);

  try {
    const result = await webui.initialize();

    if (result.success) {
      console.log(`\nWeb UI is running at: http://127.0.0.1:${result.port}`);
      console.log('Press Ctrl+C to stop\n');

      // Keep the server running
      process.on('SIGINT', async () => {
        console.log('\nShutting down Web UI...');
        await webui.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log('\nShutting down Web UI...');
        await webui.stop();
        process.exit(0);
      });
    } else {
      console.error('Failed to start Web UI');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error starting Web UI:', error);
    process.exit(1);
  }
}

main();
