import { HttpError } from '../utils/httpError.js';
import { EmailError } from '../services/emailService.js';

// Turns anything a route throws into { error } with a sensible status. Unexpected errors answer only
// a plain sentence and the request ID; the details (stack, database messages) go to the log alone.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...(err.code && { code: err.code }), ...err.extra });
  if (err instanceof EmailError) {
    console.error(`Email failed: ${err.message}`);
    return res.status(502).json({ error: 'We couldn’t send the email just now. Try again in a few minutes.' });
  }
  if (err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'That photo is too large.' : 'That upload could not be read.';
    return res.status(400).json({ error: msg });
  }
  if (err.name === 'ValidationError') return res.status(400).json({ error: Object.values(err.errors)[0]?.message || 'Invalid data.' });
  if (err.name === 'CastError') return res.status(404).json({ error: 'Not found.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  if (err.status === 413 || err.type === 'entity.too.large') return res.status(413).json({ error: 'That request is too large.' });
  console.error(`[${req.id}] ${req.method} ${req.originalUrl.split('?')[0]}: ${err.stack || err}`);
  res.status(500).json({ error: 'Something went wrong on our side.', requestId: req.id });
}
