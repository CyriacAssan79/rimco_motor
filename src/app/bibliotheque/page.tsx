import {PageHeading} from '@/components/shell';
import {requirePageRole} from '@/core/auth/guards';
import {VideoLibrary} from './VideoLibrary';
export default async function LibraryPage(){const actor = await requirePageRole('collaborateur', 'valideur', 'admin'); return <><PageHeading eyebrow="Production RIMCO" title="Bibliothèque vidéo" description="Visionnez et téléchargez vos vidéos générées."/><VideoLibrary role={actor.role}/></>}
