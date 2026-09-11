-- AlterTable
ALTER TABLE "_ProfileInterests" ADD CONSTRAINT "_ProfileInterests_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_ProfileInterests_AB_unique";
