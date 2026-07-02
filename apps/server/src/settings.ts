import { type HaleroDatabase, settings } from "@halero/db";
import { eq } from "drizzle-orm";

type Db = HaleroDatabase["db"];

export const getSetting = (db: Db, key: string): string | null => {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
};

export const setSetting = (db: Db, key: string, value: string): void => {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
};
