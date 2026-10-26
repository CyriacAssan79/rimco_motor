import {PageHeading} from '@/components/shell';
import {MediaLibrary} from './MediaLibrary';
import { requirePageRole } from '@/core/auth/guards';
export default async function MediaPage(){await requirePageRole('collaborateur','admin'); return <><PageHeading eyebrow="Médias de marque" title="Médiathèque" description="La base d’images que l’IA utilise pour créer des vidéos fidèles à RIMCO."/><MediaLibrary/></>}
