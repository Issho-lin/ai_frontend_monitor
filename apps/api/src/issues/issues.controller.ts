import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { normalizeWindow } from '../scope';
import { IssuesService } from './issues.service';

interface IssueActionBody {
  action?: string;
}

@Controller('api/v1/issues')
/** List returns a bare IssueRow[] (not { items }); see IssuesService.IssueRow. */
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Get()
  list(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
    @Query('window') window = '',
    @Query('workflowStatus') workflowStatus = '',
    @Query('kind') kind = '',
  ) {
    return this.issuesService.list(
      projectId,
      env,
      normalizeWindow(window),
      workflowStatus,
      kind,
    );
  }

  @Get(':id')
  async getOne(
    @Param('id') id: string,
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
    @Query('window') window = '',
  ) {
    const issue = await this.issuesService.getById(
      id,
      projectId,
      env,
      normalizeWindow(window),
    );
    if (!issue) {
      throw new NotFoundException(`Issue ${id} not found`);
    }
    return issue;
  }

  @Patch(':id')
  applyAction(
    @Param('id') id: string,
    @Body() body: IssueActionBody,
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
    @Query('window') window = '',
  ) {
    return this.issuesService.applyAction(
      id,
      projectId,
      env,
      body.action ?? '',
      normalizeWindow(window),
    );
  }
}
