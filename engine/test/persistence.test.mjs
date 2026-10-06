import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { MySqlStore } from '../server/persistence.mjs';

const integration = process.env.MYSQL_TEST === '1';

test('MySQL durable identity, idempotency and atomic ground items', { skip: !integration, timeout: 30000 }, async t => {
  const values = Object.fromEntries((await readFile(new URL('../.env', import.meta.url), 'utf8')).split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
    const pos = line.indexOf('=');
    return [line.slice(0, pos), line.slice(pos + 1)];
  }));
  // This test intentionally refuses the user's pre-existing/default MySQL.
  assert.equal(values.MYSQL_HOST, '127.0.0.1');
  assert.equal(values.MYSQL_PORT, '3317');
  assert.equal(values.MYSQL_DATABASE, 'spaceship_engine');
  const options = { host: values.MYSQL_HOST, port: Number(values.MYSQL_PORT), user: values.MYSQL_USER, password: values.MYSQL_PASSWORD, database: values.MYSQL_DATABASE };
  const store = await new MySqlStore(options).init();
  const prefix = `test_${randomBytes(5).toString('hex')}`;
  const playerIds = [];
  const dropIds = [];
  let first, second;
  try {
    await t.test('register/login stores salted scrypt and survives reopening', async () => {
      first = await store.register(`${prefix}_a`, 'test-password-123');
      second = await store.register(`${prefix}_b`, 'test-password-123');
      playerIds.push(first.id, second.id);
      await assert.rejects(store.register(first.username, 'test-password-123'), { code: 'USERNAME_TAKEN' });
      await assert.rejects(store.login(first.username, 'wrong-password'), { code: 'INVALID_CREDENTIALS' });
      await assert.rejects(store.login(`${prefix}_missing`, 'test-password-123'), { code: 'INVALID_CREDENTIALS' });
      const [passwords] = await store.pool.execute('SELECT password_hash FROM players WHERE id IN (?, ?)', playerIds);
      assert.ok(passwords.every(row => row.password_hash.startsWith('scrypt$')));
      assert.notEqual(passwords[0].password_hash, passwords[1].password_hash);
      await store.savePlayer(first.id, { schemaVersion: 1, mapId: 2, x: 5, y: 7, gold: 100, inventory: [{ kind: 'item', itemId: 1, quantity: 2 }] });
      await store.savePlayer(second.id, { schemaVersion: 1, mapId: 2, x: 5, y: 7, gold: 0, inventory: [] });
      const reopened = await new MySqlStore(options).init();
      try {
        const account = await reopened.login(first.username, 'test-password-123');
        assert.equal(account.id, first.id);
        assert.equal(account.state.gold, 100);
        assert.equal(account.state.x, 5);
      } finally { await reopened.close(); }
    });

    await t.test('concurrent duplicate commands commit once; failures roll back', async () => {
      let mutationCount = 0;
      const results = await Promise.all(Array.from({ length: 6 }, () => store.commitPlayer(first.id, 'buy-1', state => {
        mutationCount++;
        assert.ok(state.gold >= 10);
        state.gold -= 10;
        return { paid: 10 };
      })));
      assert.equal(mutationCount, 1);
      assert.equal(results.filter(result => !result.duplicate).length, 1);
      assert.equal((await store.loadPlayer(first.id)).state.gold, 90);
      await assert.rejects(store.commitPlayer(first.id, 'failed-1', state => { state.gold = -999; throw new Error('reject transaction'); }), /reject transaction/);
      assert.equal((await store.loadPlayer(first.id)).state.gold, 90);
      const retry = await store.commitPlayer(first.id, 'failed-1', state => { state.gold += 1; });
      assert.equal(retry.duplicate, false);
      assert.equal(retry.state.gold, 91);
      const reopened = await new MySqlStore(options).init();
      try {
        const duplicate = await reopened.commitPlayer(first.id, 'buy-1', () => { throw new Error('must not run'); });
        assert.equal(duplicate.duplicate, true);
        assert.equal((await reopened.loadPlayer(first.id)).state.gold, 91);
      } finally { await reopened.close(); }
    });

    await t.test('death drops and inventory change atomically, including SQL failure', async () => {
      const dropped = await store.createDrops({ playerId: first.id, requestId: 'death-1', drops: [
        { mapId: 2, x: 5, y: 7, itemId: 1, quantity: 1 },
        { mapId: 2, x: 5, y: 7, kind: 'weapon', itemId: 2, quantity: 1 }
      ], mutator: state => { state.inventory = []; return { dropped: 2 }; } });
      dropIds.push(...dropped.drops.map(drop => drop.id));
      assert.equal(dropped.drops.length, 2);
      assert.deepEqual((await store.loadPlayer(first.id)).state.inventory, []);
      assert.equal((await store.listDrops(2)).filter(drop => dropIds.includes(drop.id)).length, 2);
      await assert.rejects(store.createDrop({ playerId: first.id, requestId: 'failed-drop', drop: dropped.drops[0], mutator: state => { state.gold = 0; } }), { code: 'ER_DUP_ENTRY' });
      assert.equal((await store.loadPlayer(first.id)).state.gold, 91);
      const repeated = await store.createDrops({ playerId: first.id, requestId: 'death-1', drops: [], mutator: () => { throw new Error('must not run twice'); } });
      assert.equal(repeated.duplicate, true);
      assert.deepEqual(repeated.drops, dropped.drops);
      const reopened = await new MySqlStore(options).init();
      try { assert.ok((await reopened.listDrops(2)).some(drop => drop.id === dropIds[0])); }
      finally { await reopened.close(); }
    });

    await t.test('two players contesting a drop receive exactly one item', async () => {
      const addItem = (state, drop) => { state.inventory.push({ kind: drop.kind, itemId: drop.itemId, quantity: drop.quantity }); return { pickedUp: drop.id }; };
      const attempts = await Promise.allSettled([
        store.claimDrop({ playerId: first.id, requestId: 'pickup-a', dropId: dropIds[0], mutator: addItem }),
        store.claimDrop({ playerId: second.id, requestId: 'pickup-b', dropId: dropIds[0], mutator: addItem })
      ]);
      assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(attempts.find(result => result.status === 'rejected').reason.code, 'DROP_NOT_FOUND');
      const winnerIndex = attempts.findIndex(result => result.status === 'fulfilled');
      const winner = winnerIndex === 0 ? first : second;
      const original = attempts[winnerIndex].value;
      const repeated = await store.claimDrop({ playerId: winner.id, requestId: winnerIndex === 0 ? 'pickup-a' : 'pickup-b', dropId: dropIds[0], mutator: () => { throw new Error('must not add again'); } });
      assert.equal(repeated.duplicate, true);
      assert.equal(repeated.drop.id, original.drop.id);
      const inventories = await Promise.all(playerIds.map(id => store.loadPlayer(id)));
      assert.equal(inventories.reduce((sum, player) => sum + player.state.inventory.filter(item => item.kind === 'item' && item.itemId === 1).reduce((total, item) => total + item.quantity, 0), 0), 1);
      assert.ok(!(await store.listDrops(2)).some(drop => drop.id === dropIds[0]));
      await assert.rejects(store.claimDrop({ playerId: second.id, requestId: 'reject-pickup', dropId: dropIds[1], mutator: state => { state.gold = 12345; throw new Error('too far'); } }), /too far/);
      assert.equal((await store.loadPlayer(second.id)).state.gold, 0);
      assert.ok((await store.listDrops(2)).some(drop => drop.id === dropIds[1]));
    });
  } finally {
    for (const id of dropIds) await store.pool.execute('DELETE FROM world_drops WHERE id = ?', [id]);
    for (const id of playerIds) await store.pool.execute('DELETE FROM players WHERE id = ?', [id]);
    await store.close();
  }
});
