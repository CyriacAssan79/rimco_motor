import Image from 'next/image';
import { LoginForm } from './LoginForm';

function RimcoLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Image
      src="/brand/logo-rimco.png"
      width={204}
      height={60}
      alt="RIMCO Motors"
      priority
      className={compact ? 'h-auto w-[150px]' : 'h-auto w-[170px]'}
    />
  );
}

export default function Connexion() {
  return (
    <main className="grid min-h-screen bg-[var(--background)] lg:grid-cols-[1fr_460px]">
      <section className="relative hidden overflow-hidden bg-[var(--ink)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="relative z-10 w-fit rounded-lg bg-white px-4 py-3 shadow-sm">
          <RimcoLogo />
        </div>
        <div className="relative z-10 max-w-xl pb-12">
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#d9ae75]">Studio vidéo interne · RIMCO Motors</p>
          <h1 className="mt-5 text-5xl font-semibold leading-[1.05] tracking-[-.04em]">Des vidéos qui<br />font avancer<br /><span className="text-[#dfb080]">vos véhicules.</span></h1>
          <p className="mt-5 max-w-md text-sm leading-6 text-white/65">Créez des contenus fidèles à chaque modèle, partagez-les avec vos équipes et faites valider chaque publication au même endroit.</p>
        </div>
        <div className="absolute -bottom-32 -right-20 h-[460px] w-[460px] rounded-full border border-white/10" />
        <div className="absolute -bottom-20 -right-7 h-[330px] w-[330px] rounded-full border border-white/10" />
        <p className="relative z-10 text-[10px] text-white/40">Espace de travail privé · Abidjan</p>
      </section>
      <section className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-10 lg:hidden">
            <RimcoLogo compact />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[var(--brand-red)]">Accès sécurisé</p>
          <h2 className="mt-2 text-[30px] font-semibold tracking-[-.04em]">Votre espace RIMCO</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Connectez-vous pour créer, suivre et valider vos vidéos automobiles.</p>
          <div className="mt-6 rounded-xl border border-[#eadfc7] bg-[#fbf6ed] p-4">
            <p className="text-xs font-semibold text-[#675432]">Première connexion</p>
            <p className="mt-1.5 text-xs leading-5 text-[#82745c]">Après avoir ouvert le lien sécurisé reçu par e-mail, définissez votre mot de passe ici pour activer ou récupérer votre accès. Les inscriptions publiques sont désactivées.</p>
          </div>
          <LoginForm />
          <p className="mt-7 text-center text-[10px] leading-5 text-[#9a968f]">L’accès est réservé aux membres invités par votre Manager.<br />Les inscriptions publiques sont désactivées.</p>
        </div>
      </section>
    </main>
  );
}
