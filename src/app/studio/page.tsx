import {PageHeading} from '@/components/shell';
import {StudioComposer} from './StudioComposer';
import {env} from '@/env';
import {getActor} from '@/core/auth/guards';
export default async function StudioPage(){const actor=await getActor();return <><PageHeading eyebrow="Atelier de création" title="Créer une vidéo" description="Décrivez une scène; chaque vidéo reste ancrée à une photo réelle de votre véhicule."/><StudioComposer mode={env.PROVIDERS_MODE} isAdmin={actor.role==='admin'}/></>}
