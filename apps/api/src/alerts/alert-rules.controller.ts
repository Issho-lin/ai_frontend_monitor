import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  AlertRulesService,
  type UpdateAlertRuleInput,
} from './alert-rules.service';

@Controller('api/v1/alert-rules')
export class AlertRulesController {
  constructor(private readonly rules: AlertRulesService) {}

  @Get()
  list(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
  ) {
    return this.rules.list(projectId, env);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateAlertRuleInput,
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
  ) {
    return this.rules.update(id, projectId, env, body ?? {});
  }
}
