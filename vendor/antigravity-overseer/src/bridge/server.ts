import { createRuntimeContext } from "../services/runtime.ts";
import { createExtensionBridgeServer } from "./receiver.ts";

const runtime = await createRuntimeContext();

if (!runtime.config.extensionBridge.enabled) {
  runtime.logger.error("Extension bridge is disabled. Set OVERSEER_EXTENSION_BRIDGE_ENABLED=true.");
  process.exit(1);
}

const server = createExtensionBridgeServer(runtime.config, runtime.logger);

server.listen(runtime.config.extensionBridge.port, runtime.config.extensionBridge.host, () => {
  runtime.logger.info("Extension bridge listening.", {
    host: runtime.config.extensionBridge.host,
    port: runtime.config.extensionBridge.port,
    inboxDir: runtime.config.extensionBridge.inboxDir,
    latestVisibleTextPath: runtime.config.extensionBridge.latestVisibleTextPath
  });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    runtime.logger.info("Shutting down extension bridge.", { signal });
    server.close(() => process.exit(0));
  });
}

