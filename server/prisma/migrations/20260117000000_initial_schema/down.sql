-- DropForeignKey
ALTER TABLE "check_ins" DROP CONSTRAINT IF EXISTS "check_ins_video_id_fkey";

-- DropForeignKey
ALTER TABLE "distribution_recipients" DROP CONSTRAINT IF EXISTS "distribution_recipients_user_id_fkey";

-- DropForeignKey
ALTER TABLE "videos" DROP CONSTRAINT IF EXISTS "videos_user_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "check_ins_video_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "distribution_recipients_user_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "videos_public_token_idx";

-- DropIndex
DROP INDEX IF EXISTS "videos_distribute_at_idx";

-- DropIndex
DROP INDEX IF EXISTS "videos_status_idx";

-- DropIndex
DROP INDEX IF EXISTS "videos_user_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "videos_public_token_key";

-- DropIndex
DROP INDEX IF EXISTS "users_username_key";

-- DropTable
DROP TABLE IF EXISTS "system_config";

-- DropTable
DROP TABLE IF EXISTS "check_ins";

-- DropTable
DROP TABLE IF EXISTS "distribution_recipients";

-- DropTable
DROP TABLE IF EXISTS "videos";

-- DropTable
DROP TABLE IF EXISTS "users";

-- DropEnum
DROP TYPE IF EXISTS "check_in_action";

-- DropEnum
DROP TYPE IF EXISTS "video_status";
