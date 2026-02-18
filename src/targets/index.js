const { renderCopilotTarget } = require('./copilot');
const { renderCursorTarget } = require('./cursor');
const { renderClaudeTarget } = require('./claude');
const { renderGenericTarget } = require('./generic');

const targetRenderers = {
    copilot: renderCopilotTarget,
    cursor: renderCursorTarget,
    claude: renderClaudeTarget
};

function renderTargetContent(target, content) {
    const renderer = targetRenderers[target.name] || renderGenericTarget;
    return renderer(target, content);
}

module.exports = {
    renderTargetContent,
    targetRenderers
};
