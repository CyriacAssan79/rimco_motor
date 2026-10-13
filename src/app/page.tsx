import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireRole } from '@/core/auth/guards';
import { PageHeading } from '@/components/shell';
import { QuickCreate } from './QuickCreate';

export default async function Home() {
  const actor = await requireRole('collaborateur', 'admin', 'valideur');
  if (actor.role === 'valideur') redirect('/a-valider');
  return <>
    <PageHeading eyebrow="Studio vidéo" title={`Bonjour ${actor.name?.split(' ')[0] ?? 'à vous'}`} description="Que voulez-vous créer aujourd’hui ?" />
    <QuickCreate />
    <section className="mt-8 flex items-center justify-between border-b border-[#e2e2e5] pb-3"><h2 className="font-[family-name:var(--font-display)] text-[28px]">Vidéos récentes</h2><Link href="/bibliotheque" className="text-xs font-semibold text-[#831810] underline underline-offset-4">Tout voir</Link></section>
  </>;
}
