'use strict';
/**
 * WARN review handler
 * Prompts for human approval and logs the decision.
 */
async function handleWarnReview({ sessionId, inquirer, provenanceLogger, stdinIsTTY }) {
    if (!stdinIsTTY) {
        provenanceLogger.logReview(sessionId, false, 'Non-interactive session; review not completed.');
        return { approved: false, reason: 'non_interactive' };
    }

    const answer = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'approve',
            message: 'Warnings detected. Do you approve this output for use?',
            default: false,
        },
    ]);

    const approved = Boolean(answer.approve);
    provenanceLogger.logReview(sessionId, approved, 'User review completed.');
    return { approved, reason: 'user_review' };
}

module.exports = { handleWarnReview };
