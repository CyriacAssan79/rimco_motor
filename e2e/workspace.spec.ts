import { expect, test, type Page } from '@playwright/test';

test('reprend uniquement le montage après un échec, sans régénérer les clips', async ({ page }) => {
  test.setTimeout(120_000);
  if (process.env.E2E_MOCK_NO_SUPABASE !== '1') {
    const password = process.env.E2E_ADMIN_PASSWORD;
    if (!password) throw new Error('Le mot de passe du compte E2E local est absent.');
    await page.goto('/connexion');
    await page.getByLabel('Adresse e-mail').fill(process.env.E2E_ADMIN_EMAIL ?? 'admin@rimco.test');
    await page.getByLabel('Mot de passe').fill(password);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/$/);
  }
  const id = '60000000-0000-4000-8000-000000000001';
  let ready = false; let retries = 0; let generations = 0;
  let finishMontage!: () => void;
  const pending = new Promise<void>((resolve) => { finishMontage = resolve; });
  const version = () => ({ id, videoId: '60000000-0000-4000-8000-000000000002', title: 'Pro à récupérer', status: ready ? 'ready' : 'failed', versionStatus: ready ? 'ready' : 'failed',
    errorMessage: ready ? null : 'Montage impossible : La vidéo finale doit ajouter exactement deux secondes au logo.', createdAt: new Date().toISOString(),
    durationSeconds: 6, billing: { chargedFcfa: 0, pending: false },
    settings: { title: 'Pro à récupérer', description: 'Un SUV', vehicleDossierId: 'vehicle', vehiclePhotoIds: [], placeIds: [], castAssetIds: [], tier: 'pro', durationS: 10, format: '16:9', scenePresetId: '', audioAssetId: null },
    ...(ready ? { videoUrl: '/mock/mock-video.mp4' } : {}) });
  await page.route((url) => url.pathname === '/api/versions', (route) => {
    if (route.request().method() === 'POST') { generations += 1; return route.fulfill({ status: 500, json: { error: 'Aucune nouvelle génération attendue.' } }); }
    return route.fulfill({ json: { versions: new URL(route.request().url()).searchParams.has('status') ? [] : [version()] } });
  });
  await page.route(`**/api/versions/${id}/refresh`, (route) => route.fulfill({ json: version() }));
  await page.route(`**/api/versions/${id}/montage/retry`, async (route) => {
    retries += 1; await pending; ready = true;
    await route.fulfill({ json: { ...version(), generationResubmitted: false } });
  });
  await page.goto('/');
  const retry = page.getByRole('button', { name: 'Relancer uniquement le montage', exact: true });
  await expect(retry).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('button', { name: 'Relancer avec les mêmes réglages', exact: true })).toHaveCount(0);
  await retry.click();
  await expect(page.getByRole('button', { name: 'Montage en cours…', exact: true })).toBeDisabled();
  finishMontage();
  await expect(page.getByText('Votre vidéo est prête.', { exact: true })).toBeVisible();
  expect(retries).toBe(1); expect(generations).toBe(0);
});

test('images clés puis clips, désactivation et montage en simulation', async ({ page }) => {
  test.setTimeout(120_000);
  if (process.env.E2E_MOCK_NO_SUPABASE !== '1') {
    const password = process.env.E2E_ADMIN_PASSWORD;
    if (!password) throw new Error('Le mot de passe du compte E2E local est absent.');
    await page.goto('/connexion');
    await page.getByLabel('Adresse e-mail').fill(process.env.E2E_ADMIN_EMAIL ?? 'admin@rimco.test');
    await page.getByLabel('Mot de passe').fill(password);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL('/');
  }
  const id = 'e2e-human-review';
  const version = { id, videoId: 'e2e-human-film', title: 'Film E2E avec validation', status: 'generating', versionStatus: 'generating', createdAt: new Date().toISOString() };
  let phase: 'keyframes' | 'clips' | 'editing' = 'keyframes';
  let montageStarts = 0;
  const clips = [1, 2].map((number) => ({ shotNumber: number, title: `Plan ${number}`, action: 'Voiture qui roule · vers la caméra · 5 s', url: '/mock/mock-video.mp4', stage: 'video', issues: [], colour: 'green', active: true, approved: false, canRevise: true, canRetry: false, revisionsLeft: 1, clipOptions: { clip: { fcfa: 600, minutes: 4 }, full: { fcfa: 800, minutes: 5 } } }));
  await page.route((url) => url.pathname === '/api/versions', (route) => route.fulfill({ json: { versions: [version] } }));
  await page.route(`**/api/versions/${id}/refresh`, (route) => {
    const keyframeApproval = { requestedAt: new Date().toISOString(), remindAt: new Date(Date.now() + 86_400_000).toISOString(), expiresAt: new Date(Date.now() + 172_800_000).toISOString(), shots: [1, 2].map((number) => ({ shotNumber: number, title: `Plan ${number}`, action: 'Voiture qui roule · 5 s', url: null, state: 'to_approve', canRevise: true, revisionsLeft: 1 })) };
    return route.fulfill({ json: { id, status: phase === 'editing' ? 'postprocessing' : 'generating', processingStage: phase === 'keyframes' ? 'keyframe_approval' : phase === 'clips' ? 'clip_approval' : 'postprocessing', nextPollInSeconds: 120,
      ...(phase === 'keyframes' ? { keyframeApproval } : phase === 'clips' ? { clipApproval: { requestedAt: new Date().toISOString(), durationSeconds: clips.filter((clip) => clip.active).length * 5 + 2, shots: clips } } : {}) } });
  });
  await page.route(`**/api/versions/${id}/keyframes/approve`, (route) => { phase = 'clips'; return route.fulfill({ json: { approved: 2, allApproved: true } }); });
  await page.route(`**/api/versions/${id}/clips/review`, (route) => {
    const input = route.request().postDataJSON();
    if (input.action === 'disable') clips.find((clip) => clip.shotNumber === input.shotNumber)!.active = false;
    if (input.action === 'approve' && !input.shotNumber) { phase = 'editing'; montageStarts += 1; }
    return route.fulfill({ json: { changed: true } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '2 images clés à valider' })).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Tout valider et lancer la vidéo' }).click();
  const board = page.getByRole('region', { name: 'Validation des clips' });
  await expect(board.getByRole('heading', { name: '2 clips à valider' })).toBeVisible({ timeout: 30_000 });
  await expect(board.getByLabel('Clip du plan 1')).toHaveJSProperty('muted', true);
  await board.getByRole('button', { name: 'Désactiver ce clip', exact: true }).last().click();
  await expect(board.getByText(/Durée finale : 7 s/)).toBeVisible({ timeout: 30_000 });
  await expect(board.getByRole('button', { name: 'Désactiver ce clip', exact: true })).toBeDisabled();
  expect(montageStarts).toBe(0);
  await board.getByRole('button', { name: 'Tout valider et lancer le montage' }).click();
  await expect(board).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: /1 vidéo en cours · Montage/ })).toBeVisible();
  expect(montageStarts).toBe(1);
});

const mockWithoutSupabase = process.env.E2E_MOCK_NO_SUPABASE === '1';
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@rimco.test';
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

/** API answers injected: a version of the user is already running when the Studio opens. */
async function expectStudioRestoresActiveVersion(page: Page) {
  const running = { id: 'e2e-running', videoId: 'e2e-video', title: 'Vidéo E2E en cours', status: 'generating', versionStatus: 'generating', processingStage: 'keyframing', stageElapsedSeconds: 40, durationSeconds: 5, createdAt: new Date(Date.now() - 120_000).toISOString() };
  const refreshCalls: string[] = [];
  await page.route((url) => url.pathname === '/api/versions', (route) => {
    const request = route.request();
    if (request.method() !== 'GET' || new URL(request.url()).searchParams.get('status')) return route.continue();
    return route.fulfill({ json: { versions: [running] } });
  });
  await page.route('**/api/versions/e2e-running/refresh', (route) => {
    refreshCalls.push(route.request().url());
    return route.fulfill({ json: { id: 'e2e-running', status: 'generating', processingStage: 'keyframing', stageElapsedSeconds: 45, nextPollInSeconds: 30 } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'État de la vidéo · Vidéo E2E en cours' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/gardez un onglet ouvert/)).toBeVisible();
  const indicator = page.getByRole('link', { name: /1 vidéo en cours · Images clés/ });
  await expect(indicator).toBeVisible();
  await expect.poll(() => refreshCalls.length, { timeout: 15_000 }).toBe(1);
  // The Studio and then the queue: one follow-up for the whole application, no second /refresh within the interval.
  await indicator.click();
  await expect(page).toHaveURL(/\/file-generation$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Vidéo E2E en cours' })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(5_000);
  expect(refreshCalls).toHaveLength(1);
}

/** API answers injected: an unread « action requise » appears on any page, with the tab title. */
async function expectActionRequiredBanner(page: Page) {
  const actionRequired = { id: 'e2e-action', type: 'action_required', version_id: 'e2e-version', message: '« Vidéo E2E » · Plan 2 · décision requise : l’image clé a été refusée par le contrôle automatique.', read_at: null, created_at: new Date().toISOString() };
  let marked: unknown = null;
  await page.route('**/api/notifications', (route) => {
    if (route.request().method() === 'PATCH') { marked = route.request().postDataJSON(); return route.fulfill({ json: { ok: true } }); }
    return route.fulfill({ json: { notifications: [actionRequired], unread: 1 } });
  });
  await page.goto('/bibliotheque');
  await expect(page.getByRole('status').filter({ hasText: 'Action requise' })).toContainText('Plan 2 · décision requise');
  await expect(page).toHaveTitle('(1) Action requise · RIMCO Studio');
  const link = page.getByRole('link', { name: 'Voir le plan' });
  await expect(link).toHaveAttribute('href', '/file-generation?version=e2e-version#decision-e2e-version');
  await link.click();
  await expect(page).toHaveURL(/\/file-generation\?version=e2e-version#decision-e2e-version$/);
  await expect.poll(() => marked).toEqual({ ids: ['e2e-action'] });
}

/** A video of the user, finished a few minutes ago (API answers injected); `null` userId = the signed-in user. */
function finishedVersion(status: 'ready' | 'failed') {
  return {
    id: `e2e-${status}`, videoId: `e2e-video-${status}`, title: `Vidéo E2E ${status}`, status, versionStatus: status, durationSeconds: 7, tier: 'standard', format: '16:9',
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(), validationStatus: null,
    errorMessage: status === 'failed' ? 'Content policy violation: the request was flagged by the safety filter (fal error 422).' : null,
    billing: { chargedFcfa: 0, pending: false },
    settings: { title: 'Vidéo E2E', description: 'Une Haval H6 roule sur le pont HKB.', vehicleDossierId: 'e2e-unknown-dossier', vehiclePhotoIds: [], placeIds: [], castAssetIds: [], tier: 'standard', durationS: 5, format: '16:9', scenePresetId: '', audioAssetId: null },
  };
}

async function routeFinishedVersion(page: Page, status: 'ready' | 'failed') {
  const version = finishedVersion(status);
  await page.route((url) => url.pathname === '/api/versions', (route) => {
    const request = route.request();
    if (request.method() !== 'GET' || new URL(request.url()).searchParams.get('status')) return route.continue();
    return route.fulfill({ json: { versions: [version] } });
  });
  await page.route(`**/api/versions/${version.id}/refresh`, (route) => route.fulfill({ json: status === 'ready'
    ? { id: version.id, status: 'ready', videoUrl: '/mock/mock-video.mp4', qualityWarnings: [] }
    : { id: version.id, status: 'failed', error: version.errorMessage, billing: version.billing } }));
  return version;
}

/** Ready video: player, send to the validator, direct link to the library, download reminder. */
async function expectReadyVideoActions(page: Page) {
  const version = await routeFinishedVersion(page, 'ready');
  let submitted: unknown = null;
  await page.route('**/api/validations', (route) => { submitted = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { id: 'e2e-validation', status: 'pending' } }); });
  await page.goto('/');
  await expect(page.getByText('Votre vidéo est prête.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Vidéo finale')).toHaveAttribute('src', '/mock/mock-video.mp4');
  await expect(page.getByText('Durée 7 s · Niveau Standard · Format 16:9')).toBeVisible();
  await expect(page.getByText('Le téléchargement est possible après l’approbation du valideur.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ouvrir dans la Bibliothèque' })).toHaveAttribute('href', `/bibliotheque?video=${version.videoId}`);
  await page.getByRole('button', { name: 'Envoyer au valideur' }).click();
  await expect(page.getByText('Envoyée au valideur : en attente de sa décision.')).toBeVisible();
  expect(submitted).toEqual({ versionId: version.id });
}

/** Failed video: the cause in French, nothing billed, relaunch with the same settings. */
async function expectFailedVideoMessage(page: Page) {
  await routeFinishedVersion(page, 'failed');
  await page.goto('/');
  const failure = page.getByRole('alert').filter({ hasText: 'La vidéo n’a pas pu être produite.' });
  await expect(failure).toBeVisible({ timeout: 30_000 });
  await expect(failure).toContainText('Le fournisseur a refusé le contenu demandé (filtre de sécurité).');
  await expect(failure).toContainText('Rien ne vous est facturé pour cette vidéo : le montant réservé a été libéré.');
  await expect(failure.getByRole('button', { name: 'Relancer avec les mêmes réglages' })).toBeVisible();
  await expect(failure).not.toContainText('Content policy violation', { useInnerText: true });
}

/** « /bibliotheque?video=<id> » opens and highlights the video. */
async function expectLibraryDirectLink(page: Page) {
  const version = finishedVersion('ready');
  await page.route((url) => url.pathname === '/api/versions', (route) => route.request().method() === 'GET' && !new URL(route.request().url()).searchParams.get('status')
    ? route.fulfill({ json: { versions: [{ ...version, title: 'Autre vidéo', id: 'other', videoId: 'other-video' }, { ...version, previewUrl: '/mock/mock-video.mp4' }] } })
    : route.continue());
  await page.goto(`/bibliotheque?video=${version.videoId}`);
  await expect(page.locator(`#video-card-${version.videoId}`)).toHaveAttribute('aria-current', 'true', { timeout: 30_000 });
  await expect(page.getByRole('complementary', { name: 'Détails de la vidéo sélectionnée' })).toContainText(version.title);
}

/** À valider: the refusal asks for a reason in a window (no browser prompt) and confirms the decision. */
async function expectRefusalWindow(page: Page) {
  let decision: unknown = null;
  await page.route((url) => url.pathname === '/api/versions', (route) => new URL(route.request().url()).searchParams.get('status') === 'review'
    ? route.fulfill({ json: { versions: decision ? [] : [{ id: 'e2e-review', validationId: 'e2e-validation', title: 'Vidéo E2E à valider', status: 'review', tier: 'standard', durationSeconds: 5, previewUrl: null, createdAt: new Date().toISOString() }] } })
    : route.continue());
  await page.route('**/api/validations/e2e-validation', (route) => { decision = route.request().postDataJSON(); return route.fulfill({ json: { id: 'e2e-validation', status: 'rejected' } }); });
  await page.goto('/a-valider');
  await page.getByRole('button', { name: 'Refuser' }).click();
  const dialog = page.getByRole('dialog', { name: /Refuser « Vidéo E2E à valider »/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirmer le refus' })).toBeDisabled();
  await dialog.getByLabel('Motif du refus (obligatoire)').fill('Logo déformé au plan 3.');
  await dialog.getByRole('button', { name: 'Confirmer le refus' }).click();
  await expect(page.getByRole('status').filter({ hasText: '« Vidéo E2E à valider » est refusée' })).toBeVisible();
  expect(decision).toEqual({ status: 'rejected', reason: 'Logo déformé au plan 3.' });
}

/** Studio: while the adapted brief waits for a choice, the big button is off and the banner is the only way on. */
async function expectConflictBlocksMainButton(page: Page) {
  await page.route('**/api/storyboard/suggest', (route) => route.fulfill({ json: { storyboard: [{ title: 'Plan', scene: 's', framing: 'f', location: 'l', action: 'a', camera: 'c', durationSeconds: 5, vehiclePhotoId: 'v' }], storyboardSignature: 'x', briefConflicts: ['Scène de nuit demandée : les lieux choisis sont de jour, la lumière suit le lieu.'] } }));
  await page.goto('/');
  const generate = page.getByRole('button', { name: /Générer la vidéo/ });
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel('Description de la vidéo').fill('Une Haval H6 de nuit.');
  await generate.click();
  await expect(page.getByText('Votre demande a été adaptée aux règles de la marque')).toBeVisible({ timeout: 30_000 });
  await expect(generate).toBeDisabled();
  await expect(page.getByText('Choisissez d’abord dans l’encadré ci-dessus')).toBeVisible();
  await page.getByRole('button', { name: 'Modifier ma demande' }).click();
  await expect(generate).toBeEnabled();
}

/** « Modifier ce plan »: reasons, comment, cost, then « correction en cours » and the adapted request (real route, simulation). */
async function expectReviseShot(page: Page) {
  const version = { id: 'e2e-review-version', videoId: 'e2e-review-video', title: 'Vidéo E2E à corriger', status: 'generating', versionStatus: 'generating', processingStage: 'keyframing', createdAt: new Date().toISOString() };
  const request = { shotNumber: 2, title: 'Arrêt face à la lagune', stage: 'keyframe', issues: ['blocking: car cut by the frame'], codes: ['cut_off'], url: null, canRetry: true, cost: { fcfa: 181, minutes: 2 }, revisionsLeft: 2, lastRevision: null };
  await page.route((url) => url.pathname === '/api/versions', (route) => route.request().method() === 'GET' && !new URL(route.request().url()).searchParams.get('status')
    ? route.fulfill({ json: { versions: [version] } }) : route.continue());
  await page.route(`**/api/versions/${version.id}/refresh`, (route) => route.fulfill({ json: { id: version.id, status: 'generating', processingStage: 'awaiting_review', nextPollInSeconds: 120, reviewRequired: [request] } }));
  await page.goto('/file-generation');
  await page.getByRole('button', { name: 'Modifier ce plan' }).click({ timeout: 30_000 });
  const launch = page.getByRole('button', { name: 'Lancer la correction' });
  await expect(launch).toBeDisabled();
  // 27/10: a modification included in the price is shown struck through, « (non facturé) ».
  await expect(page.getByText(/Coût de la correction : 181\s?FCFA \(non facturé\), environ 2 min\./)).toBeVisible();
  await page.getByLabel('Voiture coupée ou mal cadrée').check();
  await page.getByLabel('Précisez ce que vous voulez').fill('Je la veux entière, avec le logo RIMCO peint sur la porte.');
  const sent = page.waitForRequest((call) => call.url().endsWith(`/api/versions/${version.id}/shots/2/review`) && call.method() === 'POST');
  await launch.click();
  expect((await sent).postDataJSON()).toEqual({ decision: 'revise', feedback: 'Je la veux entière, avec le logo RIMCO peint sur la porte.', reasons: ['framing'] });
  await expect(page.getByText('Plan 2 · Arrêt face à la lagune : correction en cours')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Votre demande a été adaptée aux règles de la marque' })).toContainText('Texte ou logo');
}

/** Keyframe board: the Studio box (« always » during the beta), then « Valider » and « Tout valider et lancer la vidéo ». */
async function expectKeyframeBoard(page: Page) {
  await page.goto('/');
  const box = page.getByLabel(/Valider les images clés et les clips avant le montage/);
  await expect(box).toBeChecked({ timeout: 30_000 });
  await expect(box).toBeDisabled();
  const version = { id: 'e2e-board', videoId: 'e2e-board-video', title: 'Vidéo E2E à valider', status: 'generating', versionStatus: 'generating', createdAt: new Date().toISOString() };
  const shot = (shotNumber: number, title: string) => ({ shotNumber, title, action: 'Voiture qui roule · de gauche à droite · à vitesse normale · 5 s', url: null, state: 'to_approve', canRevise: true, revisionsLeft: 1, lastRevision: null, cost: { fcfa: 181, minutes: 2 } });
  const board = { requestedAt: new Date().toISOString(), remindAt: new Date(Date.now() + 86_400_000).toISOString(), expiresAt: new Date(Date.now() + 172_800_000).toISOString(), shots: [shot(2, 'Arrêt face à la lagune'), shot(1, 'Arrivée sur le pont')] };
  await page.route((url) => url.pathname === '/api/versions', (route) => route.request().method() === 'GET' && !new URL(route.request().url()).searchParams.get('status')
    ? route.fulfill({ json: { versions: [version] } }) : route.continue());
  await page.route(`**/api/versions/${version.id}/refresh`, (route) => route.fulfill({ json: { id: version.id, status: 'generating', processingStage: 'keyframe_approval', nextPollInSeconds: 120, keyframeApproval: board } }));
  const approvals: unknown[] = [];
  page.on('request', (request) => { if (request.url().endsWith(`/api/versions/${version.id}/keyframes/approve`)) approvals.push(request.postDataJSON()); });
  await page.goto('/file-generation');
  const section = page.locator(`#keyframes-${version.id}`);
  await expect(section.getByRole('heading', { name: '2 images clés à valider' })).toBeVisible({ timeout: 30_000 });
  // In the order of the film.
  await expect(section.getByText(/^Plan \d · /)).toHaveText(['Plan 1 · Arrivée sur le pont', 'Plan 2 · Arrêt face à la lagune']);
  await section.getByRole('button', { name: 'Valider', exact: true }).first().click();
  await expect(section.getByRole('heading', { name: '1 image clé à valider' })).toBeVisible({ timeout: 30_000 });
  await section.getByRole('button', { name: 'Tout valider et lancer la vidéo' }).click();
  await expect(section.getByRole('heading', { name: 'Images clés validées : la vidéo démarre' })).toBeVisible({ timeout: 30_000 });
  expect(approvals).toEqual([{ shots: [1] }, { shots: 'all' }]);
}

if (mockWithoutSupabase) {
  test('le studio de simulation est utilisable sans compte Supabase', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /^Bonjour / })).toBeVisible();
    await expect(page.getByText('Mode simulation', { exact: false })).toBeVisible();
    await expect(page.getByText('Durée de la vidéo')).toBeVisible();
    await expect(page.getByText('Niveau de génération')).toBeVisible();
    await expect(page.getByLabel('Véhicule')).toBeVisible();
    await expect(page.getByRole('option', { name: /Haval H6/ })).toBeAttached();
    await expect.poll(() => page.getByRole('img', { name: /Illustration de simulation.*Haval H6/ }).evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  });

  test('une génération simulée arrive à son état prêt', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await page.getByLabel('Véhicule').selectOption({ index: 1 });
    await expect(page.getByLabel('Véhicule')).not.toHaveValue('');
    await expect(page.getByText(/vue\(s\) rattachée/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Générer la vidéo/ })).toBeEnabled({ timeout: 15_000 });
    const title = `Essai RIMCO ${Date.now()}`;
    await page.getByLabel('Titre de la vidéo').fill(title);
    await page.getByLabel('Description de la vidéo').fill('Une lumière naturelle douce sur un boulevard calme.');
    const createRequest = page.waitForRequest((request) => request.url().endsWith('/api/versions') && request.method() === 'POST');
    await page.getByRole('button', { name: /Générer la vidéo/ }).click();
    expect((await createRequest).postDataJSON()).toMatchObject({ overlayLogo: true, title });
    await expect(page.getByText('Votre vidéo est prête à consulter.')).toBeVisible({ timeout: 65_000 });
    await expect(page.getByRole('link', { name: 'Voir ma vidéo' })).toBeVisible();
  });
  test('le Studio retrouve une vidéo en cours et un seul suivi tourne', async ({ page }) => {
    test.setTimeout(90_000);
    await expectStudioRestoresActiveVersion(page);
  });

  test('une décision requise est signalée sur toutes les pages', async ({ page }) => {
    test.setTimeout(90_000);
    await expectActionRequiredBanner(page);
  });
  test('une vidéo prête se regarde et s’envoie au valideur depuis le Studio', async ({ page }) => {
    test.setTimeout(90_000);
    await expectReadyVideoActions(page);
  });

  test('un échec explique la cause en français et ce qui est facturé', async ({ page }) => {
    test.setTimeout(90_000);
    await expectFailedVideoMessage(page);
  });

  test('le lien direct ouvre la vidéo dans la Bibliothèque', async ({ page }) => {
    test.setTimeout(90_000);
    await expectLibraryDirectLink(page);
  });
  test('le refus demande un motif dans une fenêtre et confirme la décision', async ({ page }) => {
    test.setTimeout(90_000);
    await expectRefusalWindow(page);
  });

  test('pendant un conflit du brief, seul l’encadré permet de lancer', async ({ page }) => {
    test.setTimeout(90_000);
    await expectConflictBlocksMainButton(page);
  });
  test('« Modifier ce plan » envoie les motifs et le commentaire, puis montre la correction en cours', async ({ page }) => {
    test.setTimeout(90_000);
    await expectReviseShot(page);
  });
  test('la planche des images clés se valide plan par plan ou en un clic', async ({ page }) => {
    test.setTimeout(90_000);
    await expectKeyframeBoard(page);
  });
  test('« Se déconnecter » ferme la session et ramène à la page de connexion', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /^Bonjour / })).toBeVisible({ timeout: 60_000 });
    const signOut = page.waitForRequest((request) => request.url().endsWith('/api/auth/signout') && request.method() === 'POST');
    await page.getByRole('button', { name: 'Se déconnecter' }).filter({ visible: true }).first().click();
    await signOut;
    await expect(page).toHaveURL(/\/connexion$/, { timeout: 30_000 });
  });
  test('l’administrateur supprime un membre après confirmation', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/equipe');
    const remove = page.getByRole('button', { name: 'Supprimer Oury' });
    await expect(remove).toBeVisible({ timeout: 60_000 });
    page.once('dialog', (dialog) => { expect(dialog.message()).toContain('Cette action est irréversible'); void dialog.accept(); });
    const request = page.waitForRequest((item) => item.url().endsWith('/api/admin/users') && item.method() === 'DELETE');
    await remove.click();
    expect((await request).postDataJSON()).toEqual({ id: '00000000-0000-4000-8000-000000000003' });
    await expect(page.getByText('Oury est supprimé.')).toBeVisible();
  });
} else {
  if (!adminPassword) throw new Error('E2E_ADMIN_PASSWORD doit être préparé par le setup global Playwright.');

  async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
    await page.goto('/connexion');
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe').fill(password);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL('/', { timeout: 10_000 });
  }

  test('connexion administrateur : le studio de création est sur l’accueil', async ({ page }) => {
    await signIn(page, adminEmail, adminPassword);
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: /^Bonjour / })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Votre vidéo' })).toBeVisible();
    await expect(page.getByLabel('Véhicule')).toBeVisible();
    await expect(page.getByText('Durée de la vidéo')).toBeVisible();
    await expect(page.getByText('Niveau de génération')).toBeVisible();
  });

  test('administrateur lance une génération storyboard simulée', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, adminEmail, adminPassword);
    await page.goto('/');
    await page.getByLabel('Véhicule').selectOption({ index: 1 });
    await expect(page.getByLabel('Véhicule')).not.toHaveValue('');
    await expect(page.getByText(/vue\(s\) rattachée/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Générer la vidéo/ })).toBeEnabled({ timeout: 15_000 });
    await page.getByLabel('Titre de la vidéo').fill('Essai E2E');
    await page.getByLabel('Description de la vidéo').fill('Une Haval H6 bleue roule doucement dans le Plateau à Abidjan.');
    const createRequest = page.waitForRequest((request) => request.url().endsWith('/api/versions') && request.method() === 'POST');
    await page.getByRole('button', { name: /Générer la vidéo/ }).click();
    expect((await createRequest).postDataJSON()).toMatchObject({ overlayLogo: true, title: 'Essai E2E' });
    await expect(page.getByText('Votre vidéo est prête à consulter.')).toBeVisible({ timeout: 65_000 });
    await expect(page.getByRole('link', { name: 'Voir ma vidéo' })).toBeVisible();
  });

  test('le Studio retrouve une vidéo en cours et un seul suivi tourne', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, adminEmail, adminPassword);
    await expectStudioRestoresActiveVersion(page);
  });

  test('une décision requise est signalée sur toutes les pages', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, adminEmail, adminPassword);
    await expectActionRequiredBanner(page);
  });

  test('une vidéo prête se regarde et s’envoie au valideur depuis le Studio', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, adminEmail, adminPassword);
    await expectReadyVideoActions(page);
  });

  test('un échec explique la cause en français et ce qui est facturé', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, adminEmail, adminPassword);
    await expectFailedVideoMessage(page);
  });

  test('le lien direct ouvre la vidéo dans la Bibliothèque', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, adminEmail, adminPassword);
    await expectLibraryDirectLink(page);
  });

  test('le refus demande un motif dans une fenêtre et confirme la décision', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, adminEmail, adminPassword);
    await expectRefusalWindow(page);
  });

  test('pendant un conflit du brief, seul l’encadré permet de lancer', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, adminEmail, adminPassword);
    await expectConflictBlocksMainButton(page);
  });

  test('« Modifier ce plan » envoie les motifs et le commentaire, puis montre la correction en cours', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, adminEmail, adminPassword);
    await expectReviseShot(page);
  });

  test('la planche des images clés se valide plan par plan ou en un clic', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, adminEmail, adminPassword);
    await expectKeyframeBoard(page);
  });
}
