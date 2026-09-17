-- CreateTable
CREATE TABLE "gmd_gem_ids" (
    "id" SERIAL NOT NULL,
    "gem_id" VARCHAR(255) NOT NULL,
    "drive_link" TEXT,
    "order_pdf" TEXT,
    "order_number" TEXT,
    "docket_number" TEXT,
    "rate" TEXT,
    "remarks" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gmd_gem_ids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gmd_gem_files" (
    "id" SERIAL NOT NULL,
    "gem_id" VARCHAR(255) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "drive_link" TEXT NOT NULL,
    "file_type" VARCHAR(50) DEFAULT 'pdf',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gmd_gem_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gmd_gem_ids_gem_id_key" ON "gmd_gem_ids"("gem_id");

-- CreateIndex
CREATE INDEX "idx_gmd_files_gem_id" ON "gmd_gem_files"("gem_id");