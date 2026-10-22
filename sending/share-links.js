// Builds "share" links that open WhatsApp or LinkedIn with the message pre-filled.
// Nothing is sent here: the lead presses Send inside the app themselves.
// (WhatsApp and LinkedIn do not allow tools to post on a person's behalf.)

function whatsappLink(text) {
  return `https://wa.me/?text=${encodeURIComponent(text || "")}`;
}

function linkedinLink(text) {
  return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text || "")}`;
}

module.exports = { whatsappLink, linkedinLink };
