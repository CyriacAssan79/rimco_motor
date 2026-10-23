import { redirect } from 'next/navigation';

// The studio now lives on the home page; this route keeps old links working.
export default function StudioPage() {
  redirect('/');
}
