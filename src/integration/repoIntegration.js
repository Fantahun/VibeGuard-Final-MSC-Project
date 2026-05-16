'use strict';
/**
 * Repository/CI Integration Adapter
 * Writes approved artifacts and metadata to an integration output directory.
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config/default');

class RepoIntegration {
    /**
     * Deliver approved code to the integration output directory.
     * @param {string} code
     * @param {object} metadata
     * @param {string} [outputPath]
     * @returns {object|null}
     */
    deliverApproved(code, metadata, outputPath) {
        if (!config.integration?.enabled) return null;

        const baseDir = path.resolve(config.integration.outputDir);
        if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

        const sessionId = metadata.sessionId || 'session_unknown';
        const codePath = outputPath
            ? path.resolve(outputPath)
            : path.join(baseDir, `${sessionId}.js`);

        if (!outputPath) {
            fs.writeFileSync(codePath, code, 'utf8');
        }

        const metaPath = path.join(baseDir, `${sessionId}.meta.json`);
        fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');

        return { codePath, metaPath };
    }
}

module.exports = new RepoIntegration();
