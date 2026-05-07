import { createLogger, format, transports } from 'winston';
import { WinstonTransport as AxiomTransport } from '@axiomhq/winston';

const SENSITIVE_KEYS = ['password', 'token', 'cookie', 'authorization', 'secret'];

const maskData = (data) => {
  if (!data || typeof data !== 'object') return data;

  const maskedObj = Array.isArray(data) ? [] : {};
  for (const key in data) {
    if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
      maskedObj[key] = '*** MASKED ***';
    } else if (typeof data[key] === 'object') {
      maskedObj[key] = maskData(data[key]);
    } else {
      maskedObj[key] = data[key];
    }
  }
  return maskedObj;
};

const maskFormat = format((info) => {
  if (info.meta) {
    info.meta = maskData(info.meta);
  }
  return info;
});

const activeTransports = [new transports.Console()];

if (process.env.AXIOM_DATASET && process.env.AXIOM_TOKEN) {
  const axiomTransport = new AxiomTransport({
    dataset: process.env.AXIOM_DATASET,
    token: process.env.AXIOM_TOKEN,
  });

  axiomTransport.on?.('error', (error) => {
    console.warn('Axiom logging failed:', error?.message || error);
  });

  activeTransports.push(axiomTransport);
}

const logger = createLogger({
  level: 'info',
  exitOnError: false,
  format: format.combine(
    maskFormat(),
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.json()
  ),
  transports: activeTransports,
});

logger.on?.('error', (error) => {
  console.warn('Logger error:', error?.message || error);
});

export default logger;

