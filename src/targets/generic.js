const { resolveRulesBody, toTitle } = require('./helpers');

function renderGenericTarget(target, content) {
    const rulesBody = resolveRulesBody(target, content);

    return [
        `# ${toTitle(target.name)} Instructions`,
        '',
        rulesBody,
        ''
    ].join('\n');
}

module.exports = {
    renderGenericTarget
};
