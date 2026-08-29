import type { MetadataRoute } from 'next';
import {siteConfig} from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/','/admin/','/admin-login','/dashboard/','/login','/onboarding/','/d/'],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
