const { resolveRulesBody, normalizeApplyTo } = require('./helpers');

function renderCursorTarget(target, content) {
    const rulesBody = resolveRulesBody(target, content);
    const frontmatter = [
        '---',
        'description: Open Rules (generated)',
        'alwaysApply: true'
    ];

    const applyTo = normalizeApplyTo(target.applyTo);
    if (applyTo.length > 0) {
        frontmatter.push(`applyTo: ${applyTo}`);
    }

    return [
        ...frontmatter,
        '---',
        '',
        rulesBody,
        ''
    ].join('\n');
}

module.exports = {
    renderCursorTarget
};
