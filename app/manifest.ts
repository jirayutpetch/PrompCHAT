import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return { name: 'PromptCHAT', short_name: 'PromptCHAT', description: 'Live chat workspace', start_url: '/', display: 'standalone', background_color: '#0b1219', theme_color: '#0b1219', icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }] };
}
