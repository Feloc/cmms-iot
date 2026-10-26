-- Allow logistics preparation before any FAT execution exists.
-- The approved FAT is bound when departure is authorized.
ALTER TABLE "ManufacturingDispatch" ALTER COLUMN "fatExecutionId" DROP NOT NULL;
