import mysql from 'mysql2/promise';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

const scrypt = promisify(scryptCallback);
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
const clone = value => JSON.parse(JSON.stringify(value));
const failure = (code, message) => Object.assign(new Error(message), { code });

function stateValue(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw failure('INVALID_STATE', 'Player state must be an object.');
  const result = clone(state);
  result.schemaVersion ??= 1;
  if (!Number.isInteger(result.schemaVersion) || result.schemaVersion < 1) throw failure('INVALID_STATE', 'Invalid state schema version.');
  return result;
}

function requestKey(requestId) {
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(requestId)) throw failure('INVALID_REQUEST_ID', 'A unique request ID is required.');
  return requestId;
}

function credentials(username, password) {
  if (typeof username !== 'string' || !/^[\p{L}\p{N}_-]{3,32}$/u.test(username)) throw failure('INVALID_USERNAME', 'Use 3–32 letters, numbers, underscores or hyphens.');
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 256) throw failure('INVALID_PASSWORD', 'Use a password of at least 8 characters and at most 256 bytes.');
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT_OPTIONS);
  return `scrypt$16384$8$1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function verifyPassword(password, encoded) {
  const [algorithm, n, r, p, salt, key] = encoded.split('$');
  if (algorithm !== 'scrypt' || n !== '16384' || r !== '8' || p !== '1' || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{128}$/.test(key ?? '')) return false;
  const expected = Buffer.from(key, 'hex');
  const actual = await scrypt(password, Buffer.from(salt, 'hex'), expected.length, SCRYPT_OPTIONS);
  return timingSafeEqual(actual, expected);
}

function playerRow(row) {
  return row ? { id: Number(row.id), username: row.username, state: stateValue(decode(row.state)) } : null;
}

function dropRow(row) {
  return { id: row.id, mapId: row.map_id, x: row.x, y: row.y, kind: row.kind, itemId: row.item_id, quantity: row.quantity, metadata: decode(row.metadata) };
}

function dropValue(value) {
  const drop = { ...value, id: value.id ?? randomUUID(), kind: value.kind ?? 'item', metadata: value.metadata ?? {} };
  if (!/^[0-9a-f-]{36}$/i.test(drop.id) || !['item', 'weapon', 'armor'].includes(drop.kind)) throw failure('INVALID_DROP', 'Invalid drop identity or kind.');
  for (const name of ['mapId', 'itemId', 'quantity']) {
    if (!Number.isSafeInteger(drop[name]) || drop[name] <= 0 || drop[name] > 2147483647) throw failure('INVALID_DROP', `Invalid drop ${name}.`);
  }
  if (![drop.x, drop.y].every(v => Number.isSafeInteger(v) && v >= 0 && v <= 2147483647)) throw failure('INVALID_DROP', 'Invalid drop coordinates.');
  return clone(drop);
}

/** One dedicated database; all economy changes lock the owning player first.
 * Mutators receive an isolated state object, mutate it in place, and return a
 * JSON result. They must not perform external side effects: errors roll back SQL.
 */
export class MySqlStore {
  constructor({ host = '127.0.0.1', port = 3317, user, password, database = 'spaceship_engine' } = {}) {
    if (!/^[A-Za-z0-9_]{1,64}$/.test(database)) throw failure('INVALID_DATABASE', 'Invalid database name.');
    this.database = database;
    this.options = { host, port: Number(port), user, password, charset: 'utf8mb4', supportBigNumbers: true, bigNumberStrings: true, connectionLimit: 8, connectTimeout: 10000 };
    this.pool = null;
  }

  async init() {
    if (this.pool) return this;
    const connection = await mysql.createConnection(this.options);
    try {
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${this.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_cs`);
      await connection.query(`USE \`${this.database}\``);
      const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
      for (const statement of schema.split(';').map(part => part.trim()).filter(Boolean)) await connection.query(statement);
    } finally {
      await connection.end();
    }
    this.pool = mysql.createPool({ ...this.options, database: this.database });
    return this;
  }

  async register(username, password) {
    credentials(username, password);
    const passwordHash = await hashPassword(password);
    const state = { schemaVersion: 1 };
    try {
      const [result] = await this.pool.execute('INSERT INTO players (username, password_hash, state) VALUES (?, ?, ?)', [username, passwordHash, JSON.stringify(state)]);
      return { id: Number(result.insertId), username, state };
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') throw failure('USERNAME_TAKEN', 'That username is already registered.');
      throw error;
    }
  }

  async login(username, password) {
    credentials(username, password);
    const [rows] = await this.pool.execute('SELECT id, username, password_hash, state FROM players WHERE username = ?', [username]);
    // A dummy scrypt keeps missing-account and wrong-password work comparable.
    const encoded = rows[0]?.password_hash ?? `scrypt$16384$8$1$${'00'.repeat(16)}$${'00'.repeat(64)}`;
    const valid = await verifyPassword(password, encoded);
    if (!rows[0] || !valid) throw failure('INVALID_CREDENTIALS', 'Incorrect username or password.');
    return playerRow(rows[0]);
  }

  async loadPlayer(id) {
    const [rows] = await this.pool.execute('SELECT id, username, state FROM players WHERE id = ?', [id]);
    return playerRow(rows[0]);
  }

  async savePlayer(id, state) {
    const next = stateValue(state);
    const [result] = await this.pool.execute('UPDATE players SET state = ?, revision = revision + 1 WHERE id = ?', [JSON.stringify(next), id]);
    if (!result.affectedRows) throw failure('PLAYER_NOT_FOUND', 'Player does not exist.');
    return next;
  }

  async transaction(playerId, requestId, operation, action) {
    requestKey(requestId);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [players] = await connection.execute('SELECT state FROM players WHERE id = ? FOR UPDATE', [playerId]);
      if (!players[0]) throw failure('PLAYER_NOT_FOUND', 'Player does not exist.');
      const [requests] = await connection.execute('SELECT operation, response FROM player_requests WHERE player_id = ? AND request_id = ?', [playerId, requestId]);
      if (requests[0]) {
        if (requests[0].operation !== operation) throw failure('REQUEST_CONFLICT', 'Request ID was already used for another operation.');
        await connection.commit();
        return { ...decode(requests[0].response), duplicate: true };
      }
      const state = stateValue(decode(players[0].state));
      const response = await action(connection, state);
      const payload = { ...response, state: stateValue(state), duplicate: false };
      await connection.execute('UPDATE players SET state = ?, revision = revision + 1 WHERE id = ?', [JSON.stringify(payload.state), playerId]);
      await connection.execute('INSERT INTO player_requests (player_id, request_id, operation, response) VALUES (?, ?, ?, ?)', [playerId, requestId, operation, JSON.stringify(payload)]);
      await connection.commit();
      return payload;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async commitPlayer(playerId, requestId, mutator) {
    return this.transaction(playerId, requestId, 'player', async (_connection, state) => ({ result: (await mutator(state)) ?? null }));
  }

  async createDrops({ playerId, requestId, drops, mutator }) {
    if (!Array.isArray(drops) || drops.length > 200) throw failure('INVALID_DROP', 'Expected at most 200 drops.');
    const values = drops.map(dropValue);
    return this.transaction(playerId, requestId, 'create-drops', async (connection, state) => {
      const result = (await mutator(state, values)) ?? null;
      for (const drop of values) {
        await connection.execute('INSERT INTO world_drops (id, map_id, x, y, kind, item_id, quantity, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [drop.id, drop.mapId, drop.x, drop.y, drop.kind, drop.itemId, drop.quantity, JSON.stringify(drop.metadata)]);
      }
      return { result, drops: values };
    });
  }

  async createDrop({ drop, ...options }) {
    const response = await this.createDrops({ ...options, drops: [drop] });
    return { ...response, drop: response.drops[0] };
  }

  async listDrops(mapId) {
    const [rows] = await this.pool.execute('SELECT * FROM world_drops WHERE map_id = ? ORDER BY created_at, id', [mapId]);
    return rows.map(dropRow);
  }

  async claimDrop({ playerId, requestId, dropId, mutator }) {
    return this.transaction(playerId, requestId, 'claim-drop', async (connection, state) => {
      const [rows] = await connection.execute('SELECT * FROM world_drops WHERE id = ? FOR UPDATE', [dropId]);
      if (!rows[0]) throw failure('DROP_NOT_FOUND', 'This item was already picked up or no longer exists.');
      const drop = dropRow(rows[0]);
      const result = (await mutator(state, drop)) ?? null;
      await connection.execute('DELETE FROM world_drops WHERE id = ?', [dropId]);
      return { result, drop };
    });
  }

  async close() {
    if (this.pool) await this.pool.end();
    this.pool = null;
  }
}
