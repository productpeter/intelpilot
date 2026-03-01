import config from '../config/index.js';

export function adminAuth(req, res, next) {
  if (!config.adminToken || config.adminToken === 'change_me' || config.adminToken === 'change_me_long_random') {
    return next();
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== config.adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
