'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatFcfa } from '@/core/pricing';
import { CreditsView } from '@/app/credits/CreditsView';

type Lot = { id: string; kind: 'purchase' | 'gift'; amountFcfa: number; remainingFcfa: number; expiresAt: string; invoiceRef: string | null; paymentRef: string | null; note: string | null; createdAt: string };
type Client = { id: string; name: string; settings: { creditsEnforced: boolean; purchaseValidityMonths: number; giftValidityMonths: number }; summary: { availableFcfa: number; heldFcfa: number; lowBalance: boolean; nextExpiry: { amountFcfa: number; at: string } | null }; lots: Lot[] };
type Panel = { mode: 'topup'; client: Client } | { mode: 'adjust' | 'extend'; client: Client; lot: Lot };

const input = 'min-h-11 w-full rounded-sm border border-[#d4d4d8] bg-white px-3 text-sm font-normal outline-none focus:border-[#c51e1c]';
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
function addMonths(months: number) { const date = new Date(); date.setMonth(date.getMonth() + months); return isoDate(date); }
const shortDate = (at: string) => new Date(at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
const digits = (value: string) => Number(value.replace(/[^\d]/g, '')) || 0;

/**
 * Espace KÔMIAN · Clients et crédits (27/10). Every sensitive action shows « le solde passera de X à Y » before
 * confirmation; nothing is ever deleted: a mistake is corrected with a reason, and everything stays in the journal.
 */
export function OperatorClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState('');
  const [panel, setPanel] = useState<Panel | null>(null);
  const [form, setForm] = useState({ kind: 'purchase' as 'purchase' | 'gift', amount: '', expiresAt: '', invoiceRef: '', paymentRef: '', note: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  /** Time of the last load: expiry states are computed from it, never from the clock during render. */
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    const response = await fetch('/api/operator/clients', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? 'Les clients sont indisponibles.');
    setClients(data.clients ?? []);
    setLoadedAt(Date.now());
    setSelected((current) => current || data.clients?.[0]?.id || '');
  }, []);
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : 'Les clients sont indisponibles.')); }, [load]);
  useEffect(() => {
    if (!panel) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setPanel(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  function open(next: Panel) {
    setError(''); setNotice('');
    if (next.mode === 'topup') setForm({ kind: 'purchase', amount: '', expiresAt: addMonths(next.client.settings.purchaseValidityMonths), invoiceRef: '', paymentRef: '', note: '' });
    if (next.mode === 'extend') { const date = new Date(next.lot.expiresAt); date.setMonth(date.getMonth() + 3); setForm({ ...form, expiresAt: isoDate(date), note: '' }); }
    if (next.mode === 'adjust') setForm({ ...form, amount: '', note: '' });
    setPanel(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!panel) return;
    setBusy(true); setError('');
    try {
      const amount = digits(form.amount);
      const request = panel.mode === 'topup'
        ? fetch('/api/operator/credits', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: panel.client.id, kind: form.kind, amountFcfa: amount, expiresAt: form.expiresAt || undefined, invoiceRef: form.invoiceRef, paymentRef: form.paymentRef, note: form.note }) })
        : fetch(`/api/operator/credits/${panel.lot.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(panel.mode === 'adjust' ? { action: 'adjust', amountFcfa: amount, note: form.note } : { action: 'extend', expiresAt: form.expiresAt, note: form.note || undefined }) });
      const response = await request;
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'L’opération n’a pas pu être enregistrée.');
      setNotice(panel.mode === 'topup' ? `${form.kind === 'gift' ? 'Crédit offert' : 'Recharge'} de ${formatFcfa(amount)} enregistré${form.kind === 'gift' ? '' : 'e'} pour ${panel.client.name}.` : panel.mode === 'adjust' ? `Correction de ${formatFcfa(amount)} enregistrée.` : 'Expiration prolongée.');
      setPanel(null);
      await load();
      setHistoryKey((key) => key + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Une erreur est survenue.'); } finally { setBusy(false); }
  }

  const client = clients.find((item) => item.id === selected) ?? null;
  const amount = digits(form.amount);
  const previewTitle = panel?.mode === 'topup' ? (form.kind === 'gift' ? 'Offrir des crédits' : 'Recharger') : panel?.mode === 'adjust' ? 'Corriger un lot' : 'Prolonger un lot';
  const nextBalance = panel ? panel.client.summary.availableFcfa + (panel.mode === 'topup' ? amount : panel.mode === 'adjust' ? -amount : 0) : 0;

  return <div className="space-y-6">
    {error && !panel && <p role="alert" className="border border-[#f0c9c6] bg-[#fae9e7] p-4 text-sm text-[#9d352e]">{error}</p>}
    {notice && <p role="status" className="border border-[#d7e7da] bg-[#f2f8f3] p-4 text-sm text-[#315c39]">{notice}</p>}
    {clients.length > 1 && <label className="grid max-w-sm gap-1 text-xs font-semibold">Client<select value={selected} onChange={(event) => setSelected(event.target.value)} className={input}>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    {client && <>
      <section aria-labelledby="client-title" className="border border-[var(--border)] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 id="client-title" className="text-lg font-semibold">{client.name}</h2><p className="mt-1 text-xs text-[#626269]">{client.settings.creditsEnforced ? 'Crédits appliqués : un lancement sans solde suffisant est refusé.' : 'Crédits non appliqués : montants tracés sans blocage (mise en service).'}</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => open({ mode: 'topup', client })} className="min-h-11 rounded-sm bg-[#c51e1c] px-4 text-xs font-semibold text-white hover:bg-[#a71715]">Recharger ou offrir</button></div>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="border border-[var(--border)] p-3"><dt className="text-xs text-[#626269]">Solde disponible</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{formatFcfa(client.summary.availableFcfa)}</dd>{client.summary.lowBalance && <dd className="text-xs font-semibold text-[#9d352e]">Solde bas</dd>}</div>
          <div className="border border-[var(--border)] p-3"><dt className="text-xs text-[#626269]">Réservé (vidéos en cours)</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{formatFcfa(client.summary.heldFcfa)}</dd></div>
          <div className="border border-[var(--border)] p-3"><dt className="text-xs text-[#626269]">Prochaine expiration</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{client.summary.nextExpiry ? formatFcfa(client.summary.nextExpiry.amountFcfa) : '—'}</dd>{client.summary.nextExpiry && <dd className="text-xs text-[#626269]">le {shortDate(client.summary.nextExpiry.at)}</dd>}</div>
        </dl>
      </section>

      <section aria-labelledby="lots-title" className="border border-[var(--border)] bg-white">
        <h2 id="lots-title" className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">Recharges et crédits offerts</h2>
        {client.lots.length === 0 ? <p className="px-6 py-10 text-center text-xs text-[#626269]">Aucune recharge pour l’instant. Faites la première avant d’appliquer les crédits.</p> : <ul className="divide-y divide-[var(--border)]">{client.lots.map((lot) => {
          const expired = Date.parse(lot.expiresAt) <= loadedAt;
          return <li key={lot.id} className="grid gap-2 px-4 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div><p className="font-semibold">{lot.kind === 'gift' ? 'Crédit offert' : 'Recharge'} · {formatFcfa(lot.amountFcfa)} <span className="font-normal text-[#626269]">· reste {formatFcfa(lot.remainingFcfa)}</span></p>
              <p className="mt-1 text-[#626269]">Ajouté le {shortDate(lot.createdAt)} · {expired ? 'expiré' : 'expire'} le {shortDate(lot.expiresAt)}{lot.invoiceRef ? ` · facture ${lot.invoiceRef}` : ''}{lot.paymentRef ? ` · paiement ${lot.paymentRef}` : ''}</p>{lot.note && <p className="mt-1 text-[#626269]">{lot.note}</p>}</div>
            <div className="flex gap-2">{!expired && <button type="button" onClick={() => open({ mode: 'extend', client, lot })} className="min-h-11 rounded-sm border border-[#d4d4d8] px-3 font-semibold hover:bg-[#f7f7f8]">Prolonger</button>}{lot.remainingFcfa > 0 && <button type="button" onClick={() => open({ mode: 'adjust', client, lot })} className="min-h-11 rounded-sm border border-[#d4d4d8] px-3 font-semibold hover:bg-[#f7f7f8]">Corriger</button>}</div>
          </li>;
        })}</ul>}
      </section>

      <section aria-labelledby="client-history-title"><h2 id="client-history-title" className="mb-3 text-sm font-semibold">Historique du client</h2><CreditsView key={`${client.id}-${historyKey}`} clientId={client.id} historyOnly /></section>
    </>}

    {panel && <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setPanel(null)}>
      <form role="dialog" aria-modal="true" aria-labelledby="credit-panel-title" onSubmit={submit} onClick={(event) => event.stopPropagation()} className="flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#831810]">Interne KÔMIAN · {panel.client.name}</p><h2 id="credit-panel-title" className="mt-1 text-lg font-semibold">{previewTitle}</h2></div><button type="button" onClick={() => setPanel(null)} className="min-h-11 rounded-sm border border-[#d4d4d8] px-3 text-xs font-semibold">Fermer</button></div>
        {error && <p role="alert" className="border border-[#f0c9c6] bg-[#fae9e7] p-3 text-sm text-[#9d352e]">{error}</p>}
        {panel.mode === 'topup' && <fieldset className="grid grid-cols-2 gap-2"><legend className="mb-1 text-xs font-semibold">Type</legend>{(['purchase', 'gift'] as const).map((kind) => <label key={kind} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-sm border text-xs font-semibold ${form.kind === kind ? 'border-[#c51e1c] bg-[#fae9e8] text-[#b51d19]' : 'border-[#d4d4d8]'}`}><input type="radio" name="kind" value={kind} checked={form.kind === kind} onChange={() => setForm({ ...form, kind, expiresAt: addMonths(kind === 'gift' ? panel.client.settings.giftValidityMonths : panel.client.settings.purchaseValidityMonths) })} className="sr-only" />{kind === 'gift' ? 'Crédit offert' : 'Achat'}</label>)}</fieldset>}
        {panel.mode !== 'extend' && <label className="grid gap-1 text-xs font-semibold">{panel.mode === 'adjust' ? 'Montant à retirer (FCFA)' : 'Montant (FCFA)'}<input inputMode="numeric" required value={form.amount ? new Intl.NumberFormat('fr-FR').format(amount) : ''} onChange={(event) => setForm({ ...form, amount: event.target.value })} className={`${input} tabular-nums`} placeholder="150 000" />{panel.mode === 'adjust' && <span className="font-normal text-[#626269]">Au plus {formatFcfa(panel.lot.remainingFcfa)} (reste du lot). Pour ajouter, utilisez « Crédit offert ».</span>}</label>}
        {panel.mode !== 'adjust' && <label className="grid gap-1 text-xs font-semibold">{panel.mode === 'extend' ? 'Nouvelle date d’expiration' : 'Expire le'}<input type="date" required value={form.expiresAt} min={isoDate(new Date(loadedAt + 86_400_000))} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} className={input} />{panel.mode === 'topup' && <span className="font-normal text-[#626269]">Pré-rempli selon les réglages ({form.kind === 'gift' ? panel.client.settings.giftValidityMonths : panel.client.settings.purchaseValidityMonths} mois).</span>}</label>}
        {panel.mode === 'topup' && <><label className="grid gap-1 text-xs font-semibold">Référence de facture <span className="font-normal text-[#626269]">(facultatif)</span><input value={form.invoiceRef} maxLength={120} onChange={(event) => setForm({ ...form, invoiceRef: event.target.value })} className={input} /></label>
          <label className="grid gap-1 text-xs font-semibold">Référence de paiement <span className="font-normal text-[#626269]">(facultatif)</span><input value={form.paymentRef} maxLength={120} onChange={(event) => setForm({ ...form, paymentRef: event.target.value })} className={input} /></label></>}
        <label className="grid gap-1 text-xs font-semibold">{panel.mode === 'adjust' ? 'Motif (obligatoire)' : 'Note'}<textarea rows={3} maxLength={500} required={panel.mode === 'adjust'} minLength={panel.mode === 'adjust' ? 3 : undefined} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className={`${input} py-2`} /></label>
        <p role="status" className="border border-[var(--border)] bg-[#f8f8f9] p-3 text-sm">{panel.mode === 'extend' ? <>Le lot de {formatFcfa(panel.lot.remainingFcfa)} expirera le <b>{form.expiresAt ? shortDate(`${form.expiresAt}T12:00:00Z`) : '—'}</b> au lieu du {shortDate(panel.lot.expiresAt)}.</> : <>Le solde de {panel.client.name} passera de <b className="tabular-nums">{formatFcfa(panel.client.summary.availableFcfa)}</b> à <b className="tabular-nums">{formatFcfa(Math.max(0, nextBalance))}</b>.</>}</p>
        <button type="submit" disabled={busy || (panel.mode !== 'extend' && amount <= 0) || (panel.mode === 'adjust' && amount > panel.lot.remainingFcfa)} className="min-h-11 rounded-sm bg-[#c51e1c] px-4 text-xs font-semibold text-white hover:bg-[#a71715] disabled:opacity-45">{busy ? 'Enregistrement…' : panel.mode === 'topup' ? (form.kind === 'gift' ? 'Confirmer le crédit offert' : 'Confirmer la recharge') : panel.mode === 'adjust' ? 'Confirmer la correction' : 'Confirmer la prolongation'}</button>
      </form>
    </div>}
  </div>;
}
