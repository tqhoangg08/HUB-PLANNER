const getWritableStylesheet = () => {
    const sameOriginSheets = Array.from(document.styleSheets).filter((sheet) => {
        if (!sheet.href) return true;
        try {
            return new URL(sheet.href).origin === window.location.origin;
        } catch {
            return false;
        }
    });

    for (const sheet of sameOriginSheets) {
        try {
            void sheet.cssRules;
            return sheet as CSSStyleSheet;
        } catch {
            continue;
        }
    }

    return null;
};

export const setRuntimeStyleRule = (
    key: string,
    selector: string,
    declarations: Record<string, string | number | null | undefined>,
) => {
    if (typeof document === 'undefined') return;

    const sheet = getWritableStylesheet();
    if (!sheet) return;

    const body = Object.entries(declarations)
        .filter(([, value]) => value !== null && value !== undefined && value !== '')
        .map(([property, value]) => `${property}: ${value};`)
        .join(' ');

    if (!body) return;

    try {
        const existingRule = runtimeRules.get(key);
        if (existingRule) {
            existingRule.style.cssText = body;
            return;
        }

        const index = sheet.cssRules.length;
        sheet.insertRule(`${selector} { ${body} }`, index);
        const insertedRule = sheet.cssRules[index];
        if (insertedRule instanceof CSSStyleRule) {
            runtimeRules.set(key, insertedRule);
        }
    } catch {
        // Invalid dynamic values should not break rendering.
    }
};
const runtimeRules = new Map<string, CSSStyleRule>();
