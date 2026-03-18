# Web UI Channel for NanoClaw

Add a web-based chat interface to NanoClaw, accessible at `localhost:3000`.

## Features

- Real-time chat interface with WebSocket support
- Message history view
- Group management dashboard
- Clean, modern UI with dark/light mode
- Mobile-responsive design

## Installation Steps

1. Install dependencies (Express, WebSocket, templating)
2. Create web server with chat interface
3. Integrate with NanoClaw's IPC system
4. Register as a channel
5. Start the web UI service

## Usage

After installation, the web UI will be available at `http://localhost:3000`.
The webui channel is automatically registered and messages sent via the web interface are routed to your NanoClaw agent.
