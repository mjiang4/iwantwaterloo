import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import './globals.css';
const sans=DM_Sans({variable:'--font-garden-sans',subsets:['latin']});
export const metadata: Metadata={metadataBase:new URL('https://waterloo-idea-garden.helloimjerry.chatgpt.site'),title:'Waterloo Ideas',icons:{icon:'/favicon.svg'},description:'Share an idea for Waterloo.'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body className={sans.variable}>{children}</body></html>;}
