import {PageHeading} from '@/components/shell';
import {requirePageRole} from '@/core/auth/guards';
import {VideoLibrary} from './VideoLibrary';
export default async function LibraryPage(){const actor = await requirePageRole('collaborateur', 'admin'); return <><PageHeading eyebrow="Production RIMCO" title="Bibliothèque vidéo" description="Visionnez et téléchargez vos vidéos générées."/><VideoLibrary currentUserId={actor.id}/></>}
