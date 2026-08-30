import type { MetadataRoute } from 'next';
import {siteConfig} from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {url:siteConfig.url,changeFrequency:'weekly',priority:1},
    {url:`${siteConfig.url}/diagnostico`,changeFrequency:'weekly',priority:0.9},
    {url:`${siteConfig.url}/avaliacoes-google`,changeFrequency:'monthly',priority:0.85},
    {url:`${siteConfig.url}/reputacao-google`,changeFrequency:'monthly',priority:0.85},
    {url:`${siteConfig.url}/seo-local`,changeFrequency:'monthly',priority:0.8},
    {url:`${siteConfig.url}/sobre`,changeFrequency:'monthly',priority:0.5},
    {url:`${siteConfig.url}/privacidade`,changeFrequency:'yearly',priority:0.2},
    {url:`${siteConfig.url}/termos`,changeFrequency:'yearly',priority:0.2},
  ];
}
