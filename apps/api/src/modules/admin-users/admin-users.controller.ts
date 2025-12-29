import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { TenantAdminGuard } from '../../common/guards/tenant-admin.guard';
import { AdminUsersService } from './admin-users.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { ListAdminUsersQuery } from './dto/list-admin-users.query';

@Controller('admin/users')
@UseGuards(TenantAdminGuard) // 🔒 solo ADMIN del tenant actual
export class AdminUsersController {
  constructor(private svc: AdminUsersService) {}

  @Get()
  list(@Query() q: ListAdminUsersQuery) {
    return this.svc.list(q);
  }

  @Post()
  create(@Body() dto: CreateAdminUserDto) {
    return this.svc.create(dto);
  }
}
