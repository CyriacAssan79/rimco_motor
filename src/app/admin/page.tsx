import {PageHeading} from '@/components/shell';
import {AdminCenter} from './AdminCenter';
import { requirePageRole } from '@/core/auth/guards';
/** Espace KÔMIAN (27/10): prices, billing settings, models, fal key, storage. Never shown to the client. */
export default async function AdminPage(){await requirePageRole('operateur'); return <><PageHeading eyebrow="Interne KÔMIAN" title="Paramètres" description="Tarifs, réglages de facturation, modèles, connexion du moteur vidéo et stockage. Ces écrans ne sont jamais visibles par le client."/><AdminCenter/></>}
