// Phase 0 seed placeholder. Phase 1 populates 120 foods, 50 exercises,
// 7-day meal plan, 6-day workout plan from prisma/seed/*.json.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Phase 0: seed stub — nothing to seed yet.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
