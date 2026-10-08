import {PageHeading} from '@/components/shell';
import {ReviewQueue} from './ReviewQueue';
export default function ValidationPage(){return <><PageHeading eyebrow="Contrôle qualité" title="File de validation" description="Vérifiez chaque vidéo avant qu’elle soit accessible en téléchargement. Tout refus doit inclure un motif."/><ReviewQueue/></>}
