ALTER TABLE "public"."Asset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AssetImportUpload" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Attachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Device" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "asset_import_upload_tenant_isolation" ON "public"."AssetImportUpload" USING (("tenantId" = "current_setting"('app.tenant_id'::"text", true)));
CREATE POLICY "asset_tenant_isolation" ON "public"."Asset" USING (("tenantId" = "current_setting"('app.tenant_id'::"text", true)));
CREATE POLICY "attachment_tenant_all" ON "public"."Attachment" USING (("tenantId" = "current_setting"('app.tenant_id'::"text", true))) WITH CHECK (("tenantId" = "current_setting"('app.tenant_id'::"text", true)));
CREATE POLICY "device_tenant_insert_check" ON "public"."Device" FOR INSERT WITH CHECK (("tenantId" = "current_setting"('app.tenant_id'::"text", true)));
CREATE POLICY "device_tenant_isolation_all" ON "public"."Device" USING (("tenantId" = "current_setting"('app.tenant_id'::"text", true)));
