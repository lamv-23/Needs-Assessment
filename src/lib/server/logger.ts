type LogLevel = 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

function writeLog(level: LogLevel, entry: LogContext) {
  const message = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    ...entry,
  });

  if (level === 'error') {
    console.error(message);
    return;
  }

  if (level === 'warn') {
    console.warn(message);
    return;
  }

  console.log(message);
}

export function logServerInfo(event: string, context: LogContext = {}) {
  writeLog('info', { event, ...context });
}

export function logServerWarn(event: string, context: LogContext = {}) {
  writeLog('warn', { event, ...context });
}

export function logServerError(event: string, context: LogContext = {}) {
  writeLog('error', { event, ...context });
}
