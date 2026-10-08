import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { env, supabaseAnonKey } from '@/env';
export async function createSupabaseServerClient(){if(!env.NEXT_PUBLIC_SUPABASE_URL||!supabaseAnonKey)throw new Error('Configuration Supabase manquante : ajoutez l’URL et la clé publique dans les variables Vercel.');const cookieStore=await cookies();return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,supabaseAnonKey,{cookies:{getAll:()=>cookieStore.getAll(),setAll(cookiesToSet){try{cookiesToSet.forEach(({name,value,options})=>cookieStore.set(name,value,options))}catch{}}}})}
