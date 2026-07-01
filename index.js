const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const fs = require("fs-extra");

fs.ensureDirSync("./data");

// ---------------- FILES ----------------
const files = {
 roles: "./data/roles.json",
 warnings: "./data/warnings.json",
 mute: "./data/mute.json",
 spam: "./data/spam.json",
 levels: "./data/levels.json",
 games: "./data/games.json",
 votes: "./data/votes.json"
};

for (let k in files) {
 if (!fs.existsSync(files[k])) fs.writeJsonSync(files[k], {});
}

// ---------------- LOAD DATA ----------------
let config = fs.readJsonSync("./config.json");

let roles = fs.readJsonSync(files.roles);
let warnings = fs.readJsonSync(files.warnings);
let mute = fs.readJsonSync(files.mute);
let spam = fs.readJsonSync(files.spam);
let levels = fs.readJsonSync(files.levels);
let games = fs.readJsonSync(files.games);
let votes = fs.readJsonSync(files.votes);

// ---------------- CLIENT (FIXED) ----------------
const client = new Client({
 authStrategy: new LocalAuth(),
 puppeteer: {
  headless: true,
  executablePath: "/usr/bin/chromium",
  args: [
   "--no-sandbox",
   "--disable-setuid-sandbox"
  ]
 }
});

// ---------------- ROLE SYSTEM ----------------
function role(u) {
 return roles[u] || "user";
}

function lvl(r) {
 return { user: 0, mod: 1, admin: 2, "co-owner": 3, owner: 4 }[r] || 0;
}

function has(u, need) {
 return lvl(role(u)) >= lvl(need);
}

function isOwner(u) {
 return role(u) === "owner";
}

function can(actor, target) {
 const a = role(actor);
 const t = role(target);
 if (!target) return false;
 if (t === "owner") return false;
 if (t === "co-owner" && !isOwner(actor)) return false;
 return lvl(a) > lvl(t);
}

// ---------------- NORMALIZE ----------------
function norm(t = "") {
 return t
  .toLowerCase()
  .replace(/0/g, "o")
  .replace(/1/g, "i")
  .replace(/3/g, "e")
  .replace(/4/g, "a")
  .replace(/5/g, "s")
  .replace(/[\s_\-*\.]/g, "");
}

const badwords = ["kokot", "pica", "curak", "zmrd", "jebat"];

// ---------------- XP SYSTEM ----------------
let xpCD = {};

function xp(u, chat) {
 if (!levels[u]) levels[u] = { xp: 0, level: 1 };

 if (!xpCD[u] || Date.now() - xpCD[u] > 60000) {
  xpCD[u] = Date.now();

  levels[u].xp += config.xpPerMessage || 5;

  if (levels[u].xp >= levels[u].level * 100) {
   levels[u].xp = 0;
   levels[u].level++;

   chat.sendMessage("⭐ LEVEL UP " + levels[u].level);
  }
 }
}

// ---------------- SAVE HELP ----------------
function save(file, data) {
 fs.writeJsonSync(file, data);
}

// ---------------- EVENTS ----------------
client.on("qr", qr => qrcode.generate(qr, { small: true }));
client.on("ready", () => console.log("BOT ONLINE"));

// ---------------- MESSAGE HANDLER ----------------
client.on("message", async m => {
 try {
  const chat = await m.getChat();
  if (!chat.isGroup) return;

  const u = m.author || m.from;
  const txt = norm(m.body || "");

  // XP
  xp(u, chat);

  // ---------------- SPAM ----------------
  if (!spam[u]) spam[u] = [];
  spam[u].push(Date.now());
  spam[u] = spam[u].filter(t => Date.now() - t < (config.spamTime || 5000));

  if (spam[u].length > (config.spamLimit || 5) && !isOwner(u)) {
   await m.delete(true);
   return chat.sendMessage("⚠️ spam");
  }

  // ---------------- BADWORDS ----------------
  for (let w of badwords) {
   if (txt.includes(norm(w)) && !isOwner(u)) {
    warnings[u] = (warnings[u] || 0) + 1;
    await m.delete(true);

    if (warnings[u] >= (config.maxWarnings || 3)) {
     mute[u] = Date.now() + (config.muteTime || 60000);
     chat.sendMessage("🔇 mute");
    } else {
     chat.sendMessage("⚠️ vulgarizmus");
    }

    save(files.warnings, warnings);
    save(files.mute, mute);

    return;
   }
  }

  if (txt.includes("bober")) return m.reply("🦫 super kamarát");

  // ---------------- PREFIX ----------------
  if (!m.body.startsWith(config.prefix)) return;

  const args = m.body.slice(1).split(" ");
  const cmd = args.shift().toLowerCase();

  // ROLE
  if (cmd === "role") return m.reply(role(u));

  // GROUP LIST
  if (cmd === "groups") {
   const chats = await client.getChats();
   const g = chats.filter(c => c.isGroup);
   return m.reply(g.map(x => x.name + " | " + x.id._serialized).join("\n"));
  }

  // PROMOTE
  if (cmd === "promote") {
   if (!has(u, "admin")) return;
   const t = m.mentionedIds[0];
   if (!can(u, t)) return;

   roles[t] = "admin";
   save(files.roles, roles);

   chat.promoteParticipants([t]);
  }

  // DEMOTE
  if (cmd === "demote") {
   if (!has(u, "admin")) return;
   const t = m.mentionedIds[0];
   if (!can(u, t)) return;

   roles[t] = "user";
   save(files.roles, roles);

   chat.demoteParticipants([t]);
  }

  // ---------------- VOTE ----------------
  if (cmd === "vote") {
   const target = m.mentionedIds[0];
   if (!target) return;

   if (votes[chat.id._serialized]) return m.reply("vote running");

   votes[chat.id._serialized] = {
    target,
    yes: {},
    no: {},
    expires: Date.now() + 60000
   };

   save(files.votes, votes);

   chat.sendMessage("🗳️ VOTE START 👍 👎");
  }

 } catch (err) {
  console.log("MSG ERROR:", err);
 }
});

// ---------------- REACTIONS FIXED ----------------
client.on("message_reaction", async r => {
 try {
  const chatId = r.msgId.remote;
  const v = votes[chatId];
  if (!v) return;

  const user = r.senderId;
  const em = r.reaction;

  delete v.yes[user];
  delete v.no[user];

  if (em === "👍") v.yes[user] = true;
  if (em === "👎") v.no[user] = true;

  save(files.votes, votes);
 } catch (e) {}
});

// ---------------- VOTE ENGINE ----------------
setInterval(async () => {
 for (let id in votes) {
  let v = votes[id];
  if (Date.now() < v.expires) continue;

  try {
   const chat = await client.getChatById(id);

   const yes = Object.keys(v.yes).length;
   const no = Object.keys(v.no).length;

   if (yes > no) {
    chat.sendMessage("⚖️ APPROVED");
   } else {
    chat.sendMessage("❌ REJECTED");
   }

   delete votes[id];
   save(files.votes, votes);

  } catch (e) {
   console.log("VOTE ERROR:", e);
  }
 }
}, 5000);

// ---------------- START ----------------
client.initialize();
