const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./server');
const data = require('./data');
let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/students`;
});
after(async () => { await new Promise((resolve) => server.close(resolve)); });
beforeEach(() => {
  data.notifications.length = 0;
  data.followUps.length = 0;
  data.students.forEach((student) => { student.interventionHistory.length = 0; });
});
async function post(id, action, body = {}) {
  return fetch(`${base}/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('intervention requires approval, stores plan and notification, and persists action state', async () => {
  assert.equal((await post('s1', 'send-intervention')).status, 400);
  assert.equal((await post('s1', 'approve-plan')).status, 200);
  assert.equal((await post('s1', 'approve-plan')).status, 200);
  assert.equal(data.students[0].interventionHistory.length, 1);
  assert.equal((await post('s1', 'send-intervention')).status, 200);
  const actions = await (await fetch(`${base}/s1/actions`)).json();
  assert.equal(actions.approvedPlans.length, 1);
  assert.ok(actions.approvedPlans[0].approvedAt);
  assert.equal(actions.notifications.length, 1);
  assert.equal(actions.notifications[0].kind, 'INTERVENTION');
  assert.equal(actions.notifications[0].simulated, true);
  assert.equal((await post('s1', 'send-intervention')).status, 429);
});

test('WATCHLIST allows only soft warnings and respects shared cooldown', async () => {
  assert.equal((await post('s3', 'approve-plan')).status, 400);
  assert.equal((await post('s3', 'send-intervention')).status, 400);
  assert.equal((await post('s3', 'send-warning')).status, 200);
  assert.equal(data.students[2].interventionHistory.length, 0);
  assert.equal((await post('s3', 'send-warning')).status, 429);
  const actions = await (await fetch(`${base}/s3/actions`)).json();
  assert.equal(actions.warnings.length, 1);
  assert.doesNotMatch(actions.warnings[0].message, /преподавател|план помощи/);
  data.notifications[0].sentAt = new Date(Date.now() - 8 * 86400000).toISOString();
  assert.equal((await post('s3', 'send-warning')).status, 200);
});

test('NORMAL and invalid status/action combinations are rejected without side effects', async () => {
  for (const action of ['approve-plan', 'send-intervention', 'send-warning', 'follow-up']) {
    assert.equal((await post('s2', action)).status, 400);
  }
  assert.equal((await post('s1', 'send-warning')).status, 400);
  assert.equal((await post('missing', 'approve-plan')).status, 404);
  assert.equal(data.notifications.length, 0);
  assert.equal(data.followUps.length, 0);
});

test('follow-up validates days and reuses existing local records', async () => {
  assert.equal((await post('s3', 'follow-up')).status, 200);
  assert.equal(data.followUps[0].days, 7);
  assert.equal((await post('s3', 'follow-up', { days: 7 })).status, 200);
  assert.equal(data.followUps.length, 1);
  for (const days of [0, -1, 1.5, '7', null, 366, 3]) {
    assert.equal((await post('s3', 'follow-up', { days })).status, 400);
  }
  assert.equal((await post('s1', 'follow-up', { days: 3 })).status, 200);
  assert.equal(data.followUps.length, 2);
  assert.ok(data.followUps[1].createdAt);
  assert.equal((await post('s1', 'approve-plan', { status: 'approved' })).status, 400);
  assert.equal((await fetch(`${base}/s1/follow-up`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
});
