import type {Metadata} from 'next';
import localFont from 'next/font/local';
import './globals.css';
import {AppShell} from '@/components/shell';
const displayFont=localFont({src:'./fonts/bebas-neue-latin-400-normal.woff2',weight:'400',variable:'--font-display',display:'swap'});
export const metadata:Metadata={title:'RIMCO Studio',description:'Studio de création vidéo automobile RIMCO'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="fr" suppressHydrationWarning><body className={displayFont.variable}><AppShell>{children}</AppShell></body></html>}
