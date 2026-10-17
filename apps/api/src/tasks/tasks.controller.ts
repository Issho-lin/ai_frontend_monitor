import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { TasksService, type CreateTaskInput } from './tasks.service';

interface TaskActionBody {
  action?: string;
  release?: string;
}

@Controller('api/v1/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  getTasks(
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
  ) {
    return this.tasksService.list(projectId, env);
  }

  @Post()
  createTask(
    @Body() body: CreateTaskInput,
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
  ) {
    return this.tasksService.create(projectId, env, body);
  }

  @Get(':id')
  async getTask(
    @Param('id') id: string,
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
  ) {
    const task = await this.tasksService.getById(id, projectId, env);
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return task;
  }

  @Patch(':id')
  applyAction(
    @Param('id') id: string,
    @Body() body: TaskActionBody,
    @Query('projectId') projectId = 'demo',
    @Query('env') env = 'production',
  ) {
    return this.tasksService.applyAction(id, projectId, env, body.action ?? '', {
      release: body.release,
    });
  }
}
