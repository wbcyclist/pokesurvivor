const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function boot() {
  let distances = 0;
  const events = [];
  const G = {
    U: { dist2(x, y, a, b) { distances++; return (x - a) ** 2 + (y - b) ** 2; }, rand: (a, b) => (a + b) / 2,
      norm: (x, y) => { const n = Math.hypot(x, y) || 1; return [x / n, y / n]; }, damp: (v, target) => target },
    Coop: { active: false, isHost: false, pickupAdded: p => events.push(['add', { ...p }]), pickupGone: id => events.push(['gone', id]) },
    Camera: { sees: () => true }
  };
  const context = vm.createContext({ G });
  for (const file of ['enemy', 'pickup', 'projectile']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/entities/' + file + '.js'), 'utf8'), context);
  return { G, events, get distances() { return distances; }, enemy(id, x, y, r = 8) { return G.EnemyMgr.add({ id, x, y, r, dead: false, cy() { return this.y; } }); } };
}

test('spatial queries return each enemy once across signed and distant grid cells', () => {
  const app = boot(), mgr = app.G.EnemyMgr;
  const points = [[60, 60], [-60, -60], [0, 0], [1000000, -1000000]];
  points.forEach(([x, y], i) => app.enemy(i, x, y));
  mgr.rebuildGrid();
  for (const [x, y, r] of [[0, 0, 100], [52, 52, 10], [1000000, -1000000, 60]]) {
    const expected = Array.from(mgr.all()).filter(e => Math.hypot(e.x - x, e.y - y) <= r + e.r).map(e => e.id).sort();
    assert.deepEqual(Array.from(mgr.queryCircle(x, y, r), e => e.id).sort(), expected);
  }
});

test('clearing a run releases stashed enemies without breaking normal rift return', () => {
  const app = boot(), mgr = app.G.EnemyMgr;
  app.enemy(1, 0, 0); mgr.stash(); app.enemy(2, 0, 0); mgr.restore();
  assert.deepEqual(Array.from(mgr.all(), e => e.id), [1]);
  mgr.stash(); mgr.clear(); mgr.restore(); mgr.rebuildGrid();
  assert.equal(mgr.count, 0); assert.equal(mgr.get(1), undefined); assert.equal(mgr.queryCircle(0, 0, 100).length, 0);
});

test('pickup limits preserve a lone XP orb and conserve XP during repeated merges', () => {
  const { G } = boot();
  for (let i = 0; i < 420; i++) G.Pickups.drop('coin', 0, 0, 1);
  for (let i = 0; i < 50; i++) G.Pickups.drop('xp', 0, 0, 10);
  assert.equal(G.Pickups.count, 420);
  assert.equal(G.Pickups.all().filter(p => p.kind.startsWith('xp')).reduce((n, p) => n + p.value, 0), 500);
});

test('co-op replicas receive merged XP values and repeated updates are idempotent', () => {
  const host = boot(), peer = boot(); host.G.Coop.isHost = true;
  for (let i = 0; i < 425; i++) host.G.Pickups.drop('xp', 0, 0, 3);
  for (const [kind, data] of host.events) {
    if (kind === 'gone') peer.G.Pickups.removeId(data);
    else for (let i = 0; i < 2; i++) peer.G.Pickups.addRemote(data.id, data.kind, data.x, data.y, data.value);
  }
  const values = app => Array.from(app.G.Pickups.all(), p => [p.id, p.kind, p.value]);
  assert.deepEqual(values(peer), values(host));
});

test('homing uses nearby enemies and avoids scanning the world every frame', () => {
  const app = boot(), { G } = app;
  for (let i = 0; i < 800; i++) app.enemy(i, 1000 + i, 1000);
  app.enemy(1001, 50, 50); G.EnemyMgr.rebuildGrid();
  for (let i = 0; i < 200; i++) G.Projectiles.spawn({ homing: 2, vx: 100 });
  for (let i = 0; i < 6; i++) G.Projectiles.update(1 / 60, {}, G.EnemyMgr.all());
  assert.ok(G.Projectiles.all().every(p => p.vy > 0));
  assert.ok(app.distances < 5000, 'six frames must not perform a full-world search per projectile');
});

test('homing replaces dead or removed targets and reacquires after an empty search', () => {
  const app = boot(), { G } = app;
  const first = app.enemy(1, 50, 50); G.EnemyMgr.rebuildGrid();
  const p = G.Projectiles.spawn({ homing: 2, vx: 100 });
  G.Projectiles.update(1 / 60, {}, G.EnemyMgr.all()); assert.ok(p.vy > 0);
  first.dead = true; app.enemy(2, 40, -50); G.EnemyMgr.rebuildGrid();
  G.Projectiles.update(1 / 60, {}, G.EnemyMgr.all()); assert.ok(p.vy < 0);
  G.EnemyMgr.clear(); G.Projectiles.update(1 / 60, {}, []);
  app.enemy(3, 50, 50); G.EnemyMgr.rebuildGrid();
  for (let i = 0; i < 10; i++) G.Projectiles.update(1 / 60, {}, G.EnemyMgr.all());
  assert.ok(p.vy > 0);
});
