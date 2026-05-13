class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

function errorHandler(err, req, res, _next) {
  const requestId = req.requestId || 'unknown';
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.isOperational ? err.message : 'An unexpected error occurred';

  const logEntry = {
    timestamp: new Date().toISOString(),
    requestId,
    method: req.method,
    path: req.path,
    statusCode,
    code,
    message: err.message,
    isOperational: !!err.isOperational,
  };

  if (err.isOperational) {
    console.warn(`[${requestId}] Operational: ${req.method} ${req.path} → ${statusCode} ${err.message}`);
  } else {
    console.error(`[${requestId}] CRITICAL: ${req.method} ${req.path} → ${statusCode} ${err.message}`, err.stack?.split('\n').slice(0, 6).join('\n'));
  }

  const response = {
    success: false,
    error: message,
    code,
    requestId,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  };

  if (res.headersSent) return;
  res.status(statusCode).json(response);
}

module.exports = { errorHandler, AppError };
