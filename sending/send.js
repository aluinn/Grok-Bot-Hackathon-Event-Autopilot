// Command line for sending the approved promo content from shared/promo.json.
//
//   node sending/send.js discord --approved   -> posts the Discord message
//   node sending/send.js ghost --approved     -> creates the newsletter DRAFT in Ghost
//   node sending/send.js whatsapp             -> prints a share link (you send it by hand)
//   node sending/send.js linkedin             -> prints a share link (you send it by hand)
//
// Without --approved, discord and ghost refuse. Nothing ever runs on a timer.
const fs = require("fs");
const path = require("path");
const { sendDiscord, createGhostDraft, whatsappLink, linkedinLink, appendLog } = require("./index");

const PROMO_FILE = path.join(__dirname, "..", "shared", "promo.json");
const REFUSAL = "Refused: nothing is sent without the lead clicking Approve.";

function readPromo() {
  if (!fs.existsSync(PROMO_FILE)) throw new Error(`Could not find ${PROMO_FILE}. Generate the promo content first.`);
  return JSON.parse(fs.readFileSync(PROMO_FILE, "utf8"));
}

async function main() {
  const [channel, ...flags] = process.argv.slice(2);
  const approved = flags.includes("--approved");
  const promo = readPromo();

  if (channel === "discord" || channel === "ghost") {
    if (!approved) {
      console.log(REFUSAL);
      process.exit(1);
    }
  }

  if (channel === "discord") {
    const text = promo.posts && promo.posts.discord;
    const result = await sendDiscord({ text, approved: true });
    const logFile = appendLog({ channel: "discord", ok: result.ok, status: result.status, preview: text });
    console.log(result.ok ? `Sent to Discord (status ${result.status}) at ${result.sentAt}.` : `Discord refused the message (status ${result.status}).`);
    console.log(`Logged in ${logFile}`);
    process.exit(result.ok ? 0 : 1);
  }

  if (channel === "ghost") {
    const { subject, body } = promo.newsletter || {};
    const result = await createGhostDraft({ subject, body, approved: true });
    const logFile = appendLog({ channel: "ghost-draft", ok: result.ok, status: result.status, preview: subject });
    if (result.ok) {
      console.log(`Newsletter draft created in Ghost (not published, not emailed).`);
      if (result.url) console.log(`Open it here to review and send: ${result.url}`);
    } else {
      console.log(`Ghost did not accept the draft (status ${result.status}): ${result.error}`);
    }
    console.log(`Logged in ${logFile}`);
    process.exit(result.ok ? 0 : 1);
  }

  if (channel === "whatsapp") {
    console.log("Nothing was sent. Open this link, check the message, and press Send yourself:");
    console.log(whatsappLink(promo.posts && promo.posts.whatsapp));
    return;
  }

  if (channel === "linkedin") {
    console.log("Nothing was sent. Open this link, check the post, and press Post yourself:");
    console.log(linkedinLink(promo.posts && promo.posts.linkedin));
    return;
  }

  console.log("Usage: node sending/send.js <discord|ghost|whatsapp|linkedin> [--approved]");
  process.exit(1);
}

main().catch((err) => {
  console.log(err.message);
  process.exit(1);
});
