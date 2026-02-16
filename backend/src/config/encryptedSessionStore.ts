import crypto from 'crypto';
import session from 'express-session';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(text: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: base64(iv + authTag + ciphertext)
  const payload = Buffer.concat([iv, authTag, encrypted]);
  return payload.toString('base64');
}

function decrypt(data: string, key: Buffer): string {
  const payload = Buffer.from(data, 'base64');

  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Обёртка над session.Store, которая прозрачно шифрует/дешифрует
 * данные сессии перед записью/после чтения из MySQL.
 *
 * Формат хранения: поле data содержит JSON вида
 *   { "__enc": "<base64-зашифрованные данные>", "cookie": {...} }
 *
 * При чтении: если в сессии есть __enc — расшифровать и вернуть оригинал.
 * Старые незашифрованные сессии возвращаются как есть (обратная совместимость).
 */
export class EncryptedSessionStore extends session.Store {
  private inner: session.Store;
  private key: Buffer;

  constructor(innerStore: session.Store, encryptionKey: string) {
    super();
    this.inner = innerStore;
    this.key = deriveKey(encryptionKey);
  }

  get(
    sid: string,
    callback: (err?: any, session?: session.SessionData | null) => void,
  ): void {
    this.inner.get(sid, (err, sess) => {
      if (err) return callback(err);
      if (!sess) return callback(null, null);

      try {
        const raw = sess as any;
        if (raw.__enc) {
          const decrypted = decrypt(raw.__enc, this.key);
          const original: session.SessionData = JSON.parse(decrypted);
          return callback(null, original);
        }
        // Незашифрованная сессия — вернуть как есть (миграция)
        return callback(null, sess);
      } catch (e) {
        return callback(e);
      }
    });
  }

  set(
    sid: string,
    sess: session.SessionData,
    callback?: (err?: any) => void,
  ): void {
    try {
      const serialized = JSON.stringify(sess);
      const encrypted = encrypt(serialized, this.key);

      // cookie нужен inner-store для расчёта expires
      const wrapped = { __enc: encrypted, cookie: sess.cookie } as any;
      this.inner.set(sid, wrapped, callback);
    } catch (e) {
      if (callback) callback(e);
    }
  }

  destroy(sid: string, callback?: (err?: any) => void): void {
    this.inner.destroy(sid, callback);
  }

  touch(
    sid: string,
    sess: session.SessionData,
    callback?: () => void,
  ): void {
    if (this.inner.touch) {
      this.inner.touch(sid, sess, callback);
    } else if (callback) {
      callback();
    }
  }
}
