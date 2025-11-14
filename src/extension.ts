import * as net from 'net';
import { workspace, ExtensionContext } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  StreamInfo
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  console.log('Rust LSP Connector (TCP) is now active!');

  const serverOptions: ServerOptions = () => {
    return new Promise((resolve, reject) => {
      // Wir konfigurieren Host und Port für den externen LS
      const host = 'language-server'; // Der Name des LS-Containers
      const port = 5555;

      console.log(`Attempting to connect to Rust Language Server at ${host}:${port}`);

      try {
        const socket = net.connect({ host: host, port: port });

        socket.on('connect', () => {
          console.log("Successfully connected to the Rust Language Server.");
          const result: StreamInfo = {
            reader: socket,
            writer: socket,
          };
          resolve(result);
        });

        socket.on('error', (err) => {
          console.error(`Failed to connect to language server: ${err.message}`);
          reject(err);
        });

      } catch (e) {
        console.error(`Caught exception during connection attempt: ${e}`);
        reject(e);
      }
    });
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'rust' }],
  };

  client = new LanguageClient(
    'rustLspConnector',
    'External Rust Language Server (TCP)',
    serverOptions,
    clientOptions
  );

  console.log('Starting the language client...');
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}