// Optional local SQL harness. Uses the test-only PGlite installed under ignored .generated/sql-check.
// No network connections, credentials or production data. Test schema mirrors the columns used by migration 0038.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(resolve('.generated/sql-check/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const checks = [];
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table notifications(id uuid primary key, user_id uuid, version_id uuid, type text check(type in ('ready','failed','cancelled','validation')));
    create unique index notifications_user_version_type_idx on notifications(user_id,version_id,type) where version_id is not null;
    create table brands(id uuid primary key, name text);
    create table pricing_settings(brand_id uuid primary key,grid_fcfa_per_second_standard numeric,grid_fcfa_per_second_premium numeric);
    create table video_versions(id uuid primary key,video_id uuid,status text,brief_json jsonb,updated_at timestamptz);
    create table video_shots(version_id uuid,shot_number integer,duration_seconds integer,status text,raw_path text,
      video_quality_status text,video_quality jsonb,video_quality_retry_count integer default 0,verification_history jsonb default '[]',
      keyframe_status text,end_keyframe_status text,end_keyframe_path text,keyframe_image_ledger_ids uuid[],keyframe_quality_ledger_ids uuid[],video_quality_ledger_ids uuid[],
      revision_request_id text,revision_ledger_id uuid,video_quality_request_id text,video_quality_previous_path text,animation_submit_state text,
      provider_request_id text,provider_poll_failure_count integer,provider_next_poll_at timestamptz,provider_last_poll_error text,error_message text,updated_at timestamptz,
      primary key(version_id,shot_number));
    create table usage_ledger(id uuid primary key,version_id uuid,ai_model_id uuid,status text,kind text,price_fcfa numeric,applied_fcfa_per_second numeric);
  `);
  const notificationMigration = await readFile('supabase/migrations/0036_notifications_actions.sql', 'utf8');
  await db.query("insert into notifications values ($1,$2,$3,'ready')", [id(300), id(301), id(302)]);
  await db.exec(notificationMigration);
  await db.query("insert into notifications(id,user_id,version_id,type) values ($1,$2,$3,'expired')", [id(303), id(301), id(302)]);
  await db.exec(notificationMigration);
  const noticeRows = (await db.query('select type,dedupe_key from notifications order by id')).rows;
  assert.deepEqual(noticeRows, [{ type: 'ready', dedupe_key: 'ready' }, { type: 'expired', dedupe_key: 'expired' }]);
  await db.query("insert into notifications(id,user_id,version_id,type,dedupe_key) values ($1,$2,$3,'ready','ready') on conflict(user_id,version_id,dedupe_key) do nothing", [id(304), id(301), id(302)]);
  assert.equal((await db.query('select count(*)::int as total from notifications')).rows[0].total, 2);
  checks.push('0036 upgrades legacy notifications, keeps expired on rerun, and supports duplicate-safe writes');
  await db.query('insert into brands values ($1,$2),($3,$4)', [id(1), 'RIMCO Motors', id(2), 'Another brand']);
  await db.query('insert into pricing_settings values ($1,460,700),($2,500,810)', [id(1), id(2)]);
  const migration = await readFile('supabase/migrations/0038_human_review_and_pricing.sql', 'utf8');
  await db.exec(migration);
  let rates = (await db.query('select * from pricing_settings order by brand_id')).rows;
  assert.equal(Number(rates[0].grid_fcfa_per_second_pro), 700); assert.equal(Number(rates[0].grid_fcfa_per_second_premium), 950);
  assert.equal(Number(rates[1].grid_fcfa_per_second_pro), 810); assert.equal(Number(rates[1].grid_fcfa_per_second_premium), 810);
  await db.query('update pricing_settings set grid_fcfa_per_second_pro=725 where brand_id=$1', [id(1)]);
  await db.exec(migration);
  rates = (await db.query('select * from pricing_settings order by brand_id')).rows;
  assert.equal(Number(rates[0].grid_fcfa_per_second_pro), 725);
  checks.push('migration executed twice; Pro backfilled before Premium increase; customized Pro preserved');
  const createVideo = async (version, red = false) => {
    await db.query('insert into video_versions values ($1,$2,$3,$4::jsonb,now())', [version, id(200), 'generating', JSON.stringify({ generationTier: 'premium', storyboard: [{ locationPhotoId: 'day', shotType: 'rolling' }, { locationPhotoId: 'golden', shotType: 'hero' }], keyframeApproval: { required: true, approvedAt: new Date().toISOString() }, clipApproval: { required: true, requestedAt: new Date(Date.now() - 50 * 3_600_000).toISOString() } })]);
    for (const n of [1, 2]) await db.query("insert into video_shots(version_id,shot_number,duration_seconds,status,raw_path,video_quality_status,video_quality,keyframe_status) values ($1,$2,5,'ready',$3,$4,$5::jsonb,'ready')", [version, n, `clip-${n}.mp4`, red && n === 1 ? 'awaiting_review' : 'passed', JSON.stringify({ approved: !(red && n === 1), issues: red && n === 1 ? ['blocking: tyre floats'] : [], reason: 'Judge result' })]);
  };
  const call = async (version, action, number = null, expected = null, patch = {}) => (await db.query('select rimco_clip_review($1,$2,$3,$4::jsonb,$5::jsonb) as result', [version, action, number, expected === null ? null : JSON.stringify(expected), JSON.stringify(patch)])).rows[0].result;
  const v = id(10); await createVideo(v);
  assert.equal((await call(v, 'claim')).changed, false);
  await call(v, 'approve', 1); assert.equal((await call(v, 'claim')).changed, false);
  await call(v, 'unapprove', 1); assert.equal((await call(v, 'claim')).changed, false);
  checks.push('no montage before approval, partial approval or after reversible unapproval');
  await call(v, 'disable', 2);
  await assert.rejects(call(v, 'disable', 1), /au moins un/);
  const history = (await db.query('select verification_history from video_shots where version_id=$1 and shot_number=2', [v])).rows[0].verification_history;
  assert.equal(history.at(-2).decision, 'human_disagree'); assert.equal(history.at(-2).disagreement.tier, 'premium'); assert.equal(history.at(-1).disabled, true);
  await call(v, 'enable', 2); assert.equal((await db.query('select rimco_clip_active(verification_history) as active from video_shots where version_id=$1 and shot_number=2', [v])).rows[0].active, true);
  await call(v, 'disable', 2); await call(v, 'approve', 1);
  checks.push('disable/enable recorded, green disagreement frozen, last active clip protected');
  await db.query("insert into usage_ledger values ($1,$2,$3,'charged','generation',19000,950),($4,$2,null,'reserved','keyframe',0,0)", [id(80), v, id(90), id(81)]);
  assert.equal((await call(v, 'release_unused')).changed, true);
  const ledger = (await db.query('select * from usage_ledger order by id')).rows;
  assert.equal(ledger[0].status, 'charged'); assert.equal(Number(ledger[0].price_fcfa), 19000); assert.equal(Number(ledger[0].applied_fcfa_per_second), 950); assert.equal(ledger[1].status, 'released');
  checks.push('48h releases only unused internal reservations; paid clip and fixed customer price unchanged');
  const claims = await Promise.all([call(v, 'claim'), call(v, 'claim')]);
  assert.equal(claims.filter((result) => result.changed).length, 1);
  const version = (await db.query('select * from video_versions where id=$1', [v])).rows[0];
  assert.equal(version.status, 'postprocessing'); assert.equal(Number(version.brief_json.finalDurationSeconds), 7);
  assert.equal((await call(v, 'unapprove', 1)).changed, false);
  await db.query('select rimco_patch_version_brief($1,$2::jsonb)', [v, JSON.stringify({ clipApproval: { required: true, requestedAt: '2026-10-27T00:00:00Z' } })]);
  assert.ok((await db.query('select brief_json from video_versions where id=$1', [v])).rows[0].brief_json.clipApproval.approvedAt);
  checks.push('one montage claim, duration recalculated, decisions and stale board writes refused after claim');
  const full = id(11); await createVideo(full);
  const redo = { stage: 'video', by: 'human', decision: 'human_revise', scope: 'full', at: new Date().toISOString() };
  assert.equal((await call(full, 'revise', 1, [], { keyframe_status: 'revising', status: 'queued', video_quality_status: 'queued', verification_history: [redo], keyframe_image_ledger_ids: [id(99)] })).changed, true);
  const reopened = (await db.query('select brief_json from video_versions where id=$1', [full])).rows[0].brief_json;
  assert.equal(reopened.keyframeApproval.approvedAt, null); assert.deepEqual(reopened.keyframeApproval.shotNumbers, [1]);
  await db.query('select rimco_patch_version_brief($1,$2::jsonb)', [full, JSON.stringify({ processingMetrics: { providerCompletedAt: new Date().toISOString() } })]);
  assert.equal((await db.query('select brief_json from video_versions where id=$1', [full])).rows[0].brief_json.keyframeApproval.approvedAt, null);
  assert.equal((await call(full, 'revise', 1, [], { verification_history: [redo] })).changed, false);
  assert.equal((await call(full, 'release_unused')).changed, false);
  checks.push('full redo reopens only its image, stale redo rejected, metric writes preserve review, in-flight correction not released');
  const red = id(12); await createVideo(red, true); await call(red, 'disable', 1);
  const redHistory = (await db.query('select verification_history from video_shots where version_id=$1 and shot_number=1', [red])).rows[0].verification_history;
  assert.equal(redHistory.some((entry) => entry.decision === 'human_disagree'), false);
  await call(red, 'enable', 1); await call(red, 'approve', 1);
  assert.equal((await db.query('select rimco_clip_approved(verification_history) as approved from video_shots where version_id=$1 and shot_number=1', [red])).rows[0].approved, true);
  const acceptedQuality = (await db.query('select video_quality from video_shots where version_id=$1 and shot_number=1', [red])).rows[0].video_quality;
  assert.equal(acceptedQuality.warning, true);
  assert.ok(acceptedQuality.warningIssues.includes('blocking: tyre floats'));
  assert.ok(acceptedQuality.warningIssues.some((issue) => issue.startsWith('Accepté par décision humaine')));
  checks.push('red disable excluded from disagreements; red acceptance counts as approval');
  const grants = (await db.query("select has_function_privilege('authenticated','rimco_clip_review(uuid,text,integer,jsonb,jsonb)','execute') as public_can_write, has_function_privilege('service_role','rimco_clip_review(uuid,text,integer,jsonb,jsonb)','execute') as server_can_write")).rows[0];
  assert.equal(grants.public_can_write, false); assert.equal(grants.server_can_write, true);
  checks.push('mutations executable by service_role only');
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally { await db.close(); }
