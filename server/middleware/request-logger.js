function requestLogger(req, res, next) {
  const requestId = req.requestId || req.headers['x-request-id'];
  if (requestId) {
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
  }

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(
      `[${level}] [${req.requestId || '-'}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
    );
  });

  next();
}

module.exports = requestLogger;
