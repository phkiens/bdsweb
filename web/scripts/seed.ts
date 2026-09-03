import "fake-indexeddb/auto";
import { AppDatabase } from "../src/data/local/db";
import { seedInitialData } from "../src/data/local/seed";

async function runSeed() {
  console.log("🌱 Khởi tạo IndexedDB ảo và nạp dữ liệu seed deterministic...");
  const seedDb = new AppDatabase();
  const result = await seedInitialData(seedDb);
  console.log(`✅ Seed thành công: ${result.propertiesCount} BĐS, ${result.customersCount} Khách hàng, ${result.linksCount} Liên kết.`);
}

runSeed().catch((err) => {
  console.error("❌ Lỗi khi chạy seed:", err);
  process.exit(1);
});
