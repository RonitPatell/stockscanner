import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  const result = await prisma.$queryRaw`SELECT 1 as ok`;
  console.log("DB_OK", result);
} catch (err) {
  console.error("DB_FAIL", err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
