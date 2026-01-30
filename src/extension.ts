import { workspace, ExtensionContext, window, OutputChannel, TextDocument } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient/node';
import * as net from 'net';

// Map to manage active Language Clients (one per language).
const clients: Map<string, LanguageClient> = new Map();

// Configuration map that assigns language IDs to their environment variables and defaults.
// The operator injects both language-specific (LS_JAVA_HOST) and generic (LS_HOST) env vars.
const languageServerConfigs = {
  'rust': {
    hostEnv: 'LS_RUST_HOST',
    portEnv: 'LS_RUST_PORT',
    defaultHost: 'rust-language-server',
    defaultPort: 5000,
  },
  'java': {
    hostEnv: 'LS_JAVA_HOST',
    portEnv: 'LS_JAVA_PORT',
    defaultHost: 'java-language-server',
    defaultPort: 5000,
  }
};

// Called once when the extension is activated.
export function activate(context: ExtensionContext) {
  console.log('[LSSERVICE] Lazy Multi-Language LSP Connector is now active!');

  function ensureLanguageClient(document: TextDocument): void {
    const langId = document.languageId as keyof typeof languageServerConfigs;
    
    if (languageServerConfigs[langId] && !clients.has(langId)) {
      console.log(`[LSSERVICE] Language is supported and client is not running`);
      const config = languageServerConfigs[langId];
      // Resolution chain: language-specific env -> generic LS_HOST/LS_PORT -> default
      const host = process.env[config.hostEnv] || process.env['LS_HOST'] || config.defaultHost;
      const port = parseInt(process.env[config.portEnv] || process.env['LS_PORT'] || `${config.defaultPort}`, 10);
      
      console.log(`[LSSERVICE] First file for '${langId}' opened. Starting client to connect to ${host}:${port}`);
      
      const serverOptions: ServerOptions = () => {
        return new Promise((resolve, reject) => {
          const socket = net.connect({ host, port });
          socket.on('connect', () => {
            console.log(`[LSSERVICE] Successfully connected to ${langId} LS at ${host}:${port}`);
            resolve({ reader: socket, writer: socket });
          });
          socket.on('error', (err) => reject(`[LSSERVICE] Socket error for ${langId} LS: ${err.message}`));
        });
      };

      const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: langId }],
        synchronize: {
          fileEvents: workspace.createFileSystemWatcher(`**/*.{${getFileExtensions(langId)}}`),
        },
      };

      const client = new LanguageClient(
        `${langId}LspConnector`,
        `${langId.toUpperCase()} Language Server (TCP)`,
        serverOptions,
        clientOptions
      );

      client.start();
      clients.set(langId, client);
    }
  }

  context.subscriptions.push(workspace.onDidOpenTextDocument(ensureLanguageClient));
  
  workspace.textDocuments.forEach(ensureLanguageClient);
}

function getFileExtensions(languageId: string): string {
  switch (languageId) {
    case 'rust': return 'rs';
    case 'java': return 'java';
    default: return '';
  }
}

export function deactivate(): Thenable<void> {
  const promises: Thenable<void>[] = [];
  for (const client of clients.values()) {
    promises.push(client.stop());
  }
  return Promise.all(promises).then(() => undefined);
}