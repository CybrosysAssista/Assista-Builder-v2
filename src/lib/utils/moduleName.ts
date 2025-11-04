/**
 * Utility functions for Odoo module name sanitization
 */

/**
 * Create a concise, filesystem-safe Odoo module slug from free text
 * @example "create a real estate module" -> "real_estate"
 */
export function sanitizeModuleName(input: string): string {
    try {
        const src = String(input || '').toLowerCase();
        const tokens = src.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
        const stop = new Set([
            'create', 'make', 'build', 'generate', 'new', 'project', 'app', 'application', 'module', 'odoo',
            'a', 'an', 'the', 'this', 'that', 'please', 'for', 'to', 'of', 'and', 'with', 'in', 'on', 'from', 'when', 'i', 'need', 'it', 'is', 'be', 'should', 'then'
        ]);
        const kept = tokens.filter(w => !stop.has(w));
        const core = (kept.length ? kept : tokens).slice(0, 3);
        let slug = core.join('_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
        slug = slug.replace(/[^a-z0-9_]/g, '').slice(0, 50);
        if (!slug || !/^[a-z]/.test(slug)) {
            const a = kept[0] || tokens[0] || 'module';
            const b = kept[1] || tokens[1] || 'gen';
            slug = (a + '_' + b).replace(/[^a-z0-9_]/g, '').slice(0, 50);
        }
        return slug || 'my_module';
    } catch {
        return 'my_module';
    }
}
