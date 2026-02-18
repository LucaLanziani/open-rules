function resolveRulesBody(target, content) {
    const sourceMode = target.sourceMode === 'reference' ? 'reference' : 'embed';
    return sourceMode === 'reference' ? content.referencedRules : content.mergedRules;
}

function normalizeApplyTo(input) {
    if (typeof input === 'string' && input.trim().length > 0) {
        return toYamlQuotedString(input.trim());
    }

    if (Array.isArray(input)) {
        const cleaned = input
            .filter((item) => typeof item === 'string' && item.trim().length > 0)
            .map((item) => toYamlQuotedString(item.trim()));

        if (cleaned.length > 0) {
            return `[${cleaned.join(', ')}]`;
        }
    }

    return '';
}

function toTitle(input) {
    return input
        .replace(/[-_]+/g, ' ')
        .split(' ')
        .filter(Boolean)
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(' ');
}

function toYamlQuotedString(value) {
    return `'${value.replaceAll("'", "''")}'`;
}

module.exports = {
    resolveRulesBody,
    normalizeApplyTo,
    toTitle
};
