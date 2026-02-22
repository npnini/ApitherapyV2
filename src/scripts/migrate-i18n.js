#!/usr/bin/env node
/**
 * migrate-i18n.js
 *
 * Converts a React TSX file from react-i18next t() calls to a
 * <T> component / useT() hook pattern for on-the-fly translation.
 *
 * Usage:
 *   node migrate-i18n.js <path-to-page.tsx> <path-to-en.json>
 *
 * Output:
 *   Creates <path-to-page.migrated.tsx> alongside the original.
 *   Prints a summary of what was converted and what needs manual review.
 *
 * What it handles automatically:
 *   {t('key')}                         → <T>english text</T>
 *   ={t('key')}                        → ={useT('english text')}   (prop values)
 *   setError(t('key'))                 → setError(useT('english text'))
 *   t('key', 'fallback string')        → uses the fallback string directly
 *
 * What it flags for manual review (leaves a TODO comment):
 *   t('key', { var: value })           → interpolation, needs manual handling
 *   t('key') where key not in en.json  → missing translation key
 */

const fs = require('fs');
const path = require('path');

// ─── Argument parsing ────────────────────────────────────────────────────────

const [, , tsxPath, jsonPath] = process.argv;

if (!tsxPath || !jsonPath) {
    console.error('Usage: node migrate-i18n.js <path-to-page.tsx> <path-to-en.json>');
    process.exit(1);
}

if (!fs.existsSync(tsxPath)) {
    console.error(`❌  TSX file not found: ${tsxPath}`);
    process.exit(1);
}

if (!fs.existsSync(jsonPath)) {
    console.error(`❌  JSON file not found: ${jsonPath}`);
    process.exit(1);
}

// ─── Load files ──────────────────────────────────────────────────────────────

let source = fs.readFileSync(tsxPath, 'utf8');
const rawJson = fs.readFileSync(jsonPath, 'utf8');

let translations;
try {
    translations = JSON.parse(rawJson);
} catch (e) {
    console.error('❌  Failed to parse en.json:', e.message);
    process.exit(1);
}

// ─── Flatten nested JSON keys (supports dot-notation keys like "a.b.c") ──────

function flattenJson(obj, prefix = '') {
    return Object.entries(obj).reduce((acc, [key, value]) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            Object.assign(acc, flattenJson(value, fullKey));
        } else {
            acc[fullKey] = String(value);
        }
        return acc;
    }, {});
}

const flat = flattenJson(translations);

// ─── Stats tracking ──────────────────────────────────────────────────────────

const stats = {
    jsxReplaced: 0,       // {t('key')} → <T>text</T>
    propReplaced: 0,      // ={t('key')} → ={useT('text')}
    inlineReplaced: 0,    // t('key') in JS expressions → useT('text')
    fallbackUsed: 0,      // t('key', 'fallback') → used fallback
    interpolations: 0,    // t('key', { ... }) → flagged
    missingKeys: 0,       // key not found in en.json
    missingKeyList: [],
    interpolationList: [],
    replacedKeyList: new Set(), // NEW: Track successfully replaced keys
};

// ─── Helper: resolve a key to English text ───────────────────────────────────

function resolveKey(key, fallback = null) {
    if (flat[key] !== undefined) {
        stats.replacedKeyList.add(key); // Track this key
        return flat[key];
    }
    if (fallback) {
        stats.fallbackUsed++;
        return fallback;
    }
    stats.missingKeys++;
    stats.missingKeyList.push(key);
    return null;
}

// ─── Escape text for safe use inside JSX and strings ─────────────────────────

function escapeForJSX(text) {
    // Escape { and } so JSX doesn't interpret them as expressions
    return text.replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
}

function escapeForString(text) {
    // Escape backticks and backslashes for template literals / strings
    return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/'/g, "\\'");
}

// ─── Core replacement logic ───────────────────────────────────────────────────
//
// We process the file in one pass using a regex that matches all t() call shapes:
//
//   t('key')
//   t('key', 'fallback string')
//   t('key', `fallback string`)
//   t('key', { interpolation object })
//
// For each match we look at what's immediately around it to decide the output form.

// This regex captures:
//   group 1: the key (single or double quoted)
//   group 2: the second argument if it exists (everything up to the closing paren)
const T_CALL_REGEX = /\bt\((['"])([\w.]+)\1(?:,\s*([\s\S]*?))?\)/g;

// We need to know the context of each match. We do a single-pass replacement
// by scanning the string and tracking context manually.

function migrate(source) {
    let result = '';
    let lastIndex = 0;

    // Reset regex
    T_CALL_REGEX.lastIndex = 0;

    let match;
    while ((match = T_CALL_REGEX.exec(source)) !== null) {
        const fullMatch = match[0];          // e.g.  t('acupuncturePoints')
        const key = match[2];               // e.g.  acupuncturePoints
        const secondArg = match[3]?.trim(); // e.g.  'fallback' or { code: x }

        const matchStart = match.index;
        const matchEnd = match.index + fullMatch.length;

        // Append everything before this match unchanged
        result += source.slice(lastIndex, matchStart);
        lastIndex = matchEnd;

        // ── Detect interpolation: second arg is an object { ... } ───────────
        if (secondArg && secondArg.startsWith('{')) {
            // Can't auto-migrate interpolations — leave original + add TODO
            stats.interpolations++;
            stats.interpolationList.push(`  key: "${key}" — ${fullMatch}`);
            result += `{/* TODO: interpolation — migrate manually */ ${fullMatch}}`;
            continue;
        }

        // ── Resolve the English text ─────────────────────────────────────────
        let fallback = null;
        if (secondArg) {
            // Strip surrounding quotes from fallback string
            const fbMatch = secondArg.match(/^['"`]([\s\S]*?)['"`]$/);
            if (fbMatch) fallback = fbMatch[1];
        }

        const englishText = resolveKey(key, fallback);

        if (!englishText) {
            // Key not found and no fallback — leave original + add TODO
            result += `{/* TODO: key "${key}" not found in en.json */ ${fullMatch}}`;
            continue;
        }

        // ── Determine context: what's immediately before and after ───────────
        const before = source.slice(Math.max(0, matchStart - 60), matchStart);
        const after = source.slice(matchEnd, Math.min(source.length, matchEnd + 10));

        // Case 1: JSX expression — {t('key')}
        // Detected by: the character just before the match (ignoring whitespace) is '{'
        // and the char just after is '}'
        const charBefore = source[matchStart - 1];
        const charAfter = source[matchEnd];

        if (charBefore === '{' && charAfter === '}') {
            // Replace the whole {t('key')} with <T>text</T>
            // We need to back up one char to replace the '{' we already emitted
            result = result.slice(0, -1); // remove the '{' we already appended
            result += `<T>${escapeForJSX(englishText)}</T>`;
            lastIndex = matchEnd + 1; // skip the closing '}'
            stats.jsxReplaced++;
            continue;
        }

        // Case 2: Prop value — someprop={t('key')} or someAttr={t('key')}
        // Detected by: before the '{' is '=' and a prop name
        const propPattern = /=\{$/;
        if (propPattern.test(before.trimEnd() + charBefore)) {
            // Same as JSX — useT() for string context inside props
            result = result.slice(0, -1); // remove the '{'
            result += `<T>${escapeForJSX(englishText)}</T>`;
            lastIndex = matchEnd + 1;
            stats.propReplaced++;
            continue;
        }

        // Case 3: String context — t('key') used as a value in JS (not JSX)
        // e.g. setError(t('key')), const msg = t('key'), etc.
        // Wrap with useT() which is the hook equivalent for string contexts
        result += `useT('${escapeForString(englishText)}')`;
        stats.inlineReplaced++;
    }

    // Append the remainder of the file
    result += source.slice(lastIndex);
    return result;
}

// ─── Run the migration ────────────────────────────────────────────────────────

let migrated = migrate(source);

// ─── Update imports ───────────────────────────────────────────────────────────
//
// Remove:  import { useTranslation } from 'react-i18next';
//          const { t, i18n } = useTranslation();
//          const { t } = useTranslation();
//
// Add:     import { T, useT } from '../components/T';
//          (path is configurable below)

const T_IMPORT_PATH = '../components/T'; // ← adjust this to your project structure

// Remove react-i18next import line
migrated = migrated.replace(/^import\s+\{[^}]*useTranslation[^}]*\}\s+from\s+['"]react-i18next['"];\s*\n/m, '');

// Remove useTranslation hook call lines  (handles both { t } and { t, i18n } forms)
migrated = migrated.replace(/^\s*const\s+\{[^}]*\bt\b[^}]*\}\s*=\s*useTranslation\([^)]*\);\s*\n/mg, '');

// Also remove any remaining bare i18n language reads if t was the only reason for the hook
// (const currentLang = i18n.language; lines can stay — they use i18n for language detection,
//  not for translation. Flag them with a comment instead.)
migrated = migrated.replace(
    /const currentLang = i18n\.language;/g,
    '// NOTE: currentLang still uses i18n.language — keep if you use i18n for lang detection, or replace with your TranslationContext'
);

// Add the new import after the last existing import line
const lastImportMatch = [...migrated.matchAll(/^import .+ from .+;$/mg)].pop();
if (lastImportMatch) {
    const insertPos = lastImportMatch.index + lastImportMatch[0].length;
    migrated = migrated.slice(0, insertPos) +
        `\nimport { T, useT } from '${T_IMPORT_PATH}';` +
        migrated.slice(insertPos);
}

// ─── Write output file ────────────────────────────────────────────────────────

const ext = path.extname(tsxPath);
const base = tsxPath.slice(0, -ext.length);
const outputPath = `${base}.migrated${ext}`;

fs.writeFileSync(outputPath, migrated, 'utf8');

// ─── Print summary ────────────────────────────────────────────────────────────

console.log('\n✅  Migration complete!\n');
console.log(`📄  Output: ${outputPath}\n`);
console.log('─────────────────────────────────────────────');
console.log(`  JSX replacements    {t('key')} → <T>text</T>        : ${stats.jsxReplaced}`);
console.log(`  Prop replacements   ={t('key')} → =<T>text</T>      : ${stats.propReplaced}`);
console.log(`  Inline replacements t('key') → useT('text')         : ${stats.inlineReplaced}`);
console.log(`  Fallback strings used                                : ${stats.fallbackUsed}`);
console.log('─────────────────────────────────────────────');

if (stats.interpolations > 0) {
    console.log(`\n⚠️   ${stats.interpolations} interpolation(s) need manual migration:`);
    stats.interpolationList.forEach(l => console.log(`     ${l}`));
}

if (stats.missingKeys > 0) {
    console.log(`\n❌  ${stats.missingKeys} key(s) not found in en.json:`);
    stats.missingKeyList.forEach(k => console.log(`     "${k}"`));
    console.log('    These were left as-is with a TODO comment in the output file.');
}

if (stats.interpolations === 0 && stats.missingKeys === 0) {
    console.log('\n🎉  No manual fixes needed — all keys resolved cleanly.');
}

if (stats.replacedKeyList.size > 0) {
    console.log(`\n📦  Successfully migrated keys (you can now move these to "__migrated__" in JSON):`);
    const sortedKeys = Array.from(stats.replacedKeyList).sort();
    sortedKeys.forEach(k => console.log(`     "${k}"`));
}

console.log('\n📝  Next steps:');
console.log('    1. Create src/components/T.tsx (already done in this project)');
console.log('    2. Review any TODO comments in the output file');
console.log(`    3. If i18n is still used for language detection (currentLang),`);
console.log(`       replace it with your TranslationContext's language value`);
console.log('    4. Test the page, then rename .migrated.tsx → .tsx');
console.log('');
