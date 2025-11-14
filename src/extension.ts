import { workspace, ExtensionContext, window, OutputChannel, TextDocument } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from 'vscode-languageclient/node';
import * as net from 'net';

// Eine Map, um unsere aktiven Language Clients zu verwalten (einer pro Sprache).
const clients: Map<string, LanguageClient> = new Map();

// Eine Konfigurations-Map, die Sprach-IDs den Umgebungsvariablen und Defaults zuordnet.
const languageServerConfigs = {
  'rust': {
    hostEnv: 'LS_RUST_HOST',
    portEnv: 'LS_RUST_PORT',
    defaultHost: 'rust-language-server',
    defaultPort: 5555,
  },
  'java': {
    hostEnv: 'LS_JAVA_HOST',
    portEnv: 'LS_JAVA_PORT',
    defaultHost: 'java-language-server',
    defaultPort: 5556,
  }
};

// Diese Funktion wird EINMAL aufgerufen, wenn die Extension aktiviert wird.
export function activate(context: ExtensionContext) {
  console.log('Lazy Multi-Language LSP Connector is now active!');

  // Diese Funktion wird für JEDES geöffnete Dokument aufgerufen.
  function ensureLanguageClient(document: TextDocument): void {
    const langId = document.languageId as keyof typeof languageServerConfigs;
    
    // Prüfen, ob wir diese Sprache unterstützen UND ob der Client dafür noch NICHT läuft.
    if (languageServerConfigs[langId] && !clients.has(langId)) {
      const config = languageServerConfigs[langId];

      // Lese Host und Port aus den Umgebungsvariablen, mit Fallback auf die Defaults.
      // Das macht es für Docker Compose und Kubernetes flexibel.
      const host = process.env[config.hostEnv] || config.defaultHost;
      const port = parseInt(process.env[config.portEnv] || `${config.defaultPort}`, 10);
      
      console.log(`First file for '${langId}' opened. Starting client to connect to ${host}:${port}`);
      
      const serverOptions: ServerOptions = () => {
        return new Promise((resolve, reject) => {
          const socket = net.connect({ host, port });
          socket.on('connect', () => resolve({ reader: socket, writer: socket }));
          socket.on('error', (err) => reject(`Socket error for ${langId} LS: ${err.message}`));
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

      // Starte den Client. Er wird jetzt für alle weiteren Dateien dieser Sprache laufen.
      client.start();
      // Merke dir den Client, um zu verhindern, dass er erneut gestartet wird.
      clients.set(langId, client);
    }
  }

  // Registriere den Event-Handler. Er wird unsere Logik bei Bedarf auslösen.
  context.subscriptions.push(workspace.onDidOpenTextDocument(ensureLanguageClient));
  
  // Prüfe beim Start auch bereits geöffnete Dokumente, falls das Fenster neu geladen wurde.
  workspace.textDocuments.forEach(ensureLanguageClient);
}

// Hilfsfunktion, um die richtigen Dateiendungen zu bekommen.
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