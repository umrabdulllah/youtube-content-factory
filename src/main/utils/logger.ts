import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

class Logger {
  private logFilePath: string;
  private logStream: fs.WriteStream | null = null;
  private originalConsole: {
    log: typeof console.log;
    error: typeof console.error;
    warn: typeof console.warn;
    info: typeof console.info;
    debug: typeof console.debug;
  };

  constructor() {
    // Store original console methods
    this.originalConsole = {
      log: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      info: console.info.bind(console),
      debug: console.debug.bind(console),
    };

    // Set up log file path
    const logsDir = path.join(app.getPath('userData'), 'logs');

    // Ensure logs directory exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create log file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFilePath = path.join(logsDir, `app-${timestamp}.log`);

    // Also maintain a "latest.log" symlink/copy for easy access
    this.initLogStream();
  }

  private initLogStream(): void {
    this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
    this.logStream.on('error', (err) => {
      this.originalConsole.error('[Logger] Failed to write to log file:', err);
    });

    // Write header
    const header = `\n${'='.repeat(80)}\nLog started at: ${new Date().toISOString()}\n${'='.repeat(80)}\n\n`;
    this.logStream.write(header);
  }

  private formatMessage(level: string, args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    return `[${timestamp}] [${level.toUpperCase()}] ${formattedArgs}\n`;
  }

  private writeToFile(message: string): void {
    if (this.logStream && !this.logStream.destroyed) {
      this.logStream.write(message);
    }
  }

  public interceptConsole(): void {
    console.log = (...args: unknown[]) => {
      this.originalConsole.log(...args);
      this.writeToFile(this.formatMessage('LOG', args));
    };

    console.error = (...args: unknown[]) => {
      this.originalConsole.error(...args);
      this.writeToFile(this.formatMessage('ERROR', args));
    };

    console.warn = (...args: unknown[]) => {
      this.originalConsole.warn(...args);
      this.writeToFile(this.formatMessage('WARN', args));
    };

    console.info = (...args: unknown[]) => {
      this.originalConsole.info(...args);
      this.writeToFile(this.formatMessage('INFO', args));
    };

    console.debug = (...args: unknown[]) => {
      this.originalConsole.debug(...args);
      this.writeToFile(this.formatMessage('DEBUG', args));
    };
  }

  public getLogFilePath(): string {
    return this.logFilePath;
  }

  public getLogsDirectory(): string {
    return path.dirname(this.logFilePath);
  }

  public close(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}

// Singleton instance
export const logger = new Logger();

// Helper to initialize logging - call this early in main process
export function initializeLogging(): string {
  logger.interceptConsole();
  const logPath = logger.getLogFilePath();
  console.log(`[Logger] Logging initialized. Log file: ${logPath}`);
  return logPath;
}

export function getLogFilePath(): string {
  return logger.getLogFilePath();
}

export function getLogsDirectory(): string {
  return logger.getLogsDirectory();
}
