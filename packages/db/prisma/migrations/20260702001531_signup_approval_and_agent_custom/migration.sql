-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TenantStatus" ADD VALUE 'pending_approval';
ALTER TYPE "TenantStatus" ADD VALUE 'rejected';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "appliedAt" TIMESTAMP(3),
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "industryKey" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "TenantAgentConfig" ADD COLUMN     "afterHoursMode" TEXT NOT NULL DEFAULT 'callback',
ADD COLUMN     "afterHoursText" TEXT,
ADD COLUMN     "businessHours" JSONB,
ADD COLUMN     "closingText" TEXT,
ADD COLUMN     "emergencyKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "smsSettings" JSONB,
ADD COLUMN     "transferPhoneNumber" TEXT;
