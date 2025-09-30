BEGIN;


ALTER TABLE "AssetImportUpload" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssetImportUpload" FORCE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS asset_import_upload_tenant_isolation ON "AssetImportUpload";
CREATE POLICY asset_import_upload_tenant_isolation ON "AssetImportUpload"
USING ("tenantId" = current_setting('app.tenant_id', true));


COMMIT;