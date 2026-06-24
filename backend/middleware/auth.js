import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_development_only';

export function authenticate(req, res, next) {
  // Authentication flow removed per user request.
  // We mock a local user so backend DB queries still have a user_id.
  req.user = { id: 'local_user_123' };
  next();
}

export function optionalAuthenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
  } catch (err) {
    // Ignore invalid tokens for optional auth
  }
  next();
}
