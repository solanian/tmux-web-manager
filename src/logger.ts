export function createLogger(scope: string) {
  function format(level: string, args: unknown[]): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${scope}] [${level}]`;
    console.log(prefix, ...args);
  }

  return {
    log: (...args: unknown[]) => format('INFO', args),
    warn: (...args: unknown[]) => format('WARN', args),
    error: (...args: unknown[]) => format('ERROR', args),
  };
}

