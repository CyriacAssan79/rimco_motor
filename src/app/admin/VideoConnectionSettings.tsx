'use client';

import { useEffect, useState, type FormEvent } from 'react';

type VideoConnectionStatus = {
  configured: boolean;
  source: 'admin' | 'vercel' | 'none';
  updatedAt: string | null;
  encryptionReady: boolean;
};

export function VideoConnectionSettings() {
  const [status, setStatus] = useState<VideoConnectionStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/video-connection')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Impossible de lire la configuration vidéo.');
        return data as VideoConnectionStatus;
      })
      .then((data) => { if (active) setStatus(data); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Impossible de lire la configuration vidéo.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const response = await fetch('/api/admin/video-connection', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'La clé API n’a pas pu être enregistrée.');
      setApiKey('');
      setStatus((previous) => previous ? { ...previous, configured: true, source: 'admin', updatedAt: data.updatedAt } : previous);
      setNotice('La nouvelle clé API est enregistrée pour les prochaines générations.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La clé API n’a pas pu être enregistrée.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="max-w-2xl rounded-2xl border border-black/[.055] bg-[var(--surface)] p-6">
    <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#a42e26]">Accès sécurisé</p>
    <h2 className="mt-2 text-lg font-semibold">Connexion du moteur vidéo</h2>
    <p className="mt-2 text-sm leading-6 text-[#716d66]">La clé est chiffrée avant enregistrement et n’est jamais réaffichée. Elle sera vérifiée au prochain lancement de génération, sans appel de test payant.</p>
    <div className="mt-4 rounded-lg bg-[#f7f6f3] p-4 text-xs leading-5 text-[#716d66]" aria-live="polite">
      {loading ? 'Lecture de la configuration…' : status?.configured ? <>
        <strong className="text-[#456c4c]">Connexion configurée</strong>
        <span className="ml-2">{status.source === 'admin' ? 'Clé enregistrée dans les réglages' : 'Configuration active'}</span>
        {status.updatedAt && <span className="mt-1 block">Dernier remplacement : {new Date(status.updatedAt).toLocaleString('fr-FR')}</span>}
      </> : 'Aucune clé API configurée.'}
    </div>
    {status && !status.encryptionReady && <p className="mt-4 rounded-lg border border-[#eadfc7] bg-[#fbf6ed] p-4 text-xs leading-5 text-[#675432]">Avant d’enregistrer une clé, ajoutez la clé de chiffrement des identifiants dans les variables de configuration de Production, Preview et Development. Elle doit contenir 32 octets encodés en Base64, puis redéployez l’application.</p>}
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-lg bg-[#edf4ee] p-3 text-sm text-[#456c4c]">{notice}</p>}
    <form onSubmit={save} className="mt-5 space-y-4">
      <label className="block text-xs font-semibold" htmlFor="video-api-key">Nouvelle clé API
        <input id="video-api-key" type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} required maxLength={512} className="mt-2 w-full rounded-lg border border-[#e4e1db] bg-transparent px-3 py-3 text-sm font-normal" placeholder="Saisir la nouvelle clé API" />
      </label>
      <p className="text-xs leading-5 text-[#8c8881]">Enregistrer cette clé remplace le compte vidéo actif. Les générations déjà lancées continueront avec leur clé d’origine.</p>
      <button type="submit" disabled={saving || loading || !status?.encryptionReady} className="rounded-lg bg-[#253b4e] px-5 py-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
        {saving ? 'Enregistrement…' : 'Enregistrer la clé API'}
      </button>
    </form>
  </section>;
}
