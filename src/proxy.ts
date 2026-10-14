import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Les ressources de marque sont publiques : elles doivent rester disponibles
  // sur la page de connexion, avant toute session Supabase.
  if (pathname === '/connexion' || pathname.startsWith('/api/') || pathname.startsWith('/brand/')) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const mode = process.env.PROVIDERS_MODE ?? 'mock';

  if (process.env.NODE_ENV === 'development' && mode === 'mock' && !url && !key) {
    return NextResponse.next();
  }
  if (!url || !key) return NextResponse.redirect(new URL('/connexion?configuration=supabase', request.url));

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/connexion', request.url));
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
