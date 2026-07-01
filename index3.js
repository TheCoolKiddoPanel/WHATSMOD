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
 votes: "./data/votes.json"
};

for (let k in files) {
 if (!fs.existsSync(files[k])) fs.writeJsonSync(files[k], {});
}

// ---------------- CONFIG ----------------
const config = fs.readJsonSync("./config.json");

// ---------------- DATA ----------------
let roles = fs.readJsonSync(files.roles);
let warnings = fs.readJsonSync(files.warnings);
let mute = fs.readJsonSync(files.mute);
let spam = fs.readJsonSync(files.spam);
let levels = fs.readJsonSync(files.levels);
let votes = fs.readJsonSync(files.votes);

// ---------------- CLIENT ----------------
const client = new Client({
 authStrategy: new LocalAuth(),
 puppeteer: {
  headless: true,
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-setuid-sandbox"]
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

function can(actor, target) {
 if (!target) return false;
 const a = role(actor);
 const t = role(target);
 if (t === "owner") return false;
 return lvl(a) > lvl(t);
}

// ---------------- SAVE ----------------
function save(file, data) {
 fs.writeJsonSync(file, data);
}

// ---------------- NORMALIZE ----------------
function norm(t = "") {
 return t.toLowerCase().replace(/[\s_\-*\.]/g, "");
}

// ---------------- SYSTEMS ----------------
let xpCD = {};
const badwords = ["kokot", "pica", "curak", "zmrd", "jebat"];

// ---------------- READY ----------------
client.on("qr", qr => qrcode.generate(qr, { small: true }));
client.on("ready", () => console.log("BOT ONLINE"));

// ---------------- MESSAGE ----------------
client.on("message", async m => {
 try {

  const chat = await m.getChat();
  if (!chat.isGroup) return;

  const u = m.author || m.from;
  const txt = norm(m.body || "");

  console.log(m.fromMe ? "[BOT]" : "[USER]", m.body);

  // ---------------- PREFIX FIX ----------------
  if (!m.body || !m.body.startsWith(config.prefix)) return;

  const args = m.body.slice(config.prefix.length).trim().split(" ");
  const cmd = args.shift().toLowerCase();

  // ---------------- ROLE COMMAND ----------------
  if (cmd === "role") {
   return m.reply("Your role: " + role(u));
  }

  if (cmd === "setrole") {
   if (!has(u, "owner")) return;

   const t = m.mentionedIds[0];
   const r = args[0];

   if (!t || !r) return m.reply("!setrole @user role");

   roles[t] = r;
   save(files.roles, roles);

   return chat.sendMessage("✅ role set: " + r);
  }

  if (cmd === "promote") {
   if (!has(u, "admin")) return;

   const t = m.mentionedIds[0];
   if (!can(u, t)) return;

   roles[t] = "admin";
   save(files.roles, roles);

   await chat.promoteParticipants([t]);
   return chat.sendMessage("⬆️ promoted");
  }

  if (cmd === "demote") {
   if (!has(u, "admin")) return;

   const t = m.mentionedIds[0];
   if (!can(u, t)) return;

   roles[t] = "user";
   save(files.roles, roles);

   await chat.demoteParticipants([t]);
   return chat.sendMessage("⬇️ demoted");
  }

  // ---------------- MODERATION ----------------
  if (cmd === "kick") {
   if (!has(u, "admin")) return;

   const t = m.mentionedIds[0];
   if (!t || !can(u, t)) return;

   await chat.removeParticipants([t]);
   return chat.sendMessage("👢 kicked");
  }

  if (cmd === "mute") {
   if (!has(u, "admin")) return;

   const t = m.mentionedIds[0];
   if (!t || !can(u, t)) return;

   mute[t] = Date.now() + (config.muteTime || 60000);
   save(files.mute, mute);

   return chat.sendMessage("🔇 muted");
  }

  // ---------------- GROUPS ----------------
  if (cmd === "groups") {
   const chats = await client.getChats();
   const g = chats.filter(c => c.isGroup);
   return m.reply(g.map(x => x.name).join("\n"));
  }

 } catch (e) {
  console.log("ERROR:", e);
 }
});

// ---------------- START ----------------
client.initialize();
