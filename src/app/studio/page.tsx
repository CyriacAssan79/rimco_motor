import { PageHeading } from '@/components/shell';
import { StudioComposer } from './StudioComposer';
import { env } from '@/env';
import { requireRole } from '@/core/auth/guards';

export default async function StudioPage() {
  await requireRole('collaborateur', 'admin');
  return <>
    <PageHeading eyebrow="Atelier de création" title="Créer une vidéo" description="Choisissez une scène et une idée de film. Le Studio construit le prompt et génère un clip continu à partir de votre véhicule." />
    {env.PROVIDERS_MODE === 'mock' && <p role="status" className="mb-5 border border-[#e7d7b9] bg-[#fbf6ed] p-4 text-sm leading-6 text-[#765d39]">
      <strong>Mode simulation :</strong> cet environnement ne contacte pas fal.ai et ne produit pas de vraie vidéo. Pour tester une génération réelle, ouvrez le déploiement Preview configuré en mode live.
    </p>}
    <StudioComposer mode={env.PROVIDERS_MODE} />
  </>;
}
