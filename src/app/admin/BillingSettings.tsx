'use client';

import { useEffect, useState } from 'react';
import { formatFcfa } from '@/core/pricing';

type Settings = {
  creditsEnforced: boolean;
  lowBalanceThresholdFcfa: number;
  expiryWarningDays: number;
  purchaseValidityMonths: number;
  giftValidityMonths: number;
  humanRevisionsPerShot: number;
  humanClipRevisionsPerShot: number;
  revisionPriceFcfa: number;
  videoValidationEnabled: boolean;
};
type Client = { id: string; name: string; settings: Settings; availableFcfa?: number };

const input = 'min-h-11 w-full rounded-sm border border-[#d4d4d8] bg-white px-3 text-sm font-normal tabular-nums outline-none focus:border-[#c51e1c]';

function NumberField({ label, help, value, min, max, onChange }: { label: string; help?: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="grid content-start gap-1 text-xs font-semibold">{label}
    <input type="number" inputMode="numeric" min={min} max={max} step={1} required value={value} onChange={(event) => onChange(Math.round(Number(event.target.value)))} className={input} />
    {help && <span className="font-normal leading-5 text-[#626269]">{help}</span>}
  </label>;
}

/**
 * Espace KÔMIAN · réglages de facturation par client (27/10): credits, alerts, expiry, human modifications.
 * Each change applies to the next videos; the journal keeps who changed what.
 */
export function BillingSettings() {
  const [clients, setClients] = useState<Client[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Settings>>({});
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/operator/billing-settings').then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Réglages indisponibles.');
      if (!active) return;
      setClients(data.clients ?? []);
      setDrafts(Object.fromEntries((data.clients ?? []).map((client: Client) => [client.id, client.settings])));
      setBalances(Object.fromEntries((data.clients ?? []).map((client: Client) => [client.id, Number(client.availableFcfa ?? 0)])));
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Réglages indisponibles.'); });
    return () => { active = false; };
  }, []);

  async function save(client: Client) {
    const draft = drafts[client.id];
    if (!draft) return;
    if (draft.creditsEnforced && !client.settings.creditsEnforced) {
      const balance = balances[client.id] ?? 0;
      const message = balance <= 0
        ? `Le solde de ${client.name} est de 0 FCFA : plus aucune vidéo ne pourra être lancée. Faites d’abord une recharge. Appliquer quand même ?`
        : `Appliquer les crédits pour ${client.name} ? Chaque vidéo bloquera son prix sur le solde (${formatFcfa(balance)} disponibles) ; sans solde suffisant, le lancement sera refusé.`;
      if (!window.confirm(message)) return;
    }
    setBusy(client.id); setError(''); setNotice('');
    try {
      const response = await fetch('/api/operator/billing-settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: client.id, ...draft }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Les réglages n’ont pas pu être enregistrés.');
      setClients((current) => current.map((item) => item.id === client.id ? { ...item, settings: data.settings } : item));
      setDrafts((current) => ({ ...current, [client.id]: data.settings }));
      setNotice(`Réglages de ${client.name} enregistrés : ils s’appliquent aux prochaines vidéos.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Une erreur est survenue.'); } finally { setBusy(''); }
  }

  return <section aria-labelledby="billing-settings-title" className="max-w-3xl rounded border border-[var(--border)] bg-white p-5">
    <h2 id="billing-settings-title" className="text-sm font-semibold">Crédits et modifications</h2>
    <p className="mt-1 text-xs leading-5 text-[#626269]">Réglages propres à chaque client. Ils s’appliquent aux vidéos lancées ensuite ; une vidéo déjà lancée garde les siens.</p>
    {error && <p role="alert" className="mt-3 text-sm text-[#9d352e]">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-[#315c39]">{notice}</p>}
    {clients.map((client) => {
      const draft = drafts[client.id] ?? client.settings;
      const set = (patch: Partial<Settings>) => setDrafts((current) => ({ ...current, [client.id]: { ...draft, ...patch } }));
      const dirty = JSON.stringify(draft) !== JSON.stringify(client.settings);
      return <form key={client.id} className="mt-5 space-y-5 border-t border-[var(--border)] pt-5" onSubmit={(event) => { event.preventDefault(); void save(client); }}>
        <h3 className="text-sm font-semibold">{client.name}</h3>
        <fieldset className="space-y-3">
          <legend className="text-xs font-bold uppercase tracking-[.14em] text-[#626269]">Crédits</legend>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 size-4 accent-[#c51e1c]" checked={draft.creditsEnforced} onChange={(event) => set({ creditsEnforced: event.target.checked })} />
            <span><b className="font-semibold">Appliquer les crédits</b><span className="block text-xs leading-5 text-[#626269]">Activé : une vidéo n’est lancée que si le solde couvre son prix. Désactivé : les montants sont tracés sans bloquer personne (mise en service). Solde actuel : {formatFcfa(balances[client.id] ?? 0)}.</span></span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField label="Seuil d’alerte de solde bas (FCFA)" help="Le Manager du client et KÔMIAN sont prévenus sous ce montant." value={draft.lowBalanceThresholdFcfa} min={0} max={1_000_000_000} onChange={(value) => set({ lowBalanceThresholdFcfa: value })} />
            <NumberField label="Alerte avant expiration (jours)" value={draft.expiryWarningDays} min={0} max={365} onChange={(value) => set({ expiryWarningDays: value })} />
            <NumberField label="Validité d’un crédit acheté (mois)" value={draft.purchaseValidityMonths} min={1} max={60} onChange={(value) => set({ purchaseValidityMonths: value })} />
            <NumberField label="Validité d’un crédit offert (mois)" value={draft.giftValidityMonths} min={1} max={60} onChange={(value) => set({ giftValidityMonths: value })} />
          </div>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="text-xs font-bold uppercase tracking-[.14em] text-[#626269]">Validation des vidéos</legend>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 size-4 accent-[#c51e1c]" checked={draft.videoValidationEnabled} onChange={(event) => set({ videoValidationEnabled: event.target.checked })} />
            <span><b className="font-semibold">Valider les vidéos avant téléchargement</b><span className="block text-xs leading-5 text-[#626269]">Désactivé (par défaut) : une vidéo prête se télécharge tout de suite. Activé : elle doit être approuvée avant ; « À valider » et « Envoyer en validation » réapparaissent.</span></span>
          </label>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="text-xs font-bold uppercase tracking-[.14em] text-[#626269]">Modifications demandées par l’utilisateur</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField label="Par image clé" value={draft.humanRevisionsPerShot} min={0} max={5} onChange={(value) => set({ humanRevisionsPerShot: value })} />
            <NumberField label="Par clip" value={draft.humanClipRevisionsPerShot} min={0} max={5} onChange={(value) => set({ humanClipRevisionsPerShot: value })} />
            <NumberField label="Prix d’une modification (FCFA)" help="0 = incluse dans le prix de la vidéo." value={draft.revisionPriceFcfa} min={0} max={10_000_000} onChange={(value) => set({ revisionPriceFcfa: value })} />
          </div>
          <p className="text-xs text-[#626269]">Ce que verra l’utilisateur : {draft.revisionPriceFcfa > 0 ? <>« environ {formatFcfa(draft.revisionPriceFcfa)} », débité à la livraison de la vidéo</> : <>le coût indicatif <s>barré</s> suivi de « (non facturé) »</>}.</p>
        </fieldset>
        <button type="submit" disabled={!dirty || busy === client.id} className="min-h-11 rounded-sm bg-[#c51e1c] px-4 text-xs font-semibold text-white hover:bg-[#a71715] disabled:cursor-not-allowed disabled:bg-[#e2e2e5] disabled:text-[#626269]">{busy === client.id ? 'Enregistrement…' : dirty ? 'Enregistrer les réglages' : 'Aucune modification à enregistrer'}</button>
      </form>;
    })}
  </section>;
}
