export type LogValue = string | number | boolean;
export type LogFields = Readonly<Record<string, LogValue>>;

/**
 * Field values are restricted to primitives so that whole objects (request headers, tokens)
 * cannot end up in a log line by accident.
 */
export interface Logger {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

type LogLevel = 'info' | 'warn' | 'error';

/**
 * String values are JSON-quoted, so client-controlled text such as a device name cannot add
 * line breaks and forge extra log lines.
 */
export function formatLogLine(
  level: LogLevel,
  message: string,
  fields: LogFields,
  time: Date,
): string {
  const renderedFields = Object.entries(fields).map(
    ([key, value]) => `${key}=${typeof value === 'string' ? JSON.stringify(value) : String(value)}`,
  );
  return [time.toISOString(), level.toUpperCase(), message, ...renderedFields].join(' ');
}

export function createConsoleLogger(): Logger {
  const write = (level: LogLevel, message: string, fields: LogFields = {}): void => {
    const line = formatLogLine(level, message, fields, new Date());
    switch (level) {
      case 'info':
        console.log(line);
        break;
      case 'warn':
        console.warn(line);
        break;
      case 'error':
        console.error(line);
        break;
    }
  };
  return {
    info: (message, fields) => {
      write('info', message, fields);
    },
    warn: (message, fields) => {
      write('warn', message, fields);
    },
    error: (message, fields) => {
      write('error', message, fields);
    },
  };
}

export function errorFields(error: unknown): LogFields {
  if (!(error instanceof Error)) {
    return { error: String(error) };
  }
  return { error: error.name, detail: error.message, stack: error.stack ?? '' };
}
