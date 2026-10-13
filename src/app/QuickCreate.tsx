'use client';

import { useState } from 'react';
import Link from 'next/link';

export function QuickCreate() {
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState('16:9');
  const [duration, setDuration] = useState('5');
  return <section className="border border-[#e2e2e5] bg-white p-5 md:p-6">
    <label className="sr-only" htmlFor="quick-description">Décrivez votre vidéo</label>
    <textarea id="quick-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} placeholder="Décrivez votre vidéo…" className="w-full resize-y border border-[#e2e2e5] bg-white p-4 text-sm outline-none focus:border-[#c51e1c]" />
    <div className="mt-4 flex flex-wrap items-center gap-3"><label className="text-xs text-[#626269]">Format<select value={format} onChange={(event) => setFormat(event.target.value)} className="ml-2 min-h-10 rounded-full border border-[#e2e2e5] bg-white px-3 text-xs"><option>16:9</option><option>9:16</option><option>1:1</option><option>4:5</option></select></label><label className="text-xs text-[#626269]">Durée<select value={duration} onChange={(event) => setDuration(event.target.value)} className="ml-2 min-h-10 rounded-full border border-[#e2e2e5] bg-white px-3 text-xs"><option value="5">5 s</option><option value="10">10 s</option><option value="15">15 s</option><option value="20">20 s</option><option value="30">30 s</option></select></label><span className="ml-auto text-xs text-[#626269]">Le prix sera confirmé dans le Studio</span><Link href={`/studio?description=${encodeURIComponent(description)}&format=${format}&duration=${duration}`} className="inline-flex min-h-11 items-center rounded-full bg-[#c51e1c] px-5 text-xs font-semibold text-white hover:bg-[#a71715]">Créer la vidéo</Link></div>
    <button type="button" onClick={() => setDescription('Un plan automobile premium, réaliste et fidèle à la photo du véhicule, dans un environnement urbain à Abidjan.')} className="mt-4 text-xs font-semibold text-[#831810] underline underline-offset-4">Insérer un exemple de description</button>
  </section>;
}
