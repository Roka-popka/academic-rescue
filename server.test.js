const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./server');
const data = require('./data');
const { screenStudent } = require('./academicScreening');

test('API returns screening data and details without creating actions', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const before = JSON.stringify([data.notifications, data.followUps, data.students.map((student) => student.interventionHistory)]);
  try {
    const response = await fetch(`${base}/students`, { headers: { Origin: 'http://localhost:5173' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const students = await response.json();
    assert.equal(students.length, data.students.length);
    for (const student of students) {
      const screening = screenStudent(student.id, 5);
      assert.equal(student.riskScore, screening.riskScore);
      assert.equal(student.projectedFinal, screening.projectedFinal);
      assert.equal(student.status, screening.status);
      assert.deepEqual(student.trajectory, screening.trajectory);
    }
    const detail = await (await fetch(`${base}/students/s1`)).json();
    assert.deepEqual(detail.gradeHistory, [75, 68, 57, 48, 42]);
    assert.equal(detail.attendance, 61);
    assert.equal(detail.missedDeadlines, 2);
    assert.deepEqual(detail.weakTopics, ['JOIN', 'Indexes']);
    assert.equal(detail.followUp, null);
    assert.deepEqual(detail.recommendation, []);
    assert.equal((await fetch(`${base}/students/unknown`)).status, 404);
    const summary = await (await fetch(`${base}/screening`)).json();
    assert.deepEqual(summary, { studentsScanned: 4, normal: 1, watchlist: 1, interventionRequired: 2, deepAnalyses: 2, briefReviews: 1 });
    assert.equal(JSON.stringify([data.notifications, data.followUps, data.students.map((student) => student.interventionHistory)]), before);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
