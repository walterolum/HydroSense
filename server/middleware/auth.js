const jwt = require('jsonwebtoken');

const DEFAULT_SECRET = 'uma_water_monitor_secret_2025';
const SECRET = process.env.JWT_SECRET || DEFAULT_SECRET;
if (!process.env.JWT_SECRET) {
  console.warn('[SECURITY] JWT_SECRET env var is not set — using insecure default. Set JWT_SECRET in production!');
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRole, SECRET };
