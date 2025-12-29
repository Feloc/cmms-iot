import { Module } from '@nestjs/common';
import { OasiscomClient } from './oasiscom.client';

@Module({
  providers: [OasiscomClient],
  exports: [OasiscomClient],
})
export class OasiscomModule {}
