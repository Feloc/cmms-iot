import { Controller, Get, Query } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private svc: UsersService) {}

  @Get()
  list(@Query('role') role?: string) {
    return this.svc.list(role);
  }
}
