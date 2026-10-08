import {PageHeading} from '@/components/shell';
import {AdminCenter} from './AdminCenter';
export default function AdminPage(){return <><PageHeading eyebrow="Gestion des accès et règles" title="Administration" description="Gérez les membres, la grille tarifaire RIMCO et les modèles de génération autorisés."/><AdminCenter/></>}
