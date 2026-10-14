import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// base derives from DOCS_BASE so the site mounts under the portal prefix
// (/apps/rb-plans); the Dockerfile places the built files under the same prefix
// because Astro's output is flat (INT-FOUNDRY-018, ADR-023).
export default defineConfig({
    base: process.env.DOCS_BASE || '/',
    integrations: [
        starlight({
            title: 'RB Plans',
            description:
                'Create and manage REF-Plan project plans - one write path, immutable versions, standalone HTML export.',
            components: { SiteTitle: './src/components/SiteTitle.astro' },
            logo: { light: './src/assets/rb-lockup-light.svg', dark: './src/assets/rb-lockup-dark.svg', alt: 'Software Engineering, RB' },
            customCss: ['@psa-department-of-engineering/starlight-theme/styles.css', './src/styles/rb.css'],
            head: [
                {
                    tag: 'link',
                    attrs: { rel: 'icon', href: `${process.env.DOCS_BASE || '/'}favicon.svg`, type: 'image/svg+xml' },
                },
            ],
            lastUpdated: true,
            sidebar: [
                { label: 'Start here', items: ['index', 'brand'] },
                { label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }] },
                { label: 'Decisions', items: [{ autogenerate: { directory: 'decisions' } }] },
            ],
        }),
    ],
});
