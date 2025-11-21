-- CreateTable
CREATE TABLE "microscopy_images" (
    "id" TEXT NOT NULL,
    "examId" TEXT,
    "patientId" TEXT NOT NULL,
    "consultationId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "analysisType" TEXT NOT NULL,
    "magnification" TEXT,
    "thumbnailUrl" TEXT,
    "title" TEXT,
    "description" TEXT,
    "observations" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "microscopy_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_annotations" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "label" TEXT,
    "notes" TEXT,
    "color" TEXT NOT NULL DEFAULT '#FF5722',
    "opacity" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "image_annotations_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "microscopy_images" ADD CONSTRAINT "microscopy_images_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "microscopy_images" ADD CONSTRAINT "microscopy_images_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_annotations" ADD CONSTRAINT "image_annotations_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "microscopy_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;
