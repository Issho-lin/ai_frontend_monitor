import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ProjectsService,
  type CreateProjectInput,
  type ProjectEnv,
  type UpdateProjectInput,
} from './projects.service';

interface CreateProjectBody {
  id?: string;
  name?: string;
  env?: ProjectEnv;
}

interface UpdateProjectBody {
  name?: string;
  env?: ProjectEnv;
}

interface CreateTokenBody {
  name?: string;
}

@Controller('api/v1/projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list() {
    return this.projects.list();
  }

  @Post()
  create(@Body() body: CreateProjectBody) {
    const input: CreateProjectInput = {
      id: body?.id ?? '',
      name: body?.name ?? '',
      env: body?.env as ProjectEnv,
    };
    return this.projects.create(input);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateProjectBody) {
    const input: UpdateProjectInput = {};
    if (body && 'name' in body) input.name = body.name;
    if (body && 'env' in body) input.env = body.env;
    return this.projects.update(id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.projects.remove(id);
  }

  @Get(':id/tokens')
  listTokens(@Param('id') id: string) {
    return this.projects.listTokens(id);
  }

  @Post(':id/tokens')
  createToken(@Param('id') id: string, @Body() body: CreateTokenBody) {
    return this.projects.createToken(id, body?.name);
  }

  @Post(':id/tokens/:tokenId/revoke')
  @HttpCode(HttpStatus.OK)
  revoke(@Param('id') id: string, @Param('tokenId') tokenId: string) {
    return this.projects.revokeToken(id, tokenId);
  }
}
