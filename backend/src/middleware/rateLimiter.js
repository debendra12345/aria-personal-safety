/**
 * Login Rate Limiter with Proxy Support
 * 
 * N19 Fix: Properly track per-user failed attempts and per-IP rate limiting
 * while correctly identifying clients behind reverse proxies.
 * Successful logins are NOT counted against the failure limit.
 * 
 * Stores:
 * - loginAttemptsByEmail: tracks FAILED login attempts per email
 * - loginAttemptsByIp: tracks all login attempts per IP (for brute-force)
 * - successfulLoginsByEmail: clears failed counters after successful login
 */

const CHUNK_INTERVAL_MS = 3000; // 1 chunk every 3 seconds per user
const CLEANUP_INTERVAL_MS = 60000; // Clean stale entries every 60 seconds

const userTimestamps = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_EMAIL_LIMIT = 5; // Max 5 FAILED attempts per email in 15 minutes
const LOGIN_IP_LIMIT = 20; // Max 20 total login attempts per IP in 15 minutes
const REGISTRATION_IP_LIMIT = 5;
const failedLoginAttemptsByEmail = new Map();
const loginAttemptsByIp = new Map();
const registrationAttemptsByIp = new Map();

/**
 * Get client IP address from request, properly handling reverse proxies.
 * 
 * N19: Use Express app.set('trust proxy', ...) to determine trusted proxy hops.
 * Never blindly trust X-Forwarded-For headers from untrusted sources.
 */
function getClientIp(req) {
  // req.ip is the client IP when Express is configured to trust proxies correctly
  // The app.js must set: app.set('trust proxy', 1) for single-hop proxy (Render/Railway)
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function getEmail(req) {
  const email = req.body?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : null;
}

function isRateLimited(store, key, limit, now) {
  const timestamps = (store.get(key) || []).filter(timestamp => now - timestamp < LOGIN_WINDOW_MS);

  if (timestamps.length >= limit) {
    store.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  store.set(key, timestamps);
  return false;
}

/**
 * Mark a FAILED login attempt.
 * Increments the per-email failed-attempt counter.
 */
export function recordFailedLoginAttempt(email) {
  if (!email) return;
  
  const now = Date.now();
  const key = email.trim().toLowerCase();
  const timestamps = (failedLoginAttemptsByEmail.get(key) || [])
    .filter(t => now - t < LOGIN_WINDOW_MS);
  
  timestamps.push(now);
  failedLoginAttemptsByEmail.set(key, timestamps);
}

/**
 * Clear the failed login counter after a successful login.
 * This prevents legitimate users from being locked out after entering wrong password once.
 */
export function clearFailedLoginAttempts(email) {
  if (!email) return;
  const key = email.trim().toLowerCase();
  failedLoginAttemptsByEmail.delete(key);
  console.log(`[LOGIN RATE LIMITER] Cleared failed attempts counter for ${key} after successful login`);
}

// Periodic cleanup of stale entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [userId, lastTime] of userTimestamps.entries()) {
    if (now - lastTime > CHUNK_INTERVAL_MS * 10) {
      userTimestamps.delete(userId);
    }
  }

  for (const store of [failedLoginAttemptsByEmail, loginAttemptsByIp, registrationAttemptsByIp]) {
    for (const [key, timestamps] of store.entries()) {
      const recentTimestamps = timestamps.filter(timestamp => now - timestamp < LOGIN_WINDOW_MS);
      if (recentTimestamps.length === 0) {
        store.delete(key);
      } else {
        store.set(key, recentTimestamps);
      }
    }
  }
}, CLEANUP_INTERVAL_MS).unref(); // .unref() so this timer doesn't block process exit

export function loginRateLimiter(req, res, next) {
  const now = Date.now();
  const email = getEmail(req);
  const ip = getClientIp(req);

  // Check per-email failed-login limit
  if (email) {
    const emailKey = email.toLowerCase();
    const failedAttempts = (failedLoginAttemptsByEmail.get(emailKey) || [])
      .filter(t => now - t < LOGIN_WINDOW_MS);
    
    if (failedAttempts.length >= LOGIN_EMAIL_LIMIT) {
      console.log(`[LOGIN RATE LIMITER] Email ${emailKey} hit failed-attempt limit (${failedAttempts.length}/${LOGIN_EMAIL_LIMIT})`);
      return res.status(429).json({
        success: false,
        message: 'Too many failed login attempts. Please try again later.',
        error: 'Rate Limit Exceeded'
      });
    }
  }

  // Check per-IP total login attempt limit (both success and failure)
  // This prevents brute-force from single or botnet IPs
  if (isRateLimited(loginAttemptsByIp, ip, LOGIN_IP_LIMIT, now)) {
    console.log(`[LOGIN RATE LIMITER] IP ${ip} hit total login-attempt limit (${LOGIN_IP_LIMIT}/${LOGIN_IP_LIMIT})`);
    return res.status(429).json({
      success: false,
      message: 'Too many login attempts from this location. Please try again later.',
      error: 'Rate Limit Exceeded'
    });
  }

  next();
}

export function registrationRateLimiter(req, res, next) {
  if (isRateLimited(registrationAttemptsByIp, getClientIp(req), REGISTRATION_IP_LIMIT, Date.now())) {
    return res.status(429).json({
      success: false,
      message: 'Too many registration attempts. Please try again later.',
      error: 'Rate Limit Exceeded'
    });
  }

  next();
}

/**
 * Express middleware that rate-limits monitoring chunk uploads.
 * Requires req.userId to be set by the auth middleware upstream.
 */
export function monitoringRateLimiter(req, res, next) {
  const userId = req.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required for rate limiting.',
      error: 'Unauthorized'
    });
  }

  const now = Date.now();
  const lastRequest = userTimestamps.get(userId);

  if (lastRequest && (now - lastRequest) < CHUNK_INTERVAL_MS) {
    const retryAfterMs = CHUNK_INTERVAL_MS - (now - lastRequest);
    console.log(`[MONITORING RATE LIMITER] User ${userId} rate limited. Retry after ${retryAfterMs}ms`);

    return res.status(429).json({
      success: false,
      message: 'Too many requests. Maximum 1 audio chunk every 3 seconds.',
      retryAfterMs,
      error: 'Rate Limit Exceeded'
    });
  }

  userTimestamps.set(userId, now);
  next();
}

export default loginRateLimiter;
