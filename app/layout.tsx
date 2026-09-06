import type { Metadata } from 'next';
import { DM_Sans, Instrument_Serif } from 'next/font/google';
import './globals.css';
const sans=DM_Sans({variable:'--font-garden-sans',subsets:['latin']});
const serif=Instrument_Serif({variable:'--font-garden-serif',subsets:['latin'],weight:'400',style:['normal','italic']});
export const metadata: Metadata={metadataBase:new URL('https://waterloo-idea-garden.helloimjerry.chatgpt.site'),title:'Waterloo Garden — What could grow here?',description:'A living garden of ideas for Waterloo. Explore possibilities, plant a suggestion, and help good ideas grow. Everyone is welcome.'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body className={`${sans.variable} ${serif.variable}`}>{children}</body></html>;}
