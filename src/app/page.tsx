import { redirect } from 'next/navigation';
import { requireRole } from '@/core/auth/guards';
import { PageHeading } from '@/components/shell';
import { env } from '@/env';
import { StudioComposer } from './studio/StudioComposer';

export default async function Home() {
  const actor = await requireRole('collaborateur', 'admin', 'valideur');
  if (actor.role === 'valideur') redirect('/a-valider');
  return <>
    <PageHeading eyebrow="Studio vidéo" title={`Bonjour ${actor.name?.split(' ')[0] ?? 'à vous'}`} description="Décrivez votre idée et choisissez vos références. Le Studio construit les plans et assemble automatiquement une vidéo adaptée à votre demande." />
    {env.PROVIDERS_MODE === 'mock' && <p role="status" className="mb-5 border border-[#e7d7b9] bg-[#fbf6ed] p-4 text-sm leading-6 text-[#765d39]">
      <strong>Mode simulation :</strong> cet environnement ne lance pas de génération vidéo réelle. Pour tester une génération réelle, ouvrez le déploiement Preview configuré en mode live.
    </p>}
    <StudioComposer mode={env.PROVIDERS_MODE} />
  </>;
}
