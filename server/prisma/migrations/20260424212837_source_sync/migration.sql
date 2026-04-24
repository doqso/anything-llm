-- CreateTable
CREATE TABLE "source_sync_configs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workspaceId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "encryptedConfig" TEXT NOT NULL,
    "intervalMs" INTEGER NOT NULL DEFAULT 3600000,
    "nextSyncAt" DATETIME NOT NULL,
    "lastSyncedAt" DATETIME,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "source_sync_configs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "source_sync_executions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "configId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "result" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "source_sync_executions_configId_fkey" FOREIGN KEY ("configId") REFERENCES "source_sync_configs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
