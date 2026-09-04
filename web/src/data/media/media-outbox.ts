import { db, MediaOrphanItem } from "../local/db";

export const mediaOutbox = {
  /**
   * Thêm một media đã upload lên R2 nhưng chưa được link thành công vào bảng properties
   */
  async addOrphan(item: Omit<MediaOrphanItem, "id" | "createdAt">): Promise<number> {
    return (await db.media_orphans.add({
      ...item,
      createdAt: Date.now()
    })) as number;
  },

  /**
   * Xóa orphan theo objectKey sau khi đã link thành công vào Supabase
   */
  async removeOrphanByKey(objectKey: string): Promise<void> {
    await db.media_orphans.where("objectKey").equals(objectKey).delete();
  },

  /**
   * Xóa orphan theo id
   */
  async removeOrphan(id: number): Promise<void> {
    await db.media_orphans.delete(id);
  },

  /**
   * Lấy danh sách các orphan cần được reconcile
   */
  async getPendingOrphans(): Promise<MediaOrphanItem[]> {
    return await db.media_orphans.orderBy("createdAt").toArray();
  },

  /**
   * Lấy danh sách orphan theo propertyId
   */
  async getOrphansByProperty(propertyId: string): Promise<MediaOrphanItem[]> {
    return await db.media_orphans.where("propertyId").equals(propertyId).toArray();
  }
};
