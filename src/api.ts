import http from 'node:http';
import { AddressInfo } from 'node:net';

export interface ApiEvent {
  type: string;
  path?: string;
  timestamp: string;
  source?: string;
  data?: Record<string, unknown>;
}

export type EventQueue = ApiEvent[];

const DEFAULT_BASE_PORT = 8888;
const MAX_PORT_RETRIES = 100;

export async function startApiServer(
  eventQueue: EventQueue,
  basePort: number = DEFAULT_BASE_PORT
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let currentPort = basePort;
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/log_event') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const event = JSON.parse(body) as ApiEvent;
            if (!event.type || !event.timestamp) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing required fields: type and timestamp' }));
              return;
            }
            eventQueue.push(event);
            res.writeHead(202, { 'Content-Type': 'application/json' });
            res.end();
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          }
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      }
    });

    server.on('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE') {
        console.warn(`Port ${currentPort} in use, trying next...`);
        server.close();
        currentPort++;
        if (currentPort >= basePort + MAX_PORT_RETRIES) {
          reject(new Error(`Could not find an available port after ${MAX_PORT_RETRIES} retries.`));
        } else {
          server.listen(currentPort, '127.0.0.1');
        }
      } else {
        reject(e);
      }
    });

    server.on('listening', () => {
      const address = server.address() as AddressInfo;
      console.log(`JOURNAL_DAEMON_PORT:${address.port}`); // For client to capture
      resolve(address.port);
    });

    server.listen(currentPort, '127.0.0.1');
  });
}