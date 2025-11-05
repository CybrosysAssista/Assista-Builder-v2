/**
 * Path utility functions
 */

/**
 * Normalizes generated file paths to proper Odoo module structure
 * Returns object with cleanDirs array and cleanFile name for file system operations
 */
export function normalizeGeneratedPath(rawPath: string, moduleName: string): { cleanDirs: string[]; cleanFile: string } {
    const allowedTopDirs = new Set(['controllers', 'models', 'security', 'views', 'data', 'static', 'report', 'wizard', 'wizards', '__test__']);
    
    let p = String(rawPath || '')
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/^\.[/]/, '');
    
    const prefix = `${moduleName}/`;
    while (p.startsWith(prefix)) p = p.slice(prefix.length);
    
    let segs = p.split('/').filter(Boolean).map(s => s.trim().replace(/\s+/g, '_'));
    
    if (segs.length >= 2 && !allowedTopDirs.has(segs[0]) && allowedTopDirs.has(segs[1])) {
        segs.shift();
    }
    
    let fileName = segs.length ? segs[segs.length - 1] : p;
    let ext = (fileName.split('.').pop() || '').toLowerCase();
    const hasExt = /\.[A-Za-z0-9]+$/.test(fileName);
    
    if (segs.length >= 1 && !allowedTopDirs.has(segs[0])) {
        if (fileName === '__manifest__.py' || fileName === '__init__.py') {
            segs = [fileName];
        } else if (ext === 'py' || !hasExt) {
            if (!hasExt) {
                fileName = fileName.trim().replace(/\s+/g, '_').replace(/\.+/g, '_').toLowerCase() + '.py';
                ext = 'py';
            }
            if (/controller/.test(fileName)) segs = ['controllers', fileName];
            else if (/wizard/.test(fileName)) segs = ['wizard', fileName];
            else if (/report/.test(fileName)) segs = ['report', fileName];
            else segs = ['models', fileName];
        } else if (ext === 'xml') {
            if (/security/.test(fileName)) { segs = ['security', 'security.xml']; fileName = 'security.xml'; }
            else if (/report/.test(fileName)) segs = ['report', fileName];
            else if (/menu/.test(fileName)) { segs = ['views', 'menus.xml']; fileName = 'menus.xml'; }
            else if (/template/.test(fileName)) { segs = ['views', 'templates.xml']; fileName = 'templates.xml'; }
            else {
                if (!/_views\.xml$/i.test(fileName)) {
                    fileName = fileName.replace(/\.xml$/i, '').replace(/\s+/g, '_') + '_views.xml';
                }
                segs = ['views', fileName];
            }
        } else if (ext === 'csv') {
            segs = ['security', fileName];
        } else if (/(png|jpg|jpeg|gif|svg)$/i.test(ext)) {
            if (/icon\.(png|jpg|jpeg|gif|svg)$/i.test(fileName)) segs = ['static', 'description', fileName];
            else segs = ['static', 'img', fileName];
        } else if (ext === 'css') {
            segs = ['static', 'css', fileName];
        } else if (ext === 'js') {
            segs = ['static', 'js', fileName];
        } else if (ext === 'md') {
            segs = [fileName];
        } else {
            const base = fileName.replace(/\.[^.]+$/, '');
            const coerced = base.trim().replace(/\s+/g, '_').replace(/\.+/g, '_').toLowerCase() + '.py';
            segs = ['models', coerced];
            fileName = coerced;
            ext = 'py';
        }
    }
    
    if ((ext === 'py' || !hasExt) && /^test_.*\.py$/i.test(fileName)) {
        segs = ['__test__', fileName];
    }
    
    const cleanFile = segs.pop() || fileName;
    const cleanDirs = segs;
    
    // Normalize singular/plural for wizard folder
    if (cleanDirs[0] === 'wizards') cleanDirs[0] = 'wizard';
    
    return { cleanDirs, cleanFile };
}

/**
 * Enforces module-relative path policy and returns normalized module-relative path string
 * Used for path tracking and validation (returns format: moduleName/path/to/file)
 */
export function enforcePathPolicy(rawPath: string, moduleName: string): string | null {
    try {
        if (!rawPath) return null;
        let p = String(rawPath).trim().replace(/\\/g, '/').replace(/^\.\/?/, '');
        
        // Strip any repeated leading "<moduleName>/" to avoid nested paths
        const prefix = `${moduleName}/`;
        while (p.startsWith(prefix)) {
            p = p.slice(prefix.length);
        }
        
        // Ensure module prefix
        if (!p.startsWith(moduleName + '/')) {
            p = `${moduleName}/` + p;
        }
        
        // Split into parts
        const rest = p.slice(moduleName.length + 1); // after moduleName/
        const hasSlash = rest.includes('/');
        const lower = p.toLowerCase();
        
        // Never allow manifest under subfolders; remap to root manifest
        if (lower.endsWith('/__manifest__.py') && lower !== `${moduleName}/__manifest__.py`) {
            p = `${moduleName}/__manifest__.py`;
            return p;
        }
        
        // Keep root-only for manifest and root __init__.py
        if (!hasSlash) {
            if (lower.endsWith('__manifest__.py')) return `${moduleName}/__manifest__.py`;
            if (lower.endsWith('__init__.py')) return `${moduleName}/__init__.py`;
            const ext = (p.split('.').pop() || '').toLowerCase();
            // Place orphan .py into models/
            if (ext === 'py') return `${moduleName}/models/${rest}`;
            // Place orphan .xml into views/
            if (ext === 'xml') {
                const base = rest.endsWith('_views.xml') ? rest : rest.replace(/\.xml$/i, '_views.xml');
                return `${moduleName}/views/${base}`;
            }
            // Place orphan .csv likely into security/
            if (ext === 'csv') return `${moduleName}/security/${rest}`;
        }
        
        // Ensure views end with _views.xml when under views/
        if (lower.startsWith(`${moduleName}/views/`) && lower.endsWith('.xml') && !lower.endsWith('_views.xml') && !/menu\.xml$/i.test(lower)) {
            p = p.replace(/\.xml$/i, '_views.xml');
        }
        
        // Ensure models live under models/
        if (lower.endsWith('.py') && !lower.startsWith(`${moduleName}/models/`) && !lower.endsWith('/__init__.py')) {
            // If under wrong dir, move to models/
            const fname = p.substring(p.lastIndexOf('/') + 1);
            p = `${moduleName}/models/${fname}`;
        }
        
        // Security CSV under security/
        if (lower.endsWith('.csv') && !lower.startsWith(`${moduleName}/security/`)) {
            const fname = p.substring(p.lastIndexOf('/') + 1);
            p = `${moduleName}/security/${fname}`;
        }
        
        // Root-only files allowed: __manifest__.py, __init__.py
        if (lower.startsWith(`${moduleName}/`) && !lower.includes('/')) {
            if (!(lower.endsWith('__manifest__.py') || lower.endsWith('__init__.py'))) {
                return null;
            }
        }
        
        return p.replace(/\/\/+/, '/');
    } catch {
        return null;
    }
}

/**
 * Validates and normalizes a path for file writing operations
 * Returns normalized segments for directory structure validation
 */
export function validateAndNormalizePath(
    rawPath: string,
    moduleName: string
): { normalized: string; segments: string[]; fileName: string } | null {
    // Guard against parent escapes
    if (rawPath.includes('..')) {
        return null;
    }
    
    // Normalize path
    let relativePath = String(rawPath || '')
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/^\.\//, '');
    
    // Strip any repeated leading "<moduleName>/"
    const prefix = `${moduleName}/`;
    while (relativePath.startsWith(prefix)) {
        relativePath = relativePath.slice(prefix.length);
    }
    
    // Defensive: if the first segment equals moduleName (case-insensitive), drop it
    const probeSegs = relativePath.split('/').filter(Boolean);
    if (probeSegs.length && probeSegs[0].toLowerCase() === moduleName.toLowerCase()) {
        probeSegs.shift();
        relativePath = probeSegs.join('/');
    }
    
    // Sanitize each segment: trim whitespace and replace spaces with underscores
    let segments = relativePath
        .split('/')
        .map(s => s.trim().replace(/\s+/g, '_'))
        .filter(Boolean);
    
    const fileName = segments.pop() || relativePath;
    
    // Enforce structure at write-time
    const allowedTop = new Set(['models', 'views', 'security', 'data', 'report', 'wizards', 'static', 'controllers', 'wizard', '__test__']);
    
    // If AI added an extra wrapper (e.g., "estate/models/..."), drop the first segment
    if (segments.length >= 2 && !allowedTop.has(String(segments[0])) && allowedTop.has(String(segments[1]))) {
        segments.shift();
    }
    
    // After potential shift, compute top/atRoot
    let top = segments[0];
    const atRoot = segments.length === 0;
    
    // Block any nested manifest (e.g., models/__manifest__.py)
    if (!atRoot && fileName === '__manifest__.py') {
        return null;
    }
    
    // Root-level files allowed only for __manifest__.py and __init__.py
    if (atRoot && !(fileName === '__manifest__.py' || fileName === '__init__.py')) {
        return null;
    }
    
    // If not root and top-level is invalid, try to remap based on extension
    if (!atRoot && !allowedTop.has(String(top || ''))) {
        const ext = (fileName.split('.').pop() || '').toLowerCase();
        if (ext === 'py') {
            segments = ['models', ...segments];
        } else if (ext === 'xml') {
            segments = ['views', ...segments];
        } else if (ext === 'csv') {
            segments = ['security', ...segments];
        } else if (fileName === '__manifest__.py' || fileName === '__init__.py') {
            // Move special files to root
            segments = [];
        } else {
            return null;
        }
        top = segments[0];
    }
    
    // Dir-specific basic checks
    if (top === 'models' && !/\.py$/i.test(fileName) && fileName !== '__init__.py') {
        return null;
    }
    if (top === 'views' && !/\.xml$/i.test(fileName)) {
        return null;
    }
    if (top === 'security' && !/\.(csv|xml)$/i.test(fileName)) {
        return null;
    }
    
    const normalized = segments.length ? `${moduleName}/${segments.join('/')}/${fileName}`.replace(/\/+/g, '/') : `${moduleName}/${fileName}`;
    
    return { normalized, segments, fileName };
}

