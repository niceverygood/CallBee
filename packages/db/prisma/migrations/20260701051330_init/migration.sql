-- CreateEnum
CREATE TYPE "Intent" AS ENUM ('usage', 'billing', 'tech_error', 'upgrade', 'churn', 'new_signup', 'other');

-- CreateEnum
CREATE TYPE "Emotion" AS ENUM ('neutral', 'angry', 'urgent', 'confused');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('kb_answered', 'ticket_created', 'transferred', 'callback_queued', 'selfservice_sent', 'abandoned', 'other');

-- CreateEnum
CREATE TYPE "SpeakerRole" AS ENUM ('caller', 'agent', 'system');

-- CreateEnum
CREATE TYPE "TicketSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('open', 'in_progress', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "CallbackUrgency" AS ENUM ('low', 'normal', 'high');

-- CreateEnum
CREATE TYPE "CallbackStatus" AS ENUM ('queued', 'scheduled', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('queued', 'sent', 'delivered', 'failed');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('onboarding', 'active', 'suspended');

-- CreateEnum
CREATE TYPE "TenantPlan" AS ENUM ('trial', 'starter', 'pro', 'enterprise');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industryLabel" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'onboarding',
    "plan" "TenantPlan" NOT NULL DEFAULT 'trial',
    "ownerEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantAgentConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "greetingText" TEXT,
    "personaInstructions" TEXT,
    "toneExtra" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "domainConstraints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "intentUnresolvedFallbackTool" TEXT NOT NULL DEFAULT 'request_callback',
    "maxIntentAttempts" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantAgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantIntent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "routingToolName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantTool" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "paramsSchema" JSONB NOT NULL,
    "webhookUrl" TEXT NOT NULL,
    "webhookSecret" TEXT,
    "timeoutMs" INTEGER NOT NULL DEFAULT 8000,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantTool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clawopsCallId" TEXT NOT NULL,
    "direction" "CallDirection" NOT NULL DEFAULT 'inbound',
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "subscriberId" TEXT,
    "intent" TEXT,
    "emotion" "Emotion",
    "outcome" "CallOutcome",
    "summary" TEXT,
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "recordingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL,
    "callSessionId" TEXT NOT NULL,
    "role" "SpeakerRole" NOT NULL,
    "text" TEXT NOT NULL,
    "startMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "callSessionId" TEXT,
    "subscriberId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "severity" "TicketSeverity" NOT NULL DEFAULT 'medium',
    "status" "TicketStatus" NOT NULL DEFAULT 'open',
    "assignee" TEXT,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "callSessionId" TEXT,
    "ticketId" TEXT,
    "templateKey" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "vars" JSONB NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'queued',
    "providerMsgId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "callSessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "disclosureText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallbackRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "callSessionId" TEXT,
    "subscriberId" TEXT,
    "phone" TEXT,
    "summary" TEXT NOT NULL,
    "urgency" "CallbackUrgency" NOT NULL DEFAULT 'normal',
    "status" "CallbackStatus" NOT NULL DEFAULT 'queued',
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallbackRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolInvocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "callSessionId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "paramsSummary" JSONB,
    "ok" BOOLEAN NOT NULL,
    "errorCode" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolInvocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_phoneNumber_key" ON "Tenant"("phoneNumber");

-- CreateIndex
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TenantAgentConfig_tenantId_key" ON "TenantAgentConfig"("tenantId");

-- CreateIndex
CREATE INDEX "TenantIntent_tenantId_idx" ON "TenantIntent"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantIntent_tenantId_key_key" ON "TenantIntent"("tenantId", "key");

-- CreateIndex
CREATE INDEX "TenantTool_tenantId_idx" ON "TenantTool"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantTool_tenantId_name_key" ON "TenantTool"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CallSession_clawopsCallId_key" ON "CallSession"("clawopsCallId");

-- CreateIndex
CREATE INDEX "CallSession_tenantId_idx" ON "CallSession"("tenantId");

-- CreateIndex
CREATE INDEX "CallSession_subscriberId_idx" ON "CallSession"("subscriberId");

-- CreateIndex
CREATE INDEX "CallSession_intent_idx" ON "CallSession"("intent");

-- CreateIndex
CREATE INDEX "CallSession_startedAt_idx" ON "CallSession"("startedAt");

-- CreateIndex
CREATE INDEX "Transcript_callSessionId_idx" ON "Transcript"("callSessionId");

-- CreateIndex
CREATE INDEX "Ticket_tenantId_idx" ON "Ticket"("tenantId");

-- CreateIndex
CREATE INDEX "Ticket_subscriberId_idx" ON "Ticket"("subscriberId");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

-- CreateIndex
CREATE INDEX "Ticket_category_idx" ON "Ticket"("category");

-- CreateIndex
CREATE INDEX "KnowledgeItem_tenantId_idx" ON "KnowledgeItem"("tenantId");

-- CreateIndex
CREATE INDEX "KnowledgeItem_tenantId_category_idx" ON "KnowledgeItem"("tenantId", "category");

-- CreateIndex
CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- CreateIndex
CREATE INDEX "Notification_templateKey_idx" ON "Notification"("templateKey");

-- CreateIndex
CREATE INDEX "ConsentRecord_tenantId_idx" ON "ConsentRecord"("tenantId");

-- CreateIndex
CREATE INDEX "ConsentRecord_callSessionId_idx" ON "ConsentRecord"("callSessionId");

-- CreateIndex
CREATE INDEX "CallbackRequest_tenantId_idx" ON "CallbackRequest"("tenantId");

-- CreateIndex
CREATE INDEX "CallbackRequest_status_idx" ON "CallbackRequest"("status");

-- CreateIndex
CREATE INDEX "CallbackRequest_urgency_idx" ON "CallbackRequest"("urgency");

-- CreateIndex
CREATE INDEX "ToolInvocation_tenantId_idx" ON "ToolInvocation"("tenantId");

-- CreateIndex
CREATE INDEX "ToolInvocation_callSessionId_idx" ON "ToolInvocation"("callSessionId");

-- CreateIndex
CREATE INDEX "ToolInvocation_toolName_idx" ON "ToolInvocation"("toolName");

-- AddForeignKey
ALTER TABLE "TenantAgentConfig" ADD CONSTRAINT "TenantAgentConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantIntent" ADD CONSTRAINT "TenantIntent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTool" ADD CONSTRAINT "TenantTool_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallbackRequest" ADD CONSTRAINT "CallbackRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallbackRequest" ADD CONSTRAINT "CallbackRequest_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolInvocation" ADD CONSTRAINT "ToolInvocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolInvocation" ADD CONSTRAINT "ToolInvocation_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
