const { resolveRulesBody } = require('./helpers');

function renderClaudeTarget(target, content) {
    const rulesBody = resolveRulesBody(target, content);

    return [
        '# Claude Code Instructions',
        '',
        rulesBody,
        ''
    ].join('\n');
}

module.exports = {
    renderClaudeTarget
};
