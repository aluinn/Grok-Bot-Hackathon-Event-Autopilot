// One place to import everything in the sending folder.
// The dashboard server can require("../../sending") and call these after the Approve click.
// Every send function requires { approved: true } or it refuses.
const { sendDiscord } = require("./discord");
const { createGhostDraft } = require("./ghost");
const { whatsappLink, linkedinLink } = require("./share-links");
const { appendLog, LOG_FILE } = require("./log");

module.exports = { sendDiscord, createGhostDraft, whatsappLink, linkedinLink, appendLog, LOG_FILE };
