/**
 * Authentication module implementing native PBKDF2 hashing and JWT token signing.
 * ESModules.
 */

import crypto from 'crypto';

const SECRET_KEY = process.env.JWT_SECRET_KEY || '09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7';
const ALGORITHM = 'sha256';
const ACCESS_TOKEN_EXPIRE_MINUTES = 60;

/**
 * Hashes password using pbkdf2Sync.
 * @param {string} password 
 * @returns {string} salt:hash format
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, ALGORITHM).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verifies plain text password against hash.
 * @param {string} plainPassword 
 * @param {string} hashedPassword salt:hash formatted string
 * @returns {boolean}
 */
export function verifyPassword(plainPassword, hashedPassword) {
  try {
    const [salt, hash] = hashedPassword.split(':');
    const verifyHash = crypto.pbkdf2Sync(plainPassword, salt, 100000, 64, ALGORITHM).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
  } catch (_) {
    return false;
  }
}

/**
 * Signs payload as JWT access token.
 * @param {Object} data 
 * @param {number} [expiresInMinutes] 
 * @returns {string}
 */
export function createAccessToken(data, expiresInMinutes = ACCESS_TOKEN_EXPIRE_MINUTES) {
  const expiry = Math.floor(Date.now() / 1000) + (expiresInMinutes * 60);
  const payload = {
    ...data,
    exp: expiry
  };

  const headerEncoded = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  const tokenInput = `${headerEncoded}.${payloadEncoded}`;
  const signature = crypto.createHmac('sha256', SECRET_KEY).update(tokenInput).digest('base64url');

  return `${tokenInput}.${signature}`;
}

/**
 * Verifies and decodes JWT access token.
 * @param {string} token 
 * @returns {Object|null}
 */
export function decodeAccessToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const tokenInput = `${header}.${payload}`;
    const expectedSignature = crypto.createHmac('sha256', SECRET_KEY).update(tokenInput).digest('base64url');

    if (signature !== expectedSignature) return null;

    const payloadDecoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (payloadDecoded.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }

    return payloadDecoded;
  } catch (_) {
    return null;
  }
}
