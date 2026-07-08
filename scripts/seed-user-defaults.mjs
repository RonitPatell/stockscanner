import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_RULES = [
  {
    id: "default-watchlist",
    enabled: true,
    name: "Watchlist high-signal",
    scope: "watchlist",
    channels: ["discord"],
    minChangePercent: 2.5,
    minRvol: 2.2,
    minUrgency: 30,
    newsAttachedOnly: true,
    cooldownMinutes: 15,
  },
];

const STARTER_WATCHLIST = ["NVDA", "AMD", "TSLA", "AAPL", "META"];

const users = await prisma.user.findMany({
  select: { id: true, email: true, watchlist: true, alertRules: true },
});

for (const u of users) {
  const patch = {};
  if (!u.alertRules) patch.alertRules = DEFAULT_RULES;
  if (!u.watchlist?.length) patch.watchlist = STARTER_WATCHLIST;
  if (Object.keys(patch).length) {
    await prisma.user.update({ where: { id: u.id }, data: patch });
    console.log("Updated", u.email, JSON.stringify(patch));
  } else {
    console.log("OK", u.email, "watchlist:", u.watchlist.join(","));
  }
}

await prisma.$disconnect();
